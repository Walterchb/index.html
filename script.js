/*
  Course 1 Study Reader
  ---------------------
  UI code intentionally contains no course corpus. The reading material is stored in
  small chunks under /data and loaded only when the learner opens it. That keeps the
  startup fast and lets the project grow into a multi-reading library.
*/

const MANIFEST = window.STUDY_CONTENT_MANIFEST;
const CONTENT = window.StudyContentRegistry;

if (!MANIFEST || !CONTENT) {
  throw new Error("No se pudo iniciar el lector: faltan los archivos de índice o contenido.");
}

/*
  Translation configuration
  -------------------------
  Default: MyMemory for short study fragments without a key.
  For more speed/reliability in a published version, use a private proxy (e.g. a
  Cloudflare Worker) or a self-hosted LibreTranslate endpoint. Never put a paid API key
  inside this static file.
*/
const TRANSLATION_CONFIG = {
  PROVIDER: "mymemory", // "mymemory" | "libretranslate" | "proxy"
  TRANSLATION_API_URL: "",
  API_KEY: "",
  SOURCE_LANGUAGE: "en",
  TARGET_LANGUAGE: "es",
  MYMEMORY_EMAIL: "",
  MAX_CHARS_PER_REQUEST: 1800,
  TIMEOUT_MS: 9000
};

const STORAGE_KEY = "course1StudyReader.v2";
const LEGACY_STORAGE_KEY = "course1StudyReader.v1";
const DEFAULT_STATE = {
  lastSection: MANIFEST.sections[0]?.id || "m1-overview",
  readProgress: {},
  favorites: [],
  notes: {},
  highlights: [],
  personalWords: [],
  exerciseProgress: {},
  glossaryProgress: {},
  theme: "light",
  fontSize: 18
};

const moduleById = new Map(MANIFEST.modules.map((module) => [module.id, module]));
const sectionMetaById = new Map(MANIFEST.sections.map((section) => [section.id, section]));
const exerciseById = new Map();
let glossaryEntries = [];
let persistTimer = null;
let scrollTicking = false;
let activeTranslationController = null;

let state = loadState();
const ui = {
  activeView: "bookView",
  bookMode: "read",
  currentSection: sectionMetaById.has(state.lastSection) ? state.lastSection : (MANIFEST.sections[0]?.id || ""),
  pendingSelection: null,
  noteEditing: null,
  practiceLevel: "1",
  practiceModule: "all",
  practiceFocusSection: null,
  practiceFeedback: {},
  activeExam: null,
  examFeedback: {},
  glossaryMode: "entries",
  glossarySearch: "",
  glossaryModule: "all",
  glossaryStatus: "all",
  glossaryLimit: 24,
  flashIndex: 0,
  flashOrder: [],
  flashRevealed: false,
  personalSectionFilter: "all",
  readerRequest: 0,
  practiceRequest: 0,
  glossaryRequest: 0,
  searchRequest: 0
};

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      return {
        ...clone(DEFAULT_STATE),
        ...saved,
        readProgress: saved.readProgress || {},
        notes: saved.notes || {},
        highlights: Array.isArray(saved.highlights) ? saved.highlights : [],
        favorites: Array.isArray(saved.favorites) ? saved.favorites : [],
        personalWords: Array.isArray(saved.personalWords) ? saved.personalWords : [],
        exerciseProgress: saved.exerciseProgress || {},
        glossaryProgress: saved.glossaryProgress || {}
      };
    }

    // One-time migration from the previous monolithic release. Translations are moved
    // to IndexedDB only when a new translation is requested; the main UI stays light.
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy && typeof legacy === "object") {
      const migrated = {
        ...clone(DEFAULT_STATE),
        ...legacy,
        readProgress: legacy.readProgress || {},
        notes: legacy.notes || {},
        highlights: Array.isArray(legacy.highlights) ? legacy.highlights : [],
        favorites: Array.isArray(legacy.favorites) ? legacy.favorites : [],
        personalWords: Array.isArray(legacy.personalWords) ? legacy.personalWords : [],
        exerciseProgress: legacy.exerciseProgress || {},
        glossaryProgress: legacy.glossaryProgress || {}
      };
      delete migrated.translations;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // A corrupted local state should never stop the reading experience.
  }
  return clone(DEFAULT_STATE);
}

function persistState() {
  clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persistStateNow, 120);
}

function persistStateNow() {
  clearTimeout(persistTimer);
  persistTimer = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast("No se pudo guardar todo el avance local. Libera espacio del navegador.", "warning");
  }
}

const translationStore = (() => {
  const memory = new Map();
  let dbPromise = null;
  let initialized = false;

  function openDatabase() {
    if (!("indexedDB" in window)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      const request = indexedDB.open("course1-study-reader-cache", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("translations")) {
          request.result.createObjectStore("translations", { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    return dbPromise;
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    const db = await openDatabase();
    if (!db) return;
    await new Promise((resolve) => {
      const request = db.transaction("translations", "readonly").objectStore("translations").getAll();
      request.onsuccess = () => {
        (request.result || []).forEach((item) => memory.set(item.key, item.value));
        resolve();
      };
      request.onerror = () => resolve();
    });
  }

  async function set(key, value) {
    memory.set(key, value);
    const db = await openDatabase();
    if (!db) return;
    await new Promise((resolve) => {
      const transaction = db.transaction("translations", "readwrite");
      transaction.objectStore("translations").put({ key, value, updatedAt: Date.now() });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  }

  async function remove(key) {
    memory.delete(key);
    const db = await openDatabase();
    if (!db) return;
    await new Promise((resolve) => {
      const transaction = db.transaction("translations", "readwrite");
      transaction.objectStore("translations").delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  }

  return {
    init,
    get: (key) => memory.get(key),
    set,
    remove
  };
})();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function moduleName(moduleId) {
  const module = moduleById.get(moduleId);
  return module ? `${module.number}: ${module.title}` : "";
}

function sectionMeta(sectionId) {
  return sectionMetaById.get(sectionId);
}

function sectionName(sectionId) {
  return sectionMeta(sectionId)?.title || "Sección";
}

function sourcePageRange(section) {
  const start = section.pageStart ?? Math.min(...(section.pages || []).map((page) => page.page));
  const end = section.pageEnd ?? Math.max(...(section.pages || []).map((page) => page.page));
  if (!Number.isFinite(start)) return "Fuente: paquete principal";
  return start === end ? `Fuente: paquete principal, p. ${start}` : `Fuente: paquete principal, pp. ${start}–${end}`;
}

function sectionWordCount(section) {
  const text = (section.pages || []).map((page) => page.text).join(" ");
  return normalizeText(text).split(" ").filter(Boolean).length;
}

function getSectionProgress(sectionId) {
  return Math.max(0, Math.min(1, Number(state.readProgress[sectionId] || 0)));
}

function isFavorite(sectionId) {
  return state.favorites.includes(sectionId);
}

function totalProgress() {
  const all = MANIFEST.sections.map((section) => getSectionProgress(section.id));
  return all.length ? all.reduce((sum, progress) => sum + progress, 0) / all.length : 0;
}

function studiedCount() {
  return MANIFEST.sections.filter((section) => getSectionProgress(section.id) >= 1).length;
}

function updateProgressUi() {
  const total = Math.round(totalProgress() * 100);
  $("#sidebarProgressValue").textContent = `${total}%`;
  $("#sidebarProgressBar").style.width = `${total}%`;
  $("#sidebarProgressText").textContent = `${studiedCount()} de ${MANIFEST.sections.length} secciones estudiadas`;

  const section = Math.round(getSectionProgress(ui.currentSection) * 100);
  $("#currentSectionProgress").textContent = `${section}%`;
  $("#railSectionProgress").textContent = `${section}%`;
  $(".radial-progress").style.setProperty("--progress", `${section}%`);
  $("#railSectionStatus").textContent = section >= 100 ? "Sección completada" : section > 0 ? "Lectura en progreso" : "Aún no marcada como estudiada";
}

function renderBookNav() {
  const nav = $("#bookNav");
  nav.innerHTML = MANIFEST.modules.map((module) => {
    const sections = MANIFEST.sections.filter((section) => section.moduleId === module.id);
    return `
      <div class="module-nav-group">
        <button type="button" class="module-nav-title" data-module-nav="${module.id}" aria-label="Abrir ${escapeHtml(module.number)}">
          <span>${escapeHtml(module.number)} · ${escapeHtml(module.title)}</span>
          <small>${sections.filter((section) => getSectionProgress(section.id) >= 1).length}/${sections.length}</small>
        </button>
        ${sections.map((section) => {
          const favorite = isFavorite(section.id);
          const marker = getSectionProgress(section.id) >= 1 ? "✓" : favorite ? "★" : "•";
          return `<button type="button" class="section-nav-button ${section.id === ui.currentSection ? "is-active" : ""} ${favorite ? "is-favorite" : ""}" data-section-id="${section.id}" title="${escapeHtml(section.title)}"><span class="nav-marker" aria-hidden="true">${marker}</span><span>${escapeHtml(section.label)} · ${escapeHtml(section.title)}</span></button>`;
        }).join("")}
      </div>`;
  }).join("");
}

function getStoredHighlights(sectionId) {
  return state.highlights
    .filter((item) => item.sectionId === sectionId && item.text)
    .map((item) => item.text)
    .filter((text, index, array) => array.indexOf(text) === index)
    .sort((a, b) => b.length - a.length);
}

function renderInlineText(text, sectionId) {
  let output = escapeHtml(text);
  getStoredHighlights(sectionId).forEach((highlight) => {
    const safeHighlight = escapeHtml(highlight);
    if (safeHighlight && output.includes(safeHighlight)) {
      output = output.replaceAll(safeHighlight, `<mark class="selection-highlight">${safeHighlight}</mark>`);
    }
  });
  return output;
}

function mergeLines(lines) {
  return lines.reduce((merged, original) => {
    const line = original.trim();
    if (!line) return merged;
    if (!merged) return line;
    if (merged.endsWith("-")) return `${merged.slice(0, -1)}${line}`;
    return `${merged} ${line}`;
  }, "");
}

function isHeading(line) {
  const clean = line.trim();
  const headingPatterns = [
    /^(Module|Lesson)\s+\d+:/,
    /^Exhibit\s+\d+:/,
    /^(Terminology|Introduction|Up Next|Conclusion|Summary|Financial Institutions|Banks|Insurance Companies|Brokers|Dealers|Clearinghouses|Custodians and Depositories|Passive Investment Managers|Active Investment Managers|Front Office|Middle Office|Back Office|Big Data|Natural Language Processing \(NLP\)|High-Frequency Trading|Automated Advice and Robo-Advisors|Mobile Banking|Decentralized Finance \(DeFi\)|Crypto Assets|The Need for Ethical Behavior|The CFA Institute Ethical Decision-Making Framework|Application of an Ethical Decision-Making Framework|Case Study: Applying an Ethical Decision-Making Framework)$/,
    /^[A-Z][A-Za-zÀ-ÿ0-9&/()'’.,—–\-]+(?: [A-Z][A-Za-zÀ-ÿ0-9&/()'’.,—–\-]+){0,10}$/
  ];
  return headingPatterns.some((pattern) => pattern.test(clean));
}

function isQuestionBlock(text) {
  return /^(Question\b|Lesson \d+ Knowledge Check\b|True or False:|Which of the following\b|Match the\b|Based on the above\b|Decentralized finance\b|Laws and regulations\b|In addition to reinforcing\b|Regulatory failures\b|The consequences of failure\b|According to fundamental\b|The fundamental ethical principle\b|The last step\b)/i.test(text.trim());
}

function formatTextBlock(rawBlock, sectionId) {
  const lines = rawBlock.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  const first = lines[0];
  const plain = mergeLines(lines);

  if (/^Exhibit\s+\d+:/i.test(first)) {
    const rest = lines.slice(1);
    return `<div class="source-exhibit"><div>${renderInlineText(first, sectionId)}</div>${rest.length ? `<p>${renderInlineText(mergeLines(rest), sectionId)}</p>` : ""}</div>`;
  }
  if (isQuestionBlock(plain) || /^Question\s*\d*/i.test(first)) {
    return `<div class="source-question">${lines.map((line) => `<p>${renderInlineText(line, sectionId)}</p>`).join("")}</div>`;
  }
  if (isHeading(first) && lines.length === 1) return `<h3>${renderInlineText(first, sectionId)}</h3>`;
  if (isHeading(first) && lines.length > 1) {
    const body = lines.slice(1);
    if (body.every((line) => /^([•●]|[oο]|\d+\.)\s*/.test(line))) {
      const items = body.map((line) => line.replace(/^([•●]|[oο]|\d+\.)\s*/, ""));
      return `<h3>${renderInlineText(first, sectionId)}</h3><ul>${items.map((item) => `<li>${renderInlineText(item, sectionId)}</li>`).join("")}</ul>`;
    }
    return `<h3>${renderInlineText(first, sectionId)}</h3><p>${renderInlineText(mergeLines(body), sectionId)}</p>`;
  }
  if (lines.every((line) => /^([•●]|[oο])\s*/.test(line))) {
    const items = lines.map((line) => line.replace(/^([•●]|[oο])\s*/, ""));
    return `<ul>${items.map((item) => `<li>${renderInlineText(item, sectionId)}</li>`).join("")}</ul>`;
  }

  const tableLike = lines.length >= 5 && (
    /^(Title|Responsibility|Category|Categories|Participant|Participants|Problem|Traditional|DeFi|Investor|Goals, Needs, and Roles|Circumstance|Description)$/i.test(lines[0]) ||
    lines.filter((line) => line.length < 48 && !/[.!?]$/.test(line)).length >= 4
  );
  if (tableLike) return `<div class="source-table">${lines.map((line) => renderInlineText(line, sectionId)).join("\n")}</div>`;
  return `<p>${renderInlineText(mergeLines(lines), sectionId)}</p>`;
}

function renderReaderContent(section) {
  return section.pages.map((page) => {
    const blocks = page.text.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
    return `<section class="source-page" data-source-page="${page.page}"><p class="source-page-label">Paquete principal · página ${page.page}</p>${blocks.map((block) => formatTextBlock(block, section.id)).join("")}</section>`;
  }).join("");
}

function renderNotes() {
  const notes = Array.isArray(state.notes[ui.currentSection]) ? state.notes[ui.currentSection] : [];
  const list = $("#notesList");
  list.innerHTML = notes.length ? notes.map((note) => `
    <article class="note-card">
      <h4>${escapeHtml(note.title)}</h4><p>${escapeHtml(note.body)}</p>
      <div class="note-actions"><button type="button" data-note-action="edit" data-note-id="${note.id}" aria-label="Editar nota">✎</button><button type="button" data-note-action="delete" data-note-id="${note.id}" aria-label="Eliminar nota">×</button></div>
    </article>`).join("") : `<p class="empty-notes">Aún no hay notas para esta sección. Escribe una idea, duda o conexión con tu trabajo.</p>`;
}

function setReaderSkeleton(meta) {
  const module = moduleById.get(meta.moduleId);
  $("#sectionMeta").textContent = `${module?.number || ""} · ${meta.label}`;
  $("#sectionTitle").textContent = meta.title;
  $("#sectionPageRange").textContent = sourcePageRange(meta);
  $("#currentSectionPages").textContent = meta.pageCount || "—";
  $("#readerMetrics").textContent = "Preparando lectura…";
  $("#readerContent").innerHTML = "";
  $("#readerContent").setAttribute("aria-busy", "true");
  $("#readerLoading").hidden = false;
  const favorite = isFavorite(meta.id);
  $("#favoriteSectionButton").classList.toggle("is-favorite", favorite);
  $("#favoriteSectionButton").setAttribute("aria-pressed", String(favorite));
  $("#favoriteSectionButton").innerHTML = `<span aria-hidden="true">${favorite ? "★" : "☆"}</span> ${favorite ? "Guardado" : "Guardar"}`;
  const studied = getSectionProgress(meta.id) >= 1;
  $("#markStudiedButton").textContent = studied ? "✓ Sección estudiada" : "Marcar como estudiado";
  $("#markStudiedBottomButton").textContent = studied ? "✓ Lectura finalizada" : "Finalizar lectura";
  renderNotes();
  renderBookNav();
  updateProgressUi();
}

async function renderReader() {
  const meta = sectionMeta(ui.currentSection);
  if (!meta) return;
  const requestId = ++ui.readerRequest;
  setReaderSkeleton(meta);
  try {
    const section = await CONTENT.loadSection(meta.id);
    if (requestId !== ui.readerRequest) return;
    $("#readerContent").innerHTML = renderReaderContent(section);
    $("#readerMetrics").textContent = `${sectionWordCount(section).toLocaleString("es-PE")} palabras · ${section.pages.length} página${section.pages.length === 1 ? "" : "s"}`;
    $("#readerContent").removeAttribute("aria-busy");
  } catch (error) {
    if (requestId !== ui.readerRequest) return;
    $("#readerContent").innerHTML = `<div class="empty-state">No se pudo abrir esta sección. Verifica que la carpeta <code>data/sections</code> esté junto al archivo <code>index.html</code>.</div>`;
    $("#readerMetrics").textContent = "Error de carga";
    showToast(error.message || "No se pudo cargar la sección.", "warning");
  } finally {
    if (requestId === ui.readerRequest) $("#readerLoading").hidden = true;
  }
}

function setCurrentSection(sectionId, { scroll = true } = {}) {
  if (!sectionMetaById.has(sectionId)) return;
  ui.currentSection = sectionId;
  state.lastSection = sectionId;
  state.readProgress[sectionId] = Math.max(getSectionProgress(sectionId), .08);
  persistState();
  ui.bookMode = "read";
  showView("bookView", { skipRender: true });
  setBookMode("read", { skipRender: true });
  void renderReader();
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
}

function markCurrentSectionStudied() {
  state.readProgress[ui.currentSection] = 1;
  persistState();
  void renderReader();
  showToast("Sección marcada como estudiada.", "success");
}

function toggleCurrentFavorite() {
  const index = state.favorites.indexOf(ui.currentSection);
  if (index >= 0) state.favorites.splice(index, 1);
  else state.favorites.push(ui.currentSection);
  persistState();
  void renderReader();
}

function openNoteDialog(noteId = null) {
  const notes = state.notes[ui.currentSection] || [];
  const note = noteId ? notes.find((item) => item.id === noteId) : null;
  ui.noteEditing = note?.id || null;
  $("#noteDialogTitle").textContent = note ? "Editar nota" : "Nueva nota";
  $("#noteTitleInput").value = note?.title || "";
  $("#noteBodyInput").value = note?.body || "";
  const dialog = $("#noteDialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
}

function saveNote() {
  const title = $("#noteTitleInput").value.trim();
  const body = $("#noteBodyInput").value.trim();
  if (!title || !body) return;
  const notes = state.notes[ui.currentSection] || [];
  if (ui.noteEditing) {
    const existing = notes.find((note) => note.id === ui.noteEditing);
    if (existing) Object.assign(existing, { title, body, updatedAt: Date.now() });
  } else {
    notes.unshift({ id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, body, createdAt: Date.now() });
  }
  state.notes[ui.currentSection] = notes;
  persistState();
  $("#noteDialog").close();
  renderNotes();
  showToast("Nota guardada.", "success");
}

function deleteNote(noteId) {
  state.notes[ui.currentSection] = (state.notes[ui.currentSection] || []).filter((note) => note.id !== noteId);
  persistState();
  renderNotes();
  showToast("Nota eliminada.");
}

function showView(viewId, { skipRender = false } = {}) {
  ui.activeView = viewId;
  $$(".view-panel").forEach((panel) => { panel.hidden = panel.id !== viewId; });
  $$(".nav-tab").forEach((button) => button.classList.toggle("is-active", button.dataset.viewTarget === viewId));
  $("#bookNavWrap").hidden = viewId !== "bookView";
  $("#searchResults").innerHTML = "";
  $("#globalSearch").value = "";
  closeMobileSidebar();

  if (viewId === "bookView") {
    $("#viewKicker").textContent = "MÓDULO LIBRO";
    $("#topbarTitle").textContent = ui.bookMode === "practice" ? "Práctica guiada" : "Lectura guiada";
    if (!skipRender && ui.bookMode === "read") void renderReader();
    if (!skipRender && ui.bookMode === "practice") void renderPractice();
  } else {
    $("#viewKicker").textContent = "MÓDULO GLOSARIO";
    $("#topbarTitle").textContent = ui.glossaryMode === "flashcards" ? "Tarjetas de memoria" : ui.glossaryMode === "personal" ? "Mis palabras" : "Glosario";
    if (!skipRender) void renderGlossary();
  }
}

function setBookMode(mode, { skipRender = false } = {}) {
  ui.bookMode = mode;
  $("#readMode").hidden = mode !== "read";
  $("#practiceMode").hidden = mode !== "practice";
  $$("[data-book-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.bookMode === mode));
  $("#topbarTitle").textContent = mode === "practice" ? "Práctica guiada" : "Lectura guiada";
  if (!skipRender && mode === "practice") void renderPractice();
}

function setGlossaryMode(mode) {
  ui.glossaryMode = mode;
  $("#glossaryEntriesMode").hidden = mode !== "entries";
  $("#flashcardsMode").hidden = mode !== "flashcards";
  $("#personalWordsMode").hidden = mode !== "personal";
  $$("[data-glossary-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.glossaryMode === mode));
  $("#topbarTitle").textContent = mode === "flashcards" ? "Tarjetas de memoria" : mode === "personal" ? "Mis palabras" : "Glosario";
  void renderGlossary();
}

function openPracticeForSection(sectionId) {
  const meta = sectionMeta(sectionId);
  if (!meta) return;
  ui.practiceModule = meta.moduleId;
  ui.practiceFocusSection = sectionId;
  ui.practiceLevel = "1";
  ui.practiceFeedback = {};
  ui.activeExam = null;
  ui.examFeedback = {};
  showView("bookView", { skipRender: true });
  setBookMode("practice", { skipRender: true });
  void renderPractice();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showSectionWords() {
  ui.personalSectionFilter = ui.currentSection;
  showView("glossaryView", { skipRender: true });
  setGlossaryMode("personal");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getExerciseProgress(id) {
  return state.exerciseProgress[id] || { attempts: 0, correct: false, wrongAttempts: 0 };
}

function getExerciseStats() {
  const total = Object.values(MANIFEST.exerciseCounts || {}).reduce((sum, count) => sum + Number(count || 0), 0);
  const progress = Object.values(state.exerciseProgress);
  const complete = progress.filter((item) => item?.correct).length;
  const errors = progress.reduce((sum, item) => sum + Number(item?.wrongAttempts || 0), 0);
  return { total, complete, pending: Math.max(0, total - complete), errors };
}

function populatePracticeModuleFilter() {
  const select = $("#practiceModuleFilter");
  select.innerHTML = `<option value="all">Todas las unidades</option>${MANIFEST.modules.map((module) => `<option value="${module.id}">${escapeHtml(module.number)} · ${escapeHtml(module.title)}</option>`).join("")}`;
  select.value = ui.practiceModule;
  $("#clearPracticeFocusButton").hidden = !ui.practiceFocusSection;
}

function renderPracticeStats() {
  const stats = getExerciseStats();
  $("#practiceStats").innerHTML = `<div class="practice-stat"><strong>${stats.pending}</strong><small>Pendientes</small></div><div class="practice-stat"><strong>${stats.complete}</strong><small>Completados</small></div><div class="practice-stat"><strong>${stats.errors}</strong><small>Con error</small></div>`;
}

async function getPracticeBaseExercises() {
  const ids = ui.practiceModule === "all" ? MANIFEST.modules.map((module) => module.id) : [ui.practiceModule];
  const loaded = await CONTENT.loadAllExercises(ids);
  loaded.forEach((exercise) => exerciseById.set(exercise.id, exercise));
  return ui.practiceFocusSection ? loaded.filter((exercise) => exercise.sectionId === ui.practiceFocusSection) : loaded;
}

function sourceRef(exercise) {
  const module = moduleById.get(exercise.moduleId);
  return `${module?.number || "Módulo"} · ${sectionName(exercise.sectionId)} · p. ${exercise.page}`;
}

function renderExerciseCard(exercise, { inExam = false } = {}) {
  const feedback = inExam ? ui.examFeedback[exercise.id] : ui.practiceFeedback[exercise.id];
  const inputName = `${inExam ? "exam" : "practice"}-${exercise.id}`;
  let inputContent = "";

  if (exercise.type === "single" || exercise.type === "multiple") {
    const inputType = exercise.type === "multiple" ? "checkbox" : "radio";
    inputContent = `<div class="exercise-options">${exercise.options.map(([key, text]) => `<label class="exercise-option"><input type="${inputType}" name="${inputName}" value="${escapeHtml(key)}" /><span><strong>${escapeHtml(key)}.</strong> ${escapeHtml(text)}</span></label>`).join("")}</div>`;
  } else if (exercise.type === "matching") {
    inputContent = `<div class="match-grid">${exercise.pairs.map((pair) => `<label class="match-row"><span><strong>${escapeHtml(pair.label)}</strong></span><select data-match-key="${escapeHtml(pair.key)}" aria-label="Objetivo para ${escapeHtml(pair.label)}"><option value="">Selecciona un objetivo</option>${exercise.matchOptions.map(([key, text]) => `<option value="${escapeHtml(key)}">${escapeHtml(key)}. ${escapeHtml(text)}</option>`).join("")}</select></label>`).join("")}</div>`;
  } else if (exercise.type === "matrix") {
    inputContent = `<div class="matrix-grid">${exercise.matrixRows.map(([key, text]) => `<label class="matrix-row"><span>${escapeHtml(text)}</span><select data-matrix-key="${escapeHtml(key)}" aria-label="Respuesta para ${escapeHtml(text)}"><option value="">Selecciona una opción</option>${exercise.matrixOptions.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}</select></label>`).join("")}</div>`;
  }

  const feedbackHtml = feedback ? `<div class="exercise-feedback ${feedback.correct ? "is-correct" : "is-wrong"}"><strong>${feedback.correct ? "Correcto" : "Todavía no"}</strong><p>${escapeHtml(exercise.feedback)}</p><p class="helper-text">Referencia: <button type="button" class="inline-link" data-go-section="${exercise.sectionId}">${escapeHtml(sectionName(exercise.sectionId))}</button>, p. ${exercise.page}.</p></div>` : "";

  return `<article class="exercise-card" data-exercise-id="${exercise.id}" data-in-exam="${inExam}"><div class="exercise-card-head"><h4>${escapeHtml(exercise.title)}</h4><span class="source-reference">${escapeHtml(sourceRef(exercise))}</span></div><p class="exercise-question">${escapeHtml(exercise.question)}</p>${inputContent}<div class="card-actions"><button type="button" class="primary-button" data-exercise-action="verify" data-exercise-id="${exercise.id}" data-in-exam="${inExam}">Verificar respuesta</button>${feedback ? `<button type="button" class="secondary-button" data-exercise-action="retry" data-exercise-id="${exercise.id}" data-in-exam="${inExam}">Intentar nuevamente</button>` : ""}</div>${feedbackHtml}</article>`;
}

function describePracticeLevel() {
  const moduleTitle = ui.practiceModule === "all" ? "todas las unidades" : moduleName(ui.practiceModule);
  const focus = ui.practiceFocusSection ? ` Se muestra la sección: <strong>${escapeHtml(sectionName(ui.practiceFocusSection))}</strong>.` : "";
  return {
    "1": `Nivel 1 · Identificación y lectura inicial con actividades originales de ${escapeHtml(moduleTitle)}.${focus}`,
    "2": `Nivel 2 · Comprensión, relaciones y aplicación de los controles originales del PDF para ${escapeHtml(moduleTitle)}.${focus}`,
    "3": `Nivel 3 · Repaso acumulativo: prioriza preguntas originales donde tuviste errores. No se generan preguntas nuevas.${focus}`,
    "4": `Nivel 4 · Evaluación: selecciona hasta cinco preguntas originales del material y calcula tu resultado al verificar todas.${focus}`
  }[ui.practiceLevel];
}

function renderEvaluation(exercises) {
  if (!ui.activeExam || ui.activeExam.module !== ui.practiceModule || ui.activeExam.focus !== ui.practiceFocusSection) {
    return `<section class="evaluation-panel"><h4>Evaluación basada en ejercicios existentes</h4><p>Se seleccionarán hasta cinco preguntas originales del material, sin añadir contenido académico nuevo.</p><button type="button" class="primary-button" data-practice-action="generate-exam">Generar evaluación</button></section>`;
  }
  const selected = ui.activeExam.ids.map((id) => exerciseById.get(id)).filter(Boolean);
  const checked = Object.keys(ui.activeExam.verified || {}).length;
  const correct = Object.values(ui.activeExam.verified || {}).filter(Boolean).length;
  const finished = checked === selected.length && selected.length > 0;
  const score = selected.length ? Math.round((correct / selected.length) * 100) : 0;
  return `<section class="evaluation-panel"><h4>Evaluación en curso</h4><p>Resultado: <span class="exam-score">${correct}/${selected.length}${finished ? ` · ${score}%` : ` · ${checked} respondidas`}</span></p><button type="button" class="secondary-button" data-practice-action="generate-exam">Generar una nueva evaluación</button></section>${selected.map((exercise) => renderExerciseCard(exercise, { inExam: true })).join("")}`;
}

async function renderPractice() {
  const requestId = ++ui.practiceRequest;
  populatePracticeModuleFilter();
  $$(".level-tab").forEach((button) => button.classList.toggle("is-active", button.dataset.practiceLevel === ui.practiceLevel));
  $("#practiceDescription").innerHTML = describePracticeLevel();
  renderPracticeStats();
  $("#practiceLoading").hidden = false;
  $("#practiceList").innerHTML = "";

  try {
    let exercises = await getPracticeBaseExercises();
    if (requestId !== ui.practiceRequest) return;
    if (ui.practiceLevel === "1" || ui.practiceLevel === "2") exercises = exercises.filter((exercise) => String(exercise.level) === ui.practiceLevel);
    if (ui.practiceLevel === "3") {
      const errors = exercises.filter((exercise) => getExerciseProgress(exercise.id).wrongAttempts > 0);
      exercises = errors.length ? errors : exercises;
    }
    $("#practiceList").innerHTML = ui.practiceLevel === "4" ? renderEvaluation(exercises) : exercises.length ? exercises.map((exercise) => renderExerciseCard(exercise)).join("") : `<div class="empty-state">No hay ejercicios de este nivel para el filtro actual. Cambia de nivel o unidad para revisar el resto del material.</div>`;
  } catch (error) {
    if (requestId !== ui.practiceRequest) return;
    $("#practiceList").innerHTML = `<div class="empty-state">No se pudieron cargar los ejercicios de esta unidad.</div>`;
    showToast(error.message || "No se pudo abrir la práctica.", "warning");
  } finally {
    if (requestId === ui.practiceRequest) $("#practiceLoading").hidden = true;
  }
}

function getSubmittedAnswer(exercise, card) {
  if (exercise.type === "single" || exercise.type === "multiple") {
    return $$(`input[name="${card.querySelector("input")?.name || ""}"]:checked`, card).map((input) => input.value);
  }
  if (exercise.type === "matching") return exercise.pairs.map((pair) => card.querySelector(`[data-match-key="${pair.key}"]`)?.value || "");
  if (exercise.type === "matrix") return exercise.matrixRows.map(([key]) => card.querySelector(`[data-matrix-key="${key}"]`)?.value || "");
  return [];
}

function hasCompleteAnswer(exercise, answer) {
  if (!Array.isArray(answer) || !answer.length) return false;
  if (exercise.type === "single" || exercise.type === "multiple") return answer.length > 0;
  return answer.every(Boolean);
}

function isCorrectAnswer(exercise, answer) {
  if (exercise.type === "single" || exercise.type === "multiple") {
    const chosen = [...answer].sort();
    const correct = [...exercise.answer].sort();
    return chosen.length === correct.length && chosen.every((value, index) => value === correct[index]);
  }
  if (exercise.type === "matching") return exercise.pairs.every((pair, index) => answer[index] === pair.answer);
  if (exercise.type === "matrix") return exercise.matrixRows.every((row, index) => answer[index] === row[2]);
  return false;
}

function verifyExercise(id, inExam) {
  const exercise = exerciseById.get(id);
  const card = $(`.exercise-card[data-exercise-id="${id}"][data-in-exam="${inExam}"]`);
  if (!exercise || !card) return;
  const answer = getSubmittedAnswer(exercise, card);
  if (!hasCompleteAnswer(exercise, answer)) {
    showToast("Selecciona una respuesta antes de verificar.", "warning");
    return;
  }
  const correct = isCorrectAnswer(exercise, answer);
  if (inExam === "true") {
    ui.examFeedback[id] = { correct };
    ui.activeExam.verified[id] = correct;
  } else {
    const previous = getExerciseProgress(id);
    state.exerciseProgress[id] = { attempts: Number(previous.attempts || 0) + 1, correct: Boolean(previous.correct || correct), wrongAttempts: Number(previous.wrongAttempts || 0) + (correct ? 0 : 1) };
    ui.practiceFeedback[id] = { correct };
    persistState();
  }
  void renderPractice();
}

function retryExercise(id, inExam) {
  if (inExam === "true") {
    delete ui.examFeedback[id];
    if (ui.activeExam?.verified) delete ui.activeExam.verified[id];
  } else delete ui.practiceFeedback[id];
  void renderPractice();
}

function shuffle(array) {
  const copy = [...array];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

async function generateExam() {
  const base = await getPracticeBaseExercises();
  const pool = base.length ? base : await CONTENT.loadAllExercises(MANIFEST.modules.map((module) => module.id));
  pool.forEach((exercise) => exerciseById.set(exercise.id, exercise));
  ui.activeExam = { module: ui.practiceModule, focus: ui.practiceFocusSection, ids: shuffle(pool.map((exercise) => exercise.id)).slice(0, Math.min(5, pool.length)), verified: {} };
  ui.examFeedback = {};
  void renderPractice();
}

function glossaryKey(entry) { return entry.term; }
function glossaryStatus(entry) { return state.glossaryProgress[glossaryKey(entry)] || "new"; }
function setGlossaryStatus(entry, status) { state.glossaryProgress[glossaryKey(entry)] = status; persistState(); }

function glossaryTranslationKey(entry) { return `glossary:${entry.term}`; }
function personalTranslationKey(word) { return `personal:${word.id}`; }

function filteredGlossaryEntries() {
  const term = ui.glossarySearch.toLowerCase().trim();
  return glossaryEntries.filter((entry) => {
    const moduleId = entry.origin?.moduleId || "unknown";
    const status = glossaryStatus(entry);
    const matchText = !term || `${entry.term} ${entry.definition} ${entry.example || ""}`.toLowerCase().includes(term);
    const matchModule = ui.glossaryModule === "all" || moduleId === ui.glossaryModule;
    const matchStatus = ui.glossaryStatus === "all" || status === ui.glossaryStatus;
    return matchText && matchModule && matchStatus;
  });
}

function populateGlossaryModuleFilter() {
  const select = $("#glossaryModuleFilter");
  select.innerHTML = `<option value="all">Todos los capítulos</option>${MANIFEST.modules.map((module) => `<option value="${module.id}">${escapeHtml(module.number)}</option>`).join("")}`;
  select.value = ui.glossaryModule;
  $("#glossaryStatusFilter").value = ui.glossaryStatus;
}

function sourceOriginHtml(entry) {
  if (!entry.origin) return `Glosario complementario · p. ${entry.glossaryPage}`;
  const module = moduleById.get(entry.origin.moduleId);
  return `Glosario complementario · p. ${entry.glossaryPage} · Primera mención: <button type="button" data-go-section="${entry.origin.sectionId}">${escapeHtml(module?.number || "Módulo")} · ${escapeHtml(entry.origin.sectionTitle)}, p. ${entry.origin.page}</button>`;
}

function renderGlossaryCard(entry) {
  const status = glossaryStatus(entry);
  const translation = translationStore.get(glossaryTranslationKey(entry));
  return `<article class="glossary-card" data-glossary-term="${escapeHtml(entry.term)}"><h3>${escapeHtml(entry.term)}</h3><p class="entry-translation">${translation ? `ES: ${escapeHtml(translation)}` : "ES: traducir al seleccionar el botón"}</p><p class="entry-definition">${escapeHtml(entry.definition)}</p><p class="entry-source">${sourceOriginHtml(entry)}</p><div class="entry-actions"><button type="button" class="small-action" data-gloss-action="translate" data-glossary-term="${escapeHtml(entry.term)}">Traducir</button><button type="button" class="small-action" data-gloss-action="pronounce" data-glossary-term="${escapeHtml(entry.term)}">Escuchar</button><button type="button" class="small-action ${status === "learned" ? "is-learned" : ""}" data-gloss-action="learned" data-glossary-term="${escapeHtml(entry.term)}">${status === "learned" ? "✓ Aprendida" : "Marcar aprendida"}</button><button type="button" class="small-action ${status === "review" ? "is-review" : ""}" data-gloss-action="review" data-glossary-term="${escapeHtml(entry.term)}">${status === "review" ? "↻ En repaso" : "Repasar después"}</button></div>${entry.example ? `<details class="example-details"><summary>Ver uso original en el libro</summary><p>${escapeHtml(entry.example)}</p></details>` : ""}</article>`;
}

function renderGlossaryStats() {
  const learned = glossaryEntries.filter((entry) => glossaryStatus(entry) === "learned").length;
  const review = glossaryEntries.filter((entry) => glossaryStatus(entry) === "review").length;
  $("#glossaryTitleCount").textContent = glossaryEntries.length || MANIFEST.glossaryCount || "—";
  $("#glossaryStats").innerHTML = `<div class="glossary-stat"><strong>${glossaryEntries.length || MANIFEST.glossaryCount || 0}</strong><small>Términos</small></div><div class="glossary-stat"><strong>${learned}</strong><small>Aprendidas</small></div><div class="glossary-stat"><strong>${review}</strong><small>En repaso</small></div>`;
}

function renderGlossaryEntries() {
  populateGlossaryModuleFilter();
  $("#glossarySearch").value = ui.glossarySearch;
  const filtered = filteredGlossaryEntries();
  const visible = filtered.slice(0, ui.glossaryLimit);
  $("#glossaryList").innerHTML = visible.length ? visible.map(renderGlossaryCard).join("") : `<div class="empty-state">No hay entradas que coincidan con estos filtros.</div>`;
  $("#loadMoreGlossaryButton").hidden = filtered.length <= visible.length;
  $("#loadMoreGlossaryButton").textContent = `Mostrar ${Math.min(24, filtered.length - visible.length)} términos más (${visible.length}/${filtered.length})`;
}

function getFlashEntries() {
  const entries = filteredGlossaryEntries();
  if (!ui.flashOrder.length || ui.flashOrder.some((term) => !entries.some((entry) => entry.term === term))) {
    ui.flashOrder = entries.map((entry) => entry.term);
    ui.flashIndex = 0;
  }
  return ui.flashOrder.map((term) => entries.find((entry) => entry.term === term)).filter(Boolean);
}

function renderFlashcard() {
  const entries = getFlashEntries();
  $("#flashcardCount").textContent = entries.length ? `Tarjeta ${(ui.flashIndex % entries.length) + 1} de ${entries.length}` : "Sin tarjetas para estos filtros";
  if (!entries.length) {
    $("#flashcardStage").innerHTML = `<div class="empty-state">Ajusta los filtros de Entradas para generar tarjetas.</div>`;
    return;
  }
  const entry = entries[ui.flashIndex % entries.length];
  const translation = translationStore.get(glossaryTranslationKey(entry));
  const answer = ui.flashRevealed ? `<div class="flashcard-answer"><p><strong>Definición original:</strong> ${escapeHtml(entry.definition)}</p><p><strong>Español:</strong> ${translation ? escapeHtml(translation) : "Aún no traducida. Usa “Traducir término”."}</p></div>` : `<p class="flash-hint">Recuerda primero la definición o traducción; después revela la respuesta.</p>`;
  $("#flashcardStage").innerHTML = `<article class="flashcard"><div><p class="eyebrow">TÉRMINO EN INGLÉS</p><h3 class="flash-term">${escapeHtml(entry.term)}</h3></div><div>${answer}</div><div class="flashcard-actions">${ui.flashRevealed ? `<button type="button" class="secondary-button" data-flash-action="translate">Traducir término</button><button type="button" class="primary-button" data-flash-action="learned">La sé</button><button type="button" class="secondary-button" data-flash-action="review">Necesito repasar</button><button type="button" class="secondary-button" data-flash-action="pending">No la sé</button>` : `<button type="button" class="primary-button" data-flash-action="reveal">Revelar definición</button><button type="button" class="secondary-button" data-flash-action="pronounce">Escuchar</button>`}</div></article>`;
}

function populatePersonalSectionFilter() {
  const select = $("#personalWordsSectionFilter");
  select.innerHTML = `<option value="all">Todas las secciones</option>${MANIFEST.sections.map((section) => `<option value="${section.id}">${escapeHtml(moduleById.get(section.moduleId)?.number || "Módulo")} · ${escapeHtml(section.title)}</option>`).join("")}`;
  select.value = ui.personalSectionFilter;
}

function personalWordStatus(word) { return state.glossaryProgress[`personal:${word.id}`] || "new"; }

function renderPersonalWords() {
  populatePersonalSectionFilter();
  let words = [...state.personalWords];
  if (ui.personalSectionFilter !== "all") words = words.filter((word) => word.sectionId === ui.personalSectionFilter);
  $("#personalWordsList").innerHTML = words.length ? words.map((word) => {
    const translation = translationStore.get(personalTranslationKey(word));
    const status = personalWordStatus(word);
    return `<article class="glossary-card"><h3>${escapeHtml(word.text)}</h3><p class="entry-translation">${translation ? `ES: ${escapeHtml(translation)}` : "ES: traducir al seleccionar el botón"}</p><p class="entry-definition">Fragmento guardado desde la sección de lectura.</p><p class="entry-source">Origen: <button type="button" data-go-section="${word.sectionId}">${escapeHtml(sectionName(word.sectionId))}</button></p><div class="entry-actions"><button type="button" class="small-action" data-personal-action="translate" data-personal-id="${word.id}">Traducir</button><button type="button" class="small-action" data-personal-action="pronounce" data-personal-id="${word.id}">Escuchar</button><button type="button" class="small-action ${status === "learned" ? "is-learned" : ""}" data-personal-action="learned" data-personal-id="${word.id}">${status === "learned" ? "✓ Aprendida" : "Marcar aprendida"}</button><button type="button" class="small-action ${status === "review" ? "is-review" : ""}" data-personal-action="review" data-personal-id="${word.id}">${status === "review" ? "↻ En repaso" : "Repasar después"}</button><button type="button" class="small-action" data-personal-action="delete" data-personal-id="${word.id}">Eliminar</button></div></article>`;
  }).join("") : `<div class="empty-state">No hay palabras o fragmentos guardados en este filtro.</div>`;
}

async function renderGlossary() {
  const requestId = ++ui.glossaryRequest;
  if (ui.glossaryMode === "personal") {
    await translationStore.init();
    if (requestId === ui.glossaryRequest) renderPersonalWords();
    return;
  }
  $("#glossaryLoading").hidden = false;
  try {
    const [entries] = await Promise.all([CONTENT.loadGlossary(), translationStore.init()]);
    if (requestId !== ui.glossaryRequest) return;
    glossaryEntries = entries;
    renderGlossaryStats();
    if (ui.glossaryMode === "entries") renderGlossaryEntries();
    if (ui.glossaryMode === "flashcards") renderFlashcard();
  } catch (error) {
    if (requestId !== ui.glossaryRequest) return;
    $("#glossaryList").innerHTML = `<div class="empty-state">No se pudo cargar el glosario.</div>`;
    showToast(error.message || "No se pudo abrir el glosario.", "warning");
  } finally {
    if (requestId === ui.glossaryRequest) $("#glossaryLoading").hidden = true;
  }
}

function translationCacheKey(text) {
  return `${TRANSLATION_CONFIG.SOURCE_LANGUAGE}-${TRANSLATION_CONFIG.TARGET_LANGUAGE}:${normalizeText(text).toLowerCase()}`;
}

function createTimeoutController() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TRANSLATION_CONFIG.TIMEOUT_MS);
  return { controller, clear: () => window.clearTimeout(timeout) };
}

async function requestTranslation(text, { cancelPrevious = false } = {}) {
  const sourceText = normalizeText(text);
  if (!sourceText) return { translatedText: "", message: "Selecciona un fragmento antes de traducir." };
  if (sourceText.length > TRANSLATION_CONFIG.MAX_CHARS_PER_REQUEST) return { translatedText: "", message: `Selecciona hasta ${TRANSLATION_CONFIG.MAX_CHARS_PER_REQUEST.toLocaleString("es-PE")} caracteres por traducción.` };
  await translationStore.init();
  const key = translationCacheKey(sourceText);
  const cached = translationStore.get(key);
  if (cached) return { translatedText: cached, message: "Traducción recuperada de tu caché local." };

  if (cancelPrevious && activeTranslationController) activeTranslationController.abort();
  const { controller, clear } = createTimeoutController();
  if (cancelPrevious) activeTranslationController = controller;

  try {
    let translatedText = "";
    let message = "";
    if (TRANSLATION_CONFIG.PROVIDER === "mymemory") {
      const params = new URLSearchParams({ q: sourceText, langpair: `${TRANSLATION_CONFIG.SOURCE_LANGUAGE}|${TRANSLATION_CONFIG.TARGET_LANGUAGE}` });
      if (TRANSLATION_CONFIG.MYMEMORY_EMAIL) params.set("de", TRANSLATION_CONFIG.MYMEMORY_EMAIL);
      const response = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Servicio de traducción: ${response.status}`);
      const payload = await response.json();
      translatedText = normalizeText(payload?.responseData?.translatedText);
      if (!translatedText) throw new Error("El servicio no devolvió una traducción.");
      message = "Traducción automática. Guarda las más usadas en este navegador para abrirlas más rápido.";
    } else if (TRANSLATION_CONFIG.PROVIDER === "libretranslate" || TRANSLATION_CONFIG.PROVIDER === "proxy") {
      const endpoint = TRANSLATION_CONFIG.TRANSLATION_API_URL;
      if (!endpoint) throw new Error("No hay una URL de traducción configurada.");
      const response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: sourceText, source: TRANSLATION_CONFIG.SOURCE_LANGUAGE, target: TRANSLATION_CONFIG.TARGET_LANGUAGE, format: "text", api_key: TRANSLATION_CONFIG.API_KEY || undefined })
      });
      if (!response.ok) throw new Error(`Servicio de traducción: ${response.status}`);
      const payload = await response.json();
      translatedText = normalizeText(payload.translatedText || payload.translation || payload.text);
      if (!translatedText) throw new Error("El servicio no devolvió una traducción.");
      message = "Traducción recibida desde la integración configurada.";
    } else {
      throw new Error("Proveedor de traducción no reconocido.");
    }
    await translationStore.set(key, translatedText);
    return { translatedText, message };
  } catch (error) {
    const detail = error?.name === "AbortError" ? "La solicitud tardó demasiado o fue reemplazada por otra." : error?.message || "Error desconocido.";
    return { translatedText: "", message: `No se pudo traducir este fragmento. ${detail}` };
  } finally {
    clear();
    if (activeTranslationController === controller) activeTranslationController = null;
  }
}

async function openTranslationDialog(text) {
  const dialog = $("#translationDialog");
  $("#translationOriginal").textContent = text;
  $("#translationResult").textContent = "Preparando traducción…";
  $("#translationStatus").textContent = "";
  if (typeof dialog.showModal === "function") dialog.showModal();
  const result = await requestTranslation(text, { cancelPrevious: true });
  $("#translationResult").textContent = result.translatedText || "No se generó una traducción.";
  $("#translationStatus").textContent = result.message;
}

async function translateGlossaryEntry(entry) {
  const result = await requestTranslation(entry.term);
  if (result.translatedText) showToast("Traducción guardada para este navegador.", "success");
  else showToast("No se pudo traducir el término. Revisa tu conexión o configuración.", "warning");
  void renderGlossary();
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    showToast("Tu navegador no ofrece síntesis de voz.", "warning");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = .9;
  window.speechSynthesis.speak(utterance);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
  showToast("Texto copiado.", "success");
}

function showSelectionToolbar() {
  const selection = window.getSelection();
  const text = normalizeText(selection?.toString());
  if (!text || text.length > 3000) {
    hideSelectionToolbar();
    return;
  }
  const range = selection.getRangeAt?.(0);
  if (!range || !$("#readerContent").contains(range.commonAncestorContainer)) {
    hideSelectionToolbar();
    return;
  }
  const rect = range.getBoundingClientRect();
  ui.pendingSelection = { text, sectionId: ui.currentSection };
  const toolbar = $("#selectionToolbar");
  toolbar.hidden = false;
  const maxLeft = window.innerWidth - toolbar.offsetWidth - 8;
  toolbar.style.left = `${Math.max(8, Math.min(rect.left, maxLeft))}px`;
  toolbar.style.top = `${Math.max(8, rect.top - toolbar.offsetHeight - 10)}px`;
}

function hideSelectionToolbar() {
  $("#selectionToolbar").hidden = true;
}

function addSelectionToPersonalGlossary() {
  const selected = ui.pendingSelection;
  if (!selected?.text) return;
  const duplicate = state.personalWords.some((word) => word.text === selected.text && word.sectionId === selected.sectionId);
  if (duplicate) {
    showToast("Ese fragmento ya está guardado en esta sección.");
    return;
  }
  state.personalWords.unshift({ id: `word-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: selected.text, sectionId: selected.sectionId, createdAt: Date.now() });
  persistState();
  showToast("Guardado en Mis palabras.", "success");
}

function highlightSelectedText() {
  const selected = ui.pendingSelection;
  if (!selected?.text) return;
  const exists = state.highlights.some((item) => item.sectionId === selected.sectionId && item.text === selected.text);
  if (exists) {
    showToast("Ese texto ya estaba resaltado.");
    return;
  }
  state.highlights.push({ id: `highlight-${Date.now()}`, sectionId: selected.sectionId, text: selected.text });
  persistState();
  void renderReader();
  showToast("Texto resaltado.", "success");
}

function showToast(message, tone = "") {
  const region = $("#toastRegion");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`.trim();
  toast.textContent = message;
  region.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3800);
}

function updateTheme() {
  document.body.dataset.theme = state.theme === "dark" ? "dark" : "light";
}

function updateFontSize() {
  document.documentElement.style.setProperty("--font-size", `${Math.max(15, Math.min(24, Number(state.fontSize || 18)))}px`);
}

function updateReadingProgressFromScroll() {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    scrollTicking = false;
    if (ui.activeView !== "bookView" || ui.bookMode !== "read") return;
    const reader = $(".reader-paper");
    if (!reader) return;
    const top = reader.getBoundingClientRect().top + window.scrollY;
    const bottom = top + reader.offsetHeight;
    const viewBottom = window.scrollY + window.innerHeight;
    if (viewBottom < top || window.scrollY > bottom) return;
    const ratio = Math.max(0, Math.min(.95, (viewBottom - top) / Math.max(1, bottom - top)));
    if (ratio > getSectionProgress(ui.currentSection)) {
      state.readProgress[ui.currentSection] = ratio;
      persistState();
      updateProgressUi();
    }
  });
}

async function renderSearchResults(query) {
  const container = $("#searchResults");
  const term = normalizeText(query).toLowerCase();
  if (term.length < 2) {
    container.innerHTML = "";
    return;
  }
  const requestId = ++ui.searchRequest;
  container.innerHTML = `<div class="search-result"><small>Preparando búsqueda en el curso…</small></div>`;
  try {
    const index = await CONTENT.loadSearchIndex();
    if (requestId !== ui.searchRequest || normalizeText($("#globalSearch").value).toLowerCase() !== term) return;
    const results = index.map((entry) => {
      const content = normalizeText(entry.text);
      const position = content.toLowerCase().indexOf(term);
      return position >= 0 ? { meta: sectionMeta(entry.id), snippet: content.slice(Math.max(0, position - 75), position + term.length + 125) } : null;
    }).filter(Boolean).slice(0, 8);
    container.innerHTML = results.length ? results.map(({ meta, snippet }) => `<button type="button" class="search-result" data-search-section="${meta.id}"><strong>${escapeHtml(moduleById.get(meta.moduleId)?.number || "Módulo")} · ${escapeHtml(meta.title)}</strong><small>${escapeHtml(snippet)}…</small></button>`).join("") : `<div class="search-result"><small>No se encontraron coincidencias.</small></div>`;
  } catch (error) {
    if (requestId === ui.searchRequest) container.innerHTML = `<div class="search-result"><small>No se pudo cargar el índice de búsqueda.</small></div>`;
  }
}

function closeMobileSidebar() {
  $("#sidebar").classList.remove("is-open");
  $("#mobileMenuButton").setAttribute("aria-expanded", "false");
}

function toggleMobileSidebar() {
  const sidebar = $("#sidebar");
  sidebar.classList.toggle("is-open");
  $("#mobileMenuButton").setAttribute("aria-expanded", String(sidebar.classList.contains("is-open")));
}

function getGlossaryEntryByTerm(term) {
  return glossaryEntries.find((entry) => entry.term === term);
}

function handleGlossaryAction(button) {
  const entry = getGlossaryEntryByTerm(button.dataset.glossaryTerm);
  if (!entry) return;
  const action = button.dataset.glossAction;
  if (action === "translate") void translateGlossaryEntry(entry);
  if (action === "pronounce") speak(entry.term);
  if (action === "learned") { setGlossaryStatus(entry, glossaryStatus(entry) === "learned" ? "new" : "learned"); void renderGlossary(); }
  if (action === "review") { setGlossaryStatus(entry, glossaryStatus(entry) === "review" ? "new" : "review"); void renderGlossary(); }
}

function handlePersonalAction(button) {
  const word = state.personalWords.find((item) => item.id === button.dataset.personalId);
  if (!word) return;
  const action = button.dataset.personalAction;
  if (action === "translate") {
    void requestTranslation(word.text).then((result) => {
      if (result.translatedText) showToast("Traducción guardada.", "success");
      else showToast("No se pudo traducir el fragmento.", "warning");
      void renderGlossary();
    });
  }
  if (action === "pronounce") speak(word.text);
  if (action === "learned") { state.glossaryProgress[`personal:${word.id}`] = personalWordStatus(word) === "learned" ? "new" : "learned"; persistState(); renderPersonalWords(); }
  if (action === "review") { state.glossaryProgress[`personal:${word.id}`] = personalWordStatus(word) === "review" ? "new" : "review"; persistState(); renderPersonalWords(); }
  if (action === "delete") {
    state.personalWords = state.personalWords.filter((item) => item.id !== word.id);
    delete state.glossaryProgress[`personal:${word.id}`];
    void translationStore.remove(personalTranslationKey(word));
    persistState();
    renderPersonalWords();
    showToast("Fragmento eliminado.");
  }
}

function handleFlashAction(action) {
  const entries = getFlashEntries();
  const entry = entries[ui.flashIndex % entries.length];
  if (!entry) return;
  if (action === "reveal") ui.flashRevealed = true;
  else if (action === "pronounce") speak(entry.term);
  else if (action === "translate") { void translateGlossaryEntry(entry); return; }
  else {
    setGlossaryStatus(entry, action);
    ui.flashRevealed = false;
    ui.flashIndex = (ui.flashIndex + 1) % Math.max(1, entries.length);
  }
  renderFlashcard();
}

function bindEvents() {
  $("#bookNav").addEventListener("click", (event) => {
    const sectionButton = event.target.closest("[data-section-id]");
    if (sectionButton) return setCurrentSection(sectionButton.dataset.sectionId);
    const moduleButton = event.target.closest("[data-module-nav]");
    if (moduleButton) {
      const first = MANIFEST.sections.find((section) => section.moduleId === moduleButton.dataset.moduleNav);
      if (first) setCurrentSection(first.id);
    }
  });

  $$(".nav-tab").forEach((button) => button.addEventListener("click", () => showView(button.dataset.viewTarget)));
  $$("[data-book-mode]").forEach((button) => button.addEventListener("click", () => setBookMode(button.dataset.bookMode)));
  $$("[data-glossary-mode]").forEach((button) => button.addEventListener("click", () => setGlossaryMode(button.dataset.glossaryMode)));

  $("#markStudiedButton").addEventListener("click", markCurrentSectionStudied);
  $("#markStudiedBottomButton").addEventListener("click", markCurrentSectionStudied);
  $("#favoriteSectionButton").addEventListener("click", toggleCurrentFavorite);
  $("#addNoteButton").addEventListener("click", () => openNoteDialog());
  $("#addNoteInlineButton").addEventListener("click", () => openNoteDialog());
  $("#showSectionWordsButton").addEventListener("click", showSectionWords);
  $("#reviewSectionExercisesButton").addEventListener("click", () => openPracticeForSection(ui.currentSection));
  $("#reviewSectionExercisesBottomButton").addEventListener("click", () => openPracticeForSection(ui.currentSection));

  $$("[data-rail-action]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.railAction;
    if (action === "note") openNoteDialog();
    if (action === "words") showSectionWords();
    if (action === "practice") openPracticeForSection(ui.currentSection);
  }));

  $("#notesList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-note-action]");
    if (!button) return;
    if (button.dataset.noteAction === "edit") openNoteDialog(button.dataset.noteId);
    if (button.dataset.noteAction === "delete") deleteNote(button.dataset.noteId);
  });
  $("#noteForm").addEventListener("submit", (event) => { event.preventDefault(); saveNote(); });
  $("#closeNoteDialogButton").addEventListener("click", () => $("#noteDialog").close());
  $("#cancelNoteButton").addEventListener("click", () => $("#noteDialog").close());

  $("#practiceModuleFilter").addEventListener("change", (event) => { ui.practiceModule = event.target.value; ui.practiceFocusSection = null; ui.activeExam = null; ui.examFeedback = {}; void renderPractice(); });
  $("#clearPracticeFocusButton").addEventListener("click", () => { ui.practiceFocusSection = null; ui.activeExam = null; ui.examFeedback = {}; void renderPractice(); });
  $$(".level-tab").forEach((button) => button.addEventListener("click", () => { ui.practiceLevel = button.dataset.practiceLevel; ui.activeExam = null; ui.examFeedback = {}; void renderPractice(); }));
  $("#practiceList").addEventListener("click", (event) => {
    const exerciseButton = event.target.closest("[data-exercise-action]");
    if (exerciseButton) {
      if (exerciseButton.dataset.exerciseAction === "verify") verifyExercise(exerciseButton.dataset.exerciseId, exerciseButton.dataset.inExam);
      if (exerciseButton.dataset.exerciseAction === "retry") retryExercise(exerciseButton.dataset.exerciseId, exerciseButton.dataset.inExam);
      return;
    }
    const practiceButton = event.target.closest("[data-practice-action]");
    if (practiceButton?.dataset.practiceAction === "generate-exam") void generateExam();
    const sourceButton = event.target.closest("[data-go-section]");
    if (sourceButton) setCurrentSection(sourceButton.dataset.goSection);
  });

  $("#glossarySearch").addEventListener("input", (event) => { ui.glossarySearch = event.target.value; ui.glossaryLimit = 24; renderGlossaryEntries(); });
  $("#glossaryModuleFilter").addEventListener("change", (event) => { ui.glossaryModule = event.target.value; ui.glossaryLimit = 24; void renderGlossary(); });
  $("#glossaryStatusFilter").addEventListener("change", (event) => { ui.glossaryStatus = event.target.value; ui.glossaryLimit = 24; void renderGlossary(); });
  $("#loadMoreGlossaryButton").addEventListener("click", () => { ui.glossaryLimit += 24; renderGlossaryEntries(); });
  $("#glossaryList").addEventListener("click", (event) => {
    const action = event.target.closest("[data-gloss-action]");
    if (action) return handleGlossaryAction(action);
    const sourceButton = event.target.closest("[data-go-section]");
    if (sourceButton) setCurrentSection(sourceButton.dataset.goSection);
  });
  $("#shuffleFlashcardsButton").addEventListener("click", () => { ui.flashOrder = shuffle(getFlashEntries().map((entry) => entry.term)); ui.flashIndex = 0; ui.flashRevealed = false; renderFlashcard(); });
  $("#flashcardStage").addEventListener("click", (event) => { const button = event.target.closest("[data-flash-action]"); if (button) handleFlashAction(button.dataset.flashAction); });
  $("#personalWordsSectionFilter").addEventListener("change", (event) => { ui.personalSectionFilter = event.target.value; renderPersonalWords(); });
  $("#personalWordsList").addEventListener("click", (event) => {
    const action = event.target.closest("[data-personal-action]");
    if (action) return handlePersonalAction(action);
    const sourceButton = event.target.closest("[data-go-section]");
    if (sourceButton) setCurrentSection(sourceButton.dataset.goSection);
  });

  let searchTimer = null;
  $("#globalSearch").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void renderSearchResults(event.target.value), 240);
  });
  $("#globalSearch").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const first = $("[data-search-section]", $("#searchResults"));
      if (first) setCurrentSection(first.dataset.searchSection);
    }
    if (event.key === "Escape") $("#searchResults").innerHTML = "";
  });
  $("#searchResults").addEventListener("click", (event) => { const button = event.target.closest("[data-search-section]"); if (button) setCurrentSection(button.dataset.searchSection); });

  $("#readerContent").addEventListener("mouseup", () => window.setTimeout(showSelectionToolbar, 0));
  $("#readerContent").addEventListener("touchend", () => window.setTimeout(showSelectionToolbar, 0));
  $("#selectionToolbar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-selection-action]");
    if (!button || !ui.pendingSelection) return;
    const action = button.dataset.selectionAction;
    const text = ui.pendingSelection.text;
    if (action === "translate") void openTranslationDialog(text);
    if (action === "glossary") addSelectionToPersonalGlossary();
    if (action === "listen") speak(text);
    if (action === "highlight") highlightSelectedText();
    if (action === "copy") void copyText(text);
    hideSelectionToolbar();
    window.getSelection()?.removeAllRanges();
  });
  document.addEventListener("mousedown", (event) => { if (!$("#selectionToolbar").contains(event.target)) hideSelectionToolbar(); });

  $("#increaseFontButton").addEventListener("click", () => { state.fontSize = Math.min(24, Number(state.fontSize || 18) + 1); persistState(); updateFontSize(); });
  $("#decreaseFontButton").addEventListener("click", () => { state.fontSize = Math.max(15, Number(state.fontSize || 18) - 1); persistState(); updateFontSize(); });
  $("#themeButton").addEventListener("click", () => { state.theme = state.theme === "dark" ? "light" : "dark"; persistState(); updateTheme(); });
  $("#focusButton").addEventListener("click", () => { document.body.classList.toggle("is-focus"); $("#focusButton").setAttribute("aria-label", document.body.classList.contains("is-focus") ? "Salir de modo enfoque" : "Activar modo enfoque"); });

  $("#continueButton").addEventListener("click", () => setCurrentSection(state.lastSection || MANIFEST.sections[0]?.id));
  $("#clearDataButton").addEventListener("click", () => {
    if (!window.confirm("¿Restablecer progreso, notas, resaltados, palabras y respuestas solo en este navegador?")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = clone(DEFAULT_STATE);
    ui.currentSection = MANIFEST.sections[0]?.id || "";
    ui.practiceFeedback = {};
    ui.activeExam = null;
    ui.examFeedback = {};
    ui.flashOrder = [];
    updateTheme(); updateFontSize(); renderBookNav(); void renderReader(); void renderGlossary();
    showToast("Datos locales restablecidos.");
  });
  $("#mobileMenuButton").addEventListener("click", toggleMobileSidebar);
  $("#sourceCoverageButton").addEventListener("click", () => $("#coverageDialog").showModal());

  window.addEventListener("scroll", updateReadingProgressFromScroll, { passive: true });
  window.addEventListener("resize", hideSelectionToolbar);
  window.addEventListener("beforeunload", persistStateNow);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") persistStateNow(); });
}

async function initialize() {
  updateTheme();
  updateFontSize();
  renderBookNav();
  updateProgressUi();
  $("#glossaryTitleCount").textContent = MANIFEST.glossaryCount || "—";
  bindEvents();
  // Start with only the last section. The full glossary, exercises and search index remain unloaded.
  void renderReader();
  void translationStore.init();
}

void initialize();
