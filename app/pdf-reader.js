/* Original-page PDF reader. PDF.js is local; scripts, attachments and PDF forms
 * are never executed. Only safe external links and internal page links work. */
let enginePromise;
const documents = new Map();
const blobKeys = new WeakMap();
let nextBlobKey = 0;
function engine() {
  return enginePromise ||= import('../vendor/pdf.mjs').then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.mjs', import.meta.url).href;
    return pdfjs;
  });
}
function stylesheet() {
  const url = new URL('./pdf-reader.css', import.meta.url).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === url)) return;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.dataset.pdfReaderStyle = '';
  link.href = url; document.head.append(link);
}
function pruneDocuments() {
  for (const [key, entry] of documents) {
    if (documents.size <= 2) break;
    if (!entry.refs) { documents.delete(key); entry.disposed = true; entry.task?.destroy().catch(() => {}); }
  }
}
function acquire(blob, docId, onPassword) {
  if (!blobKeys.has(blob)) blobKeys.set(blob, ++nextBlobKey);
  // Blob identity is immutable and account-safe. A document ID + byte length
  // alone is not sufficient: another account can reuse the same identifiers.
  const key = `${docId || 'blob'}:${blobKeys.get(blob)}:${blob.size}`;
  let entry = documents.get(key);
  if (entry) { documents.delete(key); documents.set(key, entry); entry.refs++; return entry; }
  entry = { key, refs: 1, disposed: false, task: null, pdf: null };
  documents.set(key, entry);
  entry.promise = (async () => {
    const [pdfjs, buffer] = await Promise.all([engine(), blob.arrayBuffer()]);
    if (entry.disposed) return null;
    entry.task = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true,
      cMapUrl: new URL('../vendor/cmaps/', import.meta.url).href, cMapPacked: true,
      standardFontDataUrl: new URL('../vendor/standard_fonts/', import.meta.url).href,
      wasmUrl: new URL('../vendor/wasm/', import.meta.url).href });
    entry.task.onPassword = onPassword;
    entry.pdf = await entry.task.promise;
    return entry.pdf;
  })();
  entry.promise.catch(() => { documents.delete(key); });
  pruneDocuments(); return entry;
}
function release(entry) {
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  if (!entry.refs && !entry.pdf) { documents.delete(entry.key); entry.disposed = true; entry.task?.destroy().catch(() => {}); }
  pruneDocuments();
}
function element(tag, className, text) {
  const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node;
}
function button(text, title, action) {
  const node = element('button', 'pdf-control', text); node.type = 'button'; node.title = title; node.setAttribute('aria-label', title); node.dataset.pdfAction = action; return node;
}
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Returns promptly. Await controller.ready only if first-page completion matters.
 * onPageChange(page,{numPages,label}) must NOT rerender the mounted container.
 * onSelection(text,{page,docId,title,rect}) receives selected original PDF text. */
export async function mountPdfReader(container, options = {}) {
  if (!(container instanceof HTMLElement)) throw new Error('No se encontró el espacio del visor PDF.');
  const { blob, title = 'Documento de estudio', docId, pageLabels, onPageChange, onSelection, onError } = options;
  if (!(blob instanceof Blob)) throw new Error('No se recibió el PDF original.');
  if (blob.type && !['application/pdf', 'application/octet-stream'].includes(blob.type.split(';')[0])) throw new Error('El visor solo abre documentos PDF.');
  stylesheet(); container.classList.add('pdf-reader-host');
  const root = element('section', 'pdf-reader'); root.setAttribute('aria-label', `PDF: ${title}`);
  const toolbar = element('div', 'pdf-toolbar'); toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Controles del PDF');
  const previous = button('←', 'Página anterior', 'previous'), next = button('→', 'Página siguiente', 'next');
  const pageField = element('label', 'pdf-page-field', 'Página'); const pageInput = element('input', 'pdf-page-input');
  pageInput.type = 'number'; pageInput.min = '1'; pageInput.step = '1'; pageInput.inputMode = 'numeric'; pageInput.setAttribute('aria-label', 'Ir a la página del PDF');
  const total = element('span', 'pdf-total', '/ …'); pageField.append(pageInput, total);
  const zoomText = element('output', 'pdf-zoom', '100%'); zoomText.setAttribute('aria-label', 'Zoom del PDF');
  const fit = element('select', 'pdf-fit'); fit.setAttribute('aria-label', 'Ajuste del PDF');
  for (const [value, label] of [['width', 'Ajustar ancho'], ['page', 'Página completa'], ['custom', 'Zoom manual']]) { const o = element('option', '', label); o.value = value; fit.append(o); }
  const download = button('↓', 'Descargar PDF original', 'download');
  const fullscreen = button('', 'Pantalla completa', 'fullscreen');
  const fullIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); fullIcon.setAttribute('viewBox', '0 0 24 24'); fullIcon.setAttribute('width', '16'); fullIcon.setAttribute('height', '16'); fullIcon.setAttribute('aria-hidden', 'true');
  const fullPath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); fullPath.setAttribute('d', 'M9 3H3v6M15 3h6v6M21 15v6h-6M9 21H3v-6'); fullPath.setAttribute('fill', 'none'); fullPath.setAttribute('stroke', 'currentColor'); fullPath.setAttribute('stroke-width', '1.6'); fullIcon.append(fullPath); fullscreen.append(fullIcon);
  if (!root.requestFullscreen) fullscreen.hidden = true;
  toolbar.append(previous, pageField, next, element('span', 'pdf-toolbar-spacer'), button('−', 'Alejar', 'minus'), zoomText, button('+', 'Acercar', 'plus'), fit, button('↻', 'Girar 90 grados', 'rotate'), download, fullscreen);
  const stage = element('div', 'pdf-stage'); stage.tabIndex = 0; stage.setAttribute('aria-label', 'Página original del PDF. Usa las flechas para cambiar de página.');
  const wrap = element('div', 'pdf-page-wrap'); stage.append(wrap);
  const status = element('div', 'pdf-status', 'Abriendo el PDF original…'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  root.append(toolbar, stage, status); container.replaceChildren(root);
  let disposed = false, pdf = null, entry = null, renderTask = null, textTask = null, canvas = null, activePage = null;
  let currentPage = Math.max(1, Math.trunc(Number(options.page) || 1)), rotation = 0, scale = 1, fitMode = 'width', labels = pageLabels || null;
  let generation = 0, resizeTimer = null, selectionTimer = null, lastWidth = 0, lastHeight = 0, lastSelection = '', downloadUrl = null, pendingPageNotification = false;
  const listeners = new AbortController();
  function message(text, busy = false, error = false) { if (disposed) return; status.textContent = text; status.setAttribute('aria-busy', String(busy)); status.dataset.error = String(error); stage.setAttribute('aria-busy', String(busy)); }
  function report(error) {
    if (disposed || ['RenderingCancelledException', 'AbortException'].includes(error?.name)) return;
    message(error?.name === 'InvalidPDFException' ? 'El archivo no es un PDF válido o está dañado.' : `No se pudo mostrar el PDF: ${error?.message || 'vuelve a intentarlo.'}`, false, true);
    try { onError?.(error); } catch (e) { console.error(e); }
  }
  function updateControls(commitPage = false) {
    // A render/ResizeObserver callback must not erase a page number being typed.
    if (commitPage || document.activeElement !== pageInput) pageInput.value = currentPage;
    pageInput.max = pdf?.numPages || 1; total.textContent = `/ ${pdf?.numPages || '…'}`;
    previous.disabled = !pdf || currentPage <= 1; next.disabled = !pdf || currentPage >= pdf.numPages;
    zoomText.textContent = `${Math.round(scale * 100)}%`; fit.value = fitMode;
  }
  function selectedText() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return '';
    const textLayer = wrap.querySelector('.pdf-text-layer');
    if (!textLayer?.contains(selection.anchorNode) || !textLayer.contains(selection.focusNode)) return '';
    return selection.toString().trim();
  }
  function emitSelection() {
    if (disposed) return;
    const text = selectedText(); if (text === lastSelection) return; lastSelection = text;
    const selection = window.getSelection(); const rectangle = text && selection.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    try { onSelection?.(text, { page: currentPage, docId, title, rect: rectangle ? { x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height } : null }); } catch (e) { console.error(e); }
  }
  async function destination(target) {
    if (!pdf || disposed) return;
    const dest = typeof target === 'string' ? await pdf.getDestination(target) : target;
    if (!Array.isArray(dest) || !dest.length) return;
    const number = typeof dest[0] === 'number' ? dest[0] + 1 : await pdf.getPageIndex(dest[0]) + 1;
    await goToPage(number);
  }
  async function linksFor(page, viewport, layer, ticket) {
    const annotations = await page.getAnnotations({ intent: 'display' });
    if (disposed || ticket !== generation) return;
    for (const item of annotations) {
      if (item.subtype !== 'Link' || !Array.isArray(item.rect)) continue;
      let target = null, handler = null;
      if (item.dest) handler = () => destination(item.dest);
      else if (['NextPage', 'PrevPage', 'FirstPage', 'LastPage'].includes(item.action)) handler = () => goToPage(({ NextPage: currentPage + 1, PrevPage: currentPage - 1, FirstPage: 1, LastPage: pdf.numPages })[item.action]);
      else if (item.url) { try { const url = new URL(item.url); if (['https:', 'http:', 'mailto:'].includes(url.protocol)) target = url.href; } catch { /* unsafe URL */ } }
      if (!target && !handler) continue;
      const link = element(target ? 'a' : 'button', 'pdf-link');
      if (target) { link.href = target; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `Abrir enlace: ${target}`); }
      else { link.type = 'button'; link.setAttribute('aria-label', 'Ir a la página enlazada'); link.addEventListener('click', () => handler().catch(report), { signal: listeners.signal }); }
      const rect = viewport.convertToViewportRectangle(item.rect); const left = Math.min(rect[0], rect[2]), top = Math.min(rect[1], rect[3]);
      Object.assign(link.style, { left: `${left}px`, top: `${top}px`, width: `${Math.abs(rect[2] - rect[0])}px`, height: `${Math.abs(rect[3] - rect[1])}px` });
      layer.append(link);
    }
  }
  async function render(notify = false) {
    if (!pdf || disposed) return;
    pendingPageNotification ||= notify;
    const ticket = ++generation;
    const oldPage = activePage, oldRender = renderTask;
    renderTask?.cancel(); textTask?.cancel(); renderTask = textTask = null;
    message(`Preparando página ${currentPage} de ${pdf.numPages}…`, true); updateControls();
    try {
      const page = await pdf.getPage(currentPage); if (disposed || ticket !== generation) return;
      activePage = page;
      if (oldPage && oldPage !== page) Promise.resolve(oldRender?.promise).catch(() => {}).then(() => { if (activePage !== oldPage && entry?.refs <= 1) oldPage.cleanup(); }).catch(() => {});
      const angle = (page.rotate + rotation) % 360;
      const base = page.getViewport({ scale: 1, rotation: angle });
      const padding = window.innerWidth <= 600 ? 24 : 44;
      const availableWidth = Math.max(180, stage.clientWidth - padding), availableHeight = Math.max(240, stage.clientHeight - padding);
      if (fitMode === 'width') scale = clamp(availableWidth / base.width, .2, 4);
      else if (fitMode === 'page') scale = clamp(Math.min(availableWidth / base.width, availableHeight / base.height), .2, 4);
      const viewport = page.getViewport({ scale, rotation: angle });
      const paper = element('div', 'pdf-paper'); paper.style.width = `${viewport.width}px`; paper.style.height = `${viewport.height}px`;
      paper.style.setProperty('--total-scale-factor', String(viewport.scale)); paper.style.setProperty('--scale-factor', String(viewport.scale));
      const newCanvas = element('canvas', 'pdf-canvas'); newCanvas.setAttribute('aria-label', `Página ${currentPage} de ${title}`);
      // Cap the backing bitmap to 16 megapixels; retain CSS zoom and selectable text.
      const ratio = Math.min(window.devicePixelRatio || 1, 3, 8192 / viewport.width, 8192 / viewport.height, Math.sqrt(16000000 / (viewport.width * viewport.height)));
      newCanvas.width = Math.ceil(viewport.width * ratio); newCanvas.height = Math.ceil(viewport.height * ratio);
      const textLayer = element('div', 'pdf-text-layer textLayer'), links = element('div', 'pdf-links');
      paper.append(newCanvas, textLayer, links); wrap.replaceChildren(paper);
      if (canvas) { canvas.width = 0; canvas.height = 0; } canvas = newCanvas;
      const pdfjs = await engine(); if (disposed || ticket !== generation) return;
      renderTask = page.render({ canvas: newCanvas, canvasContext: newCanvas.getContext('2d', { alpha: false }), viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0], annotationMode: pdfjs.AnnotationMode.ENABLE });
      const visual = renderTask.promise;
      textTask = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport });
      const text = textTask.render();
      const outcomes = await Promise.allSettled([visual, text, linksFor(page, viewport, links, ticket)]);
      if (disposed || ticket !== generation) return;
      if (outcomes[0].status === 'rejected') throw outcomes[0].reason;
      updateControls();
      const label = labels?.[currentPage - 1];
      const readable = textLayer.textContent.trim().length > 0;
      message(`Página ${currentPage} de ${pdf.numPages}${label && label !== String(currentPage) ? ` · ${label}` : ''}${readable ? ' · Selecciona texto para estudiar.' : ' · Página sin texto seleccionable; usa el OCR en Herramientas.'}`);
      if (pendingPageNotification) { pendingPageNotification = false; try { await onPageChange?.(currentPage, { numPages: pdf.numPages, label: label || String(currentPage) }); } catch (e) { report(e); } }
      return true;
    } catch (error) { if (ticket === generation) report(error); return false; }
  }
  async function goToPage(value, { notify = true } = {}) {
    const number = Number(value); if (!Number.isFinite(number)) return;
    currentPage = Math.max(1, Math.trunc(number));
    pendingPageNotification ||= notify;
    if (pdf) currentPage = clamp(currentPage, 1, pdf.numPages);
    updateControls(true);
    if (!pdf) return;
    lastSelection = ''; stage.scrollTo({ top: 0, left: 0 }); await render(notify);
  }
  function passwordForm(updatePassword, reason) {
    if (disposed) return;
    const empty = element('div', 'pdf-empty'); empty.append(element('strong', '', 'Este PDF está protegido.'), element('p', '', reason === 2 ? 'La contraseña no es correcta. Vuelve a intentarlo.' : 'Introduce la contraseña del documento para leerlo.'));
    const form = element('form', 'pdf-password'), input = element('input', 'pdf-page-input'); input.type = 'password'; input.autocomplete = 'off'; input.style.width = '180px'; input.required = true; input.setAttribute('aria-label', 'Contraseña del PDF');
    const submit = button('Abrir PDF', 'Abrir PDF con contraseña', 'password'); submit.type = 'submit'; form.append(input, submit); empty.append(form); wrap.replaceChildren(empty);
    form.addEventListener('submit', event => { event.preventDefault(); updatePassword(input.value); input.value = ''; message('Abriendo PDF…', true); }, { signal: listeners.signal }); input.focus(); message('Se requiere la contraseña del PDF.');
  }
  toolbar.addEventListener('click', async event => {
    const action = event.target.closest('[data-pdf-action]')?.dataset.pdfAction; if (!action || disposed) return;
    try {
      if (action === 'previous') await goToPage(currentPage - 1);
      if (action === 'next') await goToPage(currentPage + 1);
      if (action === 'plus' || action === 'minus') { scale = clamp(scale * (action === 'plus' ? 1.2 : 1 / 1.2), .25, 4); fitMode = 'custom'; await render(); }
      if (action === 'rotate') { rotation = (rotation + 90) % 360; await render(); }
      if (action === 'fullscreen') { if (document.fullscreenElement === root) await document.exitFullscreen(); else await root.requestFullscreen(); }
      if (action === 'download') { downloadUrl ||= URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })); const a = element('a'); a.href = downloadUrl; a.download = `${String(title).replace(/[\\/<>:"|?*\x00-\x1f]/g, '_').replace(/\.pdf$/i, '')}.pdf`; document.body.append(a); a.click(); a.remove(); }
    } catch (error) { report(error); }
  }, { signal: listeners.signal });
  pageInput.addEventListener('change', () => goToPage(pageInput.value), { signal: listeners.signal });
  pageInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); goToPage(pageInput.value); pageInput.blur(); } }, { signal: listeners.signal });
  fit.addEventListener('change', () => { fitMode = fit.value; render(); }, { signal: listeners.signal });
  stage.addEventListener('keydown', event => { if (event.target !== stage || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); goToPage(currentPage + (event.key === 'ArrowRight' ? 1 : -1)); } }, { signal: listeners.signal });
  document.addEventListener('selectionchange', () => { clearTimeout(selectionTimer); selectionTimer = setTimeout(emitSelection, 120); }, { signal: listeners.signal });
  lastWidth = Math.round(stage.clientWidth);
  lastHeight = Math.round(stage.clientHeight);
  const observer = new ResizeObserver(() => { const width = Math.round(stage.clientWidth), height = Math.round(stage.clientHeight); if (!width || (width === lastWidth && (fitMode !== 'page' || height === lastHeight))) return; lastWidth = width; lastHeight = height; clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (pdf && fitMode !== 'custom') render(); }, 160); }); observer.observe(stage);
  updateControls();
  entry = acquire(blob, docId, passwordForm);
  const ready = (async () => {
    try { pdf = await entry.promise; if (disposed || !pdf) return false; if (!labels) labels = await pdf.getPageLabels().catch(() => null); currentPage = clamp(currentPage, 1, pdf.numPages); await render(); return !disposed; }
    catch (error) { report(error); return false; }
  })();
  return { ready, goToPage, getSelection: selectedText,
    getState: () => ({ page: currentPage, numPages: pdf?.numPages || 0, scale, rotation, fit: fitMode }),
    destroy() {
      if (disposed) return; disposed = true; generation++; listeners.abort(); observer.disconnect(); clearTimeout(resizeTimer); clearTimeout(selectionTimer);
      renderTask?.cancel(); textTask?.cancel(); if (canvas) { canvas.width = 0; canvas.height = 0; }
      const lastPage = activePage; activePage = null; Promise.resolve(renderTask?.promise).catch(() => {}).then(() => { if (!entry?.refs) lastPage?.cleanup(); }).catch(() => {});
      if (downloadUrl) URL.revokeObjectURL(downloadUrl); release(entry); root.remove();
    },
  };
}
