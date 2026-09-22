/** End-to-end local workflow. Starts its own static server on :8090.
 * Uses the configured Playwright runtime and an isolated browser context.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const runtime = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const { chromium } = runtime ? require(path.join(runtime, 'playwright')) : require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.CFA_TEST_URL || `http://127.0.0.1:8090${process.env.CFA_TEST_PATH || '/'}`;
const output = process.env.CFA_TEST_OUTPUT || '/tmp/cfa-ui-smoke';
await fs.mkdir(output, { recursive: true });
// Keep browser and local server in this same tool process/network namespace.
const server = process.env.CFA_TEST_URL ? null : spawn('python3', ['-m', 'http.server', '8090', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
for (let attempt = 0; attempt < 60; attempt++) {
  try { if ((await fetch(base)).ok) break; } catch { /* Server is still starting. */ }
  if (attempt === 59) { server?.kill(); throw new Error('The local UI server did not start.'); }
  await new Promise(resolve => setTimeout(resolve, 100));
}
const browser = await chromium.launch({ headless: true, executablePath: process.env.CFA_BROWSER || '/tmp/cfa-chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, acceptDownloads: true, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
const stage = name => console.log(`PASS ${name}`);
const click = action => page.locator(`[data-action="${action}"]`).first().click();
const read = (kind, id) => page.evaluate(async ({ kind, id }) => {
  const store = await import('./app/store.js');
  return id ? store.get(kind, id) : store.list(kind);
}, { kind, id });
async function poll(condition, message, timeout = 60000) {
  const start = Date.now();
  while (!await condition()) {
    if (Date.now() - start > timeout) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
async function nav(view) {
  if (page.viewportSize().width <= 760 && !await page.evaluate(() => document.body.classList.contains('menu-open'))) await click('menu');
  await page.locator(`.sidebar a.nav-item[href="#${view}"]`).click();
  await page.waitForFunction(v => document.querySelector('.breadcrumb strong')?.textContent === ({admin:'Gestionar',reader:'Lectura',practice:'Práctica',review:'Repasar',notes:'Mis notas',home:'Mi espacio',settings:'Ajustes',library:'Mis cursos'})[v], view);
}
async function saveForm() {
  await page.locator('#editor-form button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
}
async function create(kind, values) {
  await click(`new-${({courses:'course',modules:'module',lessons:'lesson',notes:'note',cards:'card',questions:'question'})[kind]}`);
  for (const [name, value] of Object.entries(values)) {
    const control = page.locator(`#editor-form [name="${name}"]`);
    if (await control.evaluate(el => el.tagName === 'SELECT')) await control.selectOption(value);
    else await control.fill(value);
  }
  await saveForm();
}
async function selectCourse(id) {
  await page.locator('#course-select').selectOption(id);
  await page.waitForFunction(id => document.querySelector('#course-select')?.value === id, id);
}
async function importFile(file) {
  const packet = JSON.parse(await fs.readFile(file, 'utf8'));
  const records = packet.format === 'cfa-study-workspace' ? packet : packet.records;
  const expected = Object.fromEntries(['courses','modules','lessons','questions','cards','settings'].map(kind => [kind, (records[kind] || []).map(row => row.id)]));
  const chooser = page.waitForEvent('filechooser');
  await click('import-backup');
  await (await chooser).setFiles(file);
  await poll(async () => {
    for (const [kind, ids] of Object.entries(expected)) {
      const actual = new Set((await read(kind)).map(row => row.id));
      if (!ids.every(id => actual.has(id))) return false;
    }
    return true;
  }, 'The import did not write every expected record.');
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent === 'Importación completa.', null, { timeout: 60000 });
}
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await click('local');
  await page.locator('.sidebar').waitFor();
  assert.equal((await read('courses')).length, 1);
  stage('guest opens isolated local workspace');

  await nav('admin');
  await create('courses', { title: 'Prueba integral CFA', description: 'Curso de verificación de flujo completo.' });
  const course = (await read('courses')).find(x => x.title === 'Prueba integral CFA');
  assert.ok(course);
  await create('modules', { title: 'Fundamentos de valoración', description: 'Entender flujos y tasas.' });
  const module = (await read('modules')).find(x => x.courseId === course.id);
  await create('lessons', { title: 'Valor temporal', content: '<h2>Una idea comprobable</h2><p>El valor presente descuenta los flujos futuros. Un flujo de 110 con tasa de 10% vale 100 hoy.</p><script>globalThis.smokeInjected = true</script>', sourceLabel: 'Material de prueba' });
  let lesson = (await read('lessons')).find(x => x.courseId === course.id);
  assert.ok(!lesson.content.includes('<script>'));
  await page.locator(`[data-action="edit"][data-kind="lessons"][data-id="${lesson.id}"]`).click();
  await page.locator('#editor-form [name="title"]').fill('Valor temporal revisado');
  await saveForm();
  await page.locator(`[data-action="open-lesson"][data-id="${lesson.id}"]`).click();
  await page.locator('#reading-content').waitFor();
  assert.match(await page.locator('#reading-content').innerText(), /110.*10%.*100/);
  assert.equal(await page.evaluate(() => globalThis.smokeInjected), undefined);
  await click('bookmark');
  await page.waitForFunction(() => document.querySelector('[data-action="bookmark"]')?.textContent.includes('Guardada'));
  await click('complete');
  await page.waitForFunction(() => document.querySelector('[data-action="complete"]')?.textContent.includes('Desmarcar'));
  const progress = await read('progress', lesson.id);
  assert.equal(progress.completed, true); assert.equal(progress.bookmarked, true);
  await create('notes', { text: 'Comprendo que descontar convierte flujos futuros a valor actual.' });
  await nav('notes');
  assert.match(await page.locator('.notes-grid').innerText(), /Comprendo que descontar/);
  stage('create/read/update course structure, sanitized reader, note, bookmark and completion');

  await nav('admin');
  await create('questions', { type: 'single', prompt: '¿Cuánto vale hoy un flujo de 110 descontado al 10%?', options: '110\n100\n90', correctIndex: '2', explanation: 'El valor es 110 / 1,10 = 100.' });
  await create('questions', { type: 'multiple', prompt: 'Selecciona los números pares.', options: '2\n3\n4', correctIndex: '1, 3', explanation: '2 y 4 son divisibles entre dos.' });
  const questions = (await read('questions')).filter(x => x.courseId === course.id);
  const single = questions.find(x => x.type === 'single'), multiple = questions.find(x => x.type === 'multiple');
  assert.deepEqual(multiple.correctIndices, [0, 2]);
  await nav('practice');
  await page.locator('#quiz-mode').selectOption('new');
  await page.locator('[data-action="answer"][data-index="0"]').click();
  await click('check-answer');
  await page.locator('.feedback.negative').waitFor();
  assert.match(await page.locator('.feedback').innerText(), /110 \/ 1,10 = 100/);
  await page.locator('#quiz-mode').selectOption('wrong');
  await page.locator('[data-action="answer"][data-index="1"]').click();
  await click('check-answer');
  await page.locator('.feedback.positive').waitFor();
  assert.match(await page.locator('.question-card h2').innerText(), /Cuánto vale/);
  await click('next-question');
  await page.locator('.empty').waitFor();
  await page.locator('#quiz-mode').selectOption('all');
  await page.locator(`[data-action="pick-question"][data-id="${multiple.id}"]`).click();
  await page.locator('[data-action="answer"][data-index="0"]').click();
  await page.locator('[data-action="answer"][data-index="2"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.answer-option.chosen').length === 2);
  assert.equal(await page.locator('.answer-option.chosen').count(), 2);
  await click('check-answer');
  await page.locator('.feedback.positive').waitFor();
  const attempts = (await read('attempts')).filter(x => x.courseId === course.id);
  assert.equal(attempts.length, 3); assert.deepEqual(attempts.filter(x => x.questionId === single.id).sort((a,b) => a.createdAt.localeCompare(b.createdAt)).map(x => x.correct), [false, true]);
  assert.deepEqual(attempts.find(x => x.questionId === multiple.id).selectedIndex, [0, 2]);
  stage('single/multiple practice, incorrect and correct grading, feedback retained after filter changes');

  await nav('reader');
  await create('cards', { front: '¿Qué hace el descuento?', back: 'Convierte los flujos futuros en un valor equivalente hoy.' });
  const card = (await read('cards')).find(x => x.courseId === course.id);
  await nav('review');
  await page.locator('.flashcard-front').waitFor();
  assert.match(await page.locator('.flashcard-front').innerText(), /Qué hace el descuento/);
  await click('reveal');
  await page.locator('[data-action="grade"][data-grade="good"]').click();
  await page.locator('.empty').waitFor();
  let scheduled = await read('cards', card.id);
  assert.equal(scheduled.repetitions, 1); assert.equal(scheduled.interval, 1); assert.ok(Date.parse(scheduled.dueAt) > Date.now() + 23 * 3600000);
  await page.reload({ waitUntil: 'networkidle' });
  await click('local'); await page.locator('.sidebar').waitFor();
  await nav('review'); await selectCourse(course.id);
  await page.locator('.empty').waitFor();
  assert.equal((await read('cards', card.id)).dueAt, scheduled.dueAt);
  stage('spaced review records future due date and survives reload');

  await nav('admin');
  const downloadEvent = page.waitForEvent('download');
  await click('export');
  const backupPath = path.join(output, 'backup.json');
  await (await downloadEvent).saveAs(backupPath);
  const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  assert.equal(backup.format, 'cfa-study'); assert.equal(backup.version, 3);
  await page.locator(`[data-action="delete"][data-kind="courses"][data-id="${course.id}"]`).click();
  await poll(async () => !await read('courses', course.id), 'Course cascade deletion did not finish.');
  for (const kind of ['modules', 'lessons', 'questions', 'cards', 'notes', 'attempts', 'progress']) assert.equal((await read(kind)).filter(x => x.courseId === course.id).length, 0, `${kind} cascade`);
  await importFile(backupPath);
  assert.equal((await read('cards', card.id)).dueAt, scheduled.dueAt);
  assert.equal((await read('progress', lesson.id)).completed, true);
  stage('backup download, cascade delete and restore preserve study state');

  await importFile(path.join(root, 'migration/curso-original.json'));
  const legacyLessons = (await read('lessons')).filter(x => x.courseId === 'legacy-course-1');
  const legacyQuestions = (await read('questions')).filter(x => x.courseId === 'legacy-course-1');
  assert.equal(legacyLessons.length, 157); assert.equal(legacyQuestions.length, 44);
  assert.equal(legacyQuestions.filter(x => x.type === 'multiple').length, 5);
  assert.equal((await read('cards')).filter(x => x.courseId === 'legacy-course-1').length, 71);
  assert.equal(legacyLessons.filter(x => /data:image\/webp;base64,/.test(x.content)).length, 21);
  await nav('reader'); await selectCourse('legacy-course-1');
  await page.locator('#lesson-select').selectOption('legacy-page-007');
  await page.locator('#reading-content img').waitFor();
  assert.equal(await page.locator('#reading-content img').evaluate(img => img.complete && img.naturalWidth > 0), true);
  await nav('practice');
  await page.locator(`[data-action="pick-question"][data-id="legacy-m1-l2-q1"]`).click();
  assert.equal(await page.locator('.answer-option').count(), 3);
  await page.locator('[data-action="answer"][data-index="0"]').click();
  await page.locator('[data-action="answer"][data-index="1"]').click();
  await click('check-answer'); await page.locator('.feedback.positive').waitFor();
  stage('private corpus file chooser import preserves 157 pages, 21 images, 44 questions and 71 cards');

  await page.evaluate(() => localStorage.setItem('course1StudyReader.v5', JSON.stringify({ currentPage: 7, completePages: { 6: true }, favorites: [7], notes: { 6: [{ id: 'smoke-note', body: 'Mi nota recuperada de la versión anterior' }] } })));
  await nav('settings'); await click('migrate');
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('Avance anterior recuperado'));
  await nav('notes'); await selectCourse('legacy-course-1');
  assert.match(await page.locator('.notes-grid').innerText(), /Mi nota recuperada/);
  assert.equal((await read('progress', 'legacy-page-006')).completed, true);
  stage('legacy progress recovered through UI and imported notes visible in notebook');

  await nav('home');
  await page.waitForFunction(() => !document.querySelector('#toast')?.classList.contains('show'));
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const width = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  assert.ok(width.document <= width.viewport + 1, `Mobile overflow: ${JSON.stringify(width)}`);
  for (const view of ['reader','practice','admin','settings']) {
    await nav(view);
    const sizes = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(sizes.document <= sizes.viewport + 1, `Mobile overflow in ${view}: ${JSON.stringify(sizes)}`);
  }
  await nav('home');
  assert.deepEqual(errors, [], 'Unexpected browser errors');
  stage('desktop/mobile render; home, reader, practice, admin and settings without horizontal mobile overflow; no browser page errors');
  console.log(JSON.stringify({ result: 'passed', screenshots: [path.join(output, 'desktop.png'), path.join(output, 'mobile.png')], testedCloudAuthentication: false, testedCloudSync: false }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  console.error('FAIL', error.stack || error);
  console.error('Current URL:', page.url());
  console.error('Browser errors:', errors);
  console.error('Data summary:', await page.evaluate(async () => { const s=await import('./app/store.js'); return {courses:(await s.list('courses')).map(x=>x.id),lessons:(await s.list('lessons')).length}; }).catch(()=>null));
  console.error('Overflow elements:', await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,15).map(el=>({tag:el.tagName,class:el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width}))).catch(()=>[]));
  console.error('Visible UI:', (await page.locator('body').innerText().catch(() => '')).slice(-7000));
  process.exitCode = 1;
} finally {
  await browser.close();
  server?.kill();
}
