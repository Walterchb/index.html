// A book is a physical page map. Text and headings can be edited; the source map stays intact.
export function auditBook(document, lessons, modules) {
  const total = Number(document.pages) || 0;
  const source = lessons.filter(
    (l) => l.documentId === document.id && l.kind === "pdf-page",
  );
  const counts = new Map();
  const invalid = [];
  for (const page of source) {
    if (
      !Number.isInteger(page.sourcePage) ||
      page.sourcePage < 1 ||
      page.sourcePage > total
    )
      invalid.push(page.id);
    else counts.set(page.sourcePage, (counts.get(page.sourcePage) || 0) + 1);
  }
  const missing = Array.from({ length: total }, (_, i) => i + 1).filter(
    (n) => !counts.has(n),
  );
  const duplicates = [...counts]
    .filter(([, count]) => count > 1)
    .map(([n]) => n);
  const orphaned = Array.isArray(modules)
    ? source
        .filter(
          (l) =>
            !modules.some(
              (m) => m.id === l.moduleId && m.courseId === l.courseId,
            ),
        )
        .map((l) => l.sourcePage)
    : [];
  return {
    total,
    represented: counts.size,
    missing,
    duplicates,
    invalid,
    orphaned,
    complete:
      total > 0 &&
      !missing.length &&
      !duplicates.length &&
      !invalid.length &&
      !orphaned.length,
    withoutText: source.filter((l) => !String(l.content || "").trim()).length,
  };
}
export function validateBookRanges(ranges, total) {
  if (!ranges.length) throw new Error("Crea al menos un módulo.");
  let next = 1;
  for (const r of ranges) {
    if (!r.title?.trim()) throw new Error("Cada módulo necesita un título.");
    if (
      !Number.isInteger(r.startPage) ||
      !Number.isInteger(r.endPage) ||
      r.startPage !== next ||
      r.endPage < r.startPage ||
      r.endPage > total
    )
      throw new Error(
        `Los módulos deben cubrir las páginas 1–${total}, en orden y sin huecos ni repeticiones. La siguiente página esperada es ${next}.`,
      );
    next = r.endPage + 1;
  }
  if (next !== total + 1)
    throw new Error(
      `Faltan páginas: el último módulo debe terminar en la página ${total}.`,
    );
  return ranges;
}
export function buildBookRecords(
  result,
  savedFile,
  {
    courseId,
    documentId,
    title,
    order = 0,
    makeId = () => crypto.randomUUID(),
  },
) {
  validateBookRanges(result.modules, result.totalPages);
  if (
    result.pages.length !== result.totalPages ||
    result.pages.some((p, i) => p.number !== i + 1)
  )
    throw new Error(
      "El mapa de páginas del PDF está incompleto. No se creó el curso.",
    );
  const modules = result.modules.map((m, i) => ({
    ...m,
    id: makeId(),
    courseId,
    documentId,
    title: m.title,
    order: i,
  }));
  const doc = {
    ...savedFile,
    id: documentId,
    courseId,
    title,
    kind: "pdf-book",
    pages: result.totalPages,
    fingerprint: result.fingerprint,
    method: result.method,
    outline: result.outline,
    pageLabels: result.pages.map((p) => p.label),
    structureSource: [...new Set(modules.map((m) => m.source))].join(", "),
    warnings: result.warnings,
    importedAt: new Date().toISOString(),
  };
  const lessons = result.pages.map((page) => {
    const mod = modules.find(
      (m) => page.number >= m.startPage && page.number <= m.endPage,
    );
    return {
      id: makeId(),
      courseId,
      moduleId: mod.id,
      documentId,
      kind: "pdf-page",
      title: page.title || `Página ${page.label || page.number}`,
      content: page.text || "",
      sourcePage: page.number,
      sourcePageEnd: page.number,
      sourceLabel: title,
      pageLabel: page.label,
      textStatus: page.textStatus,
      order: page.number - 1,
    };
  });
  const audit = auditBook(doc, lessons, modules);
  if (!audit.complete)
    throw new Error(
      "La validación de cobertura no pudo confirmar todas las páginas.",
    );
  const course = {
    id: courseId,
    title,
    description: `Lectura completa · ${result.totalPages} páginas · PDF original y notas por página.`,
    color: "#b4c2ad",
    order,
    kind: "pdf-book",
    sourceDocumentId: documentId,
  };
  return {
    course,
    document: doc,
    modules,
    lessons,
    records: [
      { kind: "courses", data: course },
      { kind: "documents", data: doc },
      ...modules.map((data) => ({ kind: "modules", data })),
      ...lessons.map((data) => ({ kind: "lessons", data })),
    ],
  };
}
