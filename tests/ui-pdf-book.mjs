/** Rich PDF book workflow. Starts a same-process static server and isolated browser.
 * Optional: CFA_TEST_PATH=/dist/; CFA_BROWSER=/path/to/chromium.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const runtime = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const { chromium } = runtime ? require(path.join(runtime, 'playwright')) : require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.CFA_TEST_URL || `http://127.0.0.1:8091${process.env.CFA_TEST_PATH || '/'}`;
const output = process.env.CFA_TEST_OUTPUT || '/tmp/cfa-pdf-book';
const fixture = path.join(root, 'tests/fixtures/study-book-rich.pdf');
const expected = JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/study-book-rich.expected.json'), 'utf8'));
const expectedHash = createHash('sha256').update(await fs.readFile(fixture)).digest('hex');
await fs.mkdir(output, { recursive: true });
const server = process.env.CFA_TEST_URL ? null : spawn('python3', ['-m', 'http.server', '8091', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
for (let n = 0; n < 60; n++) {
  try { if ((await fetch(base)).ok) break; } catch {}
  if (n === 59) { server?.kill(); throw new Error('Static test server did not start.'); }
  await new Promise(resolve => setTimeout(resolve, 100));
}
const browser = await chromium.launch({ headless: true, executablePath: process.env.CFA_BROWSER || '/tmp/cfa-chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1480, height: 1060 }, acceptDownloads: true, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [], failedRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => { if (!request.failure()?.errorText?.includes('ERR_ABORTED')) failedRequests.push({ url: request.url(), error: request.failure()?.errorText }); });
page.on('dialog', dialog => dialog.accept());
const stage = text => console.log(`PASS ${text}`);
const click = action => page.locator(`[data-action="${action}"]`).filter({ visible: true }).first().click();
const read = (kind, id) => page.evaluate(async ({ kind, id }) => {
  const store = await import('./app/store.js');
  return id ? store.get(kind, id) : store.list(kind);
}, { kind, id });
async function poll(predicate, message, limit = 60000) {
  const start = Date.now();
  while (!await predicate()) {
    if (Date.now() - start > limit) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
async function pdfReady(number) {
  await page.waitForFunction(number => {
    const status = document.querySelector('.pdf-status');
    const input = document.querySelector('.pdf-page-input');
    const canvas = document.querySelector('.pdf-canvas');
    return Number(input?.value) === number && status?.getAttribute('aria-busy') !== 'true' && status?.dataset.error !== 'true' && status?.textContent.startsWith(`Página ${number} de `) && canvas?.width > 0;
  }, number, { timeout: 60000 });
}
async function goPage(number, lessons, useViewer = false) {
  if (useViewer) {
    await page.locator('.pdf-page-input').fill(String(number));
    await page.locator('.pdf-page-input').press('Enter');
  } else await page.locator('#lesson-select').selectOption(lessons.find(l => l.sourcePage === number).id);
  await pdfReady(number);
  await poll(async () => (await read('settings', 'last-lesson'))?.lessonId === lessons.find(l => l.sourcePage === number).id, `Page ${number} reading position not persisted.`);
}
async function fileHash(fileId) {
  return page.evaluate(async id => {
    const blob = await (await import('./app/store.js')).loadFile(id);
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(x => x.toString(16).padStart(2, '0')).join('');
  }, fileId);
}
async function colorAt(x, y) {
  return page.locator('.pdf-canvas').evaluate((canvas, point) => [...canvas.getContext('2d').getImageData(Math.round(canvas.width * point.x / 612), Math.round(canvas.height * point.y / 792), 1, 1).data].slice(0, 3), { x, y });
}
async function capture(name) {
  await page.waitForFunction(() => !document.querySelector('#toast')?.classList.contains('show'));
  await page.screenshot({ path:path.join(output,name), fullPage:true });
}
const nearColor = (actual, expected, label) => assert.ok(actual.every((channel, i) => Math.abs(channel - expected[i]) < 10), `${label}: ${actual} versus ${expected}`);
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await click('local');
  await page.locator('.study-shell').waitFor();
  const before = await read('courses');
  await click('import-book');
  await page.locator('#book-import-form input[name="file"]').setInputFiles(fixture);
  await page.locator('#book-import-form button[type="submit"]').click();
  await poll(async () => (await read('courses')).some(c => c.kind === 'pdf-book'), 'PDF import never created a course.');
  await page.waitForFunction(() => !document.querySelector('#modal').open, null, { timeout: 60000 });
  const course = (await read('courses')).find(c => c.kind === 'pdf-book');
  const documents = (await read('documents')).filter(d => d.courseId === course.id);
  const document = documents[0];
  const modules = (await read('modules')).filter(m => m.courseId === course.id).sort((a,b) => a.startPage - b.startPage);
  const lessons = (await read('lessons')).filter(l => l.courseId === course.id).sort((a,b) => a.sourcePage - b.sourcePage);
  assert.equal((await read('courses')).length, before.length + 1);
  assert.equal(course.title, expected.title);
  assert.equal(documents.length, 1); assert.equal(document.pages, expected.pageCount);
  assert.equal(lessons.length, expected.pageCount);
  assert.deepEqual(lessons.map(l => l.sourcePage), Array.from({length:12}, (_,i) => i + 1));
  assert.ok(lessons.every(l => l.kind === 'pdf-page' && l.documentId === document.id));
  assert.equal(lessons.find(l => l.sourcePage === 6).content.trim(), '');
  assert.match(lessons.find(l => l.sourcePage === 12).content, /END-OF-BOOK-COVERAGE-MARKER/);
  assert.deepEqual(modules.map(m => [m.startPage,m.endPage]), [[1,2],[3,6],[7,9],[10,11],[12,12]]);
  assert.equal(await fileHash(document.fileId || document.id), expectedHash);
  const audit = await page.evaluate(async id => {
    const store = await import('./app/store.js');
    return (await import('./app/book-course.js')).auditBook(await store.get('documents', id), await store.list('lessons'), await store.list('modules'));
  }, document.id);
  assert.equal(audit.complete, true); assert.equal(audit.represented, 12);
  assert.equal(await page.locator('.tree-lesson').count(), 12);
  await pdfReady(1);
  assert.match(await page.locator('.book-coverage').innerText(), /12 \/ 12/);
  stage('PDF creates one course automatically, partitions modules, preserves all physical pages and exact source bytes');

  await click('book-report');
  await page.locator('#modal[open]').waitFor();
  assert.match(await page.locator('#modal').innerText(), /12/);
  await click('close');
  await goPage(4, lessons);
  assert.match(await page.locator('.pdf-text-layer').innerText(), /PV = CF/);
  assert.match(await page.locator('.pdf-text-layer').innerText(), /0\.909091/);
  const selected = await page.locator('.pdf-text-layer').evaluate(layer => {
    const span = [...layer.querySelectorAll('span')].find(span => span.textContent.includes('Cash flow formula'));
    const range = document.createRange(); range.selectNodeContents(span);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return selection.toString();
  });
  assert.match(selected, /Cash flow formula/);
  await page.waitForTimeout(180);
  await click('new-note');
  assert.match(await page.locator('#editor-form [name="text"]').inputValue(), /Cash flow formula/);
  await page.locator('#editor-form [name="text"]').fill('PDF note: 110 / 1.10 = 100. Formula and source remain linked.');
  await page.locator('#editor-form button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  await click('bookmark');
  await poll(async () => (await read('progress', lessons[3].id))?.bookmarked, 'Bookmark was not stored.');
  await click('complete');
  await poll(async () => (await read('progress', lessons[3].id))?.completed, 'Completion was not stored.');
  assert.match(await page.locator('.reader-notes-panel').innerText(), /PDF note/);
  await pdfReady(4);
  await capture('formula-desktop.png');
  stage('Original PDF text is selectable; formula/table readable; selected-text note, bookmark and progress tied to physical page');

  // Create linked study material, then split the first academic module and
  // reassign pages through the editable index without replacing page IDs.
  await click('new-card');
  await page.locator('#editor-form [name="front"]').fill('Which physical page contains the discount formula?');
  await page.locator('#editor-form [name="back"]').fill('Page 4, where 110 / 1.10 = 100.');
  await page.locator('#editor-form button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  await page.locator('.sidebar a[href="#admin"]').click();
  await page.locator('.admin-toolbar').waitFor();
  await click('new-question');
  await page.locator('#editor-form [name="prompt"]').fill('On which source page is the discount formula?');
  await page.locator('#editor-form [name="options"]').fill('3\n4\n9');
  await page.locator('#editor-form [name="correctIndex"]').fill('2');
  await page.locator('#editor-form [name="sourcePage"]').fill('4');
  await page.locator('#editor-form [name="explanation"]').fill('The formula and cash-flow table are on physical page 4.');
  await page.locator('#editor-form button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  const linked = {};
  for (const kind of ['notes','cards','questions']) linked[kind] = (await read(kind)).find(x => x.lessonId === lessons[3].id);
  assert.ok(Object.values(linked).every(Boolean), 'All three study artifacts must link to page 4.');
  await page.locator('.reader-tabs a[href="#reader"]').click();
  await pdfReady(4);
  await click('book-report'); await click('book-structure');
  await page.locator('#book-structure-form').waitFor();
  const rows = page.locator('#book-ranges [data-range-row]');
  await rows.nth(1).locator('[name="rangeEnd"]').fill('2');
  await page.locator('#book-structure-form button[type="submit"]').click();
  await page.waitForFunction(() => !!document.querySelector('#book-structure-form .form-error')?.textContent);
  assert.equal((await read('modules', modules[1].id)).endPage, 6, 'Invalid ranges must write nothing.');
  const revised = [
    {title:'Front matter', start:1, end:2},
    {title:'Module 1: Core idea', start:3, end:3},
    {title:'Module 1: Worked examples', start:4, end:6},
    {title:'Module 2: Risk and allocation', start:7, end:9},
    {title:'Module 3: Decision process', start:10, end:11}
  ];
  for (let i=0;i<revised.length;i++) {
    await rows.nth(i).locator('[name="rangeTitle"]').fill(revised[i].title);
    await rows.nth(i).locator('[name="rangeStart"]').fill(String(revised[i].start));
    await rows.nth(i).locator('[name="rangeEnd"]').fill(String(revised[i].end));
  }
  await click('add-range');
  await rows.nth(5).locator('[name="rangeTitle"]').fill('Appendix: Definitions');
  await rows.nth(5).locator('[name="rangeStart"]').fill('12');
  await rows.nth(5).locator('[name="rangeEnd"]').fill('12');
  await page.locator('#book-structure-form button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  const revisedLessons = (await read('lessons')).filter(x=>x.documentId===document.id).sort((a,b)=>a.sourcePage-b.sourcePage);
  assert.deepEqual(revisedLessons.map(x=>x.id), lessons.map(x=>x.id), 'Reorganizing must preserve physical-page identities.');
  assert.equal(revisedLessons[3].moduleId, modules[2].id);
  assert.equal((await read('modules')).filter(x=>x.documentId===document.id).length,6);
  for (const [kind, record] of Object.entries(linked)) {
    const current=await read(kind,record.id);
    assert.equal(current.lessonId,lessons[3].id);
    assert.equal(current.moduleId,modules[2].id,`${kind} module mapping after page reassignment`);
  }
  assert.equal((await read('progress',lessons[3].id)).completed,true);
  assert.equal((await read('progress',lessons[3].id)).bookmarked,true);
  assert.match(await page.locator('.book-coverage').innerText(),/12 \/ 12/);
  stage('Index rejects incomplete ranges; split/move keeps all page IDs, notes, cards, questions, marks and progress coherent');

  // Merge the split module back: the deleted row has linked material whose
  // references must move with its pages in the same transaction.
  await click('book-report'); await click('book-structure');
  await page.locator('#book-structure-form').waitFor();
  await rows.nth(1).locator('[name="rangeTitle"]').fill('Module 1: Principles and worked examples');
  await rows.nth(1).locator('[name="rangeEnd"]').fill('6');
  await rows.nth(2).locator('[data-action="remove-range"]').click();
  await page.locator('#book-structure-form button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  assert.ok(!await read('modules', modules[2].id), 'Merged module must be deleted.');
  assert.equal((await read('modules')).filter(x=>x.documentId===document.id).length, 5);
  const mergedLessons = (await read('lessons')).filter(x=>x.documentId===document.id).sort((a,b)=>a.sourcePage-b.sourcePage);
  assert.deepEqual(mergedLessons.map(x=>x.id), lessons.map(x=>x.id));
  assert.ok(mergedLessons.slice(2,6).every(x=>x.moduleId===modules[1].id));
  for (const [kind, record] of Object.entries(linked)) {
    const current = await read(kind,record.id);
    assert.equal(current.lessonId, lessons[3].id);
    assert.equal(current.moduleId, modules[1].id, `${kind} mapping after module merge/deletion`);
  }
  assert.equal((await read('progress',lessons[3].id)).completed,true);
  assert.equal((await read('progress',lessons[3].id)).bookmarked,true);
  assert.match(await page.locator('.book-coverage').innerText(),/12 \/ 12/);
  stage('Merging deletes the retired module and preserves every page, note, card, question and progress association');

  await goPage(5, lessons, true);
  assert.match(await page.locator('.pdf-text-layer').innerText(), /Discount rate/);
  const greenPixels = await page.locator('.pdf-canvas').evaluate(canvas => {
    const values = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i=0;i<values.length;i+=16) if(values[i+1]>values[i]+15 && values[i+1]>values[i+2]+8 && values[i+1]<180) count++;
    return count;
  });
  assert.ok(greenPixels > 100, `Vector chart green samples missing: ${greenPixels}`);
  await capture('vector-desktop.png');
  await goPage(6, lessons, true);
  assert.equal((await page.locator('.pdf-text-layer').innerText()).trim(), '');
  nearColor(await colorAt(306,396), [255,255,255], 'Blank physical page');
  assert.match(await page.locator('.pdf-status').innerText(), /sin texto seleccionable/);
  await goPage(9, lessons, true);
  nearColor(await colorAt(200,400), [70,121,101], 'Embedded raster green');
  nearColor(await colorAt(410,400), [197,161,92], 'Embedded raster gold');
  nearColor(await colorAt(520,400), [165,177,173], 'Embedded raster gray');
  await capture('raster-desktop.png');
  await goPage(12, lessons, true);
  assert.match(await page.locator('.pdf-text-layer').innerText(), /END-OF-BOOK-COVERAGE-MARKER/);
  stage('Vector chart, raster colors, entirely blank page and final appendix render without omission');

  await goPage(11,lessons);
  await page.locator('[data-action="reader-mode"][data-mode="text"]').click();
  await page.locator('.pdf-extracted-text').waitFor();
  assert.match(await page.locator('.pdf-extracted-text').innerText(), /<p>Keep this as PDF text<\/p>/);
  assert.equal(await page.locator('.pdf-extracted-text p').count(),0,'Source angle brackets must not become HTML elements.');
  await page.locator('[data-action="reader-mode"][data-mode="original"]').click();
  await pdfReady(11);
  stage('Extracted PDF text preserves literal angle brackets as source text, not HTML');

  await goPage(9, lessons);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('[data-pdf-action="download"]').click();
  const downloadPath = path.join(output, 'downloaded-original.pdf');
  await (await downloadEvent).saveAs(downloadPath);
  assert.equal(createHash('sha256').update(await fs.readFile(downloadPath)).digest('hex'), expectedHash);
  await page.reload({ waitUntil: 'networkidle' });
  await click('local');
  await page.locator('.study-shell').waitFor();
  await pdfReady(9);
  assert.equal((await read('progress', lessons[3].id)).completed, true);
  assert.equal((await read('progress', lessons[3].id)).bookmarked, true);
  assert.ok((await read('notes')).some(n => n.lessonId === lessons[3].id && n.text.startsWith('PDF note')));
  assert.equal(await fileHash(document.fileId || document.id), expectedHash);
  stage('Viewer page navigation, downloaded original, reload position, progress and notes survive');

  await page.setViewportSize({ width: 390, height: 844 });
  await pdfReady(9);
  await page.waitForTimeout(350);
  const mobile = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, canvas: document.querySelector('.pdf-canvas')?.getBoundingClientRect().width, stage: document.querySelector('.pdf-stage')?.getBoundingClientRect().width }));
  assert.ok(mobile.document <= mobile.viewport + 1, `Reader mobile horizontal overflow: ${JSON.stringify(mobile)}`);
  assert.ok(mobile.canvas > 180 && mobile.canvas <= mobile.stage, `PDF fit-width failed: ${JSON.stringify(mobile)}`);
  await capture('reader-mobile.png');
  await page.locator('[data-pdf-action="next"]').click();
  await pdfReady(10);
  await poll(async () => (await read('settings','last-lesson'))?.lessonId === lessons[9].id, 'Mobile page navigation not synchronized.');
  await page.locator('[data-pdf-action="previous"]').click();
  await pdfReady(9);
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  stage('Mobile PDF fits screen, toolbar navigates, no page errors or failed required requests');
  console.log(JSON.stringify({ result:'passed', fixture:expected.file, pages:12, screenshots:output, cloudTested:false }, null, 2));
} catch (error) {
  await page.screenshot({ path:path.join(output,'failure.png'), fullPage:true }).catch(()=>{});
  console.error('FAIL', error.stack || error);
  console.error('Page errors', errors, 'Failed requests', failedRequests);
  console.error('UI', (await page.locator('body').innerText().catch(()=>'' )).slice(-9000));
  console.error('Overflow', await page.evaluate(()=>[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,15).map(el=>({tag:el.tagName,class:el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width}))).catch(()=>[]));
  process.exitCode=1;
} finally { await browser.close(); server?.kill(); }
