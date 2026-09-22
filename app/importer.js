/** Local-only document extraction. No document is uploaded by this module. */
export const IMPORT_LIMITS = Object.freeze({
  bytes: 40 * 1024 * 1024,
  pages: 1000,
  characters: 3000000,
  ocrPages: 10,
});
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
const clean = (value) =>
  String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
const abortError = () =>
  new DOMException("Importación cancelada.", "AbortError");
function checkAbort(signal) {
  if (signal?.aborted) throw abortError();
}
function abortable(promise, signal) {
  if (!signal) return promise;
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const stop = () => reject(abortError());
    signal.addEventListener("abort", stop, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", stop));
  });
}
function report(callback, stage, current = 0, total = 1, message = "") {
  callback?.({
    stage,
    current,
    total,
    progress: Math.max(0, Math.min(1, current / (total || 1))),
    message,
  });
}

/** Split on paragraph, sentence or word boundaries, without dropping source text. */
export function segmentText(text, maxChars = 5500) {
  const result = [];
  let remaining = clean(text);
  const limit = Math.max(200, Math.min(30000, Number(maxChars) || 5500));
  while (remaining.length > limit) {
    const candidate = remaining.slice(0, limit + 1);
    let cut = candidate.lastIndexOf("\n\n");
    if (cut < limit * 0.35)
      cut =
        Math.max(
          candidate.lastIndexOf(". "),
          candidate.lastIndexOf("? "),
          candidate.lastIndexOf("! "),
        ) + 1;
    if (cut < limit * 0.35) cut = candidate.lastIndexOf(" ");
    if (cut < limit * 0.35) cut = limit;
    const part = remaining.slice(0, cut).trim();
    if (part) result.push(part);
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) result.push(remaining);
  return result;
}

function heading(line) {
  const value = line.trim();
  if (/^#{1,6}\s+\S/.test(value))
    return value.replace(/^#+\s*/, "").slice(0, 140);
  if (value.length < 5 || value.length > 125 || /[.!?;,]$/.test(value))
    return "";
  if (
    /^(?:chapter|cap[ií]tulo|module|m[oó]dulo|reading|lectura|lesson|lecci[oó]n|unit|unidad)\s+[\dIVX]/i.test(
      value,
    )
  )
    return value;
  if (
    /^\d+(?:\.\d+){0,3}[.)]?\s+\p{L}/u.test(value) &&
    value.split(/\s+/).length <= 12
  )
    return value;
  if (
    value === value.toUpperCase() &&
    /\p{L}/u.test(value) &&
    value.split(/\s+/).length <= 12
  )
    return value;
  return "";
}

/** Detect repeated page margins; original page text is retained for audit. */
function repeatedMargins(pages) {
  const counts = new Map();
  for (const page of pages) {
    // Only geometry-confirmed top/bottom margins may be removed. A repeated
    // formula near the end of a short page is still body content.
    const margins = new Set(
      (page.marginLines || [])
        .map((line) => line.trim())
        .filter((line) => line.length >= 8 && line.length <= 140),
    );
    for (const line of margins) counts.set(line, (counts.get(line) || 0) + 1);
  }
  return new Set(
    [...counts]
      .filter(
        ([, count]) => count >= Math.max(3, Math.ceil(pages.length * 0.6)),
      )
      .map(([line]) => line),
  );
}

function buildSections(pages, title) {
  const repeated = repeatedMargins(pages);
  const sections = [];
  let current = null;
  let lastHeading = title;
  function flush() {
    if (!current?.text.trim()) {
      current = null;
      return;
    }
    const pieces = segmentText(current.text);
    pieces.forEach((text, index) =>
      sections.push({
        ...current,
        title: `${current.title}${pieces.length > 1 ? ` · ${index + 1}` : ""}`,
        text,
      }),
    );
    current = null;
  }
  for (const page of pages) {
    const lines = page.text.split("\n");
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line.trim() && !current) continue;
      if (
        (page.marginLines || []).includes(line.trim()) &&
        repeated.has(line.trim())
      )
        continue;
      const detected = heading(line);
      if (detected) {
        flush();
        lastHeading = detected;
        current = {
          title: detected,
          text: "",
          pageStart: page.number,
          pageEnd: page.number,
        };
      }
      if (!current)
        current = {
          title: `${lastHeading} · p. ${page.number}`,
          text: "",
          pageStart: page.number,
          pageEnd: page.number,
        };
      current.text += `${line}\n`;
      current.pageEnd = page.number;
    }
    // Page-boundary sections keep references truthful when lessons are edited
    // and later sent independently to the study-material generator.
    flush();
  }
  flush();
  return { sections, cleanedMargins: repeated.size };
}

/** Geometry ordering for ordinary PDF prose. Complex tables always require review. */
export function orderPdfText(items, pageWidth = 612, pageHeight = 0) {
  const words = items
    .filter((item) => typeof item.str === "string" && item.str.trim())
    .map((item) => ({
      text: item.str,
      x: item.transform?.[4] || 0,
      y: item.transform?.[5] || 0,
      width: Math.abs(item.width || 0),
      height: Math.abs(item.height || item.transform?.[3] || 10),
    }));
  words.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const word of words) {
    let line = lines.at(-1);
    if (
      !line ||
      Math.abs(line.y - word.y) >
        Math.max(2, Math.min(word.height, line.height) * 0.35)
    ) {
      line = { y: word.y, height: word.height, words: [] };
      lines.push(line);
    }
    line.words.push(word);
  }
  const rows = lines.map((line) => {
    line.words.sort((a, b) => a.x - b.x);
    const parts = [];
    let previous = null;
    let gapCount = 0;
    for (const word of line.words) {
      const gap = previous ? word.x - (previous.x + previous.width) : 0;
      if (gap > pageWidth * 0.075) gapCount++;
      if (
        previous &&
        gap > Math.max(1, word.height * 0.1) &&
        !/\s$/.test(previous.text) &&
        !/^\s/.test(word.text)
      )
        parts.push(gap > pageWidth * 0.075 ? "    " : " ");
      parts.push(word.text);
      previous = word;
    }
    return { ...line, text: parts.join("").trim(), gapCount };
  });
  const complex = rows.filter((row) => row.gapCount > 0).length >= 3;
  let text = "";
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    text +=
      (previous &&
      previous.y - row.y > Math.max(previous.height, row.height) * 1.8
        ? "\n\n"
        : index
          ? "\n"
          : "") + row.text;
  });
  return {
    text: clean(text),
    complex,
    marginLines: pageHeight
      ? rows
          .filter(
            (row) => row.y < pageHeight * 0.07 || row.y > pageHeight * 0.93,
          )
          .map((row) => row.text)
      : [],
  };
}

let ocrLibrary;
async function loadOcrLibrary() {
  if (globalThis.Tesseract?.createWorker) return globalThis.Tesseract;
  if (!ocrLibrary)
    ocrLibrary = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("../vendor/tesseract.min.js", import.meta.url).href;
      script.onload = () =>
        globalThis.Tesseract?.createWorker
          ? resolve(globalThis.Tesseract)
          : reject(new Error("No se pudo inicializar Tesseract."));
      script.onerror = () =>
        reject(
          new Error(
            "No se pudo cargar vendor/tesseract.min.js. Verifica que publicaste la carpeta vendor completa.",
          ),
        );
      document.head.append(script);
    }).catch((error) => {
      ocrLibrary = null;
      throw error;
    });
  return ocrLibrary;
}

async function createOcr({ signal, onProgress, ocrLanguages }) {
  checkAbort(signal);
  const Tesseract = await loadOcrLibrary();
  const options = globalThis.CFA_CONFIG?.ocr || {};
  let worker;
  const terminate = () => {
    worker?.terminate().catch(() => {});
  };
  signal?.addEventListener("abort", terminate, { once: true });
  try {
    const pendingWorker = Tesseract.createWorker(ocrLanguages, 1, {
      workerPath:
        options.workerPath ||
        new URL("../vendor/tesseract-worker.min.js", import.meta.url).href,
      corePath:
        options.corePath ||
        new URL("../vendor/tesseract-core", import.meta.url).href,
      langPath:
        options.langPath || new URL("../vendor/tessdata", import.meta.url).href,
      logger: (message) =>
        report(
          onProgress,
          "ocr",
          message.progress || 0,
          1,
          `OCR: ${message.status || "procesando"}`,
        ),
    });
    pendingWorker.then(
      (created) => {
        if (signal?.aborted) created.terminate().catch(() => {});
      },
      () => {},
    );
    worker = await abortable(pendingWorker, signal);
    checkAbort(signal);
    await worker.setParameters({ preserve_interword_spaces: "1" });
    return {
      async recognize(image) {
        checkAbort(signal);
        const result = await abortable(worker.recognize(image), signal);
        checkAbort(signal);
        return result.data;
      },
      async close() {
        signal?.removeEventListener("abort", terminate);
        await worker.terminate().catch(() => {});
      },
    };
  } catch (error) {
    signal?.removeEventListener("abort", terminate);
    await worker?.terminate().catch(() => {});
    if (signal?.aborted) throw abortError();
    throw new Error(
      `No se pudo iniciar OCR. Verifica que publicaste vendor/tesseract-core y vendor/tessdata completos y que el sitio terminó de descargarlos. ${error.message || ""}`,
    );
  }
}

async function extractPdf(buffer, settings) {
  const { signal, onProgress, ocr, ocrMaxPages, pageStart, pageEnd } = settings;
  const pdfjs = await import("../vendor/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "../vendor/pdf.worker.mjs",
    import.meta.url,
  ).href;
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
    cMapUrl: new URL("../vendor/cmaps/", import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("../vendor/standard_fonts/", import.meta.url)
      .href,
    wasmUrl: new URL("../vendor/wasm/", import.meta.url).href,
  });
  const cancel = () => {
    task.destroy().catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  let pdf;
  let engine;
  let renderTask;
  const warnings = [];
  const pages = [];
  const sparsePages = [];
  const complexPages = [];
  let usedOcr = 0;
  let characters = 0;
  try {
    pdf = await task.promise;
    const first = Math.max(1, Math.floor(Number(pageStart) || 1));
    const last = Math.min(
      pdf.numPages,
      Math.floor(Number(pageEnd) || pdf.numPages),
    );
    if (first > last)
      throw new Error(
        `El rango no coincide con el PDF (${pdf.numPages} páginas).`,
      );
    if (last - first + 1 > IMPORT_LIMITS.pages)
      throw new Error(
        `Selecciona hasta ${IMPORT_LIMITS.pages} páginas por importación.`,
      );
    if (first > 1 || last < pdf.numPages)
      warnings.push(
        `Importación parcial: páginas ${first}–${last} de ${pdf.numPages}.`,
      );
    for (let number = first; number <= last; number++) {
      checkAbort(signal);
      report(
        onProgress,
        "pdf",
        number - first,
        last - first + 1,
        `Leyendo página ${number} de ${pdf.numPages}`,
      );
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const ordered = orderPdfText(
        content.items,
        viewport.width,
        viewport.height,
      );
      let text = ordered.text;
      let method = "pdf-text";
      if (ordered.complex) complexPages.push(number);
      if (text.replace(/\s/g, "").length < 35) {
        if (ocr && usedOcr < ocrMaxPages) {
          engine ||= await createOcr(settings);
          const scale = Math.min(
            2,
            2400 / Math.max(viewport.width, viewport.height),
          );
          const renderViewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(renderViewport.width);
          canvas.height = Math.ceil(renderViewport.height);
          try {
            renderTask = page.render({
              canvasContext: canvas.getContext("2d"),
              viewport: renderViewport,
            });
            await renderTask.promise;
            renderTask = null;
            const result = await engine.recognize(canvas);
            text = clean(result.text);
            method = "ocr";
            usedOcr++;
            if ((result.confidence || 0) < 65)
              warnings.push(
                `OCR con baja confianza en página ${number}: revisa cifras, símbolos y fórmulas.`,
              );
          } finally {
            canvas.width = canvas.height = 0;
          }
        }
        if (text.replace(/\s/g, "").length < 35) sparsePages.push(number);
      }
      characters += text.length;
      if (characters > IMPORT_LIMITS.characters)
        throw new Error(
          "El texto supera 3 millones de caracteres. Divide el PDF en varios módulos.",
        );
      pages.push({
        number,
        text,
        method,
        marginLines: method === "pdf-text" ? ordered.marginLines : [],
      });
      page.cleanup();
      await pause();
    }
    if (sparsePages.length)
      warnings.push(
        `${sparsePages.length} página(s) sin texto suficiente (${sparsePages.slice(0, 15).join(", ")}${sparsePages.length > 15 ? "…" : ""}). ${ocr ? `OCR limitado a ${ocrMaxPages} páginas por lote; importa otro rango para continuar.` : "Activa OCR si contienen texto escaneado."}`,
      );
    if (complexPages.length)
      warnings.push(
        `Posibles columnas o tablas en páginas ${complexPages.slice(0, 15).join(", ")}${complexPages.length > 15 ? "…" : ""}. Se conserva el orden por filas; revisa el orden de lectura antes de guardar.`,
      );
    if (usedOcr)
      warnings.push(
        "El OCR no interpreta gráficos ni garantiza fórmulas, superíndices o cifras correctas. Contrasta con el original.",
      );
    return { pages, warnings, method: usedOcr ? "pdf-text+ocr" : "pdf-text" };
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (error.name === "PasswordException")
      throw new Error(
        "El PDF tiene contraseña. Importa una copia desbloqueada autorizada.",
      );
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    renderTask?.cancel();
    await engine?.close();
    await task.destroy().catch(() => {});
  }
}

export async function extractDocument(
  file,
  {
    onProgress,
    signal,
    ocr = false,
    ocrLanguages = "eng+spa",
    ocrMaxPages = 10,
    pageStart = 1,
    pageEnd,
  } = {},
) {
  if (!file?.arrayBuffer) throw new Error("Selecciona un archivo válido.");
  if (!file.size) throw new Error("El archivo está vacío.");
  if (file.size > IMPORT_LIMITS.bytes)
    throw new Error(
      "El límite es 40 MB por archivo. Divide o comprime el documento.",
    );
  if (!/^[a-z]{3}(?:\+[a-z]{3}){0,3}$/.test(ocrLanguages))
    throw new Error("Idioma OCR no válido. Usa eng, spa o eng+spa.");
  checkAbort(signal);
  report(onProgress, "read", 0, 1, "Leyendo el archivo…");
  const buffer = await file.arrayBuffer();
  checkAbort(signal);
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  const fingerprint = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const title = (file.name || "Documento")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .slice(0, 160);
  const extension = (file.name || "").split(".").pop().toLowerCase();
  const isPdf = new TextDecoder("ascii").decode(buffer.slice(0, 5)) === "%PDF-";
  const settings = {
    onProgress,
    signal,
    ocr,
    ocrLanguages,
    ocrMaxPages: Math.max(
      1,
      Math.min(IMPORT_LIMITS.ocrPages, Number(ocrMaxPages) || 10),
    ),
    pageStart,
    pageEnd,
  };
  let result;
  if (isPdf) result = await extractPdf(buffer, settings);
  else if (extension === "pdf")
    throw new Error("El archivo no contiene un PDF válido.");
  else if (
    ["txt", "md", "markdown"].includes(extension) ||
    /^text\/(plain|markdown)/.test(file.type)
  ) {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      throw new Error(
        "El texto no está codificado en UTF-8. Guárdalo como UTF-8 e inténtalo de nuevo.",
      );
    }
    if (text.length > IMPORT_LIMITS.characters)
      throw new Error(
        "El texto supera 3 millones de caracteres. Divídelo en varios archivos.",
      );
    result = {
      pages: [
        {
          number: 1,
          text: clean(text),
          method: extension === "md" ? "markdown" : "text",
        },
      ],
      warnings: [],
      method: "text",
    };
  } else if (
    /^image\/(png|jpe?g|webp|bmp)$/.test(file.type) ||
    ["png", "jpg", "jpeg", "webp", "bmp"].includes(extension)
  ) {
    if (!ocr) throw new Error("Para extraer texto de una imagen, activa OCR.");
    const engine = await createOcr(settings);
    try {
      const data = await engine.recognize(file);
      result = {
        pages: [{ number: 1, text: clean(data.text), method: "ocr" }],
        warnings: [
          "Revisa el resultado OCR, especialmente cifras, símbolos y fórmulas.",
          ...((data.confidence || 0) < 65
            ? ["El motor reportó baja confianza en el reconocimiento."]
            : []),
        ],
        method: "ocr",
      };
    } finally {
      await engine.close();
    }
  } else
    throw new Error(
      "Formato no compatible. Importa PDF, TXT UTF-8, Markdown o imágenes PNG/JPG/WEBP/BMP con OCR.",
    );
  checkAbort(signal);
  const structured = buildSections(result.pages, title);
  if (structured.cleanedMargins)
    result.warnings.push(
      `Se detectaron ${structured.cleanedMargins} encabezados/pies repetidos; se omiten de las lecciones, conservando el texto original por página.`,
    );
  if (!structured.sections.length)
    result.warnings.push(
      "No se detectó texto utilizable. Activa OCR o importa una versión con texto seleccionable.",
    );
  report(
    onProgress,
    "done",
    1,
    1,
    "Extracción lista. Revisa los borradores antes de guardarlos.",
  );
  return { title, ...result, sections: structured.sections, fingerprint };
}

/** Extractive drafts, deliberately not presented as AI-authored or verified facts. */
export function suggestCards(sections, limit = 24) {
  const cards = [];
  const seen = new Set();
  for (const section of sections || []) {
    const statements = String(section.text || "").split(
      /\n+|(?<=[.!?])\s+(?=[\p{Lu}\d])/u,
    );
    for (const statement of statements) {
      const match =
        statement.trim().match(/^([^:]{3,90}):\s+(.{20,900})$/) ||
        statement
          .trim()
          .match(
            /^(.{3,80}?)\s+(?:se define como|se refiere a|is defined as|refers to)\s+(.{20,900})$/i,
          );
      if (!match) continue;
      const term = match[1].replace(/^[-*•]\s*/, "").trim();
      if (seen.has(term.toLowerCase())) continue;
      seen.add(term.toLowerCase());
      cards.push({
        front: `Explica: ${term}`,
        back: match[2].trim(),
        sourcePage: Number(section.pageStart) || 1,
        draft: true,
        method: "extractive",
        sourceTitle: section.title || "",
      });
      if (cards.length >= Math.max(1, Math.min(100, limit))) return cards;
    }
  }
  return cards;
}

/** Safe interchange: no imported IDs, HTML execution, or cloud ownership fields. */
export function validateStructuredImport(input) {
  let data;
  try {
    data = typeof input === "string" ? JSON.parse(input) : input;
  } catch {
    throw new Error("El archivo JSON no es válido.");
  }
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray(data.modules) ||
    typeof data.title !== "string" ||
    !data.title.trim()
  )
    throw new Error("Se requiere un curso con title y modules.");
  if (data.modules.length > 100)
    throw new Error("El curso puede importar hasta 100 módulos por lote.");
  let length = 0;
  let count = 0;
  const result = {
    title: data.title.trim().slice(0, 160),
    description: String(data.description || "").slice(0, 2000),
    modules: data.modules.map((module, index) => {
      if (
        !module ||
        typeof module.title !== "string" ||
        !module.title.trim() ||
        !Array.isArray(module.lessons)
      )
        throw new Error(`El módulo ${index + 1} requiere title y lessons.`);
      return {
        title: module.title.trim().slice(0, 160),
        lessons: module.lessons.map((lesson, lessonIndex) => {
          if (
            !lesson ||
            typeof lesson.title !== "string" ||
            !lesson.title.trim() ||
            typeof lesson.text !== "string"
          )
            throw new Error(
              `Lección ${lessonIndex + 1} del módulo ${index + 1}: title/text obligatorios.`,
            );
          length += lesson.text.length;
          count++;
          if (length > IMPORT_LIMITS.characters || count > 2000)
            throw new Error(
              "El curso supera el límite de 2.000 lecciones o 3 millones de caracteres.",
            );
          return {
            title: lesson.title.trim().slice(0, 160),
            text: clean(lesson.text),
          };
        }),
      };
    }),
  };
  return result;
}
