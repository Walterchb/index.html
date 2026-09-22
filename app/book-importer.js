import { IMPORT_LIMITS, orderPdfText } from './importer.js';

/** Analyze a complete PDF without deleting, hiding, or replacing physical pages.
 * The caller must retain the original File: text is a search/study companion,
 * never a reconstruction of figures, equations, tables, or page appearance.
 */
export const BOOK_IMPORT_LIMITS = Object.freeze({ ...IMPORT_LIMITS, groupPages: 20 });
const abortError = () => new DOMException('Análisis del libro cancelado.', 'AbortError');
const checkAbort = signal => { if (signal?.aborted) throw abortError(); };
const cleanTitle = value => String(value || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, 240);
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
function report(callback, stage, current, total, message) {
  callback?.({ stage, current, total, progress: total ? Math.max(0, Math.min(1, current / total)) : 0, message });
}
function pageList(numbers) { return `${numbers.slice(0, 16).join(', ')}${numbers.length > 16 ? '…' : ''}`; }

/** Partition every physical page exactly once. Candidates are starts, not ranges. */
export function partitionBookModules(totalPages, candidates = [], source = 'fallback') {
  if (!Number.isInteger(totalPages) || totalPages < 1) throw new Error('El libro debe contener al menos una página.');
  const starts = new Map();
  for (const item of candidates) {
    const page = Number(item.page ?? item.startPage);
    if (!Number.isInteger(page) || page < 1 || page > totalPages || starts.has(page)) continue;
    starts.set(page, { title: cleanTitle(item.title) || `Sección · página ${page}`, startPage: page, source: item.source || source });
  }
  if (!starts.size) {
    for (let page = 1; page <= totalPages; page += BOOK_IMPORT_LIMITS.groupPages) {
      const end = Math.min(totalPages, page + BOOK_IMPORT_LIMITS.groupPages - 1);
      starts.set(page, { title: `Bloque ${Math.floor((page - 1) / BOOK_IMPORT_LIMITS.groupPages) + 1} · páginas ${page}–${end}`, startPage: page, source: 'fallback' });
    }
  } else if (!starts.has(1)) starts.set(1, { title: 'Inicio del libro', startPage: 1, source: 'frontmatter' });
  const ordered = [...starts.values()].sort((a, b) => a.startPage - b.startPage);
  return ordered.map((item, index) => ({ ...item, endPage: ordered[index + 1] ? ordered[index + 1].startPage - 1 : totalPages }));
}

function conservativeHeading(text) {
  const lines = String(text || '').split('\n').map(line => line.trim()).filter(Boolean).slice(0, 8);
  for (const line of lines) {
    if (line.length > 180 || /\.{3,}|…\s*\d+\s*$/.test(line)) continue;
    if (/^(?:chapter|cap[ií]tulo|(?:learning\s+)?module|m[oó]dulo|reading|lectura|unit|unidad|part|parte)\s+(?:\d+[A-Za-z]?|[IVXLCDM]+)\b(?:\s*[:.\-–—]\s*|\s+|$)/i.test(line) && !/[.!?;]$/.test(line)) return cleanTitle(line);
    if (/^(?:appendix|appendices|ap[eé]ndices?|annex(?:es)?|anexos?)(?:\s+[A-Z0-9IVX]+)?(?:\s*[:.\-–—]\s*[^.]{1,120}|\s+[^.]{1,100})?$/i.test(line)) return cleanTitle(line);
    if (/^(?:glossary|glosario|bibliography|bibliograf[ií]a|references|referencias|answer key|solucionario|[ií]ndice anal[ií]tico)$/i.test(line)) return cleanTitle(line);
  }
  return '';
}

async function readOutline(pdf, signal, warnings) {
  let nodes;
  try { nodes = await pdf.getOutline(); } catch { warnings.push('No se pudo leer el índice de marcadores; se propondrá una organización alternativa.'); return []; }
  if (!Array.isArray(nodes)) return [];
  const result = []; let unresolved = 0; let visited = 0;
  const destinations = new Map();
  async function destinationPage(destination) {
    if (typeof destination === 'string') {
      if (!destinations.has(destination)) destinations.set(destination, await pdf.getDestination(destination));
      destination = destinations.get(destination);
    }
    if (!Array.isArray(destination) || !destination.length) return null;
    const reference = destination[0];
    const index = Number.isInteger(reference) ? reference : reference && typeof reference === 'object' ? await pdf.getPageIndex(reference) : -1;
    return Number.isInteger(index) && index >= 0 && index < pdf.numPages ? index + 1 : null;
  }
  // Iterative walk avoids recursion failures on deeply nested, untrusted PDFs.
  const queue = nodes.map(node => ({ node, level: 0 })).reverse();
  while (queue.length) {
    checkAbort(signal);
    const { node, level } = queue.pop();
    if (!node || typeof node !== 'object') continue;
    visited++;
    // This is an explicit index-only safety limit, never a document page limit.
    if (visited > 10000) { warnings.push('El índice contiene más de 10.000 entradas; se analizaron las primeras 10.000. Todas las páginas del libro se conservan.'); break; }
    let page = null;
    try { page = await destinationPage(node.dest); } catch { /* Unresolvable bookmark; retain all original pages. */ }
    const title = cleanTitle(node.title);
    if (page !== null && title) result.push({ title, page, level });
    else if (title) unresolved++;
    const children = Array.isArray(node.items) ? node.items : [];
    for (let index = children.length - 1; index >= 0; index--) queue.push({ node: children[index], level: level + 1 });
  }
  if (unresolved) warnings.push(`${unresolved} marcador(es) sin destino de página válido no se usaron para dividir el libro. Ninguna página fue omitida.`);
  return result;
}

function chooseBookmarkStarts(outline) {
  const levels = [...new Set(outline.map(item => item.level))].sort((a, b) => a - b);
  // A single outer bookmark commonly names the entire book; use its chapters.
  for (const level of levels) {
    const items = outline.filter(item => item.level === level);
    if (new Set(items.map(item => item.page)).size >= 2) return items;
  }
  return outline.length ? [outline[0]] : [];
}

export async function analyzeBook(file, { onProgress, signal } = {}) {
  if (!file?.arrayBuffer || !Number.isFinite(file.size)) throw new Error('Selecciona un archivo PDF válido.');
  if (!file.size) throw new Error('El PDF está vacío.');
  if (file.size > BOOK_IMPORT_LIMITS.bytes) throw new Error('El límite es 40 MB por libro. Comprime el PDF sin quitar páginas o divídelo en volúmenes.');
  checkAbort(signal);
  report(onProgress, 'read', 0, 1, 'Leyendo el libro completo…');
  const bytes = await file.arrayBuffer();
  checkAbort(signal);
  const header = new TextDecoder('ascii').decode(bytes.slice(0, 1024));
  if (!header.includes('%PDF-')) throw new Error('El archivo no contiene un PDF válido.');
  if (!globalThis.crypto?.subtle) throw new Error('Abre la web mediante HTTPS o localhost para analizar libros de forma segura.');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const fingerprint = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  checkAbort(signal);
  const pdfjs = await import('../vendor/pdf.mjs');
  checkAbort(signal);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.mjs', import.meta.url).href;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true,
    cMapUrl: new URL('../vendor/cmaps/', import.meta.url).href, cMapPacked: true,
    standardFontDataUrl: new URL('../vendor/standard_fonts/', import.meta.url).href,
    wasmUrl: new URL('../vendor/wasm/', import.meta.url).href,
  });
  const stop = () => { loadingTask.destroy().catch(() => {}); };
  signal?.addEventListener('abort', stop, { once: true });
  const warnings = [];
  try {
    const pdf = await loadingTask.promise;
    checkAbort(signal);
    const totalPages = pdf.numPages;
    if (totalPages > BOOK_IMPORT_LIMITS.pages) throw new Error('El libro supera el límite de 1.000 páginas. Divídelo en volúmenes; no se importó ninguna página parcialmente.');
    if (totalPages < 1) throw new Error('El PDF no contiene páginas.');
    let title = cleanTitle((file.name || 'Libro').replace(/\.pdf$/i, '').replace(/[_]+/g, ' ')) || 'Libro';
    let labels = null;
    try {
      const metadata = await pdf.getMetadata();
      const candidate = cleanTitle(metadata.info?.Title || metadata.metadata?.get('dc:title'));
      if (candidate && !/^(?:untitled|sin t[ií]tulo|document|documento)$/i.test(candidate)) title = candidate;
    } catch { warnings.push('No se pudo leer el título del PDF; se usa el nombre del archivo.'); }
    try { labels = await pdf.getPageLabels(); } catch { warnings.push('No se pudieron leer las etiquetas impresas; se usan los números de página físicos.'); }
    report(onProgress, 'outline', 0, totalPages, 'Leyendo índice, marcadores y numeración…');
    const bookmarks = await readOutline(pdf, signal, warnings);
    const bookmarkTitles = new Map();
    [...bookmarks].sort((a, b) => a.level - b.level).forEach(item => { if (!bookmarkTitles.has(item.page)) bookmarkTitles.set(item.page, item.title); });
    const pages = []; const headingStarts = []; const headingTitles = new Set();
    const sparse = []; const unavailable = []; const complex = []; const limited = [];
    let characters = 0; let textBudgetReached = false;
    for (let number = 1; number <= totalPages; number++) {
      checkAbort(signal);
      report(onProgress, 'pages', number - 1, totalPages, `Analizando página ${number} de ${totalPages} · todas se conservarán`);
      checkAbort(signal);
      const label = labels?.[number - 1] != null ? String(labels[number - 1]) : String(number);
      const record = { number, label, text: '', title: bookmarkTitles.get(number) || `Página ${label}`, hasText: false, textStatus: 'empty', width: 0, height: 0, rotation: 0 };
      let page;
      try {
        page = await pdf.getPage(number);
        checkAbort(signal);
        const viewport = page.getViewport({ scale: 1 });
        record.width = viewport.width; record.height = viewport.height; record.rotation = page.rotate || 0;
        if (textBudgetReached) { record.textStatus = 'limit'; limited.push(number); }
        else {
          const content = await page.getTextContent();
          checkAbort(signal);
          // No header/footer removal, deduplication, summarization, or OCR rewrite.
          const ordered = orderPdfText(content.items, viewport.width, viewport.height);
          if (characters + ordered.text.length > BOOK_IMPORT_LIMITS.characters) {
            textBudgetReached = true; record.textStatus = 'limit'; limited.push(number);
          } else {
            record.text = ordered.text; characters += record.text.length;
            record.hasText = /\p{L}/u.test(record.text) || record.text.replace(/\s/g, '').length >= 8;
            record.textStatus = record.hasText ? 'extracted' : 'empty';
            if (!record.hasText) sparse.push(number);
            if (ordered.complex) complex.push(number);
            const heading = conservativeHeading(record.text);
            if (heading) {
              if (!bookmarkTitles.has(number)) record.title = heading;
              const key = heading.toLocaleLowerCase();
              if (!headingTitles.has(key)) { headingTitles.add(key); headingStarts.push({ title: heading, page: number }); }
            }
          }
        }
      } catch (error) {
        if (signal?.aborted) throw abortError();
        record.textStatus = 'unavailable'; unavailable.push(number);
      } finally { page?.cleanup(); }
      pages.push(record);
      await pause();
    }
    checkAbort(signal);
    if (sparse.length) warnings.push(`${sparse.length} página(s) sin texto seleccionable suficiente (${pageList(sparse)}). Se conservan completas en el lector original: pueden contener escaneos, figuras o páginas en blanco.`);
    if (unavailable.length) warnings.push(`No se pudo extraer texto de ${unavailable.length} página(s) (${pageList(unavailable)}). Sus posiciones se conservan; revisa esas páginas en el PDF original.`);
    if (limited.length) warnings.push(`Se alcanzó el límite de 3 millones de caracteres: no se extrajo texto de las páginas ${pageList(limited)}. Se conservan las ${totalPages} páginas físicas y el PDF completo; la búsqueda por texto no cubrirá esas páginas.`);
    if (complex.length) warnings.push(`Posibles columnas o tablas en páginas ${pageList(complex)}. El texto auxiliar puede tener otro orden; gráficos, fórmulas y distribución se consultan en el PDF original.`);
    const bookmarkStarts = chooseBookmarkStarts(bookmarks);
    let starts = bookmarkStarts; let source = 'bookmarks';
    if (!starts.length || (starts.length === 1 && starts[0].page === 1 && headingStarts.length >= 2)) {
      starts = headingStarts; source = starts.length ? 'headings' : 'fallback';
      warnings.push(starts.length ? 'La organización se propuso a partir de encabezados detectados; puedes ajustar los módulos sin eliminar páginas.' : 'No se detectó un índice utilizable. El libro se organizó en bloques contiguos de hasta 20 páginas, sin omitir contenido.');
    }
    const modules = partitionBookModules(totalPages, starts, source);
    const outline = bookmarks.length ? bookmarks : headingStarts.map(item => ({ ...item, level: 0 }));
    report(onProgress, 'done', totalPages, totalPages, `Libro listo: ${totalPages} páginas conservadas en ${modules.length} módulos.`);
    return { title, totalPages, pages, modules, outline, warnings, fingerprint, method: 'pdf-book' };
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (error.name === 'PasswordException') throw new Error('El PDF tiene contraseña. Usa una copia desbloqueada que estés autorizado a abrir.');
    throw error;
  } finally {
    signal?.removeEventListener('abort', stop);
    await loadingTask.destroy().catch(() => {});
  }
}
