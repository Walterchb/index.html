// Browser persistence/sync contract tests. Requires Playwright + Chromium.
// Run: node supabase/tests/store-browser.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright/index.mjs') : 'playwright');
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/harness') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Storage contract tests</title>'); return; }
    const target = path.resolve(root, `.${new URL(req.url, 'http://localhost').pathname}`);
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const contents = await fs.readFile(target);
    res.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); res.end(contents);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/vendor/supabase.js', route => route.fulfill({ contentType: 'text/javascript', body: `
export function createClient() { return window.mockClient; }
` }));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/harness`);
  await page.evaluate(() => {
    window.CFA_CONFIG = { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'test-public-key' };
    window.mock = { rows: new Map(), operations: new Map(), files: new Map(), reads: [], user: { id: 'user-a' }, fail: false, paused: null };
    window.mockClient = {
      auth: {
        onAuthStateChange(fn) { window.mock.authChange = fn; return { data: { subscription: { unsubscribe() {} } } }; },
        async getSession() { return { data: { session: { user: mock.user } } }; },
        async signInWithPassword({ email }) { mock.user = { id: email.split('@')[0] }; mock.authChange('SIGNED_IN', { user: mock.user }); return { data: { user: mock.user } }; },
        async signOut() { mock.user = null; mock.authChange('SIGNED_OUT', null); return {}; },
      },
      async rpc(name, p) {
        if (mock.fail) return { error: { message: 'simulated outage' } };
        if (mock.paused) { mock.reached?.(); await mock.paused; }
        if (p.p_owner_id !== mock.user.id) return { error: { message: 'owner mismatch' } };
        const operation = p.p_owner_id + ':' + p.p_operation_id;
        if (mock.operations.has(operation)) return { data: structuredClone(mock.operations.get(operation)) };
        const id = p.p_owner_id + ':' + p.p_kind + ':' + p.p_id;
        const old = mock.rows.get(id);
        if ((old?.revision || 0) !== p.p_expected_revision) return { data: { status: 'conflict', record: structuredClone(old || null) } };
        const row = { owner_id: p.p_owner_id, kind: p.p_kind, id: p.p_id, payload: structuredClone(p.p_payload), deleted: p.p_deleted, revision: (old?.revision || 0) + 1 };
        mock.rows.set(id, row);
        const data = { status: 'applied', record: row }; mock.operations.set(operation, structuredClone(data)); return { data };
      },
      from() {
        let owner, kind, ids, columns;
        const filtered = () => [...mock.rows.values()].filter(row => row.owner_id === owner && (!kind || row.kind === kind) && (!ids || ids.includes(row.id))).sort((a, b) => (a.kind + a.id).localeCompare(b.kind + b.id)).map(row => structuredClone(row));
        return { select(value) { columns = value; mock.reads.push(value); return this; }, eq(field, value) { if (field === 'owner_id') owner = value; if (field === 'kind') kind = value; return this; }, order() { return this; },
          in(_, values) { ids = values; return this; }, then(resolve) { return Promise.resolve({ data: filtered() }).then(resolve); },
          async range(start, end) { return { data: filtered().slice(start, end + 1) }; } };
      },
      storage: { from() { return {
        async upload(path, blob) { if (mock.files.has(path)) return { error: { statusCode: '409', message: 'already exists' } }; mock.files.set(path, blob); return {}; },
        async download(path) { return mock.files.has(path) ? { data: mock.files.get(path) } : { error: { message: 'missing file' } }; },
      }; } },
    };
  });
  const results = await page.evaluate(async () => {
    const auth = await import('/app/auth.js'); const store = await import('/app/store.js');
    window.store = store;
    const passed = [];
    function ok(value, label) { if (!value) throw new Error(label); passed.push(label); }
    await auth.initAuth();
    mock.authChange('PASSWORD_RECOVERY', { user: mock.user });
    await new Promise(resolve => setTimeout(resolve, 5));
    const recovery = await new Promise(resolve => { const off = auth.onAuthChange((user, event) => { if (event === 'PASSWORD_RECOVERY') { off(); resolve(user); } }); });
    ok(recovery.id === 'user-a', 'Recovery event survives subscription after auth initialization');
    await store.initStore();
    await store.put('courses', { id: 'guest-course', title: 'Guest only' });
    const batchEvents = []; const stopBatchEvents = store.subscribe(event => batchEvents.push(event));
    const savedBatch = await store.putBatch([
      { kind: 'courses', data: { id: 'book-course', title: 'Complete book' } },
      { kind: 'modules', data: { id: 'book-module', courseId: 'book-course', title: 'Reading' } },
      { kind: 'lessons', data: { id: 'book-page-1', courseId: 'book-course', moduleId: 'book-module', sourcePage: 1 } },
      { kind: 'lessons', data: { id: 'book-page-2', courseId: 'book-course', moduleId: 'book-module', sourcePage: 2 } },
    ]);
    stopBatchEvents();
    ok(savedBatch.length === 4 && (await store.list('lessons')).length === 2 && batchEvents.filter(event => event.source === 'local').length === 1 && batchEvents[0].changed === 4, 'Book batch saves all pages and emits one change');
    let batchRejected = false;
    try { await store.putBatch([{ kind: 'lessons', data: { id: 'validation-unwritten' } }, { kind: 'invalid-kind', data: { id: 'invalid' } }]); } catch { batchRejected = true; }
    ok(batchRejected && !(await store.get('lessons', 'validation-unwritten')), 'Invalid record rejects the whole batch before writes');
    batchRejected = false;
    try { await store.putBatch([{ kind: 'lessons', data: { id: 'duplicate-page' } }, { kind: 'lessons', data: { id: 'duplicate-page' } }]); } catch { batchRejected = true; }
    ok(batchRejected && !(await store.get('lessons', 'duplicate-page')), 'Duplicate batch identifiers reject without partial writes');
    batchRejected = false;
    try { await store.putBatch([{ kind: 'lessons', data: { id: 'collision-unwritten' } }, { kind: 'courses', data: { id: 'book-course', title: 'Must not overwrite' } }]); } catch { batchRejected = true; }
    ok(batchRejected && !(await store.get('lessons', 'collision-unwritten')) && (await store.get('courses', 'book-course')).title === 'Complete book', 'Create-only collision preserves existing records and rolls back new ones');
    const originalPut = IDBObjectStore.prototype.put; let queuedWrites = 0;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'outbox' && ++queuedWrites === 2) throw new DOMException('Simulated quota failure', 'QuotaExceededError');
      return originalPut.apply(this, args);
    };
    batchRejected = false;
    try { await store.putBatch([{ kind: 'lessons', data: { id: 'rollback-first' } }, { kind: 'lessons', data: { id: 'rollback-second' } }]); } catch { batchRejected = true; }
    finally { IDBObjectStore.prototype.put = originalPut; }
    ok(batchRejected && !(await store.get('lessons', 'rollback-first')) && !(await store.get('lessons', 'rollback-second')), 'Mid-transaction failure rolls back every record and queue write');
    await store.putBatch([{ kind: 'modules', data: { id: 'book-module', courseId: 'book-course', title: 'Reordered chapter' } }, { kind: 'lessons', data: { id: 'book-page-2', courseId: 'book-course', moduleId: 'book-module', sourcePage: 2, order: 1 } }], { createOnly: false });
    ok((await store.get('modules', 'book-module')).title === 'Reordered chapter' && (await store.get('lessons', 'book-page-1')).sourcePage === 1, 'Batch upsert repartitions selected records without touching others');
    batchRejected = false;
    try { await store.putBatch([], { remove: [{ kind: 'modules', id: 'book-module' }] }); } catch { batchRejected = true; }
    ok(batchRejected && (await store.get('modules', 'book-module')), 'Batch deletion requires explicit createOnly false');
    batchRejected = false;
    try { await store.putBatch([{ kind: 'modules', data: { id: 'book-module', title: 'Must not change' } }], { createOnly: false, remove: [{ kind: 'modules', id: 'book-module' }] }); } catch { batchRejected = true; }
    ok(batchRejected && (await store.get('modules', 'book-module')).title === 'Reordered chapter', 'Updating and deleting the same batch target rejects before writes');
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'outbox' && args[0]?.deleted) throw new DOMException('Simulated deletion quota failure', 'QuotaExceededError');
      return originalPut.apply(this, args);
    };
    batchRejected = false;
    try { await store.putBatch([{ kind: 'modules', data: { id: 'replacement-unwritten', title: 'New chapter' } }], { createOnly: false, remove: [{ kind: 'modules', id: 'book-module' }] }); } catch { batchRejected = true; }
    finally { IDBObjectStore.prototype.put = originalPut; }
    ok(batchRejected && !(await store.get('modules', 'replacement-unwritten')) && (await store.get('modules', 'book-module')).title === 'Reordered chapter', 'Failure writing a tombstone rolls back deletions and earlier updates together');
    const repartition = await store.putBatch([
      { kind: 'modules', data: { id: 'replacement-module', courseId: 'book-course', title: 'Merged chapter' } },
      ...await Promise.all(['book-page-1', 'book-page-2'].map(async id => ({ kind: 'lessons', data: { ...await store.get('lessons', id), moduleId: 'replacement-module' } }))),
    ], { createOnly: false, remove: [{ kind: 'modules', id: 'book-module' }] });
    ok(repartition.length === 3 && !(await store.get('modules', 'book-module')) && (await store.get('lessons', 'book-page-1')).moduleId === 'replacement-module' && (await store.get('lessons', 'book-page-2')).moduleId === 'replacement-module', 'Repartition moves all pages and tombstones the removed module atomically');
    const originalGet = IDBObjectStore.prototype.get; let switching;
    IDBObjectStore.prototype.get = function (...args) {
      const result = originalGet.apply(this, args);
      if (this.name === 'records' && args[0] === 'lessons:scope-unwritten') {
        IDBObjectStore.prototype.get = originalGet;
        queueMicrotask(() => { switching = store.initStore('batch-switch'); });
      }
      return result;
    };
    batchRejected = false;
    try { await store.putBatch([{ kind: 'lessons', data: { id: 'scope-unwritten' } }]); } catch { batchRejected = true; }
    finally { IDBObjectStore.prototype.get = originalGet; }
    await switching;
    const leakedIntoNewScope = await store.get('lessons', 'scope-unwritten');
    await store.initStore();
    ok(batchRejected && !leakedIntoNewScope && !(await store.get('lessons', 'scope-unwritten')), 'Account switch aborts the batch without writing either account');
    await store.initStore('user-a');
    ok((await store.list('courses')).length === 0, 'Guest data is isolated from account');
    await store.put('notes', { id: 'note-1', body: 'First note' });
    await store.sync();
    ok(store.status().pending === 0 && mock.rows.get('user-a:notes:note-1').revision === 1, 'Cloud CAS insert drains outbox');
    await store.putBatch([{ kind: 'courses', data: { id: 'cloud-book', title: 'Book' } }, { kind: 'lessons', data: { id: 'cloud-page', courseId: 'cloud-book', sourcePage: 1 } }]);
    await store.sync();
    await store.putBatch([{ kind: 'lessons', data: { id: 'cloud-page', courseId: 'cloud-book', sourcePage: 1, title: 'Renamed page' } }], { createOnly: false });
    await store.sync();
    ok(mock.rows.get('user-a:lessons:cloud-page').revision === 2 && mock.rows.get('user-a:lessons:cloud-page').payload.title === 'Renamed page' && store.status().pending === 0, 'Batch inserts and updates use the existing cloud CAS revision contract');
    await store.putBatch([], { createOnly: false, remove: [{ kind: 'lessons', id: 'cloud-page' }] }); await store.sync();
    ok(mock.rows.get('user-a:lessons:cloud-page').deleted && mock.rows.get('user-a:lessons:cloud-page').revision === 3 && store.status().pending === 0, 'Batch tombstone uses the existing revision when synchronizing deletion');
    await store.put('modules', { id: 'conflicting-module', title: 'Original chapter' }); await store.sync();
    const remoteModule = mock.rows.get('user-a:modules:conflicting-module'); remoteModule.revision++; remoteModule.payload.title = 'Remote chapter';
    await store.put('modules', { id: 'conflicting-module', title: 'Local chapter' }); await store.sync();
    await store.putBatch([], { createOnly: false, remove: [{ kind: 'modules', id: 'conflicting-module' }] });
    const deletionConflict = (await store.listConflicts()).find(c => c.id === 'conflicting-module');
    ok(deletionConflict?.localDeleted && deletionConflict.local.id === 'conflicting-module' && !remoteModule.deleted && remoteModule.payload.title === 'Remote chapter', 'Batch deletion preserves remote conflict and records the local tombstone');
    await store.resolveConflict('modules', 'conflicting-module', 'local'); await store.sync();
    ok(mock.rows.get('user-a:modules:conflicting-module').deleted && mock.rows.get('user-a:modules:conflicting-module').revision === 3 && store.status().conflicts === 0, 'Batch deletion conflict resolves with the latest remote revision');
    const remote = mock.rows.get('user-a:notes:note-1'); remote.revision++; remote.payload.body = 'Edited on another device';
    await store.put('notes', { id: 'note-1', body: 'Local conflicting note' });
    await store.sync();
    ok(store.status().conflicts === 1 && (await store.get('notes', 'note-1')).body === 'Local conflicting note' && remote.payload.body === 'Edited on another device', 'Conflict preserves both versions');
    await store.resolveConflict('notes', 'note-1', 'remote');
    ok((await store.get('notes', 'note-1')).body === 'Edited on another device' && store.status().conflicts === 0, 'Explicit remote conflict resolution');
    remote.revision++; remote.payload.body = 'New remote version';
    await store.put('notes', { id: 'note-1', body: 'Keep this local version' });
    await store.sync(); await store.resolveConflict('notes', 'note-1', 'local'); await store.sync();
    ok(mock.rows.get('user-a:notes:note-1').payload.body === 'Keep this local version' && !store.status().pending, 'Explicit local resolution uses new revision');
    const metadata = await store.saveFile(new File(['PDF-like fixture'], 'fixture.pdf', { type: 'application/pdf' }));
    await store.put('documents', { id: 'doc-1', title: 'Test file', ...metadata });
    await store.sync();
    ok(mock.files.has('user-a/' + metadata.fileId), 'Private storage path is user scoped');
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('cfa-study-v3:user-a');
      request.onsuccess = () => {
        const db = request.result; const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').delete(metadata.fileId); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      }; request.onerror = () => reject(request.error);
    });
    ok(await (await store.loadFile(metadata.fileId)).text() === 'PDF-like fixture', 'Uncached attachment downloads from private storage');
    const backup = await store.exportBackup();
    ok(backup.files.length === 1 && atob(backup.files[0].base64) === 'PDF-like fixture' && backup.recovery.length >= 2, 'Backup includes exact attachment bytes and conflict recovery');
    await auth.signIn('user-b@example.com', 'password'); await store.initStore('user-b');
    ok((await store.list('notes')).length === 0, 'Account data isolation');
    await store.importBackup(backup); await store.sync();
    ok((await store.get('notes', 'note-1')).body === 'Keep this local version' && mock.files.has('user-b/' + metadata.fileId), 'Backup restores account-owned records and attachments');
    const corrupt = structuredClone(backup); corrupt.files[0].sha256 = 'bad-checksum';
    let corruptRejected = false; try { await store.importBackup(corrupt); } catch { corruptRejected = true; }
    ok(corruptRejected && (await store.get('notes', 'note-1')).body === 'Keep this local version', 'Corrupt backup rejects before any write');
    let unsafeRejected = false; try { await store.saveFile(new File(['<script>danger()</script>'], 'unsafe.html', { type: 'text/html' })); } catch { unsafeRejected = true; }
    ok(unsafeRejected, 'HTML uploads are rejected');
    const unsafeBackup = structuredClone(backup); unsafeBackup.records.notes[0].body = 'Must not be written';
    unsafeBackup.files.push({ fileId: 'unsafe-svg', name: 'unsafe.svg', type: 'image/svg+xml', base64: btoa('<svg onload="danger()"/>') });
    unsafeRejected = false; try { await store.importBackup(unsafeBackup); } catch { unsafeRejected = true; }
    ok(unsafeRejected && (await store.get('notes', 'note-1')).body === 'Keep this local version', 'SVG backup rejects atomically before records are changed');
    mock.files.set('user-b/unsafe-remote', new Blob(['<script>danger()</script>'], { type: 'text/html' }));
    unsafeRejected = false; try { await store.loadFile('unsafe-remote'); } catch { unsafeRejected = true; }
    ok(unsafeRejected, 'Unsafe MIME from remote Storage is rejected');
    const inferred = await store.saveFile(new File(['plain fixture'], 'text.md', { type: '' }));
    ok((await store.loadFile(inferred.fileId)).type === 'text/markdown', 'Only known safe extensions infer a content type');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const offlineFile = await store.saveFile(new File(['offline content'], 'offline.txt', { type: 'text/plain' }));
    await store.sync();
    ok(store.status().pending > 0 && !mock.files.has('user-b/' + offlineFile.fileId), 'Offline file remains in durable upload queue');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); await store.sync();
    ok(mock.files.has('user-b/' + offlineFile.fileId) && store.status().pending === 0, 'Offline file uploads after reconnect');
    await store.remove('notes', 'note-1'); await store.sync();
    ok(!(await store.get('notes', 'note-1')) && mock.rows.get('user-b:notes:note-1').deleted, 'Deletion synchronizes a tombstone');
    mock.fail = true;
    await store.put('notes', { id: 'retry-note', body: 'Do not lose me' }); await store.sync();
    ok(store.status().pending > 0 && store.status().error.includes('simulated outage'), 'Failed sync retains pending changes and displays error');
    mock.fail = false; await store.sync();
    ok(!store.status().pending && mock.rows.has('user-b:notes:retry-note'), 'Retry recovers failed upload');
    let reached; const waiting = new Promise(resolve => { reached = resolve; });
    mock.paused = new Promise(resolve => { mock.release = resolve; }); mock.reached = reached;
    await store.put('notes', { id: 'race-note', body: 'Version 1' });
    const syncing = store.sync(); await waiting;
    await store.put('notes', { id: 'race-note', body: 'Version 2' });
    mock.paused = null; mock.release(); await syncing; await store.sync();
    ok(mock.rows.get('user-b:notes:race-note').payload.body === 'Version 2' && !store.status().conflicts, 'Edits during sync retain latest payload and rebase revision');
    const bodiesBefore = mock.reads.filter(columns => columns.includes('payload')).length; await store.sync();
    ok(mock.reads.filter(columns => columns.includes('payload')).length === bodiesBefore, 'Unchanged cloud text is not downloaded again');
    mock.rows.set('user-b:notes:remote-new', { owner_id: 'user-b', kind: 'notes', id: 'remote-new', revision: 1, deleted: false, payload: { id: 'remote-new', body: 'Remote addition' } });
    const events = []; const off = store.subscribe(event => events.push(event)); await store.sync(); off();
    ok((await store.get('notes', 'remote-new')).body === 'Remote addition' && events.some(event => event.source === 'remote' && event.changed === 1), 'Changed cloud bodies download and notify a remote change');
    await store.initStore();
    ok((await store.get('courses', 'guest-course')).title === 'Guest only', 'Returning to guest restores isolated local data');
    return passed;
  });
  assert.deepEqual(errors, []);
  for (const result of results) console.log('PASS', result);
  console.log(`${results.length} browser storage checks passed. Live Supabase RLS not exercised here.`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
