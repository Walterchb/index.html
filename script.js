/*
  Course 1 Study Reader - v7
  --------------------------
  UI shell is intentionally independent from the course corpus. Text lives in lazy
  module chunks, semantic tables and cropped exhibits remain separate lazy files.
  No full-page PDF screenshots or source PDFs are shipped: the first paint stays light
  while all reading pages and their relevant visuals remain available in the study flow.
*/

const MANIFEST = window.COURSE_MANIFEST;
const PAGES = window.CoursePages;
const CONTENT = window.StudyContentRegistry;
const TRANSLATION = window.TRANSLATION_CONFIG || {};
const VISUALS = window.VISUAL_REGISTRY || {};

if (!MANIFEST || !PAGES || !CONTENT) {
  throw new Error("No se pudo iniciar el lector: faltan los archivos del contenido.");
}

const STORAGE_KEY = "course1StudyReader.v5";
const LEGACY_STORAGE_KEYS = ["course1StudyReader.v4", "course1StudyReader.v3", "course1StudyReader.v2"];
const MAX_PAGE = Number(MANIFEST.course.mainPages || 157);
const FIRST_READING_PAGE = 5;

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const modulesById = new Map(MANIFEST.modules.map((item) => [item.id, item]));
const sectionsById = new Map(MANIFEST.sections.map((item) => [item.id, item]));
const frontModule = modulesById.get("front");

const DEFAULT_STATE = {
  schemaVersion: 5,
  currentPage: FIRST_READING_PAGE,
  completePages: {},
  favorites: [],
  notes: {},
  highlights: [],
  personalWords: [],
  exerciseProgress: {},
  glossaryProgress: {},
  theme: "light",
  readerFont: 18,
  readerLineHeight: 1.76,
  readerWidth: 70
};

let persistTimer = null;
let activeTranslationController = null;
let translationDbPromise = null;
let translationMemory = new Map();
let renderToken = 0;
let glossaryEntries = [];
let activeVisual = null;
let visualZoom = 1;

const ui = {
  view: "reader",
  currentPage: FIRST_READING_PAGE,
  currentPageData: null,
  collapsedModules: new Set(MANIFEST.modules.map((module) => module.id).filter((id) => id !== "m1")),
  expandedSections: new Set(["m1-l1"]),
  selectionText: "",
  noteEditing: null,
  practice: {
    moduleId: "m1",
    level: "1",
    questions: [],
    index: 0,
    transientFeedback: {},
    loading: false
  },
  glossary: {
    mode: "terms",
    search: "",
    moduleId: "all",
    status: "all",
    limit: 24,
    flashIndex: 0,
    flashRevealed: false,
    loading: false
  }
};

let state = loadState();
ui.currentPage = clamp(Number(state.currentPage) || FIRST_READING_PAGE, 1, MAX_PAGE);

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function sectionForPage(page) {
  const target = Number(page);
  return MANIFEST.sections.find((section) => target >= section.pageStart && target <= section.pageEnd) || MANIFEST.sections[0];
}

function moduleForPage(page) {
  return modulesById.get(sectionForPage(page)?.moduleId) || frontModule;
}

function sectionPages(section) {
  const pages = [];
  for (let page = section.pageStart; page <= section.pageEnd; page += 1) pages.push(page);
  return pages;
}

function migrateLegacyState(legacy) {
  const migrated = cloneDefaultState();
  if (!legacy || typeof legacy !== "object") return migrated;

  const legacySection = sectionsById.get(legacy.lastSection);
  if (legacySection) migrated.currentPage = legacySection.pageStart;
  migrated.theme = legacy.theme === "dark" ? "dark" : "light";
  migrated.readerFont = clamp(Number(legacy.fontSize) || 19, 17, 23);
  migrated.exerciseProgress = legacy.exerciseProgress || {};
  migrated.glossaryProgress = legacy.glossaryProgress || {};
  migrated.personalWords = Array.isArray(legacy.personalWords) ? legacy.personalWords.map((item) => ({
    id: item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: normalize(item.text),
    page: sectionsById.get(item.sectionId)?.pageStart || FIRST_READING_PAGE,
    createdAt: item.createdAt || Date.now(),
    status: item.status || "new"
  })).filter((item) => item.text) : [];

  const oldProgress = legacy.readProgress || {};
  Object.entries(oldProgress).forEach(([sectionId, value]) => {
    if (!value) return;
    const section = sectionsById.get(sectionId);
    if (section) sectionPages(section).forEach((page) => { migrated.completePages[page] = true; });
  });

  migrated.favorites = (Array.isArray(legacy.favorites) ? legacy.favorites : [])
    .map((sectionId) => sectionsById.get(sectionId)?.pageStart)
    .filter(Boolean);

  Object.entries(legacy.notes || {}).forEach(([sectionId, notes]) => {
    const page = sectionsById.get(sectionId)?.pageStart;
    if (!page || !Array.isArray(notes)) return;
    migrated.notes[page] = notes.map((note) => ({
      id: note.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: note.title || "Nota",
      body: note.body || "",
      createdAt: note.createdAt || Date.now(),
      updatedAt: note.updatedAt || Date.now()
    }));
  });

  return migrated;
}

function normaliseSavedState(saved) {
  return {
    ...cloneDefaultState(),
    ...saved,
    completePages: saved.completePages || {},
    favorites: Array.isArray(saved.favorites) ? saved.favorites : [],
    notes: saved.notes || {},
    highlights: Array.isArray(saved.highlights) ? saved.highlights : [],
    personalWords: Array.isArray(saved.personalWords) ? saved.personalWords : [],
    exerciseProgress: saved.exerciseProgress || {},
    glossaryProgress: saved.glossaryProgress || {}
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") return normaliseSavedState(saved);

    for (const key of LEGACY_STORAGE_KEYS) {
      const legacy = JSON.parse(localStorage.getItem(key));
      if (!legacy || typeof legacy !== "object") continue;
      const migrated = key.endsWith("v3") ? normaliseSavedState(legacy) : migrateLegacyState(legacy);
      migrated.schemaVersion = 5;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // A corrupt local record should never block access to the reading packet.
  }
  return cloneDefaultState();
}
function persistState() {
  clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    try {
      state.currentPage = ui.currentPage;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      showToast("No se pudo guardar todo el avance local. Libera espacio en el navegador.", "warning");
    }
  }, 120);
}

function persistNow() {
  clearTimeout(persistTimer);
  try {
    state.currentPage = ui.currentPage;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast("No se pudo guardar el avance local.", "warning");
  }
}

function isPageComplete(page) {
  return Boolean(state.completePages[String(page)] || state.completePages[page]);
}

function completePage(page, shouldRender = true) {
  state.completePages[String(page)] = true;
  persistState();
  if (shouldRender) {
    renderCourseNav();
    updateProgressUI();
    updateReaderChrome();
  }
}

function uncompletePage(page) {
  delete state.completePages[String(page)];
  delete state.completePages[page];
  persistState();
  renderCourseNav();
  updateProgressUI();
  updateReaderChrome();
}

function completeSectionRatio(section) {
  const pages = sectionPages(section);
  const complete = pages.filter(isPageComplete).length;
  return { complete, total: pages.length, percent: pages.length ? Math.round((complete / pages.length) * 100) : 0 };
}

function courseProgress() {
  const total = MAX_PAGE;
  const complete = Array.from({ length: total }, (_, index) => index + 1).filter(isPageComplete).length;
  return { complete, total, percent: Math.round((complete / total) * 100) };
}

function isFavorite(page) {
  return state.favorites.map(Number).includes(Number(page));
}

function toggleFavorite(page) {
  const target = Number(page);
  if (isFavorite(target)) {
    state.favorites = state.favorites.filter((item) => Number(item) !== target);
    showToast("Página quitada de guardados.");
  } else {
    state.favorites.push(target);
    showToast("Página guardada para volver a ella.", "success");
  }
  persistState();
  updateReaderChrome();
}

function getNotes(page = ui.currentPage) {
  const notes = state.notes[String(page)] || state.notes[page] || [];
  return Array.isArray(notes) ? notes : [];
}


function sectionLabel(section) {
  const module = modulesById.get(section.moduleId);
  return `${module?.number || "Reading packet"} · ${section.label}`;
}

function showToast(message, tone = "") {
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  $("#toastRegion").appendChild(toast);
  window.setTimeout(() => toast.remove(), 3500);
}

function applyTheme() {
  const isDark = state.theme === "dark";
  document.body.dataset.theme = isDark ? "dark" : "light";
  const button = $("#themeButton");
  button.innerHTML = isDark
    ? '<i class="fa-solid fa-sun" aria-hidden="true"></i>'
    : '<i class="fa-solid fa-moon" aria-hidden="true"></i>';
  button.title = isDark ? "Usar modo claro" : "Usar modo oscuro";
  button.setAttribute("aria-label", button.title);
}

function applyReaderPreferences() {
  const size = clamp(Number(state.readerFont) || 18, 17, 23);
  const leading = clamp(Number(state.readerLineHeight) || 1.76, 1.55, 2.05);
  const width = clamp(Number(state.readerWidth) || 70, 58, 82);
  state.readerFont = size;
  state.readerLineHeight = leading;
  state.readerWidth = width;
  document.documentElement.style.setProperty("--reader-size", `${size}px`);
  document.documentElement.style.setProperty("--reader-leading", String(leading));
  document.documentElement.style.setProperty("--reader-measure", `${width}ch`);

  const range = $("#readerFontRange");
  const output = $("#readerFontOutput");
  const leadingSelect = $("#readerLineHeightSelect");
  const widthSelect = $("#readerWidthSelect");
  if (range) range.value = String(size);
  if (output) output.textContent = `${size} px`;
  if (leadingSelect) leadingSelect.value = String(leading);
  if (widthSelect) widthSelect.value = String(width);
}

function applyReaderFont() {
  applyReaderPreferences();
}

function updateProgressUI() {
  const progress = courseProgress();
  $("#courseProgressValue").textContent = `${progress.percent}%`;
  $("#courseProgressBar").style.width = `${progress.percent}%`;
  $("#courseProgressCopy").textContent = `${progress.complete} de ${progress.total} páginas completadas`;
}

function renderCourseNav() {
  const currentSection = sectionForPage(ui.currentPage);
  const html = MANIFEST.modules.map((module) => {
    const sections = MANIFEST.sections.filter((section) => section.moduleId === module.id);
    if (!sections.length) return "";
    const collapsed = ui.collapsedModules.has(module.id) ? "is-collapsed" : "";
    const sectionItems = sections.map((section) => {
      const ratio = completeSectionRatio(section);
      const active = section.id === currentSection.id ? "is-active" : "";
      const done = ratio.percent === 100 ? "is-done" : "";
      const expanded = ui.expandedSections.has(section.id) ? "is-expanded" : "";
      const pageText = section.pageStart === section.pageEnd ? `p. ${section.pageStart}` : `pp. ${section.pageStart}-${section.pageEnd}`;
      const pages = sectionPages(section).map((page) => {
        const pageCurrent = page === ui.currentPage ? "is-current" : "";
        const pageDone = isPageComplete(page) ? "is-done" : "";
        return `<button class="page-jump ${pageCurrent} ${pageDone}" type="button" data-nav-page="${page}" aria-label="${escapeHtml(section.title)}, página ${page}" ${page === ui.currentPage ? 'aria-current="page"' : ""}>${page}</button>`;
      }).join("");
      return `<div class="section-nav-group ${expanded}" data-section-group="${section.id}">
        <div class="section-nav-main">
          <button class="course-nav-item ${active} ${done}" type="button" data-nav-page="${section.pageStart}" title="${escapeHtml(section.title)}">
            <i class="nav-dot" aria-hidden="true"></i><span>${escapeHtml(section.label)} · ${escapeHtml(section.title)}</span><small>${pageText}</small>
          </button>
          <button class="section-toggle" type="button" data-toggle-section="${section.id}" aria-label="${expanded ? 'Ocultar' : 'Mostrar'} páginas de ${escapeHtml(section.title)}" aria-expanded="${expanded ? 'true' : 'false'}"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
        </div>
        <div class="section-page-grid" aria-label="Páginas de ${escapeHtml(section.title)}">${pages}</div>
      </div>`;
    }).join("");
    return `<section class="module-nav-group ${collapsed}" data-module-group="${module.id}">
      <button class="module-nav-head" type="button" data-toggle-module="${module.id}" aria-expanded="${collapsed ? 'false' : 'true'}">
        <span><span>${escapeHtml(module.number)}</span><strong>${escapeHtml(module.title)}</strong></span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="module-nav-items">${sectionItems}</div>
    </section>`;
  }).join("");

  $("#courseNav").innerHTML = html;
}

function stripListMarker(text) {
  return text.replace(/^[•●○ο]\s*/, "").trim();
}

function renderListBlock(text, indent = 0) {
  const split = text
    .split(/\n(?=[•●○ο]\s*)|(?=\s[•●○ο]\s*)/)
    .map((entry) => stripListMarker(entry))
    .filter(Boolean);
  if (split.length <= 1) return `<p class="content-block content-block-indent-${indent}">${escapeHtml(stripListMarker(text))}</p>`;
  return `<ul class="content-list content-block-indent-${indent}">${split.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>`;
}

function blockHtml(block, index) {
  const text = normalize(block.text);
  const indent = Number(block.indent || 0);
  if (!text) return "";
  const prefix = `content-block content-block-indent-${indent}`;

  if (block.kind === "heading") {
    const tag = index === 0 && /^(lesson|module|introduction)/i.test(text) ? "h1" : "h2";
    return `<${tag} class="${prefix}">${escapeHtml(text)}</${tag}>`;
  }
  if (block.kind === "exhibit") {
    return `<div class="content-exhibit ${prefix}">${escapeHtml(text)}</div>`;
  }
  if (block.kind === "note") {
    return `<aside class="content-note ${prefix}">${escapeHtml(text)}</aside>`;
  }
  if (block.kind === "example") {
    return `<aside class="content-example ${prefix}">${escapeHtml(text)}</aside>`;
  }
  if (block.kind === "question") {
    return `<div class="content-question ${prefix}">${escapeHtml(text)}</div>`;
  }
  if (block.kind === "bullets") return renderListBlock(block.text, indent);
  return `<p class="${prefix}">${escapeHtml(text)}</p>`;
}

function semanticTableHtml(tableId) {
  if (tableId === "debt-equity") {
    return `<section class="semantic-table-card" aria-label="Exhibit 1: Debt and Equity Securities">
      <div class="semantic-table-heading"><span class="exhibit-kicker">EXHIBIT 1</span><h3>Debt and Equity Securities</h3><button type="button" class="visual-open-button" data-open-visual-page="7"><i class="fa-solid fa-expand" aria-hidden="true"></i> Ver referencia</button></div>
      <div class="semantic-table-wrap" tabindex="0" aria-label="Tabla desplazable horizontalmente">
        <table class="semantic-table">
          <caption class="sr-only">Exhibit 1: Debt and Equity Securities</caption>
          <thead><tr><th scope="col">Debt Securities</th><th scope="col">Equity Securities</th></tr></thead>
          <tbody><tr>
            <td><p>Debt securities are loans that lenders make to borrowers. Lenders expect the borrowers to repay these loans and to make interest payments until the loans are repaid.</p><p>You may already be familiar with this concept in personal finance because many people use debt to pay for big expenses, such as cars and homes. Because interest payments on many loans are fixed, debt securities are also called fixed-income securities.</p><p>They are also known as bonds, and investors in bonds are referred to as bondholders. More information about debt securities is provided in Course 3, Investment Instruments.</p></td>
            <td><p>Equity securities are also called stocks or shares. Shareholders (also known as stockholders) have ownership in a company.</p><p>The company has no obligation to repay the money that shareholders paid for their shares or to make regular payments to them, which are called dividends. But investors who buy shares expect to earn a return by selling their shares at a higher price than they bought them, and possibly by receiving dividends.</p><p>Equity securities are discussed further in Course 3, Investment Instruments.</p></td>
          </tr></tbody>
        </table>
      </div>
      <p class="table-scroll-hint"><i class="fa-solid fa-arrows-left-right" aria-hidden="true"></i> Desliza horizontalmente para comparar las dos columnas.</p>
      <p class="visual-source-note"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Fuente: p. 7 del packet · Columnas preservadas como conceptos separados.</p>
    </section>`;
  }
  if (tableId === "competitive-liquid") {
    return `<section class="semantic-table-card" aria-label="Exhibit 1: Competitive and Liquid Markets">
      <div class="semantic-table-heading"><span class="exhibit-kicker">EXHIBIT 1</span><h3>Competitive and Liquid Markets</h3><button type="button" class="visual-open-button" data-open-visual-page="16"><i class="fa-solid fa-expand" aria-hidden="true"></i> Ver referencia</button></div>
      <div class="semantic-table-wrap" tabindex="0" aria-label="Tabla desplazable horizontalmente">
        <table class="semantic-table">
          <caption class="sr-only">Exhibit 1: Competitive and Liquid Markets</caption>
          <thead><tr><th scope="col">Competitive Markets</th><th scope="col">Liquid Markets and Low Transaction Costs</th></tr></thead>
          <tbody><tr>
            <td><p>Investors benefit when financial markets are competitive. Competitive markets lead to fair prices, which ensure that buyers and sellers transact at a reasonable price. Markets in general and financial markets in particular are competitive if a large number of participants compete with one another without any one of them having an undue influence on supply or demand.</p><p>Competitive markets promote production efficiency and keep the prices of goods and services down, including investment products and services.</p></td>
            <td><p>Investors benefit when financial markets are liquid and transaction costs are low. As covered earlier, better liquidity lets investors quickly buy or sell an asset without unwanted price effects.</p><p>If we picture an active market with many buyers and sellers, such as a stock exchange, the costs incurred when a trade happens are called transaction costs. Because transaction costs reduce the return on investments, the lower the transaction costs the better.</p></td>
          </tr></tbody>
        </table>
      </div>
      <p class="table-scroll-hint"><i class="fa-solid fa-arrows-left-right" aria-hidden="true"></i> Desliza horizontalmente para comparar las dos columnas.</p>
      <p class="visual-source-note"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Fuente: p. 16 del packet · Relaciones entre columnas preservadas.</p>
    </section>`;
  }
  return "";
}

function visualFigureHtml(visual, readerPage) {
  if (!visual) return "";
  const visualTitle = escapeHtml(visual.title || visual.label || "Visual del material");
  const caption = escapeHtml(visual.caption || "Visual del reading packet integrado para conservar la información.");
  const alt = escapeHtml(visual.alt || visualTitle);
  const label = escapeHtml(visual.label || "SOURCE VISUAL");
  const page = Number(readerPage || visual.sourcePage);
  return `<figure class="inline-visual" data-visual-page="${page}">
    <div class="inline-visual-head"><div><span class="exhibit-kicker">${label}</span><h3>${visualTitle}</h3></div><button class="visual-open-button" type="button" data-open-visual-page="${page}" aria-label="Ampliar ${visualTitle}"><i class="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true"></i><span>Ampliar</span></button></div>
    <button class="inline-visual-image-button" type="button" data-open-visual-page="${page}" aria-label="Abrir visual ampliado: ${visualTitle}"><img src="${escapeHtml(visual.asset)}" alt="${alt}" loading="lazy" decoding="async" /></button>
    <figcaption>${caption}<span><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Packet p. ${Number(visual.sourcePage || page)}</span></figcaption>
  </figure>`;
}

function renderReaderPage(page) {
  const parts = [];
  const visual = VISUALS[Number(page.page)];
  const skipped = new Set((visual?.skipBlocks || []).map(Number));
  let visualInserted = false;
  const insertVisual = () => {
    if (visualInserted || !visual) return;
    visualInserted = true;
    parts.push(visual.kind === "semantic-table" ? semanticTableHtml(visual.table) : visualFigureHtml(visual, page.page));
  };

  if (visual?.insertBefore === 0) insertVisual();
  let answerOpen = false;
  page.blocks.forEach((block, index) => {
    if (!skipped.has(index)) {
      if (block.kind === "answer") {
        if (answerOpen) parts.push("</div></details>");
        answerOpen = true;
        parts.push(`<details class="answer-details"><summary>Mostrar feedback y respuestas del material</summary><div>${blockHtml({ ...block, kind: "heading" }, index)}`);
      } else {
        parts.push(blockHtml(block, index));
      }
    }
    if (visual && Number(visual.insertAfter) === index) insertVisual();
  });
  if (!visualInserted && visual) insertVisual();
  if (answerOpen) parts.push("</div></details>");
  return parts.join("");
}

function setVisualZoom(nextValue) {
  visualZoom = clamp(nextValue, .7, 2.5);
  $("#visualImage").style.width = `${Math.round(visualZoom * 100)}%`;
  $("#visualZoomValue").textContent = `${Math.round(visualZoom * 100)}%`;
}

function openVisualDialog(pageNumber = ui.currentPage) {
  const visual = VISUALS[Number(pageNumber)];
  if (!visual) {
    showToast("Esta página no tiene un visual adicional.", "warning");
    return;
  }
  activeVisual = visual;
  visualZoom = 1;
  $("#visualDialogMeta").textContent = `${visual.label || "VISUAL DEL MATERIAL"} · PACKET P. ${visual.sourcePage || pageNumber}`.toUpperCase();
  $("#visualDialogTitle").textContent = visual.title || "Visual del material";
  $("#visualDialogCaption").textContent = visual.caption || "Visual del reading packet integrado para conservar la información.";
  const image = $("#visualImage");
  image.src = visual.asset;
  image.alt = visual.alt || visual.title || "Visual del material";
  setVisualZoom(1);
  if (!$("#visualDialog").open) $("#visualDialog").showModal();
}

function updateReaderChrome() {
  const section = sectionForPage(ui.currentPage);
  const module = modulesById.get(section.moduleId);
  const position = ui.currentPage - section.pageStart + 1;
  const total = section.pageEnd - section.pageStart + 1;
  const ratio = completeSectionRatio(section);
  const favorite = isFavorite(ui.currentPage);
  const completed = isPageComplete(ui.currentPage);
  const visual = VISUALS[Number(ui.currentPage)];

  $("#topBreadcrumb").textContent = sectionLabel(section);
  $("#topTitle").textContent = section.title;
  $("#topPageChip").textContent = `p. ${ui.currentPage} / ${MAX_PAGE}`;
  $("#readerModuleLabel").textContent = (module?.number || "Reading packet").toUpperCase();
  $("#readerSectionTitle").textContent = section.title;
  $("#readerSectionMeta").textContent = `Página ${ui.currentPage} · ${position} de ${total} en esta lección`;
  $("#currentPageNumber").textContent = `p. ${ui.currentPage}`;
  $("#currentPageCount").textContent = `/ ${MAX_PAGE}`;
  $("#currentPagePosition").textContent = `Página ${position} de ${total} en esta lección`;
  $("#sectionProgressBar").style.width = `${ratio.percent}%`;
  $("#sectionProgressCopy").textContent = `${ratio.percent}% de esta lección`;
  $("#readerSourceLabel").textContent = visual ? `LECTURA + ${String(visual.label || "VISUAL").toUpperCase()}` : "LECTURA DEL PACKET";
  $("#visualReferenceButton").hidden = !visual;
  $("#mobileVisualAction").hidden = !visual;
  $("#openVisualFromReaderButton").hidden = !visual;
  $("#favoritePageButton").classList.toggle("is-saved", favorite);
  $("#favoritePageButton").setAttribute("aria-pressed", String(favorite));
  $("#favoritePageButton").innerHTML = favorite
    ? '<i class="fa-solid fa-bookmark" aria-hidden="true"></i><span>Guardada</span>'
    : '<i class="fa-regular fa-bookmark" aria-hidden="true"></i><span>Guardar</span>';
  $("#markPageButton").innerHTML = completed
    ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Completada</span>'
    : '<i class="fa-solid fa-check" aria-hidden="true"></i><span>Marcar estudiada</span>';
  $("#markPageButton").classList.toggle("is-complete", completed);
  $("#previousPageButton").disabled = ui.currentPage <= 1;
  $("#nextPageButton").disabled = ui.currentPage >= MAX_PAGE;
  const previousLabel = ui.currentPage > 1 ? `Ir a p. ${ui.currentPage - 1}` : "Inicio del curso";
  const nextLabel = ui.currentPage < MAX_PAGE ? `Ir a p. ${ui.currentPage + 1}` : "Fin del curso";
  $("#previousPageButton strong").textContent = previousLabel;
  $("#nextPageButton strong").textContent = nextLabel;
}
function renderPageNotes() {
  const notes = getNotes();
  const target = $("#pageNotesSummary");
  if (!notes.length) {
    target.innerHTML = `<p class="notes-summary-empty">Sin notas en esta página. Guarda ideas, dudas o conexiones mientras lees.</p>`;
    return;
  }
  target.innerHTML = notes.slice(0, 3).map((note) => `<div class="note-mini"><strong>${escapeHtml(note.title)}</strong><span>${escapeHtml(note.body)}</span><div class="note-mini-actions"><button type="button" data-edit-note="${escapeHtml(note.id)}"><i class="fa-solid fa-pen" aria-hidden="true"></i> Editar</button><button type="button" data-delete-note="${escapeHtml(note.id)}"><i class="fa-solid fa-trash" aria-hidden="true"></i> Eliminar</button></div></div>`).join("");
}

async function renderReader() {
  const myToken = ++renderToken;
  const reader = $("#readerContent");
  $("#readerLoading").hidden = false;
  reader.innerHTML = "";
  updateReaderChrome();
  renderPageNotes();

  try {
    const page = await PAGES.loadPage(ui.currentPage);
    if (myToken !== renderToken || ui.view !== "reader") return;
    ui.currentPageData = page;
    reader.innerHTML = renderReaderPage(page);
    $("#readerWordCount").textContent = `${page.wordCount.toLocaleString("es-PE")} palabras en esta página`;
    const visual = VISUALS[Number(page.page)];
    $("#pageFocusHint").textContent = visual
      ? "El recurso visual original está integrado junto al texto. Puedes ampliarlo sin salir de la lectura."
      : "Avanza una página a la vez. Selecciona la idea exacta que necesites traducir o repasar.";
    updateReaderChrome();
    renderPageNotes();
  } catch (error) {
    if (myToken !== renderToken) return;
    reader.innerHTML = `<div class="practice-empty">No se pudo abrir esta página. Verifica que la carpeta <code>data/page-content</code> siga junto a <code>index.html</code>.</div>`;
    console.error(error);
  } finally {
    if (myToken === renderToken) $("#readerLoading").hidden = true;
  }
}


function setSidebarOpen(open) {
  const sidebar = $("#courseSidebar");
  const backdrop = $("#drawerBackdrop");
  sidebar.classList.toggle("is-open", open);
  backdrop.classList.toggle("is-visible", open);
  document.body.classList.toggle("drawer-open", open);
  $("#mobileMenuButton").setAttribute("aria-expanded", String(open));
}

function closeSidebar() {
  setSidebarOpen(false);
}

function setView(view) {
  const valid = ["reader", "practice", "glossary"];
  if (!valid.includes(view)) return;
  ui.view = view;
  valid.forEach((name) => {
    $(`#${name}View`).hidden = name !== view;
    $$(`[data-view="${name}"]`).forEach((button) => button.classList.toggle("is-active", name === view));
  });
  closeSidebar();

  if (view === "reader") void renderReader();
  if (view === "practice") void renderPractice();
  if (view === "glossary") void renderGlossary();
}

function setPage(page, { autoCompletePrevious = false, view = ui.view } = {}) {
  const nextPage = clamp(Number(page), 1, MAX_PAGE);
  if (autoCompletePrevious && ui.view === "reader" && nextPage > ui.currentPage) completePage(ui.currentPage, false);
  ui.currentPage = nextPage;
  state.currentPage = nextPage;
  const section = sectionForPage(nextPage);
  ui.collapsedModules.delete(section.moduleId);
  ui.expandedSections.add(section.id);
  if (["m1", "m2", "m3", "m4", "m5"].includes(section.moduleId)) ui.practice.moduleId = section.moduleId;
  persistState();
  renderCourseNav();
  updateProgressUI();
  if (view !== ui.view) setView(view);
  else if (ui.view === "reader") void renderReader();
  else updateReaderChrome();
}

function nextPage() {
  if (ui.currentPage >= MAX_PAGE) return;
  setPage(ui.currentPage + 1, { autoCompletePrevious: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function previousPage() {
  if (ui.currentPage <= 1) return;
  setPage(ui.currentPage - 1);
  window.scrollTo({ top: 0, behavior: "smooth" });
}


function openNoteDialog(noteId = null) {
  const notes = getNotes();
  const note = noteId ? notes.find((item) => item.id === noteId) : null;
  ui.noteEditing = note ? note.id : null;
  $("#noteDialogTitle").textContent = note ? "Editar nota" : "Nueva nota";
  $("#noteTitleInput").value = note?.title || "";
  $("#noteBodyInput").value = note?.body || "";
  $("#noteDialog").showModal();
  window.setTimeout(() => $("#noteTitleInput").focus(), 80);
}

function saveNote(event) {
  event.preventDefault();
  const title = normalize($("#noteTitleInput").value);
  const body = normalize($("#noteBodyInput").value);
  if (!title || !body) return;

  const key = String(ui.currentPage);
  const notes = getNotes(ui.currentPage).slice();
  if (ui.noteEditing) {
    const index = notes.findIndex((note) => note.id === ui.noteEditing);
    if (index >= 0) notes[index] = { ...notes[index], title, body, updatedAt: Date.now() };
  } else {
    notes.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, title, body, createdAt: Date.now(), updatedAt: Date.now() });
  }
  state.notes[key] = notes;
  persistState();
  $("#noteDialog").close();
  renderPageNotes();
  showToast(ui.noteEditing ? "Nota actualizada." : "Nota guardada.", "success");
}

function deleteNote(noteId) {
  const key = String(ui.currentPage);
  const remaining = getNotes().filter((note) => note.id !== noteId);
  if (remaining.length) state.notes[key] = remaining;
  else delete state.notes[key];
  persistState();
  renderPageNotes();
  showToast("Nota eliminada.");
}

function addPersonalWord(text) {
  const clean = normalize(text);
  if (!clean) return;
  const exists = state.personalWords.some((item) => item.page === ui.currentPage && item.text.toLowerCase() === clean.toLowerCase());
  if (exists) {
    showToast("Ese fragmento ya está guardado en tus selecciones.");
    return;
  }
  state.personalWords.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: clean,
    page: ui.currentPage,
    createdAt: Date.now(),
    status: "new"
  });
  persistState();
  showToast("Guardado en Mis selecciones.", "success");
}

function deletePersonalWord(id) {
  state.personalWords = state.personalWords.filter((item) => item.id !== id);
  persistState();
  void renderGlossary();
}

function selectedText() {
  const selection = window.getSelection();
  const text = normalize(selection?.toString());
  return text;
}

function hideSelectionToolbar() {
  $("#selectionToolbar").hidden = true;
}

function showSelectionToolbar() {
  const selection = window.getSelection();
  const text = selectedText();
  const reader = $("#readerContent");
  if (!text || text.length < 1 || !selection?.rangeCount || !reader.contains(selection.getRangeAt(0).commonAncestorContainer)) {
    hideSelectionToolbar();
    return;
  }
  ui.selectionText = text;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  const toolbar = $("#selectionToolbar");
  toolbar.hidden = false;
  const width = toolbar.offsetWidth || 320;
  const left = clamp(rect.left + (rect.width / 2) - width / 2, 8, window.innerWidth - width - 8);
  const top = clamp(rect.top - 48, 8, window.innerHeight - 55);
  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top}px`;
}

function applyHighlight() {
  const selection = window.getSelection();
  const text = selectedText();
  if (!text) return;
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (range && $("#readerContent").contains(range.commonAncestorContainer)) {
    try {
      const mark = document.createElement("mark");
      range.surroundContents(mark);
      selection.removeAllRanges();
    } catch {
      // A multi-block selection cannot be wrapped safely without changing the DOM.
    }
  }
  state.highlights.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, page: ui.currentPage, text, createdAt: Date.now() });
  persistState();
  hideSelectionToolbar();
  showToast("Texto resaltado para esta sesión y guardado en tu avance.", "success");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Texto copiado.", "success");
  } catch {
    showToast("No se pudo copiar automáticamente. Usa Ctrl+C.", "warning");
  }
}

function speak(text) {
  const phrase = normalize(text);
  if (!phrase) {
    showToast("Selecciona un fragmento o abre una página de lectura primero.", "warning");
    return;
  }
  if (!("speechSynthesis" in window)) {
    showToast("Tu navegador no tiene lectura en voz disponible.", "warning");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.lang = "en-US";
  utterance.rate = .86;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
  showToast("Reproduciendo pronunciación en inglés.");
}

function openTranslationDialog(text) {
  const source = normalize(text);
  if (!source) {
    showToast("Selecciona una palabra, frase u oración antes de traducir.", "warning");
    return;
  }
  if (source.length > Number(TRANSLATION.MAX_CHARS || 1400)) {
    showToast(`Selecciona un fragmento de hasta ${Number(TRANSLATION.MAX_CHARS || 1400).toLocaleString("es-PE")} caracteres.`, "warning");
    return;
  }
  $("#translationOriginal").textContent = source;
  $("#translationResult").textContent = "Preparando traducción…";
  $("#translationStatus").textContent = "";
  $("#translationDialog").showModal();
  void translateText(source);
}

function translationKey(text) {
  return `en-es:${normalize(text).toLowerCase()}`;
}

function openTranslationDb() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  if (translationDbPromise) return translationDbPromise;
  translationDbPromise = new Promise((resolve) => {
    const request = indexedDB.open("course1-study-reader-translations", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("translations")) request.result.createObjectStore("translations", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return translationDbPromise;
}

async function getCachedTranslation(key) {
  if (translationMemory.has(key)) return translationMemory.get(key);
  const db = await openTranslationDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = db.transaction("translations", "readonly").objectStore("translations").get(key);
    request.onsuccess = () => {
      const value = request.result?.value || null;
      if (value) translationMemory.set(key, value);
      resolve(value);
    };
    request.onerror = () => resolve(null);
  });
}

async function cacheTranslation(key, value) {
  translationMemory.set(key, value);
  const db = await openTranslationDb();
  if (!db) return;
  await new Promise((resolve) => {
    const transaction = db.transaction("translations", "readwrite");
    transaction.objectStore("translations").put({ key, value, updatedAt: Date.now() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

async function translateText(text) {
  const source = normalize(text);
  const key = translationKey(source);
  const cached = await getCachedTranslation(key);
  if (cached) {
    $("#translationResult").textContent = cached;
    $("#translationStatus").textContent = "Traducción recuperada del almacenamiento local.";
    return;
  }

  activeTranslationController?.abort();
  activeTranslationController = new AbortController();
  const timeout = window.setTimeout(() => activeTranslationController?.abort(), Number(TRANSLATION.TIMEOUT_MS || 9000));
  $("#translationStatus").textContent = "Consultando traducción…";

  try {
    let translated = "";
    const provider = String(TRANSLATION.PROVIDER || "mymemory").toLowerCase();
    if (provider === "proxy" && TRANSLATION.PROXY_URL) {
      const response = await fetch(TRANSLATION.PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: source, source: "en", target: "es" }),
        signal: activeTranslationController.signal
      });
      if (!response.ok) throw new Error(`El proxy respondió ${response.status}`);
      const payload = await response.json();
      translated = payload.translation || payload.translatedText || payload.text || "";
    } else if (provider === "libretranslate" && TRANSLATION.LIBRETRANSLATE_URL) {
      const response = await fetch(TRANSLATION.LIBRETRANSLATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: source, source: "en", target: "es", format: "text" }),
        signal: activeTranslationController.signal
      });
      if (!response.ok) throw new Error(`LibreTranslate respondió ${response.status}`);
      const payload = await response.json();
      translated = payload.translatedText || "";
    } else {
      const params = new URLSearchParams({ q: source, langpair: "en|es" });
      const response = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`, { signal: activeTranslationController.signal });
      if (!response.ok) throw new Error(`MyMemory respondió ${response.status}`);
      const payload = await response.json();
      translated = payload?.responseData?.translatedText || "";
    }

    if (!translated) throw new Error("El servicio no devolvió una traducción.");
    await cacheTranslation(key, translated);
    $("#translationResult").textContent = translated;
    $("#translationStatus").textContent = "Traducción guardada localmente para próximas consultas.";
  } catch (error) {
    if (error?.name === "AbortError") {
      $("#translationResult").textContent = "La consulta tardó demasiado. Intenta con una frase más corta o configura un proxy propio.";
    } else {
      $("#translationResult").textContent = "No fue posible obtener una traducción en este momento.";
    }
    $("#translationStatus").textContent = "La lectura y el glosario siguen disponibles sin conexión. Revisa README.md para configurar LibreTranslate o un proxy privado.";
  } finally {
    window.clearTimeout(timeout);
  }
}

function renderPracticeStats(questions) {
  const answered = questions.filter((question) => state.exerciseProgress[question.id]).length;
  const correct = questions.filter((question) => state.exerciseProgress[question.id]?.correct).length;
  const wrong = Math.max(answered - correct, 0);
  $("#practiceStats").innerHTML = `
    <div class="practice-stat"><strong>${questions.length}</strong><span>disponibles</span></div>
    <div class="practice-stat"><strong>${correct}</strong><span>correctas</span></div>
    <div class="practice-stat"><strong>${wrong}</strong><span>por reforzar</span></div>`;
}

function exerciseInputHtml(exercise) {
  if (exercise.type === "matching") {
    const options = exercise.matchOptions || [];
    return `<div class="answer-options">${(exercise.pairs || []).map((pair) => `<label class="match-row"><span>${escapeHtml(pair.label)}</span><select data-match-key="${escapeHtml(pair.key)}"><option value="">Selecciona…</option>${options.map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join("")}</select></label>`).join("")}</div>`;
  }

  const inputType = exercise.type === "multiple" ? "checkbox" : "radio";
  return `<div class="answer-options">${(exercise.options || []).map(([key, label]) => `<label class="answer-option"><input type="${inputType}" name="exercise-${escapeHtml(exercise.id)}" value="${escapeHtml(key)}" /><span><strong>${escapeHtml(key)}.</strong> ${escapeHtml(label)}</span></label>`).join("")}</div>`;
}

function currentFeedback(exercise) {
  return ui.practice.transientFeedback[exercise.id] || state.exerciseProgress[exercise.id] || null;
}

function renderPracticeCard(exercise) {
  const feedback = currentFeedback(exercise);
  const source = `Página fuente ${exercise.page}`;
  const feedbackHtml = feedback?.checked ? `<div class="practice-feedback ${feedback.correct ? "is-correct" : "is-wrong"}"><strong>${feedback.correct ? "Correcto." : "Aún no."}</strong><span>${escapeHtml(exercise.feedback || "Revisa el texto indicado.")}</span></div>` : "";
  return `<article class="practice-card" data-exercise="${escapeHtml(exercise.id)}">
    <header class="practice-card-top"><div><span class="practice-kicker">${escapeHtml(exercise.title || "Knowledge check")}</span><h4>${escapeHtml(exercise.question)}</h4></div><span class="practice-position">${ui.practice.index + 1} de ${ui.practice.questions.length}</span></header>
    <div class="practice-question">Elige tu respuesta antes de verificar.</div>
    ${exerciseInputHtml(exercise)}
    <div class="practice-actions"><button class="primary-button" type="button" data-practice-action="verify"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Verificar respuesta</button>${feedback?.checked ? `<button class="compact-button" type="button" data-practice-action="retry"><i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i> Intentar otra vez</button>` : ""}</div>
    ${feedbackHtml}
    <footer class="practice-card-bottom"><span><i class="fa-solid fa-file-lines" aria-hidden="true"></i> ${source} · ${escapeHtml(sectionForPage(exercise.page).title)}</span><button class="link-button" type="button" data-practice-action="source"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Abrir referencia</button></footer>
  </article>`;
}

async function ensurePracticeQuestions() {
  const moduleIds = ui.practice.moduleId === "all"
    ? MANIFEST.modules.filter((module) => /^m\d+$/.test(module.id)).map((module) => module.id)
    : [ui.practice.moduleId];
  const raw = await CONTENT.loadAllExercises(moduleIds);
  let questions = raw.slice();
  if (ui.practice.level === "1") questions = questions.filter((item) => Number(item.level || 1) === 1);
  if (ui.practice.level === "2") questions = questions.filter((item) => Number(item.level || 1) === 2);
  // Levels 3 and 4 deliberately reuse the packet's questions rather than invent new ones.
  if (ui.practice.level === "3") questions.sort((a, b) => (a.sectionId || "").localeCompare(b.sectionId || "") || Number(a.page) - Number(b.page));
  if (ui.practice.level === "4") questions.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  ui.practice.questions = questions;
  ui.practice.index = clamp(ui.practice.index, 0, Math.max(questions.length - 1, 0));
  return questions;
}

async function renderPractice() {
  $("#practiceModuleFilter").value = ui.practice.moduleId;
  const token = ++renderToken;
  $("#practiceLoading").hidden = false;
  try {
    const questions = await ensurePracticeQuestions();
    if (token !== renderToken || ui.view !== "practice") return;
    renderPracticeStats(questions);
    if (!questions.length) {
      $("#practiceRunner").innerHTML = `<div class="practice-empty">No hay preguntas para este filtro. Cambia de nivel o de unidad.</div>`;
      return;
    }
    $("#practiceRunner").innerHTML = renderPracticeCard(questions[ui.practice.index]);
  } catch (error) {
    console.error(error);
    $("#practiceRunner").innerHTML = `<div class="practice-empty">No se pudo abrir la práctica. Verifica que la carpeta <code>data/exercises</code> esté disponible.</div>`;
  } finally {
    if (token === renderToken) $("#practiceLoading").hidden = true;
  }
}

function readExerciseAnswer(exercise, card) {
  if (exercise.type === "matching") {
    return (exercise.pairs || []).map((pair) => card.querySelector(`[data-match-key="${CSS.escape(pair.key)}"]`)?.value || "");
  }
  return $$('input:checked', card).map((input) => input.value);
}

function isExerciseCorrect(exercise, selection) {
  if (exercise.type === "matching") {
    const pairs = exercise.pairs || [];
    return selection.length === pairs.length && pairs.every((pair, index) => selection[index] === pair.answer);
  }
  const expected = (exercise.answer || []).map(String).sort();
  return selection.map(String).sort().join("|") === expected.join("|") && selection.length === expected.length;
}

function verifyCurrentExercise() {
  const exercise = ui.practice.questions[ui.practice.index];
  const card = $("#practiceRunner [data-exercise]");
  if (!exercise || !card) return;
  const selected = readExerciseAnswer(exercise, card);
  if (!selected.length || selected.some((value) => !value)) {
    showToast("Elige una respuesta antes de verificar.", "warning");
    return;
  }
  const correct = isExerciseCorrect(exercise, selected);
  const previous = state.exerciseProgress[exercise.id] || {};
  const result = { checked: true, correct, attempts: Number(previous.attempts || 0) + 1, answeredAt: Date.now() };
  state.exerciseProgress[exercise.id] = result;
  ui.practice.transientFeedback[exercise.id] = result;
  persistState();
  void renderPractice();
}

function retryCurrentExercise() {
  const exercise = ui.practice.questions[ui.practice.index];
  if (!exercise) return;
  delete ui.practice.transientFeedback[exercise.id];
  void renderPractice();
}

function movePractice(direction) {
  const total = ui.practice.questions.length;
  if (!total) return;
  ui.practice.index = (ui.practice.index + direction + total) % total;
  void renderPractice();
}

function renderGlossaryFilters() {
  const select = $("#glossaryModuleFilter");
  const options = ["<option value=\"all\">Todo el curso</option>"]
    .concat(MANIFEST.modules.filter((module) => /^m\d+$/.test(module.id)).map((module) => `<option value="${module.id}">${escapeHtml(module.number)} · ${escapeHtml(module.title)}</option>`));
  select.innerHTML = options.join("");
  select.value = ui.glossary.moduleId;
}

function glossaryEntryStatus(entry) {
  return state.glossaryProgress[entry.term]?.status || "new";
}

function filteredGlossary() {
  const query = normalize(ui.glossary.search).toLowerCase();
  return glossaryEntries.filter((entry) => {
    const originModule = entry.origin?.moduleId || "";
    const status = glossaryEntryStatus(entry);
    const matchSearch = !query || `${entry.term} ${entry.definition}`.toLowerCase().includes(query);
    const matchModule = ui.glossary.moduleId === "all" || originModule === ui.glossary.moduleId;
    const matchStatus = ui.glossary.status === "all" || status === ui.glossary.status;
    return matchSearch && matchModule && matchStatus;
  });
}

function glossaryCard(entry) {
  const status = glossaryEntryStatus(entry);
  const origin = entry.origin || {};
  const translation = translationMemory.get(translationKey(entry.term));
  return `<article class="glossary-card" data-term="${escapeHtml(entry.term)}">
    <h4>${escapeHtml(entry.term)}</h4>
    <p class="term-translation">${translation ? `ES: ${escapeHtml(translation)}` : "ES: traduce cuando la necesites"}</p>
    <p class="term-definition">${escapeHtml(entry.definition)}</p>
    <p class="term-origin">${origin.sectionTitle ? `Origen: ${escapeHtml(origin.sectionTitle)} · p. ${origin.page}` : `Glosario complementario · p. ${entry.glossaryPage || "—"}`}</p>
    <div class="glossary-card-actions">
      <button class="term-action" type="button" data-glossary-action="translate" data-term="${escapeHtml(entry.term)}"><i class="fa-solid fa-language" aria-hidden="true"></i> Traducir</button>
      <button class="term-action" type="button" data-glossary-action="listen" data-term="${escapeHtml(entry.term)}"><i class="fa-solid fa-volume-high" aria-hidden="true"></i> Escuchar</button>
      <button class="term-action ${status === "learned" ? "is-active" : ""}" type="button" data-glossary-action="learned" data-term="${escapeHtml(entry.term)}"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${status === "learned" ? "Aprendida" : "Aprendida"}</button>
      <button class="term-action ${status === "review" ? "is-active" : ""}" type="button" data-glossary-action="review" data-term="${escapeHtml(entry.term)}"><i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i> ${status === "review" ? "En repaso" : "Repasar"}</button>
    </div>
  </article>`;
}

function renderGlossaryTerms(entries) {
  const visible = entries.slice(0, ui.glossary.limit);
  const grid = visible.length ? `<div class="glossary-grid">${visible.map(glossaryCard).join("")}</div>` : `<div class="practice-empty">No se encontraron términos con ese filtro.</div>`;
  const more = entries.length > visible.length ? `<button id="glossaryLoadMore" class="compact-button glossary-load-more" type="button"><i class="fa-solid fa-plus" aria-hidden="true"></i> Mostrar ${Math.min(24, entries.length - visible.length)} términos más</button>` : "";
  return grid + more;
}

function renderFlashcards(entries) {
  if (!entries.length) return `<div class="practice-empty">No hay tarjetas para este filtro.</div>`;
  ui.glossary.flashIndex = clamp(ui.glossary.flashIndex, 0, entries.length - 1);
  const entry = entries[ui.glossary.flashIndex];
  const revealed = ui.glossary.flashRevealed;
  const origin = entry.origin || {};
  return `<div class="flashcard-wrap"><div class="flashcard-toolbar"><span>${ui.glossary.flashIndex + 1} de ${entries.length}</span><button class="link-button" type="button" data-flash-action="shuffle"><i class="fa-solid fa-shuffle" aria-hidden="true"></i> Mezclar</button></div>
    <article class="flashcard"><small>TERMINO EN INGLES</small><h4>${escapeHtml(entry.term)}</h4>${revealed ? `<p>${escapeHtml(entry.definition)}</p><p><strong>Origen:</strong> ${escapeHtml(origin.sectionTitle || "Glosario complementario")}</p>` : `<p>Intenta recordar la definición antes de revelarla.</p>`}</article>
    <div class="flashcard-actions">${revealed ? "" : `<button class="primary-button" type="button" data-flash-action="reveal"><i class="fa-solid fa-eye" aria-hidden="true"></i> Revelar definición</button>`}<button class="compact-button" type="button" data-flash-action="learned"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> La sé</button><button class="compact-button" type="button" data-flash-action="review"><i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i> Necesito repasar</button><button class="compact-button" type="button" data-flash-action="next">Siguiente <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div>
  </div>`;
}
function renderSavedSelections() {
  const words = state.personalWords;
  if (!words.length) return `<div class="practice-empty">Selecciona una palabra o una frase durante la lectura y pulsa Guardar. Aparecerá aquí para tus repasos.</div>`;
  return `<div class="saved-selection-grid">${words.map((item) => `<article class="saved-selection"><p>${escapeHtml(item.text)}</p><small><i class="fa-solid fa-book-open" aria-hidden="true"></i> Guardado desde la página ${item.page}</small><div class="glossary-card-actions"><button class="term-action" type="button" data-personal-action="translate" data-id="${escapeHtml(item.id)}"><i class="fa-solid fa-language" aria-hidden="true"></i> Traducir</button><button class="term-action" type="button" data-personal-action="listen" data-id="${escapeHtml(item.id)}"><i class="fa-solid fa-volume-high" aria-hidden="true"></i> Escuchar</button><button class="term-action" type="button" data-personal-action="source" data-id="${escapeHtml(item.id)}"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Ir a lectura</button><button class="term-action" type="button" data-personal-action="delete" data-id="${escapeHtml(item.id)}"><i class="fa-solid fa-trash" aria-hidden="true"></i> Eliminar</button></div></article>`).join("")}</div>`;
}

async function renderGlossary() {
  const token = ++renderToken;
  $("#glossaryLoading").hidden = false;
  renderGlossaryFilters();
  try {
    glossaryEntries = await CONTENT.loadGlossary();
    if (token !== renderToken || ui.view !== "glossary") return;
    const entries = filteredGlossary();
    let html = "";
    if (ui.glossary.mode === "terms") html = renderGlossaryTerms(entries);
    else if (ui.glossary.mode === "cards") html = renderFlashcards(entries);
    else html = renderSavedSelections();
    $("#glossaryContent").innerHTML = html;
    $$("[data-glossary-status]").forEach((button) => button.classList.toggle("is-active", button.dataset.glossaryStatus === ui.glossary.status));
    $$("[data-glossary-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.glossaryMode === ui.glossary.mode));
  } catch (error) {
    console.error(error);
    $("#glossaryContent").innerHTML = `<div class="practice-empty">No se pudo abrir el glosario. Verifica que <code>data/glossary.js</code> exista.</div>`;
  } finally {
    if (token === renderToken) $("#glossaryLoading").hidden = true;
  }
}

function setGlossaryStatus(term, status) {
  const current = state.glossaryProgress[term]?.status || "new";
  state.glossaryProgress[term] = { status: current === status ? "new" : status, updatedAt: Date.now() };
  persistState();
  void renderGlossary();
}

function advanceFlash(status = null) {
  const entries = filteredGlossary();
  if (!entries.length) return;
  const entry = entries[ui.glossary.flashIndex];
  if (status) setGlossaryStatus(entry.term, status);
  ui.glossary.flashIndex = (ui.glossary.flashIndex + 1) % entries.length;
  ui.glossary.flashRevealed = false;
  void renderGlossary();
}

function highlightSnippet(text, query) {
  const safe = escapeHtml(text);
  const q = normalize(query);
  if (!q) return safe;
  const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  return safe.replace(regex, "<em>$1</em>");
}

function closeCourseSearch({ clear = false } = {}) {
  const box = $("#searchBox");
  const panel = $("#searchResults");
  const input = $("#courseSearch");
  box.classList.remove("is-open");
  panel.hidden = true;
  panel.innerHTML = "";
  if (clear) input.value = "";
}

async function searchCourse(query) {
  const clean = normalize(query);
  const panel = $("#searchResults");
  if (clean.length < 2) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  panel.innerHTML = `<div class="search-empty">Buscando en las 157 páginas…</div>`;
  try {
    const index = await PAGES.loadSearchIndex();
    const lower = clean.toLowerCase();
    const hits = index.filter((item) => `${item.sectionTitle} ${item.text}`.toLowerCase().includes(lower)).slice(0, 9);
    if (!hits.length) {
      panel.innerHTML = `<div class="search-empty">No encontré “${escapeHtml(clean)}” en este paquete.</div>`;
      return;
    }
    panel.innerHTML = hits.map((item) => {
      const source = `${item.sectionTitle} ${item.text}`;
      const position = source.toLowerCase().indexOf(lower);
      const snippet = position >= 0 ? source.slice(Math.max(0, position - 82), position + clean.length + 120) : source.slice(0, 190);
      return `<button class="search-result" type="button" data-search-page="${item.page}"><strong>p. ${item.page} · ${escapeHtml(item.sectionTitle)}</strong><span>${highlightSnippet(`${position > 82 ? "…" : ""}${snippet}${source.length > position + clean.length + 120 ? "…" : ""}`, clean)}</span></button>`;
    }).join("");
  } catch (error) {
    console.error(error);
    panel.innerHTML = `<div class="search-empty">No se pudo preparar la búsqueda completa.</div>`;
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && /^(http:|https:)$/.test(location.protocol)) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      // The reader still works normally if a host does not allow service workers.
    });
  }
}

function bindEvents() {
  $("#mobileMenuButton").addEventListener("click", () => setSidebarOpen(!$("#courseSidebar").classList.contains("is-open")));
  $("#mobileDrawerClose").addEventListener("click", closeSidebar);
  $("#drawerBackdrop").addEventListener("click", closeSidebar);

  $("#courseNav").addEventListener("click", (event) => {
    const group = event.target.closest("[data-toggle-module]");
    if (group) {
      const id = group.dataset.toggleModule;
      if (ui.collapsedModules.has(id)) ui.collapsedModules.delete(id);
      else ui.collapsedModules.add(id);
      renderCourseNav();
      return;
    }
    const sectionToggle = event.target.closest("[data-toggle-section]");
    if (sectionToggle) {
      const id = sectionToggle.dataset.toggleSection;
      if (ui.expandedSections.has(id)) ui.expandedSections.delete(id);
      else ui.expandedSections.add(id);
      renderCourseNav();
      return;
    }
    const pageButton = event.target.closest("[data-nav-page]");
    if (pageButton) setPage(Number(pageButton.dataset.navPage), { view: "reader" });
  });

  $$("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));

  $("#mobileSearchButton").addEventListener("click", () => {
    const box = $("#searchBox");
    const open = !box.classList.contains("is-open");
    if (!open) {
      closeCourseSearch();
      return;
    }
    box.classList.add("is-open");
    window.setTimeout(() => $("#courseSearch").focus(), 40);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#searchBox")) closeCourseSearch();
  });

  $("#continueButton").addEventListener("click", () => setPage(Number(state.currentPage) || FIRST_READING_PAGE, { view: "reader" }));
  $("#coverageButton").addEventListener("click", () => $("#coverageDialog").showModal());
  $("#resetButton").addEventListener("click", () => {
    if (!window.confirm("¿Restablecer progreso, notas, guardados y resultados de esta web?")) return;
    state = cloneDefaultState();
    ui.currentPage = FIRST_READING_PAGE;
    ui.collapsedModules = new Set();
    ui.expandedSections = new Set(["m1-l1"]);
    persistNow();
    renderCourseNav();
    updateProgressUI();
    applyTheme();
    applyReaderPreferences();
    setPage(FIRST_READING_PAGE, { view: "reader" });
    showToast("Datos locales restablecidos.");
  });

  $("#themeButton").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    persistState();
  });
  $("#fontDecreaseButton").addEventListener("click", () => { state.readerFont = clamp(state.readerFont - 1, 17, 23); applyReaderPreferences(); persistState(); });
  $("#fontIncreaseButton").addEventListener("click", () => { state.readerFont = clamp(state.readerFont + 1, 17, 23); applyReaderPreferences(); persistState(); });
  $("#readerSettingsButton").addEventListener("click", () => { applyReaderPreferences(); $("#readerSettingsDialog").showModal(); });
  $("#readerSettingsCloseButton").addEventListener("click", () => $("#readerSettingsDialog").close());
  $("#readerFontRange").addEventListener("input", (event) => { state.readerFont = Number(event.target.value); applyReaderPreferences(); persistState(); });
  $("#readerLineHeightSelect").addEventListener("change", (event) => { state.readerLineHeight = Number(event.target.value); applyReaderPreferences(); persistState(); });
  $("#readerWidthSelect").addEventListener("change", (event) => { state.readerWidth = Number(event.target.value); applyReaderPreferences(); persistState(); });
  $("#chapterTopButton").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  $("#markPageButton").addEventListener("click", () => {
    if (isPageComplete(ui.currentPage)) {
      uncompletePage(ui.currentPage);
      showToast("Página marcada como pendiente.");
    } else {
      completePage(ui.currentPage);
      showToast("Página marcada como completada.", "success");
    }
  });
  $("#favoritePageButton").addEventListener("click", () => toggleFavorite(ui.currentPage));
  $("#previousPageButton").addEventListener("click", previousPage);
  $("#nextPageButton").addEventListener("click", nextPage);
  $("#openVisualFromReaderButton").addEventListener("click", () => openVisualDialog(ui.currentPage));
  $("#visualReferenceButton").addEventListener("click", () => openVisualDialog(ui.currentPage));
  $("#addNoteButton").addEventListener("click", () => openNoteDialog());
  $("#listenPageButton").addEventListener("click", () => speak(ui.currentPageData?.plainText || $("#readerContent").innerText));
  $("#quickTranslateButton").addEventListener("click", () => openTranslationDialog(selectedText() || ui.selectionText));
  $("#sectionPracticeButton").addEventListener("click", () => { ui.practice.moduleId = sectionForPage(ui.currentPage).moduleId; ui.practice.level = "1"; ui.practice.index = 0; setView("practice"); });
  $("#viewSavedTermsButton").addEventListener("click", () => { ui.glossary.mode = "saved"; setView("glossary"); });
  $(".mobile-study-actions").addEventListener("click", (event) => {
    const action = event.target.closest("[data-reader-action]")?.dataset.readerAction;
    if (!action) return;
    if (action === "listen") speak(ui.currentPageData?.plainText || $("#readerContent").innerText);
    if (action === "note") openNoteDialog();
    if (action === "practice") { ui.practice.moduleId = sectionForPage(ui.currentPage).moduleId; ui.practice.level = "1"; ui.practice.index = 0; setView("practice"); }
    if (action === "visual") openVisualDialog(ui.currentPage);
  });

  $("#readerContent").addEventListener("click", (event) => {
    const visualButton = event.target.closest("[data-open-visual-page]");
    if (visualButton) { openVisualDialog(Number(visualButton.dataset.openVisualPage)); return; }
  });
  $("#visualZoomOutButton").addEventListener("click", () => setVisualZoom(visualZoom - .2));
  $("#visualZoomInButton").addEventListener("click", () => setVisualZoom(visualZoom + .2));
  $("#visualCloseButton").addEventListener("click", () => $("#visualDialog").close());
  $("#readerContent").addEventListener("mouseup", () => window.setTimeout(showSelectionToolbar, 0));
  $("#readerContent").addEventListener("touchend", () => window.setTimeout(showSelectionToolbar, 120));
  document.addEventListener("mousedown", (event) => {
    if (!event.target.closest("#selectionToolbar") && !event.target.closest("#readerContent")) hideSelectionToolbar();
  });
  $("#selectionToolbar").addEventListener("click", (event) => {
    const action = event.target.closest("[data-selection-action]")?.dataset.selectionAction;
    if (!action) return;
    const text = selectedText() || ui.selectionText;
    if (action === "translate") openTranslationDialog(text);
    if (action === "save") addPersonalWord(text);
    if (action === "listen") speak(text);
    if (action === "highlight") applyHighlight();
    if (action === "copy") void copyText(text);
    if (action !== "highlight") hideSelectionToolbar();
  });

  $("#pageNotesSummary").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-note]");
    const remove = event.target.closest("[data-delete-note]");
    if (edit) openNoteDialog(edit.dataset.editNote);
    if (remove) deleteNote(remove.dataset.deleteNote);
  });
  $("#noteForm").addEventListener("submit", saveNote);
  $("#noteCloseButton").addEventListener("click", () => $("#noteDialog").close());
  $("#noteCancelButton").addEventListener("click", () => $("#noteDialog").close());

  $("#practiceModuleFilter").addEventListener("change", (event) => { ui.practice.moduleId = event.target.value; ui.practice.index = 0; ui.practice.transientFeedback = {}; void renderPractice(); });
  $$("[data-practice-level]").forEach((button) => button.addEventListener("click", () => {
    ui.practice.level = button.dataset.practiceLevel;
    ui.practice.index = 0;
    ui.practice.transientFeedback = {};
    $$("[data-practice-level]").forEach((item) => item.classList.toggle("is-active", item === button));
    void renderPractice();
  }));
  $("#practiceRunner").addEventListener("click", (event) => {
    const action = event.target.closest("[data-practice-action]")?.dataset.practiceAction;
    if (!action) return;
    if (action === "verify") verifyCurrentExercise();
    if (action === "retry") retryCurrentExercise();
    if (action === "source") {
      const question = ui.practice.questions[ui.practice.index];
      if (question) setPage(question.page, { view: "reader" });
    }
  });

  $("#glossarySearch").addEventListener("input", (event) => { ui.glossary.search = event.target.value; ui.glossary.limit = 24; void renderGlossary(); });
  $("#glossaryModuleFilter").addEventListener("change", (event) => { ui.glossary.moduleId = event.target.value; ui.glossary.limit = 24; ui.glossary.flashIndex = 0; void renderGlossary(); });
  $$("[data-glossary-status]").forEach((button) => button.addEventListener("click", () => { ui.glossary.status = button.dataset.glossaryStatus; ui.glossary.limit = 24; ui.glossary.flashIndex = 0; void renderGlossary(); }));
  $$("[data-glossary-mode]").forEach((button) => button.addEventListener("click", () => { ui.glossary.mode = button.dataset.glossaryMode; ui.glossary.flashIndex = 0; ui.glossary.flashRevealed = false; void renderGlossary(); }));
  $("#glossaryContent").addEventListener("click", (event) => {
    const loadMore = event.target.closest("#glossaryLoadMore");
    if (loadMore) { ui.glossary.limit += 24; void renderGlossary(); return; }
    const action = event.target.closest("[data-glossary-action]");
    if (action) {
      const entry = glossaryEntries.find((item) => item.term === action.dataset.term);
      if (!entry) return;
      if (action.dataset.glossaryAction === "translate") openTranslationDialog(entry.term);
      if (action.dataset.glossaryAction === "listen") speak(entry.term);
      if (action.dataset.glossaryAction === "learned") setGlossaryStatus(entry.term, "learned");
      if (action.dataset.glossaryAction === "review") setGlossaryStatus(entry.term, "review");
      return;
    }
    const flash = event.target.closest("[data-flash-action]")?.dataset.flashAction;
    if (flash) {
      if (flash === "reveal") { ui.glossary.flashRevealed = true; void renderGlossary(); }
      if (flash === "learned") advanceFlash("learned");
      if (flash === "review") advanceFlash("review");
      if (flash === "next") advanceFlash();
      if (flash === "shuffle") { ui.glossary.flashIndex = Math.floor(Math.random() * Math.max(filteredGlossary().length, 1)); ui.glossary.flashRevealed = false; void renderGlossary(); }
      return;
    }
    const personal = event.target.closest("[data-personal-action]");
    if (personal) {
      const item = state.personalWords.find((word) => word.id === personal.dataset.id);
      if (!item) return;
      if (personal.dataset.personalAction === "translate") openTranslationDialog(item.text);
      if (personal.dataset.personalAction === "listen") speak(item.text);
      if (personal.dataset.personalAction === "source") setPage(item.page, { view: "reader" });
      if (personal.dataset.personalAction === "delete") deletePersonalWord(item.id);
    }
  });

  let searchTimer = null;
  $("#courseSearch").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void searchCourse(event.target.value), 180);
  });
  $("#courseSearch").addEventListener("focus", (event) => {
    if (normalize(event.target.value).length >= 2) void searchCourse(event.target.value);
  });
  $("#searchResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-search-page]");
    if (!button) return;
    closeCourseSearch({ clear: true });
    setPage(Number(button.dataset.searchPage), { view: "reader" });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideSelectionToolbar();
      setSidebarOpen(false);
      closeCourseSearch();
    }
    if (event.key === "ArrowRight" && ui.view === "practice" && !event.target.matches("input, textarea, select")) movePractice(1);
    if (event.key === "ArrowLeft" && ui.view === "practice" && !event.target.matches("input, textarea, select")) movePractice(-1);
  });
}

async function initialize() {
  applyTheme();
  applyReaderPreferences();
  renderCourseNav();
  updateProgressUI();
  renderGlossaryFilters();
  $("#practiceModuleFilter").innerHTML = ["<option value=\"all\">Todo el curso</option>"]
    .concat(MANIFEST.modules.filter((module) => /^m\d+$/.test(module.id)).map((module) => `<option value="${module.id}">${escapeHtml(module.number)} · ${escapeHtml(module.title)}</option>`)).join("");
  $("#practiceModuleFilter").value = ui.practice.moduleId;
  bindEvents();
  registerServiceWorker();
  await renderReader();
}

void initialize();
