import * as store from "./store.js";
import * as auth from "./auth.js";
import DOMPurify from "../vendor/purify.js";
import { seedWelcome } from "./seed.js";
import {
  metrics,
  dayKey,
  dueCards,
  scheduleReview,
  searchLessons,
} from "./learning.js";
import { extractDocument } from "./importer.js";
import { analyzeBook } from "./book-importer.js";
import {
  buildBookRecords,
  auditBook,
  validateBookRanges,
} from "./book-course.js";
import { mountPdfReader } from "./pdf-reader.js";
import { generateStudyMaterial } from "./ai.js";
import { inspectLegacyProgress, migrateLegacyProgress } from "./legacy.js";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const uid = () => crypto.randomUUID(),
  kinds = [
    "courses",
    "modules",
    "lessons",
    "documents",
    "cards",
    "questions",
    "progress",
    "notes",
    "attempts",
    "sessions",
    "settings",
  ];
const icons = {
  home: "⌂",
  library: "▤",
  reader: "▥",
  practice: "◎",
  review: "↻",
  notes: "▧",
  admin: "⊞",
  settings: "⚙",
};
const names = {
  home: "Mi espacio",
  library: "Mis cursos",
  reader: "Lectura",
  practice: "Práctica",
  review: "Repasar",
  notes: "Mis notas",
  admin: "Gestionar",
  settings: "Ajustes",
};
let db = {},
  view = "reader",
  courseId = "",
  lessonId = "",
  questionId = "",
  reviewId = "",
  revealed = false,
  answer = null,
  feedback = null,
  quizMode = "all",
  quizModule = "",
  search = "",
  pendingImport = null,
  importController = null,
  timer = null,
  timerStart = 0,
  timerSeconds = 0,
  timerCourseId = "",
  currentUser = null,
  authMode = "signin",
  ready = false,
  renderSeq = 0;
let tempUrls = [];
let sessionGeneration = 0;
let readerMode = "original",
  pdfState = null,
  pdfSelectedText = "",
  bookBusy = false,
  bookStructureSnapshot = null,
  ocrSnapshot = null;
const modal = $("#modal");
let editorSnapshot = null,
  entering = null,
  enteringScope = null,
  authBooting = true,
  lastSyncSeen = null,
  refreshPending = false,
  importGeneration = 0;
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
const scoped = (kind) =>
  (db[kind] || [])
    .filter((x) => !courseId || x.courseId === courseId)
    .sort(byOrder);
const course = () => db.courses?.find((x) => x.id === courseId);
const currentLesson = () => db.lessons?.find((x) => x.id === lessonId);
const progress = (l) =>
  db.progress?.find((p) => p.lessonId === l.id) || {
    id: l.id,
    lessonId: l.id,
    courseId: l.courseId,
  };
const strip = (s) => {
  const el = document.createElement("div");
  el.innerHTML = DOMPurify.sanitize(String(s || ""));
  return el.textContent || "";
};
const content = (s) =>
  /<(?:p|div|h[1-6]|table|ul|ol|figure)\b/i.test(s || "")
    ? DOMPurify.sanitize(s, {
        ADD_ATTR: ["target"],
        FORBID_TAGS: ["iframe", "style", "form", "input", "button"],
        FORBID_ATTR: ["style"],
      })
    : String(s || "")
        .split(/\n\s*\n/)
        .map((x) => `<p>${esc(x).replace(/\n/g, "<br>")}</p>`)
        .join("");
const empty = (title, copy, action = "", label = "") =>
  `<div class="empty"><span class="empty-mark">◇</span><h3>${title}</h3><p>${copy}</p>${action ? btn(label, action, "primary") : ""}</div>`;
const btn = (label, action, cls = "", attrs = "") =>
  `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const ref = (x) =>
  x.sourcePage ? `Página ${x.sourcePage}` : x.sourceLabel || "Contenido propio";
const bar = (p) =>
  `<div class="progress"><span style="width:${Math.max(0, Math.min(100, p))}%"></span></div>`;
const field = (label, name, value = "", type = "text", attrs = "") =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
function toast(message, error = false) {
  const t = $("#toast");
  t.textContent = message;
  t.className = error ? "show error" : "show";
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => (t.className = ""), 6500);
}
function errorMessage(e) {
  return e?.message || String(e || "No se pudo completar la operación.");
}
function openModal(html) {
  modal.innerHTML = `<button type="button" class="dialog-close" data-action="close" aria-label="Cerrar">×</button>${html}`;
  if (!modal.open) modal.showModal();
}
function closeModal(force = false) {
  if (bookBusy && !force)
    return toast("Estamos guardando el curso completo. Espera un momento.");
  pdfSelectedText = "";
  modal.close();
  pendingImport = null;
  importGeneration++;
  importController?.abort();
  importController = null;
  tempUrls.forEach(URL.revokeObjectURL);
  tempUrls = [];
}
function download(name, data, type = "application/json") {
  const b = new Blob(
    [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
    { type },
  );
  const u = URL.createObjectURL(b),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}
async function refresh(seq) {
  const next = Object.fromEntries(
    await Promise.all(kinds.map(async (k) => [k, await store.list(k)])),
  );
  if (!ready || seq !== renderSeq) return;
  db = next;
  db.courses.sort(byOrder);
  if (!db.courses.some((c) => c.id === courseId))
    courseId =
      db.lessons.find(
        (l) =>
          l.id === db.settings.find((x) => x.id === "last-lesson")?.lessonId,
      )?.courseId ||
      db.courses[0]?.id ||
      "";
  if (!db.lessons.some((l) => l.id === lessonId && l.courseId === courseId)) {
    const last = db.settings.find((s) => s.id === "last-lesson")?.lessonId;
    lessonId =
      scoped("lessons").find((l) => l.id === last)?.id ||
      scoped("lessons")[0]?.id ||
      "";
  }
}
function courseTree() {
  const active = currentLesson();
  return `<nav class="course-tree" aria-label="Índice del curso">${
    scoped("modules")
      .map((m, i) => {
        const pages = scoped("lessons").filter((l) => l.moduleId === m.id);
        return `<details class="tree-module" ${m.id === active?.moduleId ? "open" : ""}><summary><span class="tree-number">${String(i + 1).padStart(2, "0")}</span><span>${esc(m.title)}<small>${pages.filter((l) => progress(l).completed).length} / ${pages.length} ${course()?.kind === "pdf-book" ? "páginas" : "lecciones"}</small></span></summary>${pages.map((l) => `<button class="tree-lesson ${l.id === lessonId ? "current" : ""}" data-action="open-lesson" data-id="${esc(l.id)}" ${l.id === lessonId ? 'aria-current="page"' : ""}><span class="tree-page">${l.sourcePage || "·"}</span><span>${esc(l.title)}</span><span class="tree-state">${progress(l).completed ? "✓" : progress(l).bookmarked ? "★" : ""}</span></button>`).join("")}</details>`;
      })
      .join("") ||
    '<p class="muted">Añade un PDF para comenzar tu curso de lectura.</p>'
  }</nav>`;
}
async function render() {
  if (!ready) return;
  const seq = ++renderSeq;
  await refresh(seq);
  if (!ready || seq !== renderSeq) return;
  const m = metrics(
    scoped("lessons"),
    db.progress,
    scoped("attempts"),
    scoped("sessions"),
  );
  const l = currentLesson(),
    d = db.documents.find((x) => x.id === l?.documentId);
  const wantsPdf =
    view === "reader" && readerMode === "original" && isPdfDocument(d);
  const retained = wantsPdf && pdfState?.docId === d.id ? pdfState : null;
  if (!retained) disposePdf();
  document.title = `${names[view]} · CFA Study Reader`;
  document.body.dataset.theme =
    db.settings.find((x) => x.id === "preferences")?.theme || "light";
  $("#app").innerHTML =
    `<div class="shell study-shell"><aside class="sidebar study-sidebar"><a href="#reader" class="brand"><span class="brand-icon">C<span>·</span></span><span>CFA Study Reader<small>READING COMPANION</small></span></a><div class="sidebar-course"><label class="eyebrow" for="sidebar-course-select">MI BIBLIOTECA</label><select id="sidebar-course-select" aria-label="Cambiar curso">${db.courses.map((c) => `<option value="${esc(c.id)}" ${c.id === courseId ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select><div class="sidebar-count"><span>${m.completed} / ${m.total} estudiadas</span><b>${m.percent}%</b></div>${bar(m.percent)}</div><div class="sidebar-index-heading"><span class="eyebrow">ÍNDICE DE LECTURA</span>${btn("+ PDF", "import-book", "small", 'title="Crear curso desde un PDF"')}</div>${courseTree()}<nav class="nav-bottom">${["library", "home", "notes", "admin", "settings"].map((k) => `<a href="#${k}" class="nav-item ${view === k ? "active" : ""}"><span class="nav-icon">${icons[k]}</span>${names[k]}</a>`).join("")}</nav><button class="profile" data-action="account"><span class="avatar">${esc((currentUser?.email || "L").slice(0, 1).toUpperCase())}</span><span><strong>${currentUser ? "Mi cuenta" : "Espacio local"}</strong><small>${esc(currentUser?.email || "Conecta para sincronizar")}</small></span><span>↗</span></button></aside><div class="workspace study-workspace"><header class="topbar reader-topbar"><button class="mobile-toggle btn" data-action="menu" aria-label="Abrir menú">☰</button><div class="breadcrumb"><span>MI LECTURA</span><strong>${esc(course()?.title || "Biblioteca personal")}</strong></div><div class="top-actions"><button class="search-button" data-action="search"><span>⌕</span> Buscar <kbd>/</kbd></button><button class="sync-pill" data-action="sync" id="sync-status"></button>${btn("◐", "theme", "small", 'aria-label="Cambiar apariencia"')}</div></header><nav class="reader-tabs" aria-label="Herramientas de estudio">${["reader", "practice", "review"].map((k) => `<a href="#${k}" class="nav-item reader-tab ${view === k ? "active" : ""}" ${view === k ? 'aria-current="page"' : ""}>${k === "review" ? "Glosario y repaso" : names[k]}</a>`).join("")}<a href="#library" class="reader-tab ${view === "library" ? "active" : ""}">Biblioteca</a><span class="tab-spacer"></span>${btn("Cargar PDF", "import-book", "small")}</nav><main id="main" class="${view === "reader" ? "is-reader" : ""}" tabindex="-1">${({ home: homeView, library: libraryView, reader: readerView, practice: practiceView, review: reviewView, notes: notesView, admin: adminView, settings: settingsView }[view] || readerView)()}</main><footer>CFA Study Reader <span>Lectura · Comprensión · Práctica</span><span class="footer-note">Espacio personal · Independiente de CFA Institute</span></footer></div></div>`;
  if (wantsPdf) {
    const host = $(".pdf-reader-host");
    if (retained) {
      host.replaceWith(retained.host);
      if (retained.page !== l.sourcePage) {
        retained.page = l.sourcePage;
        retained.controller?.goToPage(l.sourcePage || 1, { notify: false });
      }
    } else attachPdf(host, l, d);
  }
  updateStatus();
  updateTimer();
}
function isPdfDocument(d) {
  return (
    !!d &&
    (d.kind === "pdf-book" ||
      d.type === "application/pdf" ||
      /\.pdf$/i.test(d.name || ""))
  );
}
function disposePdf() {
  pdfSelectedText = "";
  if (pdfState) {
    pdfState.controller?.destroy();
    pdfState = null;
  }
}
function attachPdf(host, l, d) {
  const state = {
    docId: d.id,
    host,
    page: l.sourcePage || 1,
    controller: null,
  };
  pdfState = state;
  host.innerHTML =
    '<div class="pdf-loading" role="status">Abriendo el PDF original…</div>';
  (async () => {
    const blob = await store.loadFile(d.fileId || d.id);
    if (pdfState !== state) return;
    if (!blob)
      throw Error(
        "El PDF aún no está disponible en este dispositivo. Conecta y sincroniza para descargarlo.",
      );
    state.blob = blob;
    const controller = await mountPdfReader(host, {
      blob,
      docId: d.id,
      page: state.page,
      title: d.name || d.title,
      pageLabels: d.pageLabels,
      onPageChange: async (number) => {
        if (pdfState !== state) return;
        state.page = number;
        const page =
          db.lessons.find(
            (p) => p.documentId === d.id && p.sourcePage === number,
          ) ||
          db.lessons.find(
            (p) =>
              p.documentId === d.id &&
              p.sourcePage <= number &&
              (p.sourcePageEnd || p.sourcePage) >= number,
          );
        if (page && page.id !== lessonId) {
          lessonId = page.id;
          try {
            await rememberReading(page);
            await render();
          } catch (e) {
            toast(errorMessage(e), true);
          }
        }
      },
      onSelection: (selection) => {
        pdfSelectedText =
          typeof selection === "string" ? selection : selection?.text || "";
      },
      onError: (e) => toast(errorMessage(e), true),
    });
    if (pdfState !== state) {
      controller.destroy();
      return;
    }
    state.controller = controller;
    if (controller.ready) await controller.ready;
  })().catch((e) => {
    if (pdfState === state) {
      host.innerHTML = `<div class="empty"><h3>No se pudo abrir el PDF</h3><p>${esc(errorMessage(e))}</p>${btn("Reintentar", "retry-pdf")}</div>`;
    }
  });
}
async function rememberReading(l) {
  const assertActive = operationGuard();
  await store.put("settings", {
    id: "last-lesson",
    lessonId: l.id,
    courseId: l.courseId,
  });
  assertActive();
  const p = await store.put("progress", {
    ...progress(l),
    lastReadAt: new Date().toISOString(),
  });
  assertActive();
  db.progress = db.progress.filter((x) => x.id !== p.id).concat(p);
}
function heading(kicker, title, desc, actions = "") {
  return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${desc}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function courseSelect() {
  return `<select id="course-select" aria-label="Curso activo">${db.courses.map((c) => `<option value="${esc(c.id)}" ${c.id === courseId ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select>`;
}
function homeView() {
  const lessons = scoped("lessons"),
    cards = dueCards(scoped("cards")),
    m = metrics(lessons, db.progress, scoped("attempts"), scoped("sessions")),
    prefs = db.settings.find((s) => s.id === "preferences") || {},
    today = db.sessions
      .filter((s) => s.date === dayKey())
      .reduce((v, s) => v + s.minutes, 0),
    goal = Number(prefs.dailyGoal) || 30,
    l = currentLesson();
  return `${heading("TU RUTA, A TU RITMO", "Un poco más cerca.", "Cada idea comprendida cuenta. Este es tu punto de partida de hoy.", btn("+ Importar material", "import", "primary"))}<div class="dashboard-top"><section class="continue-card"><div class="continue-content"><span class="pill soft">${m.completed ? "CONTINÚA DONDE LO DEJASTE" : "TU SIGUIENTE PASO"}</span><h2>${esc(l?.title || "Construye tu biblioteca")}</h2><p>${esc(course()?.title || "Añade tu primer curso para empezar a estudiar.")}</p><div class="continue-meta"><span>${l ? esc(db.modules.find((x) => x.id === l.moduleId)?.title || "Lección") : ""}</span><span>${l ? Math.max(1, Math.ceil(strip(l.content).split(/\s+/).length / 200)) + " min de lectura" : ""}</span></div>${btn(l ? "Continuar aprendiendo <span>↗</span>" : "Crear mi primer curso", l ? "continue" : "new-course", "light")}</div><div class="orbit-art" aria-hidden="true"><div class="orbit o1"></div><div class="orbit o2"></div><div class="orbit o3"></div><span class="orbit-dot"></span><div class="art-book">A<span>↗</span></div><small>ONE IDEA AT A TIME</small></div></section><section class="daily-card"><span class="eyebrow">UN HÁBITO QUE SUMA</span><h3>Tu meta de hoy</h3><div class="daily-value">${Math.round(today)} <span>/ ${goal} min</span></div>${bar((today / goal) * 100)}<p>${today >= goal ? "Meta alcanzada. Date un momento para repasar." : "Reserva un espacio y enfócate en una idea."}</p><div class="timer-row"><strong id="timer-label">${timer ? "En sesión" : "¿Empezamos?"}</strong>${btn(timer ? "Terminar sesión" : "Iniciar enfoque", timer ? "stop-timer" : "start-timer", "subtle")}</div></section></div><div class="stats-grid"><div class="stat"><span>Cobertura de lectura</span><strong>${m.percent}<small>%</small></strong><p>${m.completed} de ${m.total} lecciones estudiadas</p></div><div class="stat"><span>Aciertos en práctica</span><strong>${m.accuracy === null ? "—" : m.accuracy + "<small>%</small>"}</strong><p>${m.attempts ? m.attempts + " respuestas registradas" : "Aún no has respondido preguntas"}</p></div><div class="stat"><span>Listas para repasar</span><strong>${cards.length}<small> tarjetas</small></strong><p>Recupera lo aprendido de memoria</p></div><div class="stat"><span>Tu constancia</span><strong>${m.streak}<small> ${m.streak === 1 ? "día" : "días"}</small></strong><p>Con sesiones de estudio registradas</p></div></div><div class="dashboard-bottom"><section class="panel"><div class="section-heading"><h2>Tu ruta de aprendizaje</h2>${courseSelect()}</div>${
    scoped("modules")
      .slice(0, 5)
      .map((mod, i) => {
        const ls = lessons.filter((l) => l.moduleId === mod.id),
          done = ls.filter((l) => progress(l).completed).length;
        return `<button class="route-row" data-action="open-module" data-id="${esc(mod.id)}"><span class="route-number ${done === ls.length && ls.length ? "done" : ""}">${String(i + 1).padStart(2, "0")}</span><span class="route-info"><strong>${esc(mod.title)}</strong><small>${ls.length} lecciones · ${done} estudiadas</small>${bar(ls.length ? (done / ls.length) * 100 : 0)}</span><span>↗</span></button>`;
      })
      .join("") ||
    empty(
      "Tu ruta comienza aquí",
      "Crea un curso y dale una estructura.",
      "new-course",
      "Crear curso",
    )
  }${scoped("modules").length > 5 ? '<a class="text-link" href="#library">Ver todos los módulos →</a>' : ""}</section><section class="panel next-panel"><span class="eyebrow">HAZ QUE SE QUEDE</span><h2>Leer es el inicio.<br>Recordar es el siguiente paso.</h2><p>Responde sin mirar, entiende tus errores y vuelve a las ideas que necesitan atención.</p><div class="next-option"><span class="next-icon">◎</span><div><strong>Practica con intención</strong><small>${scoped("questions").length} preguntas en este curso</small></div>${btn("→", "go-practice", "icon", 'aria-label="Ir a práctica"')}</div><div class="next-option"><span class="next-icon">↻</span><div><strong>Un repaso a tiempo</strong><small>${cards.length} tarjetas pendientes</small></div>${btn("→", "go-review", "icon", 'aria-label="Ir a repasar"')}</div></section></div>`;
}
function libraryView() {
  return `${heading("UNA BIBLIOTECA QUE CRECE CONTIGO", "Todo tu aprendizaje, en orden.", "Cursos, módulos y lecciones en un solo lugar.", btn("+ Cargar PDF", "import-book", "primary") + btn("Crear curso vacío", "new-course"))}<div class="course-grid">${db.courses
    .map((c, i) => {
      const ls = db.lessons.filter((l) => l.courseId === c.id),
        m = metrics(ls, db.progress, [], []);
      return `<button class="course-card ${c.id === courseId ? "selected" : ""}" data-action="select-course" data-id="${esc(c.id)}"><div class="course-cover" style="--cover:${/^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : "#d7e1cd"}"><span>ATLAS / ${String(i + 1).padStart(2, "0")}</span><div class="cover-symbol">${i % 2 ? "◎" : "↗"}</div><small>${db.modules.filter((m) => m.courseId === c.id).length} MÓDULOS</small></div><div class="course-body"><h3>${esc(c.title)}</h3><p>${esc(c.description || "Tu espacio para aprender.")}</p><div class="sidebar-count"><span>${m.completed} / ${ls.length} lecciones</span><strong>${m.percent}%</strong></div>${bar(m.percent)}</div></button>`;
    })
    .join(
      "",
    )}</div><section class="panel library-outline"><div class="section-heading"><h2>${esc(course()?.title || "Selecciona un curso")}</h2>${btn("Gestionar contenido", "go-admin")}</div>${outline(false)}</section>`;
}
function outline(admin) {
  return (
    scoped("modules")
      .map(
        (mod) =>
          `<details class="module-group" open><summary><span class="module-title">${esc(mod.title)}</span><small>${scoped("lessons").filter((l) => l.moduleId === mod.id).length} lecciones</small></summary>${admin ? `<div class="module-actions">${btn("Editar", "edit", "small", `data-kind="modules" data-id="${esc(mod.id)}"`)}${btn("↑", "move", "small", `aria-label="Subir módulo" data-kind="modules" data-id="${esc(mod.id)}" data-dir="-1"`)}${btn("↓", "move", "small", `aria-label="Bajar módulo" data-kind="modules" data-id="${esc(mod.id)}" data-dir="1"`)}${btn("Eliminar", "delete", "small danger", `data-kind="modules" data-id="${esc(mod.id)}"`)}${btn("+ Lección", "new-lesson", "small", `data-module="${esc(mod.id)}"`)}</div>` : ""}${
            scoped("lessons")
              .filter((l) => l.moduleId === mod.id)
              .map(
                (l) =>
                  `<div class="lesson-row"><button class="lesson-link" data-action="open-lesson" data-id="${esc(l.id)}"><span class="lesson-check ${progress(l).completed ? "complete" : ""}">${progress(l).completed ? "✓" : "○"}</span><span><strong>${esc(l.title)}</strong><small>${esc(ref(l))}</small></span></button>${admin ? `<div class="row-actions">${btn("Editar", "edit", "small", `data-kind="lessons" data-id="${esc(l.id)}"`)}${btn("↑", "move", "small", `aria-label="Subir lección" data-kind="lessons" data-id="${esc(l.id)}" data-dir="-1"`)}${btn("↓", "move", "small", `aria-label="Bajar lección" data-kind="lessons" data-id="${esc(l.id)}" data-dir="1"`)}${btn("×", "delete", "small danger", `aria-label="Eliminar lección" data-kind="lessons" data-id="${esc(l.id)}"`)}</div>` : '<span class="muted">↗</span>'}</div>`,
              )
              .join("") ||
            '<p class="muted">Añade la primera lección de este módulo.</p>'
          }</details>`,
      )
      .join("") ||
    empty(
      "Aún no hay módulos",
      "Dale una estructura a este curso.",
      "new-module",
      "Crear módulo",
    )
  );
}
function readerView() {
  const l = currentLesson();
  if (!l)
    return (
      heading(
        "LECTURA",
        "Tu biblioteca empieza con un PDF.",
        "Carga un libro y conviértelo en una ruta de lectura completa.",
        btn("Cargar mi primer PDF", "import-book", "primary"),
      ) +
      empty(
        "Cada página tiene su lugar",
        "Índice, lectura original y notas vinculadas a la fuente.",
      )
    );
  const ls = orderedLessons(),
    idx = ls.findIndex((x) => x.id === l.id),
    p = progress(l),
    prefs = db.settings.find((s) => s.id === "preferences") || {},
    d = db.documents.find((x) => x.id === l.documentId),
    pdf = isPdfDocument(d);
  const sourceModule = db.modules.find((m) => m.id === l.moduleId);
  const audit =
    d?.kind === "pdf-book" ? auditBook(d, db.lessons, db.modules) : null;
  const pageNotes = db.notes.filter((n) => n.lessonId === l.id);
  return `<section class="reader-workbench"><div class="reader-heading"><div><span class="eyebrow">${esc(sourceModule?.title || "LECTURA")}</span><h1>${esc(l.title)}</h1><p>${esc(course()?.title || "")} <span>·</span> ${pdf ? `Página física ${l.sourcePage || 1} de ${d.pages}${l.pageLabel && String(l.pageLabel) !== String(l.sourcePage) ? ` · Página impresa ${esc(l.pageLabel)}` : ""}` : esc(ref(l))}</p></div><div class="heading-actions">${btn(p.bookmarked ? "★ Guardada" : "☆ Guardar", "bookmark", "small")}${btn(p.completed ? "✓ Estudiada · Desmarcar" : "Marcar como estudiada", "complete", p.completed ? "small subtle" : "small primary")}</div></div><div class="reader-controls"><div class="reader-mode">${pdf ? `${btn("PDF original", "reader-mode", readerMode === "original" ? "active small" : "small", 'data-mode="original"')}${btn("Texto extraído", "reader-mode", readerMode === "text" ? "active small" : "small", 'data-mode="text"')}` : `${btn("A−", "font", "small", 'data-delta="-1" aria-label="Reducir texto"')}${btn("A+", "font", "small", 'data-delta="1" aria-label="Aumentar texto"')}`}</div><select id="lesson-select" aria-label="Lección">${ls.map((x) => `<option value="${esc(x.id)}" ${x.id === l.id ? "selected" : ""}>${x.sourcePage ? "p. " + x.sourcePage + " · " : ""}${esc(x.title)}</option>`).join("")}</select><div>${btn("←", "prev-lesson", "small", `aria-label="Lectura anterior" ${idx === 0 ? "disabled" : ""}`)}${btn("→", "next-lesson", "small", `aria-label="Lectura siguiente" ${idx === ls.length - 1 ? "disabled" : ""}`)}</div></div><div class="reader-body"><div class="reader-document-area">${pdf && readerMode === "original" ? '<div class="pdf-reader-host" aria-label="Visor del PDF original"></div>' : `<article class="reading-panel" style="--reader-size:${Math.min(24, Math.max(16, Number(prefs.fontSize) || 18))}px">${pdf ? '<p class="book-extraction-note">Texto auxiliar para buscar, seleccionar y escuchar. Consulta el PDF original para comprobar fórmulas, tablas, gráficos y el orden visual.</p>' : ""}<div class="reading-content" id="reading-content">${l.content ? (l.kind === "pdf-page" ? `<div class="pdf-extracted-text">${esc(l.content)}</div>` : content(l.content)) : '<div class="empty"><h3>Esta página no tiene texto reconocido.</h3><p>Su contenido completo está disponible en el PDF original. Puedes usar OCR si es un escaneo.</p></div>'}</div></article>`}<div class="reading-bottom"><span>${idx + 1} / ${ls.length} ${pdf ? "páginas de lectura" : "lecciones"}</span><div>${btn("← Anterior", "prev-lesson", "", idx === 0 ? "disabled" : "")}${btn("Siguiente →", "next-lesson", "primary", idx === ls.length - 1 ? "disabled" : "")}</div></div></div><aside class="reading-rail"><section><span class="eyebrow">EN ESTA LECTURA</span><h3>Comprender y recordar</h3><p>Selecciona una idea y escríbela con tus palabras.</p>${btn("+ Nota", "new-note", "full small")}${btn("+ Tarjeta", "new-card", "full small")}<div class="rail-actions">${btn("Escuchar", "speak", "small")}${btn("■", "stop-speak", "small", 'aria-label="Detener voz"')}</div><span class="rail-session" id="timer-label">${timer ? "En sesión" : "Tiempo de estudio"}</span>${btn(timer ? "Terminar sesión" : "Iniciar enfoque", timer ? "stop-timer" : "start-timer", "full small")}</section><section class="reader-notes-panel"><span class="eyebrow">MIS NOTAS</span>${pageNotes.map((n) => `<button class="note-mini" data-action="edit" data-kind="notes" data-id="${esc(n.id)}">${esc(n.text)}</button>`).join("") || '<p class="muted">Tus notas quedarán vinculadas a esta página.</p>'}</section>${audit ? `<section class="book-coverage"><span class="eyebrow">INTEGRIDAD DEL LIBRO</span><strong>${audit.represented} / ${audit.total} páginas</strong><p>${audit.complete ? "Todas las páginas en tu ruta." : "Revisa la cobertura de este curso."}</p>${btn("Ver índice y cobertura", "book-report", "small full", `data-id="${esc(d.id)}"`)}</section>` : ""}${pdf ? `<section><span class="eyebrow">HERRAMIENTAS</span>${btn("Índice del documento", "pdf-outline", "small full", `data-id="${esc(d.id)}"`)}${btn("Reconocer esta página (OCR)", "ocr-page", "small full")}${btn("Descargar original", "download-document", "small full", `data-id="${esc(d.id)}"`)}</section>` : l.documentId ? btn("Abrir fuente", "open-document", "small full", `data-id="${esc(l.documentId)}"`) : ""}<details class="rail-ai"><summary>Material de estudio con IA</summary><p>Genera borradores de preguntas o tarjetas a partir del texto. Revisa sus respuestas.</p>${btn("Preparar con IA", "ai", "small full", 'data-mode="all"')}</details></aside></div></section>`;
}
function orderedLessons() {
  return scoped("lessons").sort(
    (a, b) =>
      (db.modules.find((m) => m.id === a.moduleId)?.order || 0) -
        (db.modules.find((m) => m.id === b.moduleId)?.order || 0) ||
      byOrder(a, b),
  );
}
function questionPool() {
  let qs = scoped("questions").filter(
    (q) => !quizModule || q.moduleId === quizModule,
  );
  if (quizMode === "wrong")
    qs = qs.filter((q) => {
      const a = db.attempts
        .filter((x) => x.questionId === q.id)
        .sort((a, b) =>
          (b.createdAt || "").localeCompare(a.createdAt || ""),
        )[0];
      return a && !a.correct;
    });
  if (quizMode === "new")
    qs = qs.filter((q) => !db.attempts.some((a) => a.questionId === q.id));
  if (feedback && questionId && !qs.some((q) => q.id === questionId)) {
    const current = db.questions.find((q) => q.id === questionId);
    if (current && current.courseId === courseId) qs.unshift(current);
  }
  return qs;
}
function practiceView() {
  const qs = questionPool();
  if (!qs.some((q) => q.id === questionId)) {
    questionId = qs[0]?.id;
    answer = null;
    feedback = null;
  }
  const q = qs.find((q) => q.id === questionId),
    idx = qs.findIndex((q) => q.id === questionId);
  return `${heading("ENTIENDE, APLICA, COMPRUEBA", "Dale una vuelta a lo aprendido.", "Responde primero. Después, revisa el razonamiento y vuelve a la fuente.")}<div class="filterbar">${courseSelect()}<select id="quiz-module" aria-label="Módulo"><option value="">Todos los módulos</option>${scoped(
    "modules",
  )
    .map(
      (m) =>
        `<option value="${esc(m.id)}" ${quizModule === m.id ? "selected" : ""}>${esc(m.title)}</option>`,
    )
    .join(
      "",
    )}</select><select id="quiz-mode" aria-label="Tipo de práctica"><option value="all" ${quizMode === "all" ? "selected" : ""}>Todas las preguntas</option><option value="wrong" ${quizMode === "wrong" ? "selected" : ""}>Errores por reforzar</option><option value="new" ${quizMode === "new" ? "selected" : ""}>Sin responder</option></select></div>${
    q
      ? `<div class="practice-layout"><section class="question-card"><div class="question-top"><span class="eyebrow">PREGUNTA ${idx + 1} DE ${qs.length}</span><span class="pill">${esc(ref(q))}</span></div>${bar(((idx + 1) / qs.length) * 100)}<h2>${esc(q.prompt)}</h2>${q.type === "multiple" ? '<p class="muted">Selecciona todas las respuestas correctas.</p>' : ""}<div class="answer-options">${q.options.map((opt, i) => `<button class="answer-option ${(Array.isArray(answer) ? answer.includes(i) : answer === i) ? "chosen" : ""} ${feedback && (q.type === "multiple" ? q.correctIndices.includes(i) : q.correctIndex === i) ? "correct" : ""} ${feedback && (Array.isArray(answer) ? answer.includes(i) : answer === i) && !(q.type === "multiple" ? q.correctIndices.includes(i) : q.correctIndex === i) ? "incorrect" : ""}" data-action="answer" data-index="${i}" ${feedback ? "disabled" : ""}><span>${String.fromCharCode(65 + i)}</span>${esc(opt)}</button>`).join("")}</div>${feedback ? `<div class="feedback ${feedback.correct ? "positive" : "negative"}"><strong>${feedback.correct ? "Bien razonado." : "Una oportunidad para afinar."}</strong><p>${esc(q.explanation || "Consulta el material de referencia para revisar el razonamiento.")}</p>${q.lessonId ? btn("Volver a la lección", "open-lesson", "small", `data-id="${esc(q.lessonId)}"`) : ""}</div>` : ""}<div class="question-footer">${btn("Comprobar respuesta", "check-answer", "primary", answer === null || (Array.isArray(answer) && !answer.length) || feedback ? "disabled" : "")}${btn("Siguiente →", "next-question", "", !feedback ? "disabled" : "")}</div></section><aside class="panel question-map"><h3>Mapa de práctica</h3><p class="muted">Cada respuesta queda registrada.</p><div class="question-dots">${qs
          .map((x, i) => {
            const a = db.attempts
              .filter((a) => a.questionId === x.id)
              .sort((a, b) =>
                (b.createdAt || "").localeCompare(a.createdAt || ""),
              )[0];
            return `<button data-action="pick-question" data-id="${esc(x.id)}" class="${x.id === q.id ? "current" : ""} ${a ? (a.correct ? "pass" : "fail") : ""}" aria-label="Pregunta ${i + 1}">${i + 1}</button>`;
          })
          .join(
            "",
          )}</div><div class="map-legend"><span>● Correcta</span><span>● Por reforzar</span></div><p>El porcentaje de aciertos incluye todos tus intentos, también los repetidos.</p></aside></div>`
      : empty(
          "No hay preguntas en este filtro",
          "Crea preguntas o cambia el curso y los filtros.",
          "new-question",
          "Crear pregunta",
        )
  }`;
}
function reviewView() {
  const cards = dueCards(scoped("cards"));
  if (!cards.some((c) => c.id === reviewId)) {
    reviewId = cards[0]?.id;
    revealed = false;
  }
  const c = cards.find((c) => c.id === reviewId);
  return `${heading("EL CONOCIMIENTO SE CULTIVA", "Vuelve a las ideas importantes.", "Intenta recordar antes de revelar la respuesta.", btn("+ Nueva tarjeta", "new-card", "primary"))}<div class="filterbar">${courseSelect()}<span class="pill">${cards.length} pendientes · ${scoped("cards").length} en total</span>${btn("Administrar tarjetas", "manage-cards")}</div>${
    c
      ? `<section class="flashcard"><span class="eyebrow">RECUERDO ACTIVO</span><div class="flashcard-front">${esc(c.front)}</div>${
          revealed
            ? `<div class="flashcard-back">${esc(c.back).replace(/\n/g, "<br>")}</div><small class="muted">${esc(ref(c))}</small><p>¿Qué tan fácil fue recordarlo?</p><div class="review-grades">${[
                ["again", "Otra vez", "10 min"],
                ["hard", "Difícil", "Paso corto"],
                ["good", "Bien", "Paso normal"],
                ["easy", "Fácil", "Paso largo"],
              ]
                .map(([g, t, s]) =>
                  btn(
                    `<strong>${t}</strong><small>${s}</small>`,
                    "grade",
                    "",
                    `data-grade="${g}"`,
                  ),
                )
                .join("")}</div>`
            : `<p class="muted">Tómate un momento. La respuesta puede esperar.</p>${btn("Revelar respuesta", "reveal", "primary")}`
        }${c.lessonId ? btn("Consultar fuente", "open-lesson", "text-link", `data-id="${esc(c.lessonId)}"`) : ""}</section>`
      : empty(
          "Estás al día.",
          "Las tarjetas aparecerán aquí cuando llegue su próximo repaso.",
          "manage-cards",
          "Ver mis tarjetas",
        )
  }${glossaryView()}`;
}
function glossaryView() {
  const cards = scoped("cards")
    .slice()
    .sort((a, b) => a.front.localeCompare(b.front, "es"));
  return `<section class="panel course-glossary"><span class="eyebrow">CONSULTA TU MATERIAL</span><h2>Glosario y tarjetas del curso</h2><label>Buscar un concepto<input id="glossary-search" type="search" placeholder="Término, pregunta o definición…"></label><div id="glossary-entries">${cards.map((c) => `<details data-glossary-entry><summary>${esc(c.front)}</summary><p>${esc(c.back).replace(/\n/g, "<br>")}</p>${c.needsDefinition ? '<p class="notice">Esta definición requiere revisión.</p>' : ""}<div class="row-actions">${c.lessonId ? btn("Volver a la fuente", "open-lesson", "small", `data-id="${esc(c.lessonId)}"`) : ""}${btn("Editar", "edit", "small", `data-kind="cards" data-id="${esc(c.id)}"`)}</div></details>`).join("") || '<p class="muted">Añade términos y tarjetas desde la lectura. Aquí podrás consultarlos aunque todavía no estén pendientes de repaso.</p>'}</div><p id="glossary-empty" class="muted" hidden>No hay coincidencias.</p></section>`;
}
function notesView() {
  return `${heading("TU FORMA DE ENTENDERLO", "Ideas que vale la pena guardar.", "Tus notas, vinculadas al material que estás estudiando.", btn("+ Nueva nota", "new-note", "primary"))}<div class="filterbar">${courseSelect()}</div><div class="notes-grid">${
    scoped("notes")
      .map(
        (n) =>
          `<article class="note-card"><span class="eyebrow">${esc(db.lessons.find((l) => l.id === n.lessonId)?.title || "Nota del curso")}</span><p>${esc(n.text).replace(/\n/g, "<br>")}</p><div class="row-actions">${btn("Editar", "edit", "small", `data-kind="notes" data-id="${esc(n.id)}"`)}${n.lessonId ? btn("Fuente", "open-lesson", "small", `data-id="${esc(n.lessonId)}"`) : ""}${btn("Eliminar", "delete", "small danger", `data-kind="notes" data-id="${esc(n.id)}"`)}</div></article>`,
      )
      .join("") ||
    empty(
      "Tu cuaderno está listo",
      "Guarda una explicación, una duda o un ejemplo.",
      "new-note",
      "Escribir una nota",
    )
  }</div>`;
}
function adminView() {
  return `${heading("TÚ CONSTRUYES TU BIBLIOTECA", "Un lugar para cada idea.", "Crea, ordena y actualiza tu material sin editar código.", btn("+ Importar documento", "import", "primary"))}<div class="admin-toolbar">${courseSelect()}${btn("+ Curso", "new-course")}${btn("+ Módulo", "new-module")}${btn("+ Lección", "new-lesson")}${btn("+ Pregunta", "new-question")}${btn("Importar respaldo / curso", "import-backup")}${btn("Exportar respaldo", "export")}</div><div class="admin-layout"><section class="panel"><div class="section-heading"><h2>Estructura del curso</h2>${course() ? `<div>${btn("Editar curso", "edit", "small", `data-kind="courses" data-id="${esc(courseId)}"`)}${btn("Eliminar", "delete", "small danger", `data-kind="courses" data-id="${esc(courseId)}"`)}</div>` : ""}</div>${outline(true)}</section><aside><section class="panel import-hint"><span class="import-symbol">↥</span><h3>Del documento al aprendizaje.</h3><p>Carga un libro PDF y obtén un curso completo con índice editable, lecturas por página y el documento original.</p><div class="tag-list"><span>PDF</span><span>TXT</span><span>Markdown</span><span>Imagen + OCR</span></div>${btn("Crear curso desde PDF", "import-book", "primary full") + btn("Otros materiales", "import-material", "full small")}<small>El PDF original conserva gráficos y fórmulas. Puedes reconocer escaneos desde el lector.</small></section><section class="panel"><h3>Documentos del curso</h3>${
    scoped("documents")
      .map(
        (d) =>
          `<div class="document-item"><button data-action="open-document" data-id="${esc(d.id)}">▤ ${esc(d.title || d.name)}</button><small>${d.pages || 0} páginas · ${esc(d.method || "Archivo")}</small>${d.kind === "pdf-book" ? btn("Índice y cobertura", "book-report", "small", `data-id="${esc(d.id)}"`) : ""}</div>`,
      )
      .join("") || '<p class="muted">Aquí estarán tus fuentes originales.</p>'
  }</section><section class="panel"><h3>Banco de preguntas</h3><p>${scoped("questions").length} preguntas editables</p>${btn("Administrar preguntas", "manage-questions", "full")}${btn("Administrar tarjetas", "manage-cards", "full")}</section></aside></div>`;
}
function settingsView() {
  const p = db.settings.find((x) => x.id === "preferences") || {},
    s = store.status();
  return `${heading("UN ESPACIO A TU MEDIDA", "Todo preparado para continuar.", "Tu cuenta, tus preferencias y tus copias de seguridad.")}<div class="settings-grid"><section class="panel"><h2>Tu rutina</h2><form id="preferences-form">${field("Nombre para tu espacio", "name", p.name || "Walter")}${field("Meta diaria (minutos)", "dailyGoal", p.dailyGoal || 30, "number", 'min="5" max="600" required')}${field("Fecha objetivo (opcional)", "examDate", p.examDate || "", "date")}<label>Apariencia<select name="theme"><option value="light" ${p.theme !== "dark" ? "selected" : ""}>Clara</option><option value="dark" ${p.theme === "dark" ? "selected" : ""}>Oscura</option></select></label><button class="btn primary" type="submit">Guardar preferencias</button></form>${p.examDate ? `<p class="muted">${Math.max(0, Math.ceil((new Date(p.examDate + "T23:59:59") - Date.now()) / 86400000))} días hasta tu fecha objetivo.</p>` : ""}</section><section class="panel"><h2>Cuenta y sincronización</h2><p>${currentUser ? esc(currentUser.email) : "Estás usando un espacio local en este navegador."}</p><div class="status-detail"><span>${currentUser ? "Cuenta conectada" : "Sin sesión"}</span><strong>${s.pending || 0} cambios pendientes</strong><small>${s.lastSync ? "Última sincronización: " + new Date(s.lastSync).toLocaleString("es-PE") : "Todavía sin sincronización"}</small></div>${s.error ? `<p class="inline-error">${esc(s.error)}</p>` : ""}${btn("Sincronizar ahora", "sync", "primary")}${currentUser ? btn("Cerrar sesión", "logout") : btn("Iniciar sesión", "account")}${btn("Resolver conflictos", "conflicts")}<p class="muted">Los espacios locales y las cuentas se mantienen separados. Para llevar tus datos a tu cuenta: exporta un respaldo, inicia sesión e impórtalo.</p><a href="docs/GUIA_CONFIGURACION.html" target="_blank" rel="noopener" class="text-link">Guía de configuración paso a paso ↗</a></section><section class="panel"><h2>Tu información te pertenece</h2><p>Descarga un respaldo con tu biblioteca, avance, notas, tarjetas y archivos disponibles en este dispositivo.</p>${btn("Exportar respaldo", "export", "primary")}${btn("Importar respaldo / curso", "import-backup")}<p class="muted">Conserva copias periódicas. El almacenamiento del navegador puede borrarse.</p></section><section class="panel"><h2>Recupera tu lector anterior</h2><p>Importa primero <strong>migration/curso-original.json</strong> desde Gestionar. Después recupera las marcas y notas guardadas por la web anterior, usando el mismo navegador y dominio.</p>${btn("Recuperar avance anterior", "migrate", "primary")}<p class="muted">La migración conserva una copia del estado original y no borra tus datos anteriores.</p></section></div>`;
}
function editor(kind, id = "", preset = {}) {
  editorSnapshot = null;
  const existing = db[kind]?.find((x) => x.id === id);
  editorSnapshot = existing ? structuredClone(existing) : null;
  const v = { ...preset, ...existing },
    selectedText =
      window.getSelection()?.toString().trim() ||
      pdfState?.controller?.getSelection() ||
      pdfSelectedText ||
      "";
  let fields = "";
  const modules = `<label>Módulo<select name="moduleId" required>${scoped(
    "modules",
  )
    .map(
      (m) =>
        `<option value="${esc(m.id)}" ${m.id === (v.moduleId || currentLesson()?.moduleId) ? "selected" : ""}>${esc(m.title)}</option>`,
    )
    .join("")}</select></label>`;
  const sourceLessons = `<label>Lección de referencia<select name="lessonId"><option value="">Sin lección vinculada</option>${scoped(
    "lessons",
  )
    .map(
      (l) =>
        `<option value="${esc(l.id)}" ${l.id === (v.lessonId || lessonId) ? "selected" : ""}>${esc(l.title)}</option>`,
    )
    .join("")}</select></label>`;
  if (
    ["modules", "lessons", "cards", "questions", "notes"].includes(kind) &&
    !courseId
  ) {
    toast("Crea un curso primero.", true);
    return editor("courses");
  }
  if (["lessons", "questions"].includes(kind) && !scoped("modules").length) {
    toast("Crea un módulo primero.", true);
    return editor("modules");
  }
  const textarea = (label, name, value, attrs = "") =>
    `<label>${label}<textarea name="${name}" ${attrs}>${esc(value || "")}</textarea></label>`;
  if (kind === "courses")
    fields =
      field(
        "Título del curso",
        "title",
        v.title || "",
        "text",
        'required maxlength="160"',
      ) +
      textarea("Descripción", "description", v.description) +
      field("Color de portada", "color", v.color || "#c4dca5", "color");
  if (kind === "modules")
    fields =
      field(
        "Título del módulo",
        "title",
        v.title || "",
        "text",
        'required maxlength="180"',
      ) + textarea("Objetivo del módulo", "description", v.description);
  if (kind === "lessons")
    fields =
      modules +
      field(
        "Título de la lección",
        "title",
        v.title || "",
        "text",
        'required maxlength="240"',
      ) +
      textarea(
        "Contenido (texto o HTML; las etiquetas inseguras se eliminan)",
        "content",
        v.content,
        v.kind === "pdf-page" ? 'rows="12"' : 'required rows="12"',
      ) +
      field("Referencia / fuente", "sourceLabel", v.sourceLabel || "");
  if (kind === "notes")
    fields =
      sourceLessons +
      textarea("Tu nota", "text", v.text || selectedText, 'required rows="7"');
  if (kind === "cards")
    fields =
      sourceLessons +
      textarea(
        "Pregunta / anverso",
        "front",
        v.front || selectedText,
        'required rows="3"',
      ) +
      textarea("Respuesta / reverso", "back", v.back, 'required rows="5"');
  if (kind === "questions")
    fields =
      modules +
      sourceLessons +
      `<label>Tipo<select name="type"><option value="single" ${v.type !== "multiple" ? "selected" : ""}>Una respuesta</option><option value="multiple" ${v.type === "multiple" ? "selected" : ""}>Varias respuestas</option></select></label>` +
      textarea("Pregunta", "prompt", v.prompt, 'required rows="3"') +
      textarea(
        "Alternativas (una por línea, entre 2 y 6)",
        "options",
        (v.options || ["", "", ""]).join("\n"),
        'required rows="5"',
      ) +
      field(
        "Respuestas correctas (1 = primera; varias separadas por coma)",
        "correctIndex",
        v.type === "multiple"
          ? (v.correctIndices || []).map((i) => i + 1).join(", ")
          : Number.isInteger(v.correctIndex)
            ? v.correctIndex + 1
            : 1,
        "text",
        "required",
      ) +
      textarea(
        "Explicación de la respuesta",
        "explanation",
        v.explanation,
        'required rows="4"',
      ) +
      field(
        "Página fuente (opcional)",
        "sourcePage",
        v.sourcePage || "",
        "number",
        'min="1"',
      );
  const titles = {
    courses: "curso",
    modules: "módulo",
    lessons: "lección",
    notes: "nota",
    cards: "tarjeta",
    questions: "pregunta",
  };
  openModal(
    `<span class="eyebrow">TU BIBLIOTECA</span><h2>${existing ? "Editar" : "Crear"} ${titles[kind]}</h2><form id="editor-form" data-kind="${kind}" data-id="${esc(id)}">${fields}<div class="form-error" role="alert"></div><div class="dialog-actions">${btn("Cancelar", "close")}<button class="btn primary" type="submit">Guardar ${titles[kind]}</button></div></form>`,
  );
}
async function saveEditor(form) {
  const kind = form.dataset.kind;
  if (form.dataset.id) {
    const latest = await store.get(kind, form.dataset.id);
    if (JSON.stringify(latest) !== JSON.stringify(editorSnapshot))
      throw new Error(
        "Este elemento cambió mientras lo editabas. Copia tu borrador, cierra y vuelve a abrirlo para comparar la versión actual.",
      );
  }
  const data = Object.fromEntries(new FormData(form)),
    old = db[kind]?.find((x) => x.id === form.dataset.id) || {};
  Object.keys(data).forEach((k) => (data[k] = data[k].trim()));
  const record = {
    ...old,
    ...data,
    id: old.id || uid(),
    courseId: old.courseId || courseId,
    order: old.order ?? scoped(kind).length,
  };
  if (kind === "courses") delete record.courseId;
  if (kind === "questions") {
    record.options = data.options
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    const indices = [
      ...new Set(data.correctIndex.split(",").map((n) => Number(n.trim()) - 1)),
    ].sort((a, b) => a - b);
    if (
      record.options.length < 2 ||
      record.options.length > 6 ||
      !indices.length ||
      indices.some(
        (i) => !Number.isInteger(i) || i < 0 || i >= record.options.length,
      ) ||
      (record.type !== "multiple" && indices.length !== 1)
    )
      throw new Error(
        "Agrega entre 2 y 6 alternativas e indica respuestas correctas válidas.",
      );
    record.correctIndex = record.type === "multiple" ? -1 : indices[0];
    record.correctIndices = record.type === "multiple" ? indices : undefined;
    record.sourcePage = data.sourcePage ? Number(data.sourcePage) : undefined;
  }
  if (kind === "cards") {
    const linked = db.lessons.find((x) => x.id === record.lessonId);
    record.moduleId = linked?.moduleId || "";
    record.sourcePage = linked?.sourcePage;
    record.sourceLabel = linked?.sourceLabel || record.sourceLabel;
    record.needsDefinition = false;
    record.interval = old.interval || 0;
    record.repetitions = old.repetitions || 0;
    record.ease = old.ease || 2.5;
  }
  if (kind === "lessons" && record.kind !== "pdf-page")
    record.content = DOMPurify.sanitize(record.content, {
      FORBID_TAGS: ["script", "style", "iframe", "form"],
      FORBID_ATTR: ["style"],
    });
  await store.put(kind, record);
  if (kind === "courses") courseId = record.id;
  if (kind === "lessons") lessonId = record.id;
  closeModal();
  await render();
  toast("Guardado en tu espacio.");
}
async function deleteRecord(kind, id) {
  const entity = db[kind].find((x) => x.id === id);
  if (!entity) return;
  if (kind === "lessons" && entity.kind === "pdf-page")
    throw Error(
      "Las páginas del libro se conservan completas. Puedes editar su título, cambiar su módulo o eliminar el curso completo.",
    );
  if (
    kind === "modules" &&
    db.lessons.some((l) => l.moduleId === id && l.kind === "pdf-page")
  )
    throw Error(
      "Este módulo contiene páginas del libro. Usa «Ajustar módulos y rangos» en el informe de cobertura para reorganizarlo sin perder páginas.",
    );
  let affected = [];
  if (kind === "courses")
    affected = kinds
      .filter((k) => k !== "settings" && k !== "courses")
      .flatMap((k) =>
        db[k].filter((x) => x.courseId === id).map((x) => [k, x.id]),
      );
  if (kind === "modules") {
    const ls = db.lessons.filter((l) => l.moduleId === id).map((l) => l.id);
    affected = kinds
      .filter((k) => !["courses", "settings", "modules"].includes(k))
      .flatMap((k) =>
        db[k]
          .filter(
            (x) =>
              x.moduleId === id ||
              ls.includes(x.lessonId) ||
              (k === "lessons" && ls.includes(x.id)),
          )
          .map((x) => [k, x.id]),
      );
  }
  if (kind === "lessons")
    affected = ["progress", "notes", "cards", "questions"].flatMap((k) =>
      db[k].filter((x) => x.lessonId === id).map((x) => [k, x.id]),
    );
  const qids = affected.filter((x) => x[0] === "questions").map((x) => x[1]);
  if (kind === "questions") qids.push(id);
  affected.push(
    ...db.attempts
      .filter((x) => qids.includes(x.questionId))
      .map((x) => ["attempts", x.id]),
  );
  if (
    !confirm(
      `¿Eliminar “${entity.title || entity.front || entity.prompt || "esta nota"}”${affected.length ? ` y ${affected.length} elementos relacionados` : ""}? Exporta un respaldo si quieres conservarlo.`,
    )
  )
    return;
  for (const [k, rid] of affected) await store.remove(k, rid);
  await store.remove(kind, id);
  await render();
  toast("Elemento eliminado.");
}
async function moveRecord(kind, id, dir) {
  const x = db[kind].find((x) => x.id === id);
  const list = scoped(kind).filter(
      (v) => kind !== "lessons" || v.moduleId === x.moduleId,
    ),
    idx = list.findIndex((v) => v.id === id),
    other = idx + dir;
  if (other < 0 || other >= list.length) return;
  [list[idx], list[other]] = [list[other], list[idx]];
  for (let i = 0; i < list.length; i++)
    if (list[i].order !== i) await store.put(kind, { ...list[i], order: i });
  await render();
}
function manageList(kind) {
  const list = scoped(kind);
  openModal(
    `<h2>${kind === "cards" ? "Tus tarjetas" : "Tus preguntas"}</h2><p class="muted">${list.length} elementos en el curso actual</p><div class="manage-list">${list.map((x) => `<div><span>${esc(x.front || x.prompt)}</span><div>${btn("Editar", "edit", "small", `data-kind="${kind}" data-id="${esc(x.id)}"`)}${btn("Eliminar", "delete", "small danger", `data-kind="${kind}" data-id="${esc(x.id)}"`)}</div></div>`).join("") || "<p>Aún no hay elementos.</p>"}</div>${btn("+ Crear", kind === "cards" ? "new-card" : "new-question", "primary")}`,
  );
}
function operationGuard(form) {
  const epoch = sessionGeneration,
    scope = currentUser?.id || "guest";
  return () => {
    if (
      !ready ||
      epoch !== sessionGeneration ||
      (currentUser?.id || "guest") !== scope ||
      (form && (!form.isConnected || !modal.open))
    )
      throw new DOMException(
        "La operación se canceló o cambió la cuenta.",
        "AbortError",
      );
  };
}
function bookImportDialog() {
  openModal(
    `<span class="eyebrow">UN LIBRO, UN CURSO COMPLETO</span><h2>Empieza cargando tu PDF.</h2><p>Se guardará el original y se creará una lectura para cada página, con módulos basados en su índice o en los encabezados detectados.</p><form id="book-import-form"><label class="dropzone"><span>↥</span><strong>Selecciona un libro PDF</strong><small>Hasta 40 MB y 1.000 páginas · Procesamiento en tu navegador</small><input name="file" type="file" accept="application/pdf,.pdf" required></label>${field("Nombre del curso (opcional)", "title", "", "text", 'maxlength="160" placeholder="Se utilizará el título del documento"')}<div class="book-import-summary"><p><strong>El libro completo.</strong> Portadas, texto, tablas, gráficos, fórmulas y anexos permanecen en el PDF original.</p><p><strong>Un índice editable.</strong> Si el archivo no tiene un índice reconocible, se organizará en bloques de páginas para que puedas ajustarlo.</p></div><div id="book-progress" role="status" aria-live="polite"></div><div class="form-error" role="alert"></div><div class="dialog-actions">${btn("Cancelar", "close")}<button class="btn primary" type="submit">Crear curso de lectura</button></div></form><details><summary>Otros materiales y extracción por rangos</summary><p>Para TXT, imágenes, Markdown o fragmentos de un documento usa la importación de contenido.</p>${btn("Importar otro material", "import-material", "small")}</details>`,
  );
}
async function importBook(form) {
  const file = form.elements.file.files[0];
  if (!file) return;
  const generation = ++importGeneration,
    scope = currentUser?.id || "guest",
    epoch = sessionGeneration;
  const title = form.elements.title.value.trim();
  const controller = new AbortController();
  importController = controller;
  const assertActive = () => {
    if (
      controller.signal.aborted ||
      generation !== importGeneration ||
      epoch !== sessionGeneration ||
      !ready ||
      (currentUser?.id || "guest") !== scope
    )
      throw new DOMException("Importación cancelada.", "AbortError");
  };
  const report = (message) => {
    const el = $("#book-progress");
    if (el) el.textContent = message;
  };
  const result = await analyzeBook(file, {
    signal: controller.signal,
    onProgress: (p) =>
      report(
        p.message ||
          `Procesando página ${p.current || 0} de ${p.total || "?"}…`,
      ),
  });
  assertActive();
  const duplicate = db.documents.find(
    (d) => d.kind === "pdf-book" && d.fingerprint === result.fingerprint,
  );
  if (duplicate) {
    courseId = duplicate.courseId;
    const first = db.lessons
      .filter((l) => l.documentId === duplicate.id)
      .sort((a, b) => a.sourcePage - b.sourcePage)[0];
    closeModal();
    if (first) await openLesson(first.id);
    else await navigate("admin");
    return toast(
      "Este libro ya está en tu biblioteca. Abrimos su curso para conservar tu avance.",
    );
  }
  const documentId = uid(),
    newCourseId = uid();
  report("Guardando el PDF original y verificando la cobertura completa…");
  bookBusy = true;
  try {
    const savedFile = await store.saveFile(file, documentId);
    assertActive();
    const book = buildBookRecords(result, savedFile, {
      courseId: newCourseId,
      documentId,
      title: title || result.title,
      order: db.courses.length,
      makeId: uid,
    });
    await store.putBatch(book.records);
    assertActive();
    courseId = newCourseId;
    lessonId = book.lessons[0].id;
    readerMode = "original";
    await store.put("settings", { id: "last-lesson", courseId, lessonId });
    assertActive();
  } finally {
    bookBusy = false;
  }
  closeModal();
  await navigate("reader");
  toast(
    `Curso listo: ${result.totalPages} de ${result.totalPages} páginas conservadas. Revisa su índice en «Ver índice y cobertura».`,
  );
}
function bookReport(id) {
  const d = db.documents.find((x) => x.id === id);
  if (!d) return;
  const audit = auditBook(d, db.lessons, db.modules),
    sourceLabels = {
      bookmarks: "Índice interno del PDF",
      headings: "Encabezados detectados",
      fallback: "Bloques de páginas",
      frontmatter: "Páginas iniciales",
    };
  openModal(
    `<span class="eyebrow">CONTROL DE COBERTURA</span><h2>${esc(d.title)}</h2><div class="coverage-grid"><div><strong>${audit.represented} / ${audit.total}</strong><span>Páginas representadas</span></div><div><strong>${audit.withoutText}</strong><span>Sin texto auxiliar</span></div></div><p class="notice">${audit.complete ? "Todas las páginas físicas están incluidas una sola vez y vinculadas a un módulo." : "La estructura necesita revisión. Sincroniza si el libro se está descargando en este dispositivo."}</p>${audit.missing.length ? `<p class="inline-error">Páginas sin lectura: ${audit.missing.join(", ")}</p>` : ""}${audit.duplicates.length ? `<p class="inline-error">Páginas duplicadas: ${audit.duplicates.join(", ")}</p>` : ""}${audit.orphaned.length ? `<p class="inline-error">Páginas sin módulo: ${audit.orphaned.join(", ")}</p>` : ""}<p>La cobertura mide páginas incluidas; tu avance mide las que has marcado como estudiadas. El original conserva la disposición visual de tablas, fórmulas, gráficos y anexos.</p><h3>Estructura de lectura</h3><div class="book-module-report">${db.modules
      .filter((m) => m.documentId === d.id)
      .sort(byOrder)
      .map((m) => {
        const pages = db.lessons
          .filter((l) => l.moduleId === m.id && l.documentId === d.id)
          .map((l) => l.sourcePage);
        return `<div><strong>${esc(m.title)}</strong><span>${pages.length ? `p. ${Math.min(...pages)}–${Math.max(...pages)}` : "Sin páginas"} · ${esc(sourceLabels[m.source] || "Organización manual")}</span></div>`;
      })
      .join(
        "",
      )}</div>${(d.warnings || []).map((w) => `<p class="book-extraction-note">${esc(w)}</p>`).join("")}<p class="muted">El reconocimiento del índice y del texto es automático y puede necesitar ajustes. No interpreta ni reconstruye las fórmulas del libro.</p><div class="dialog-actions">${btn("Ajustar módulos y rangos", "book-structure", "", `data-id="${esc(d.id)}"`)}${btn("Ver índice del PDF", "pdf-outline", "", `data-id="${esc(d.id)}"`)}${btn("Seguir leyendo", "close", "primary")}</div>`,
  );
}
function sourceOutline(id) {
  const d = db.documents.find((x) => x.id === id);
  if (!d) return;
  openModal(
    `<span class="eyebrow">NAVEGACIÓN DEL DOCUMENTO</span><h2>Índice de ${esc(d.title)}</h2><p>Los números indican páginas físicas del archivo.</p><div class="source-outline">${(d.outline || []).map((o) => `<button class="outline-level-${Math.min(3, o.level || 0)}" data-action="source-page" data-id="${esc(d.id)}" data-page="${o.page}"><span>${esc(o.title)}</span><small>p. ${o.page}</small></button>`).join("") || "<p>Este PDF no contiene un índice interno utilizable. Puedes navegar con los módulos y páginas de la barra lateral.</p>"}</div>`,
  );
}
function rangeRow(r = { title: "Nuevo módulo", startPage: 1, endPage: 1 }) {
  return `<div class="book-index-row" data-range-row data-module-id="${esc(r.id || "")}">${field("Título", "rangeTitle", r.title, "text", 'required maxlength="180"')}${field("Desde", "rangeStart", r.startPage, "number", 'required min="1"')}${field("Hasta", "rangeEnd", r.endPage, "number", 'required min="1"')}${btn("×", "remove-range", "small danger", 'aria-label="Quitar fila del índice"')}</div>`;
}
function editBookStructure(id) {
  const d = db.documents.find((x) => x.id === id);
  if (!d) return;
  const modules = db.modules
    .filter((m) => m.documentId === d.id)
    .sort(byOrder)
    .map((m) => {
      const nums = db.lessons
        .filter((l) => l.moduleId === m.id && l.documentId === d.id)
        .map((l) => l.sourcePage);
      return {
        ...m,
        startPage: nums.length ? Math.min(...nums) : m.startPage,
        endPage: nums.length ? Math.max(...nums) : m.endPage,
      };
    });
  bookStructureSnapshot = JSON.stringify({
    modules: db.modules.filter((m) => m.documentId === d.id),
    lessons: db.lessons.filter((l) => l.documentId === d.id),
  });
  openModal(
    `<span class="eyebrow">ESTRUCTURA ACADÉMICA</span><h2>Ajusta los módulos de lectura</h2><p>Distribuye las páginas 1–${d.pages} en orden, sin huecos ni repeticiones. Puedes dividir o reunir capítulos. Tus notas, marcas y avance permanecen vinculados a la misma página.</p><form id="book-structure-form" data-id="${esc(id)}"><div id="book-ranges">${modules.map(rangeRow).join("")}</div>${btn("+ Añadir módulo", "add-range", "small", `data-total="${d.pages}"`)}<div class="form-error" role="alert"></div><div class="dialog-actions">${btn("Cancelar", "close")}<button class="btn primary" type="submit">Guardar estructura completa</button></div></form>`,
  );
}
async function saveBookStructure(form) {
  const d = db.documents.find((x) => x.id === form.dataset.id);
  if (!d) throw Error("No se encontró el libro.");
  const assertActive = operationGuard(form);
  const fresh = Object.fromEntries(
    await Promise.all(
      ["modules", "lessons", "questions", "cards", "notes"].map(
        async (kind) => [kind, await store.list(kind)],
      ),
    ),
  );
  assertActive();
  const latestMods = fresh.modules.filter((m) => m.documentId === d.id),
    latestPages = fresh.lessons.filter((l) => l.documentId === d.id);
  if (
    JSON.stringify({ modules: latestMods, lessons: latestPages }) !==
    bookStructureSnapshot
  )
    throw Error(
      "La estructura cambió mientras la editabas. Copia tus ajustes, cierra y abre el editor de nuevo.",
    );
  const ranges = [...form.querySelectorAll("[data-range-row]")].map((row) => ({
    id: row.dataset.moduleId || uid(),
    title: row.querySelector("[name=rangeTitle]").value.trim(),
    startPage: Number(row.querySelector("[name=rangeStart]").value),
    endPage: Number(row.querySelector("[name=rangeEnd]").value),
  }));
  validateBookRanges(ranges, d.pages);
  const removed = latestMods.filter((m) => !ranges.some((r) => r.id === m.id));
  const pageIds = new Set(latestPages.map((l) => l.id));
  for (const mod of removed) {
    if (
      fresh.lessons.some(
        (l) => l.moduleId === mod.id && l.documentId !== d.id,
      ) ||
      ["questions", "cards", "notes"].some((kind) =>
        fresh[kind].some(
          (x) => x.moduleId === mod.id && !pageIds.has(x.lessonId),
        ),
      )
    )
      throw Error(
        `El módulo «${mod.title}» tiene materiales independientes vinculados. Conserva esa fila o mueve esos materiales desde Gestionar.`,
      );
  }
  const mods = ranges.map((r, i) => ({
    ...latestMods.find((m) => m.id === r.id),
    ...r,
    courseId: d.courseId,
    documentId: d.id,
    source: "manual",
    order: i,
  }));
  const pages = latestPages.map((l) => ({
    ...l,
    moduleId: mods.find(
      (m) => l.sourcePage >= m.startPage && l.sourcePage <= m.endPage,
    ).id,
    order: l.sourcePage - 1,
  }));
  const pageMap = new Map(pages.map((l) => [l.id, l]));
  const linked = ["questions", "cards", "notes"].flatMap((kind) =>
    fresh[kind]
      .filter(
        (x) =>
          x.courseId === d.courseId &&
          pageMap.has(x.lessonId) &&
          x.moduleId !== pageMap.get(x.lessonId).moduleId,
      )
      .map((x) => ({
        kind,
        data: { ...x, moduleId: pageMap.get(x.lessonId).moduleId },
      })),
  );
  assertActive();
  bookBusy = true;
  try {
    await store.putBatch(
      [
        ...mods.map((data) => ({ kind: "modules", data })),
        ...pages.map((data) => ({ kind: "lessons", data })),
        ...linked,
      ],
      {
        createOnly: false,
        remove: removed.map((m) => ({ kind: "modules", id: m.id })),
      },
    );
    assertActive();
  } finally {
    bookBusy = false;
  }
  closeModal();
  await render();
  toast(
    "Estructura actualizada. Todas las páginas, notas y materiales vinculados se conservaron.",
  );
}
async function ocrCurrentPage() {
  const l = currentLesson(),
    d = db.documents.find((x) => x.id === l?.documentId);
  if (!d) return;
  openModal(
    `<span class="eyebrow">RECONOCIMIENTO DE TEXTO</span><h2>Reconocer página ${l.sourcePage}</h2><p>El OCR añade texto auxiliar para buscar y escuchar. Revisa los símbolos y las fórmulas contra el PDF original.</p><form id="ocr-page-form" data-id="${esc(l.id)}"><label>Idioma<select name="language"><option value="eng">Inglés</option><option value="spa">Español</option><option value="eng+spa">Inglés y español</option></select></label><div id="import-progress" role="status"></div><div class="form-error" role="alert"></div><div class="dialog-actions">${btn("Cancelar", "close")}<button class="btn primary" type="submit">Reconocer texto de esta página</button></div></form>`,
  );
}
async function runPageOcr(form) {
  const l = db.lessons.find((x) => x.id === form.dataset.id),
    d = db.documents.find((x) => x.id === l?.documentId);
  if (!d) return;
  const generation = ++importGeneration,
    controller = new AbortController(),
    assertActive = operationGuard(form);
  importController = controller;
  const original = JSON.stringify(await store.get("lessons", l.id)),
    blob = await store.loadFile(d.fileId || d.id);
  assertActive();
  if (controller.signal.aborted || generation !== importGeneration) return;
  if (!blob) throw Error("Descarga el PDF sincronizando antes de reconocerlo.");
  const result = await extractDocument(
    new File([blob], d.name || "libro.pdf", { type: "application/pdf" }),
    {
      ocr: true,
      ocrLanguages: form.elements.language.value,
      pageStart: l.sourcePage,
      pageEnd: l.sourcePage,
      signal: controller.signal,
      onProgress: (p) => {
        const el = $("#import-progress");
        if (el) el.textContent = p.message || "Reconociendo texto…";
      },
    },
  );
  assertActive();
  if (controller.signal.aborted || generation !== importGeneration) return;
  const recognized = result.pages[0]?.text || "";
  openModal(
    `<span class="eyebrow">REVISA EL TEXTO RECONOCIDO</span><h2>Página ${l.sourcePage}</h2><p>El PDF permanece intacto. Puedes corregir este texto antes de guardarlo.</p><form id="ocr-save-form" data-id="${esc(l.id)}"><label>Texto auxiliar<textarea name="text" rows="14">${esc(recognized)}</textarea></label><div class="form-error" role="alert"></div><div class="dialog-actions">${btn("Cancelar", "close")}<button class="btn primary" type="submit">Guardar texto revisado</button></div></form>`,
  );
  ocrSnapshot = original;
}
async function downloadDocument(id) {
  const d = db.documents.find((x) => x.id === id);
  if (!d) return;
  const blob = await store.loadFile(d.fileId || d.id);
  if (!blob) throw Error("Sincroniza para descargar el archivo.");
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = d.name || `${d.title}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function importDialog() {
  if (!courseId) {
    toast("Primero crea un curso.", true);
    return editor("courses");
  }
  openModal(
    `<span class="eyebrow">MOTOR DE CONTENIDOS</span><h2>Del archivo a tu biblioteca.</h2><p>Curso destino: <strong>${esc(course()?.title)}</strong>. Revisa siempre el texto antes de crear lecciones.</p><form id="import-form"><label class="dropzone"><span>↥</span><strong>Selecciona tu material</strong><small>PDF, TXT, Markdown, PNG o JPG · hasta 40 MB</small><input type="file" name="file" accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp" required></label><label class="check-label"><input type="checkbox" name="ocr"> Reconocer texto en escaneos (OCR, requiere conexión inicial)</label><div class="field-pair">${field("Desde página PDF", "pageStart", 1, "number", 'min="1"')}${field("Hasta página (opcional)", "pageEnd", "", "number", 'min="1"')}</div><p class="muted">El OCR procesa hasta 10 páginas por importación. En PDF extensos puedes trabajar por rangos.</p><div id="import-progress" role="status"></div><div class="form-error" role="alert"></div><div class="dialog-actions">${btn("Cancelar", "close")}<button class="btn primary" type="submit">Reconocer y ordenar</button></div></form>`,
  );
}
async function processImport(form) {
  const file = form.elements.file.files[0];
  if (!file) return;
  importController = new AbortController();
  const result = await extractDocument(file, {
    ocr: form.elements.ocr.checked,
    pageStart: Number(form.elements.pageStart.value) || 1,
    pageEnd: Number(form.elements.pageEnd.value) || undefined,
    signal: importController.signal,
    onProgress: (p) => {
      const el = $("#import-progress");
      if (el)
        el.textContent =
          p.message || `Procesando ${p.current || 0}/${p.total || "?"}…`;
    },
  });
  if (!modal.open) return;
  const duplicate = db.documents.find(
    (d) => d.fingerprint === result.fingerprint,
  );
  if (
    duplicate &&
    !confirm(
      `Este archivo ya existe como “${duplicate.title}”. ¿Crear otra importación?`,
    )
  )
    return;
  pendingImport = { file, result };
  openModal(
    `<span class="eyebrow">REVISA ANTES DE GUARDAR</span><h2>Una estructura para empezar.</h2><p>${result.pages.length} páginas procesadas · ${esc(result.method)} · ${result.sections.length} secciones sugeridas</p>${result.warnings.map((w) => `<p class="notice">${esc(w)}</p>`).join("")}<form id="commit-import"><label>Guardar en módulo<select name="moduleId"><option value="new">Crear módulo con el nombre del documento</option>${scoped(
      "modules",
    )
      .map((m) => `<option value="${esc(m.id)}">${esc(m.title)}</option>`)
      .join(
        "",
      )}</select></label>${field("Título del documento", "title", result.title, "text", "required")}<div class="import-sections">${result.sections.map((s, i) => `<details ${i === 0 ? "open" : ""}><summary><input type="checkbox" name="include-${i}" checked aria-label="Incluir sección ${i + 1}"> ${esc(s.title)} <small>p. ${s.pageStart}–${s.pageEnd}</small></summary>${field("Título de la lección", `title-${i}`, s.title, "text", "required")}<label>Texto reconocido<textarea name="text-${i}" rows="8">${esc(s.text)}</textarea></label></details>`).join("")}</div><p class="muted">Las tablas, fórmulas y varias columnas pueden requerir corrección. El original se guarda para contrastarlo.</p><div class="form-error" role="alert"></div><div class="dialog-actions">${btn("Cancelar", "close")}<button class="btn primary" type="submit">Guardar documento y lecciones</button></div></form>`,
  );
}
async function commitImport(form) {
  if (!pendingImport) throw Error("Selecciona el documento de nuevo.");
  const { file, result } = pendingImport,
    data = Object.fromEntries(new FormData(form)),
    chosen = result.sections
      .map((s, i) => ({ ...s, i }))
      .filter((s) => data[`include-${s.i}`]);
  if (!chosen.length) throw Error("Selecciona al menos una sección.");
  const docId = uid(),
    moduleId = data.moduleId === "new" ? uid() : data.moduleId;
  const savedFile = await store.saveFile(file, docId);
  if (data.moduleId === "new")
    await store.put("modules", {
      id: moduleId,
      courseId,
      title: data.title,
      order: scoped("modules").length,
    });
  await store.put("documents", {
    id: docId,
    courseId,
    moduleId,
    title: data.title,
    ...savedFile,
    pages: result.pages.length,
    fingerprint: result.fingerprint,
    method: result.method,
  });
  const start = scoped("lessons").filter((l) => l.moduleId === moduleId).length;
  for (let j = 0; j < chosen.length; j++) {
    const s = chosen[j];
    await store.put("lessons", {
      id: uid(),
      courseId,
      moduleId,
      title: data[`title-${s.i}`] || s.title,
      content: data[`text-${s.i}`] || s.text,
      sourcePage: s.pageStart,
      sourcePageEnd: s.pageEnd,
      sourceLabel: data.title,
      documentId: docId,
      order: start + j,
    });
  }
  closeModal();
  view = "library";
  location.hash = "library";
  await render();
  toast(
    `${chosen.length} lecciones creadas. Tu archivo original también está guardado.`,
  );
}
async function openDocument(id) {
  const d = db.documents.find((x) => x.id === id);
  if (!d) throw Error("No se encontró el documento de origen.");
  if (isPdfDocument(d)) {
    const page = db.lessons
      .filter((l) => l.documentId === id)
      .sort((a, b) => (a.sourcePage || 0) - (b.sourcePage || 0))[0];
    if (page) {
      readerMode = "original";
      return openLesson(page.id);
    }
  }
  const blob = await store.loadFile(d.fileId || d.id);
  if (
    blob &&
    ![
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/bmp",
      "text/plain",
      "text/markdown",
    ].includes(blob.type)
  )
    throw Error(
      "El formato de este archivo no está permitido para abrirlo en la web.",
    );
  if (!blob)
    throw Error("El archivo todavía no está disponible. Conecta y sincroniza.");
  const u = URL.createObjectURL(blob);
  tempUrls.push(u);
  openModal(
    `<h2>${esc(d.title || d.name)}</h2><p>Contrasta el contenido reconocido con su fuente original.</p><a class="btn primary" href="${u}" target="_blank" rel="noopener">Abrir original en otra pestaña ↗</a><a class="btn" href="${u}" download="${esc(d.name || d.title)}">Descargar</a>${blob.type === "application/pdf" ? `<iframe class="pdf-frame" title="Documento original" src="${u}"></iframe>` : ""}`,
  );
}
async function importBackupFile(file) {
  const payload = JSON.parse(await file.text());
  if (payload.format === "cfa-study-workspace") {
    const allowed = [
      "courses",
      "modules",
      "lessons",
      "questions",
      "cards",
      "settings",
    ];
    let count = 0;
    for (const kind of allowed) {
      if (!Array.isArray(payload[kind])) continue;
      for (const row of payload[kind]) {
        if (!row || typeof row.id !== "string" || row.id.length > 180)
          throw Error("El archivo contiene un registro inválido.");
        if (
          kind === "questions" &&
          (!Array.isArray(row.options) ||
            (row.type === "multiple"
              ? !Array.isArray(row.correctIndices) ||
                !row.correctIndices.length ||
                row.correctIndices.some(
                  (i) =>
                    !Number.isInteger(i) || i < 0 || i >= row.options.length,
                )
              : !Number.isInteger(row.correctIndex) ||
                row.correctIndex < 0 ||
                row.correctIndex >= row.options.length))
        )
          throw Error("El archivo contiene una pregunta inválida.");
        count++;
      }
    }
    if (!count) throw Error("El archivo no contiene cursos.");
    if (
      !confirm(
        `Importar ${count} elementos. Los registros con el mismo identificador se actualizarán. ¿Continuar?`,
      )
    )
      return;
    for (const kind of allowed)
      for (const row of payload[kind] || [])
        await store.put(kind, {
          ...row,
          ...(kind === "lessons"
            ? { content: DOMPurify.sanitize(row.content) }
            : {}),
        });
    courseId = payload.courses?.[0]?.id || courseId;
  } else {
    if (
      !confirm(
        "Importar este respaldo en el espacio actual. Los elementos con el mismo identificador pueden actualizarse. ¿Continuar?",
      )
    )
      return;
    await store.importBackup(payload);
  }
  await render();
  toast("Importación completa.");
}
async function prepareAI() {
  const l = currentLesson();
  if (!l) throw Error("Abre una lección primero.");
  if (!auth.isConfigured() || !currentUser)
    throw Error("Configura Supabase e inicia sesión para usar la IA opcional.");
  openModal(
    `<h2>Material de apoyo con IA</h2><p>Se enviará el texto de esta lección a tu función privada y al proveedor de IA configurado. Revisa las respuestas y sus referencias antes de guardarlas.</p><p><strong>${esc(l.title)}</strong></p>${btn("Generar borrador", "run-ai", "primary")}<div id="ai-progress" role="status"></div>`,
  );
}
async function runAI() {
  const l = currentLesson(),
    generation = ++importGeneration;
  $("#ai-progress").textContent = "Preparando el borrador…";
  const r = await generateStudyMaterial({
    text: strip(l.content),
    pages: [{ number: l.sourcePage || 1, text: strip(l.content) }],
    mode: "all",
  });
  if (!modal.open || generation !== importGeneration) return;
  pendingImport = { ai: r, lesson: { ...l } };
  openModal(
    `<span class="eyebrow">BORRADOR · VERIFICA LA FUENTE</span><h2>Revisa antes de incorporar.</h2><form id="ai-save"><label>Resumen<textarea name="summary" rows="5">${esc(r.summary || "")}</textarea></label><p>El resumen se guardará como una nota. Desmarca los elementos que no quieras incorporar.</p>${(r.cards || []).map((c, i) => `<details open><summary><input type="checkbox" name="card-${i}" checked aria-label="Incluir tarjeta ${i + 1}"> Tarjeta ${i + 1}</summary>${field("Pregunta", `front-${i}`, c.front)}<label>Respuesta<textarea name="back-${i}">${esc(c.back)}</textarea></label><small>Página ${esc(c.sourcePage || "sin referencia")}</small></details>`).join("")}${(r.questions || []).map((q, i) => `<details><summary><input type="checkbox" name="q-${i}" checked aria-label="Incluir pregunta ${i + 1}"> ${esc(q.prompt)}</summary><p>${q.options.map((o, j) => `${j + 1}. ${esc(o)}${j === q.correctIndex ? " ✓" : ""}`).join("<br>")}</p><p>${esc(q.explanation)}</p><small>Puedes editar la pregunta en Gestionar después de guardarla.</small></details>`).join("")}<div class="form-error" role="alert"></div><button class="btn primary" type="submit">Guardar elementos revisados</button></form>`,
  );
}
async function saveAI(form) {
  const { ai, lesson: l } = pendingImport || {};
  if (!ai) throw Error("El borrador ya no está disponible.");
  const d = Object.fromEntries(new FormData(form));
  const base = {
    courseId: l.courseId,
    moduleId: l.moduleId,
    lessonId: l.id,
    sourcePage: l.sourcePage,
    sourceLabel: "Borrador de IA revisado · " + l.title,
  };
  if (d.summary?.trim())
    await store.put("notes", {
      ...base,
      id: uid(),
      text: d.summary,
      aiGenerated: true,
    });
  for (let i = 0; i < (ai.cards || []).length; i++)
    if (d[`card-${i}`])
      await store.put("cards", {
        ...base,
        ...ai.cards[i],
        id: uid(),
        front: d[`front-${i}`],
        back: d[`back-${i}`],
        interval: 0,
        repetitions: 0,
        ease: 2.5,
        aiGenerated: true,
      });
  for (let i = 0; i < (ai.questions || []).length; i++)
    if (d[`q-${i}`])
      await store.put("questions", {
        ...base,
        ...ai.questions[i],
        id: uid(),
        aiGenerated: true,
      });
  closeModal();
  await render();
  toast("Material revisado incorporado a tu curso.");
}
function loginView() {
  renderSeq++;
  disposePdf();
  ready = false;
  $("#app").innerHTML =
    `<div class="login-shell"><section class="login-story"><a class="brand" href="#"><span class="brand-icon">a<span>↗</span></span><span>CFA Study Reader<small>READING COMPANION</small></span></a><div><span class="eyebrow">DALE ESPACIO A TU CURIOSIDAD</span><h1>Un libro completo.<br>Tu propia ruta de lectura.</h1><p>Carga tu PDF, recorre cada página y conecta tus notas con la fuente. Tu lectura y tu avance, en un solo lugar.</p><div class="login-orbits" aria-hidden="true">◎</div></div><small>Organiza · Comprende · Practica · Recuerda</small></section><section class="login-form-area"><div class="login-form-inner"><span class="eyebrow">BIENVENIDO A TU ESPACIO</span><h2>${authMode === "signup" ? "Crea tu cuenta." : authMode === "reset" ? "Recupera tu acceso." : "Qué bueno volver."}</h2><p>${auth.isConfigured() ? "Inicia sesión para continuar en cualquiera de tus dispositivos." : "Puedes comenzar en este dispositivo y conectar tu cuenta después."}</p>${auth.isConfigured() ? `<form id="auth-form">${field("Correo electrónico", "email", "", "email", 'required autocomplete="email"')}${authMode !== "reset" ? field("Contraseña", "password", "", "password", `required minlength="8" autocomplete="${authMode === "signup" ? "new-password" : "current-password"}"`) : ""}<div class="form-error" role="alert"></div><button class="btn primary full" type="submit">${authMode === "signup" ? "Crear cuenta" : authMode === "reset" ? "Enviar enlace" : "Iniciar sesión"}</button></form><div class="auth-links">${btn(authMode === "signin" ? "Crear cuenta" : "Ya tengo cuenta", "auth-mode", "text-link", `data-mode="${authMode === "signin" ? "signup" : "signin"}"`)}${authMode === "signin" ? btn("Olvidé mi contraseña", "auth-mode", "text-link", 'data-mode="reset"') : ""}</div><div class="divider">o</div>` : '<p class="notice">La conexión se configura una sola vez con la guía incluida en el ZIP.</p>'}${btn("Continuar en este dispositivo", "local", "full")}<small class="login-note">El modo local guarda tus datos en este navegador. No sincroniza con otros dispositivos.</small><a class="text-link" href="docs/GUIA_CONFIGURACION.html" target="_blank" rel="noopener">Cómo conectar y publicar la web ↗</a></div></section></div>`;
}
async function enter(user) {
  const scope = user?.id || "guest";
  if (entering && enteringScope === scope) return entering;
  if (entering) await entering;
  if (timerStart) await finishTimer();
  sessionGeneration++;
  renderSeq++;
  disposePdf();
  if (modal.open) closeModal(true);
  ready = false;
  currentUser = user || null;
  enteringScope = scope;
  entering = (async () => {
    await store.initStore(user?.id || null);
    if (user) {
      await store.sync();
      if (!store.status().error) await seedWelcome(store);
    } else await seedWelcome(store);
    ready = true;
    view = Object.hasOwn(names, location.hash.slice(1))
      ? location.hash.slice(1)
      : "reader";
    await render();
  })();
  try {
    await entering;
  } finally {
    entering = null;
  }
}
async function finishTimer() {
  if (!timerStart) return;
  const seconds = Math.min(
    8 * 3600,
    Math.max(0, Math.round((Date.now() - timerStart) / 1000)),
  );
  clearInterval(timer);
  timer = null;
  timerStart = 0;
  timerSeconds = 0;
  if (seconds >= 10)
    await store.put("sessions", {
      id: uid(),
      courseId: timerCourseId,
      date: dayKey(),
      minutes: Number((seconds / 60).toFixed(2)),
      createdAt: new Date().toISOString(),
    });
  await render();
  toast(
    seconds >= 10
      ? "Sesión registrada. Buen trabajo."
      : "Sesión finalizada. Se registran sesiones desde 10 segundos.",
  );
}
function updateTimer() {
  const el = $("#timer-label");
  if (el && timerStart) {
    timerSeconds = Math.round((Date.now() - timerStart) / 1000);
    el.textContent = `${String(Math.floor(timerSeconds / 60)).padStart(2, "0")}:${String(timerSeconds % 60).padStart(2, "0")}`;
  }
}
function updateStatus() {
  const s = store.status(),
    el = $("#sync-status");
  if (!el) return;
  el.className = "sync-pill " + (s.error ? "sync-error" : "");
  el.innerHTML = `<span class="status-dot"></span>${s.syncing ? "Sincronizando…" : s.error ? "Revisar sincronización" : currentUser ? (s.pending ? `${s.pending} pendientes` : "Sincronizado") : "Solo este dispositivo"}`;
  el.title = s.error || "Estado de tus datos";
}
async function navigate(v) {
  if (v !== view) window.speechSynthesis?.cancel();
  view = v;
  location.hash = v;
  await render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
async function openLesson(id) {
  const l = db.lessons.find((x) => x.id === id);
  if (!l) throw Error("La lección vinculada no está disponible.");
  if (l.documentId !== currentLesson()?.documentId) readerMode = "original";
  courseId = l.courseId;
  lessonId = id;
  pdfSelectedText = "";
  document.body.classList.remove("menu-open");
  await rememberReading(l);
  if (modal.open) closeModal();
  await navigate("reader");
}
async function stepLesson(dir) {
  const ls = orderedLessons(),
    n = ls.findIndex((x) => x.id === lessonId) + dir;
  if (ls[n]) await openLesson(ls[n].id);
}
async function handleAction(target) {
  const a = target.dataset.action,
    id = target.dataset.id,
    kind = target.dataset.kind;
  switch (a) {
    case "close":
      return closeModal();
    case "menu":
      return document.body.classList.toggle("menu-open");
    case "local":
      return enter(null);
    case "account":
      if (currentUser) return navigate("settings");
      if (timerStart) await finishTimer();
      if (modal.open) closeModal();
      return loginView();
    case "auth-mode":
      authMode = target.dataset.mode;
      return loginView();
    case "logout":
      if (timerStart) await finishTimer();
      await auth.signOut();
      currentUser = null;
      ready = false;
      await store.initStore(null);
      return loginView();
    case "sync":
      if (!currentUser)
        return toast(
          "Inicia sesión para sincronizar. Tu trabajo local está guardado aquí.",
        );
      await store.sync();
      await render();
      if (store.status().error) throw Error(store.status().error);
      return toast("Sincronización completada.");
    case "continue":
      return currentLesson() ? openLesson(lessonId) : editor("courses");
    case "select-course":
      courseId = id;
      readerMode = "original";
      quizModule = "";
      questionId = "";
      reviewId = "";
      return render();
    case "open-module": {
      const l = scoped("lessons").find((l) => l.moduleId === id);
      if (l) return openLesson(l.id);
      return navigate("admin");
    }
    case "open-lesson":
      return openLesson(id);
    case "go-admin":
      return navigate("admin");
    case "go-practice":
      return navigate("practice");
    case "go-review":
      return navigate("review");
    case "new-course":
      return editor("courses");
    case "new-module":
      return editor("modules");
    case "new-lesson":
      return editor("lessons", "", { moduleId: target.dataset.module });
    case "new-note":
      return editor("notes");
    case "new-card":
      return editor("cards");
    case "new-question":
      return editor("questions");
    case "edit":
      return editor(kind, id);
    case "delete":
      await deleteRecord(kind, id);
      if (modal.open) closeModal();
      return;
    case "move":
      return moveRecord(kind, id, Number(target.dataset.dir));
    case "manage-cards":
      return manageList("cards");
    case "manage-questions":
      return manageList("questions");
    case "bookmark": {
      const l = currentLesson(),
        p = progress(l);
      await store.put("progress", { ...p, bookmarked: !p.bookmarked });
      return render();
    }
    case "complete": {
      const l = currentLesson(),
        p = progress(l);
      await store.put("progress", {
        ...p,
        completed: !p.completed,
        completedAt: !p.completed ? new Date().toISOString() : null,
      });
      return render();
    }
    case "next-lesson":
      return stepLesson(1);
    case "prev-lesson":
      return stepLesson(-1);
    case "speak": {
      if (!("speechSynthesis" in window))
        throw Error("Este navegador no ofrece lectura en voz alta.");
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        strip(currentLesson().content),
      );
      utterance.lang = /\b(the|and|investment)\b/i.test(utterance.text)
        ? "en-US"
        : "es-PE";
      speechSynthesis.speak(utterance);
      return;
    }
    case "stop-speak":
      return window.speechSynthesis?.cancel();
    case "font": {
      const p = db.settings.find((s) => s.id === "preferences") || {
        id: "preferences",
      };
      await store.put("settings", {
        ...p,
        fontSize: Math.max(
          16,
          Math.min(24, (p.fontSize || 18) + Number(target.dataset.delta)),
        ),
      });
      return render();
    }
    case "answer": {
      const q = db.questions.find((x) => x.id === questionId),
        i = Number(target.dataset.index);
      answer =
        q?.type === "multiple"
          ? Array.isArray(answer) && answer.includes(i)
            ? answer.filter((n) => n !== i)
            : [...(Array.isArray(answer) ? answer : []), i].sort(
                (a, b) => a - b,
              )
          : i;
      return render();
    }
    case "check-answer": {
      const q = db.questions.find((x) => x.id === questionId);
      if (answer === null || feedback) return;
      feedback = {
        correct:
          q.type === "multiple"
            ? JSON.stringify(answer) ===
              JSON.stringify([...q.correctIndices].sort((a, b) => a - b))
            : answer === q.correctIndex,
      };
      await store.put("attempts", {
        id: uid(),
        courseId,
        questionId: q.id,
        selectedIndex: answer,
        correct: feedback.correct,
        createdAt: new Date().toISOString(),
      });
      return render();
    }
    case "next-question": {
      const prevId = questionId;
      feedback = null;
      const qs = questionPool(),
        i = qs.findIndex((q) => q.id === prevId);
      questionId = qs[(i + 1) % qs.length]?.id;
      answer = null;
      return render();
    }
    case "pick-question":
      questionId = id;
      answer = null;
      feedback = null;
      return render();
    case "reveal":
      revealed = true;
      return render();
    case "grade": {
      const c = db.cards.find((c) => c.id === reviewId);
      if (!c || !revealed) return;
      await store.put("cards", scheduleReview(c, target.dataset.grade));
      reviewId = "";
      revealed = false;
      return render();
    }
    case "start-timer":
      if (!timerStart) {
        timerStart = Date.now();
        timerCourseId = courseId;
        timer = setInterval(updateTimer, 1000);
      }
      return render();
    case "stop-timer":
      return finishTimer();
    case "import":
    case "import-book":
      return bookImportDialog();
    case "import-material":
      return importDialog();
    case "book-report":
      return bookReport(id);
    case "pdf-outline":
      return sourceOutline(id);
    case "book-structure":
      return editBookStructure(id);
    case "source-page": {
      const number = Number(target.dataset.page);
      const page = db.lessons.find(
        (l) => l.documentId === id && l.sourcePage === number,
      );
      if (page) {
        readerMode = "original";
        return openLesson(page.id);
      }
      throw Error(
        "No hay una lectura vinculada a esta página. Revisa la cobertura del libro.",
      );
    }
    case "add-range": {
      const rows = [...$("#book-ranges").querySelectorAll("[data-range-row]")],
        last = rows.at(-1);
      const start = last
        ? Number(last.querySelector("[name=rangeEnd]").value) + 1
        : 1;
      $("#book-ranges").insertAdjacentHTML(
        "beforeend",
        rangeRow({
          title: "Nuevo módulo",
          startPage: start,
          endPage: Number(target.dataset.total),
        }),
      );
      return;
    }
    case "remove-range":
      target.closest("[data-range-row]").remove();
      return;
    case "ocr-page":
      return ocrCurrentPage();
    case "download-document":
      return downloadDocument(id);
    case "reader-mode":
      readerMode = target.dataset.mode;
      pdfSelectedText = "";
      return render();
    case "retry-pdf":
      disposePdf();
      return render();
    case "theme": {
      const old = db.settings.find((s) => s.id === "preferences") || {
        id: "preferences",
      };
      await store.put("settings", {
        ...old,
        theme: old.theme === "dark" ? "light" : "dark",
      });
      return render();
    }
    case "open-document":
      return openDocument(id);
    case "export": {
      toast("Preparando el respaldo…");
      const backup = await store.exportBackup();
      download(`Study-Atlas-respaldo-${dayKey()}.json`, backup);
      return toast("Respaldo descargado. Consérvalo en un lugar seguro.");
    }
    case "import-backup": {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = () =>
        input.files[0] &&
        importBackupFile(input.files[0]).catch((e) =>
          toast(errorMessage(e), true),
        );
      input.click();
      return;
    }
    case "migrate": {
      const state = inspectLegacyProgress();
      if (!state.found)
        throw Error(
          "No se encontró avance del lector anterior en este navegador y dominio.",
        );
      if (!db.courses.some((c) => c.id === "legacy-course-1"))
        throw Error(
          "Importa migration/curso-original.json antes de recuperar el avance.",
        );
      const result = await migrateLegacyProgress(store);
      if (result.requiresCourse) throw Error(result.message);
      if (result.currentLessonId)
        await store.put("settings", {
          id: "last-lesson",
          lessonId: result.currentLessonId,
        });
      courseId = "legacy-course-1";
      lessonId = result.currentLessonId || lessonId;
      await render();
      return toast(
        "Avance anterior recuperado. Se conservó una copia de seguridad.",
      );
    }
    case "search":
      return openModal(
        `<h2>Encuentra la idea que buscas.</h2><label>Buscar en todas tus lecciones<input id="global-search" placeholder="Un concepto, una fórmula, una palabra…" autofocus></label><div id="search-results" class="search-results"><p class="muted">Escribe para buscar por título y contenido.</p></div>`,
      );
    case "ai":
      return prepareAI();
    case "run-ai":
      return runAI();
    case "conflicts": {
      const conflicts = await store.listConflicts();
      return openModal(
        `<h2>Cambios que necesitan tu decisión</h2><p>Compara las versiones antes de elegir cuál conservar.</p>${conflicts.length ? conflicts.map((c, i) => `<details><summary>${esc(c.kind || c.entity_type)} · ${esc(c.id || c.entity_id)}</summary><pre>${esc(JSON.stringify(c, null, 2))}</pre>${btn("Conservar este dispositivo", "resolve-conflict", "", `data-kind="${esc(c.kind)}" data-id="${esc(c.id)}" data-choice="local"`)}${btn("Usar versión de nube", "resolve-conflict", "", `data-kind="${esc(c.kind)}" data-id="${esc(c.id)}" data-choice="remote"`)}</details>`).join("") : "<p>No hay conflictos pendientes.</p>"}`,
      );
    }
    case "resolve-conflict":
      await store.resolveConflict(kind, id, target.dataset.choice);
      closeModal();
      return render();
  }
}
document.addEventListener("click", async (e) => {
  const target = e.target.closest("[data-action]");
  if (target) {
    if (target.disabled) return;
    e.preventDefault();
    const busy = [
      "sync",
      "check-answer",
      "grade",
      "export",
      "run-ai",
      "migrate",
      "logout",
    ].includes(target.dataset.action);
    if (busy) target.disabled = true;
    try {
      await handleAction(target);
    } catch (err) {
      toast(errorMessage(err), true);
      const p = $("#ai-progress");
      if (p) p.textContent = errorMessage(err);
    } finally {
      if (busy) target.disabled = false;
    }
  }
  const nav = e.target.closest('a[href^="#"]');
  if (nav && Object.hasOwn(names, nav.hash.slice(1))) {
    document.body.classList.remove("menu-open");
  }
});
document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (!(f instanceof HTMLFormElement)) return;
  e.preventDefault();
  const submit = f.querySelector('[type="submit"]'),
    err = f.querySelector(".form-error");
  if (submit) submit.disabled = true;
  if (err) err.textContent = "";
  try {
    if (f.id === "editor-form") await saveEditor(f);
    if (f.id === "preferences-form") {
      const old = db.settings.find((s) => s.id === "preferences") || {},
        data = Object.fromEntries(new FormData(f));
      await store.put("settings", {
        ...old,
        ...data,
        id: "preferences",
        dailyGoal: Number(data.dailyGoal),
      });
      await render();
      toast("Preferencias guardadas.");
    }
    if (f.id === "book-import-form") await importBook(f);
    if (f.id === "book-structure-form") await saveBookStructure(f);
    if (f.id === "ocr-page-form") await runPageOcr(f);
    if (f.id === "ocr-save-form") {
      const assertActive = operationGuard(f);
      const page = await store.get("lessons", f.dataset.id);
      assertActive();
      if (JSON.stringify(page) !== ocrSnapshot)
        throw Error(
          "Esta página cambió mientras revisabas el texto. Copia tu borrador y vuelve a abrirla.",
        );
      await store.put("lessons", {
        ...page,
        content: f.elements.text.value,
        textStatus: "reviewed",
      });
      assertActive();
      closeModal();
      await render();
      toast("Texto auxiliar guardado.");
    }
    if (f.id === "import-form") await processImport(f);
    if (f.id === "commit-import") await commitImport(f);
    if (f.id === "ai-save") await saveAI(f);
    if (f.id === "auth-form") {
      const { email, password } = Object.fromEntries(new FormData(f));
      if (authMode === "reset") {
        await auth.resetPassword(email);
        toast(
          "Si la cuenta existe, recibirás un enlace para recuperar el acceso.",
        );
      } else if (authMode === "signup") {
        const r = await auth.signUp(email, password);
        toast("Revisa tu correo para confirmar la cuenta.");
        if (auth.getUser()) await enter(auth.getUser());
      } else {
        await auth.signIn(email, password);
        await enter(auth.getUser());
      }
    }
    if (f.id === "password-form") {
      const d = Object.fromEntries(new FormData(f));
      if (d.password !== d.confirm)
        throw Error("Las contraseñas no coinciden.");
      await auth.updatePassword(d.password);
      closeModal();
      toast("Contraseña actualizada.");
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (err && err.isConnected) err.textContent = errorMessage(error);
    else toast(errorMessage(error), true);
  } finally {
    if (submit) submit.disabled = false;
  }
});
document.addEventListener("change", async (e) => {
  try {
    if (["course-select", "sidebar-course-select"].includes(e.target.id)) {
      courseId = e.target.value;
      readerMode = "original";
      quizModule = "";
      questionId = "";
      reviewId = "";
      answer = null;
      feedback = null;
      await render();
    }
    if (e.target.id === "lesson-select") await openLesson(e.target.value);
    if (e.target.id === "quiz-mode" || e.target.id === "quiz-module") {
      if (e.target.id === "quiz-mode") quizMode = e.target.value;
      else quizModule = e.target.value;
      questionId = "";
      answer = null;
      feedback = null;
      await render();
    }
  } catch (error) {
    toast(errorMessage(error), true);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "glossary-search") {
    const normalized = (value) =>
      String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const query = normalized(e.target.value).trim();
    let visible = 0;
    document.querySelectorAll("[data-glossary-entry]").forEach((entry) => {
      entry.hidden = !normalized(entry.textContent).includes(query);
      if (!entry.hidden) visible++;
    });
    $("#glossary-empty").hidden = visible > 0 || !query;
  }
  if (e.target.id === "global-search") {
    const hits = searchLessons(db.lessons, e.target.value);
    $("#search-results").innerHTML =
      hits
        .map(
          (l) =>
            `<button data-action="open-lesson" data-id="${esc(l.id)}"><strong>${esc(l.title)}</strong><small>${esc(db.courses.find((c) => c.id === l.courseId)?.title)} · ${esc(ref(l))}</small><p>${esc(strip(l.content).slice(0, 160))}…</p></button>`,
        )
        .join("") || '<p class="muted">No se encontraron lecciones.</p>';
  }
});
window.addEventListener("hashchange", () => {
  if (
    ready &&
    Object.hasOwn(names, location.hash.slice(1)) &&
    view !== location.hash.slice(1)
  ) {
    view = location.hash.slice(1);
    render();
  }
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) &&
    !modal.open &&
    ready
  ) {
    e.preventDefault();
    handleAction({ dataset: { action: "search" } });
  }
  if (e.key === "Escape") document.body.classList.remove("menu-open");
});
modal.addEventListener("cancel", (e) => {
  if (bookBusy) {
    e.preventDefault();
    return;
  }
  pendingImport = null;
  importGeneration++;
  importController?.abort();
  tempUrls.forEach(URL.revokeObjectURL);
  tempUrls = [];
});
window.addEventListener("beforeunload", (e) => {
  if (timerStart || bookBusy) {
    e.preventDefault();
    e.returnValue = "";
  }
});
store.subscribe((s) => {
  updateStatus();
  if ((s.source === "remote" || s.source === "tab") && s.changed) {
    lastSyncSeen = s.lastSync;
    if (ready && !entering) {
      if (modal.open) refreshPending = true;
      else render();
    }
  }
});
modal.addEventListener("close", () => {
  if (refreshPending && ready) {
    refreshPending = false;
    render();
  }
});
try {
  await auth.initAuth();
  auth.onAuthChange((user, event) => {
    if (event === "PASSWORD_RECOVERY")
      openModal(
        `<h2>Elige una nueva contraseña</h2><form id="password-form">${field("Nueva contraseña", "password", "", "password", 'required minlength="8" autocomplete="new-password"')}${field("Repetir contraseña", "confirm", "", "password", 'required minlength="8" autocomplete="new-password"')}<div class="form-error" role="alert"></div><button class="btn primary" type="submit">Actualizar contraseña</button></form>`,
      );
    if (event === "SIGNED_OUT" && currentUser) {
      sessionGeneration++;
      renderSeq++;
      disposePdf();
      clearInterval(timer);
      timer = null;
      timerStart = 0;
      currentUser = null;
      ready = false;
      if (modal.open) closeModal(true);
      store.initStore(null).then(loginView);
    }
    if (
      !authBooting &&
      user &&
      ["SIGNED_IN", "USER_UPDATED"].includes(event) &&
      currentUser?.id !== user.id
    )
      enter(user);
  });
  currentUser = auth.getUser();
  if (currentUser) await enter(currentUser);
  else loginView();
  authBooting = false;
  if ("serviceWorker" in navigator && location.protocol !== "file:")
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
} catch (error) {
  $("#app").innerHTML =
    `<div class="boot"><h1>No se pudo abrir tu espacio</h1><p>${esc(errorMessage(error))}</p><p>Abre la web por HTTPS o mediante el servidor local indicado en la guía.</p><button onclick="location.reload()" class="btn">Reintentar</button></div>`;
}
