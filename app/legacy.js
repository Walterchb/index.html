/** Local, explicit migration from the previous reader. Never deletes old data. */
const KEYS = [
  "course1StudyReader.v5",
  "course1StudyReader.v4",
  "course1StudyReader.v3",
  "course1StudyReader.v2",
];
const COURSE_ID = "legacy-course-1";
const SECTION_PAGES = {
  "front-cover": [1, 1],
  "front-copyright": [2, 2],
  "front-introduction": [3, 3],
  "m1-overview": [4, 4],
  "m1-l1": [5, 10],
  "m1-l2": [11, 14],
  "m1-l3": [15, 18],
  "m1-l4": [19, 27],
  "m1-summary": [28, 29],
  "m1-glossary": [30, 31],
  "m2-overview": [32, 32],
  "m2-l1": [33, 39],
  "m2-l2": [40, 43],
  "m2-l3": [44, 48],
  "m2-summary": [49, 50],
  "m2-glossary": [51, 51],
  "m3-overview": [52, 52],
  "m3-l1": [53, 57],
  "m3-l2": [58, 62],
  "m3-l3": [63, 71],
  "m3-summary": [72, 73],
  "m4-overview": [74, 74],
  "m4-l1": [75, 76],
  "m4-l2": [77, 78],
  "m4-l3": [79, 82],
  "m4-l4": [83, 93],
  "m4-summary": [94, 95],
  "m4-glossary": [96, 96],
  "m5-overview": [97, 97],
  "m5-l1": [98, 101],
  "m5-l2": [102, 104],
  "m5-l3": [105, 107],
  "m5-l4": [108, 115],
  "m5-l5": [116, 117],
  "m5-l6": [118, 122],
  "m5-l7": [123, 126],
  "m5-l8": [127, 135],
  "m5-l9": [136, 143],
  "m5-l10": [144, 152],
  "m5-summary": [153, 156],
  "m5-glossary": [157, 157],
};
const pageId = (n) => `legacy-page-${String(n).padStart(3, "0")}`;
const slug = (value) =>
  String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const record = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const array = (value) => (Array.isArray(value) ? value : []);
const resolvePage = (value) =>
  SECTION_PAGES[value]?.[0] ||
  (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 157
    ? Number(value)
    : null);
const moduleForPage = (page) =>
  Object.keys(SECTION_PAGES)
    .find(
      (key) => page >= SECTION_PAGES[key][0] && page <= SECTION_PAGES[key][1],
    )
    ?.split("-")[0] || "front";
const timestamp = (value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
function stableId(value) {
  let hash = 2166136261;
  for (const c of String(value))
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}

export function inspectLegacyProgress(storage) {
  const snapshots = {},
    raw = {},
    warnings = [];
  let sourceStorage;
  try {
    sourceStorage = storage || globalThis.localStorage;
  } catch {
    /* Storage is unavailable in some private contexts. */
  }
  if (!sourceStorage)
    return {
      found: false,
      warnings: ["El navegador no permite leer el almacenamiento anterior."],
      counts: {},
    };
  for (const key of KEYS) {
    try {
      const text = sourceStorage.getItem(key);
      if (!text) continue;
      raw[key] = text;
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        snapshots[key] = parsed;
      else
        warnings.push(
          `${key}: formato no reconocido; conservado en el respaldo.`,
        );
    } catch {
      warnings.push(`${key}: no se pudo interpretar; no se modificó.`);
    }
  }
  const key = KEYS.find((item) => snapshots[item]);
  if (!key) return { found: false, raw, snapshots, warnings, counts: {} };
  const state = snapshots[key];
  const progressMap = new Map(),
    notes = [],
    personalCards = [];
  const getProgress = (page) => {
    if (!progressMap.has(page))
      progressMap.set(page, {
        id: pageId(page),
        courseId: COURSE_ID,
        lessonId: pageId(page),
        completed: false,
        bookmarked: false,
        lastReadAt: 0,
      });
    return progressMap.get(page);
  };
  for (const [pageKey, complete] of Object.entries(
    record(state.completePages),
  )) {
    const page = resolvePage(pageKey);
    if (complete && page) getProgress(page).completed = true;
  }
  for (const [section, complete] of Object.entries(
    record(state.readProgress),
  )) {
    if (!complete || !SECTION_PAGES[section]) continue;
    const [start, end] = SECTION_PAGES[section];
    for (let page = start; page <= end; page++)
      getProgress(page).completed = true;
  }
  for (const favorite of array(state.favorites)) {
    const page = resolvePage(favorite);
    if (page) getProgress(page).bookmarked = true;
  }
  for (const [pageKey, pageNotes] of Object.entries(record(state.notes))) {
    const page = resolvePage(pageKey);
    if (!page) {
      warnings.push(
        `Notas con referencia no reconocida: ${pageKey}. Se mantienen en el respaldo.`,
      );
      continue;
    }
    const entries =
      typeof pageNotes === "string" ? [{ body: pageNotes }] : array(pageNotes);
    entries.forEach((note, index) => {
      const original = typeof note === "string" ? { body: note } : record(note);
      const text = [original.title, original.body ?? original.text]
        .filter(
          (value) => value !== undefined && value !== null && value !== "",
        )
        .join("\n\n");
      if (!text) return;
      notes.push({
        id: `legacy-note-${page}-${stableId(original.id || `${index}:${text}`)}`,
        courseId: COURSE_ID,
        moduleId: `legacy-${moduleForPage(page)}`,
        lessonId: pageId(page),
        text,
        createdAt: timestamp(original.createdAt),
        legacyUpdatedAt: timestamp(original.updatedAt),
        legacySource: original,
      });
    });
  }
  array(state.highlights).forEach((highlight, index) => {
    const page = resolvePage(highlight.page ?? highlight.sectionId);
    if (!page || !highlight.text) return;
    notes.push({
      id: `legacy-highlight-${page}-${stableId(highlight.id || `${index}:${highlight.text}`)}`,
      courseId: COURSE_ID,
      moduleId: `legacy-${moduleForPage(page)}`,
      lessonId: pageId(page),
      text: `Subrayado importado:\n${highlight.text}`,
      createdAt: timestamp(highlight.createdAt),
      legacyKind: "highlight",
      legacySource: highlight,
    });
  });
  array(state.personalWords).forEach((word, index) => {
    if (!word.text) return;
    const page = resolvePage(word.page ?? word.sectionId);
    personalCards.push({
      id: `legacy-word-${stableId(word.id || `${index}:${word.text}`)}`,
      courseId: COURSE_ID,
      moduleId: `legacy-${moduleForPage(page)}`,
      lessonId: page ? pageId(page) : null,
      front: word.text,
      back: `Fragmento guardado del lector anterior.${page ? ` Revisa el contexto en la página ${page}.` : ""}\nAñade tu definición o explicación antes de practicar.`,
      sourcePage: page,
      dueAt: 0,
      interval: 0,
      ease: 2.5,
      repetitions: 0,
      legacyStatus: word.status || "new",
      legacySource: word,
      needsDefinition: true,
    });
  });
  const cardStatuses = Object.entries(record(state.glossaryProgress)).map(
    ([term, value]) => ({
      id: `legacy-glossary-${slug(term)}`,
      term,
      status: record(value).status || "new",
      updatedAt: timestamp(record(value).updatedAt),
    }),
  );
  const currentPage = resolvePage(state.currentPage ?? state.lastSection);
  if (currentPage)
    getProgress(currentPage).lastReadAt = timestamp(state.updatedAt);
  const progress = [...progressMap.values()];
  return {
    found: true,
    key,
    raw,
    snapshots,
    warnings,
    progress,
    notes,
    personalCards,
    cardStatuses,
    currentLessonId: currentPage ? pageId(currentPage) : null,
    exerciseProgress: record(state.exerciseProgress),
    preferences: {
      theme: state.theme,
      readerFont: state.readerFont ?? state.fontSize,
      readerLineHeight: state.readerLineHeight,
      readerWidth: state.readerWidth,
    },
    counts: {
      completed: progress.filter((x) => x.completed).length,
      bookmarked: progress.filter((x) => x.bookmarked).length,
      notes: notes.length,
      personalCards: personalCards.length,
      glossaryStatuses: cardStatuses.length,
      exerciseResults: Object.keys(record(state.exerciseProgress)).length,
    },
  };
}

export async function migrateLegacyProgress(store, storage) {
  const inspection = inspectLegacyProgress(storage);
  if (!inspection.found) return inspection;
  // Back up the exact raw strings, including earlier versions, before writing progress.
  const previousBackup = await store.get("settings", "legacy-backup");
  const backup = {
    id: "legacy-backup",
    rawLocalStorage: { ...previousBackup?.rawLocalStorage, ...inspection.raw },
    firstImportedAt: previousBackup?.firstImportedAt || Date.now(),
    importedAt: Date.now(),
    sourceKey: inspection.key,
    warnings: inspection.warnings,
    exerciseProgress: inspection.exerciseProgress,
    preferences: inspection.preferences,
  };
  await store.put("settings", backup);
  if (!(await store.get("lessons", "legacy-page-001"))) {
    return {
      found: true,
      requiresCourse: true,
      counts: inspection.counts,
      message:
        "Importa primero curso-original.json y vuelve a recuperar el avance.",
      warnings: inspection.warnings,
    };
  }
  const counts = {
    progress: 0,
    notes: 0,
    personalCards: 0,
    glossaryStatuses: 0,
  };
  for (const progress of inspection.progress) {
    const current = await store.get("progress", progress.id);
    await store.put("progress", {
      ...current,
      ...progress,
      completed: Boolean(current?.completed || progress.completed),
      bookmarked: Boolean(current?.bookmarked || progress.bookmarked),
      lastReadAt: Math.max(
        timestamp(current?.lastReadAt),
        timestamp(progress.lastReadAt),
      ),
      importedFrom: inspection.key,
    });
    counts.progress++;
  }
  for (const note of inspection.notes) {
    if (await store.get("notes", note.id)) continue;
    await store.put("notes", note);
    counts.notes++;
  }
  for (const card of inspection.personalCards) {
    if (await store.get("cards", card.id)) continue;
    await store.put("cards", card);
    counts.personalCards++;
  }
  for (const status of inspection.cardStatuses) {
    const current = await store.get("cards", status.id);
    if (!current || current.legacyStatus === status.status) continue;
    await store.put("cards", {
      ...current,
      legacyStatus: status.status,
      legacyStatusUpdatedAt: status.updatedAt,
    });
    counts.glossaryStatuses++;
  }
  await store.put("settings", {
    id: "legacy-migration",
    sourceKey: inspection.key,
    importedAt: Date.now(),
    currentLessonId: inspection.currentLessonId,
    sourceCounts: inspection.counts,
    mappedCounts: counts,
    exerciseProgress: inspection.exerciseProgress,
    preferences: inspection.preferences,
    note: "Historical exercise summaries retained; no answer selection or review schedule was invented.",
  });
  return {
    found: true,
    migrated: true,
    counts,
    sourceCounts: inspection.counts,
    currentLessonId: inspection.currentLessonId,
    warnings: inspection.warnings,
  };
}
