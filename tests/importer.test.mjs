import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import canvas from '@napi-rs/canvas';

// Import the browser ES module directly; the package uses type:module.
const { extractDocument, segmentText, orderPdfText, suggestCards, validateStructuredImport, IMPORT_LIMITS } = await import('../app/importer.js');

test('Markdown creates reviewable sections, original page text and stable content fingerprints', async () => {
  const text = '# Valor temporal\n\nEl dinero hoy permite invertir.\n\n## Valor presente\n\nValor presente: Importe equivalente hoy a flujos de caja futuros descontados.\n';
  const events = [];
  const first = await extractDocument(new File([text], 'CFA-notas.md', { type: 'text/markdown' }), { onProgress: event => events.push(event) });
  const second = await extractDocument(new File([text], 'otro-nombre.md', { type: 'text/markdown' }));
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.fingerprint.length, 64);
  assert.equal(first.pages.length, 1);
  assert.equal(first.sections.length, 2);
  assert.equal(first.sections[1].title, 'Valor presente');
  assert.equal(first.sections[1].pageStart, 1);
  assert.equal(events.at(-1).progress, 1);
  assert.match(first.pages[0].text, /## Valor presente/);
  const cards = suggestCards(first.sections);
  assert.equal(cards[0].front, 'Explica: Valor presente');
  assert.equal(cards[0].draft, true);
  assert.equal(cards[0].method, 'extractive');
});

test('Splitting retains all non-whitespace source characters in long paragraphs and long tokens', () => {
  const text = `First paragraph. ${'alpha beta gamma. '.repeat(100)}\n\n${'Z'.repeat(900)}`;
  const parts = segmentText(text, 400);
  assert.ok(parts.every(part => part.length <= 400));
  assert.equal(parts.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
});

test('Import rejects oversize, invalid UTF-8, fake PDFs and aborted jobs before publishing results', async () => {
  await assert.rejects(extractDocument({ size: IMPORT_LIMITS.bytes + 1, arrayBuffer() { throw new Error('Should not read'); } }), /40 MB/);
  await assert.rejects(extractDocument(new File([new Uint8Array([0xFF, 0xFE])], 'bad.txt')), /UTF-8/);
  await assert.rejects(extractDocument(new File(['not a PDF'], 'fake.pdf')), /PDF válido/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(extractDocument(new File(['text'], 'test.txt'), { signal: controller.signal }), error => error.name === 'AbortError');
});

test('PDF geometry restores reading rows and identifies complex columns instead of claiming certainty', () => {
  const item = (str, x, y, width = 60) => ({ str, width, height: 12, transform: [12, 0, 0, 12, x, y] });
  const simple = orderPdfText([item('second', 20, 600), item('top', 20, 700), item('row', 84, 700)], 600);
  assert.equal(simple.text, 'top row\n\nsecond');
  const table = orderPdfText([700, 680, 660].flatMap(y => [item('Asset', 20, y), item('100', 350, y)]), 600);
  assert.equal(table.complex, true);
  assert.match(table.text, /Asset {4}100/);
});

test('Structured imports validate nesting and discard untrusted ownership and IDs', () => {
  const output = validateStructuredImport({ title: 'Course', owner: 'someone-else', modules: [{ title: 'Module', id: 'foreign', lessons: [{ title: 'Lesson', text: 'Text', user_id: 'foreign' }] }] });
  assert.equal(output.owner, undefined);
  assert.equal(output.modules[0].id, undefined);
  assert.equal(output.modules[0].lessons[0].user_id, undefined);
  assert.throws(() => validateStructuredImport('{bad'), /JSON/);
  assert.throws(() => validateStructuredImport({ title: 'Course', modules: [{ title: 'Module', lessons: [{}] }] }), /obligatorios/);
});

test('Real PDF extraction keeps page citations exact and never strips repeated formulas from body', async () => {
  Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, ImageData: canvas.ImageData, Path2D: canvas.Path2D });
  const bytes = await readFile(new URL('./fixtures/import-three-pages.pdf', import.meta.url));
  const document = new File([bytes], 'three-pages.pdf', { type: 'application/pdf' });
  const result = await extractDocument(document);
  assert.equal(result.pages.length, 3);
  assert.equal(result.sections.length, 3);
  result.sections.forEach((section, index) => {
    assert.equal(section.pageStart, index + 1);
    assert.equal(section.pageEnd, index + 1);
    assert.ok(section.text.includes('PV = FV / (1 + r)^n'));
    assert.ok(!section.text.includes('Common document header'));
    assert.ok(result.pages[index].text.includes('Common document header'));
  });
  const range = await extractDocument(document, { pageStart: 2, pageEnd: 2 });
  assert.equal(range.pages.length, 1);
  assert.equal(range.pages[0].number, 2);
  assert.match(range.warnings.join(' '), /parcial/);
});
