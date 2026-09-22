import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import canvas from '@napi-rs/canvas';
import { analyzeBook, partitionBookModules, BOOK_IMPORT_LIMITS } from '../app/book-importer.js';

Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, ImageData: canvas.ImageData, Path2D: canvas.Path2D });

const fixture = new URL('./fixtures/study-book-rich.pdf', import.meta.url);
const expected = JSON.parse(await readFile(new URL('./fixtures/study-book-rich.expected.json', import.meta.url), 'utf8'));
const bytes = await readFile(fixture);
const book = () => new File([bytes], 'filename-fallback.pdf', { type: 'application/pdf' });

/** Minimal real PDF fixture builder: avoids mocking PDF.js, outline, or labels. */
function smallPdf(pageDefinitions, { labels = false, oneRootOutline = false } = {}) {
  const objects = [];
  const add = value => { objects.push(value); return objects.length; };
  const catalog = add(''); const pageTree = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const literal = value => `(${String(value).replace(/([\\()])/g, '\\$1')})`;
  const image = add('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\n\xff\x00\x00\nendstream');
  const pageIds = [];
  pageDefinitions.forEach(definition => {
    const lines = typeof definition === 'string' ? definition.split('\n') : String(definition.text || '').split('\n');
    const stream = definition.image ? 'q 400 0 0 600 50 100 cm /Im1 Do Q' : lines.filter(Boolean).map((line, index) => `BT /F1 14 Tf 50 ${740 - index * 22} Td ${literal(line)} Tj ET`).join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    const page = add(`<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> /XObject << /Im1 ${image} 0 R >> >> /Contents ${content} 0 R >>`);
    pageIds.push(page);
  });
  let outlineReference = '';
  if (oneRootOutline) {
    const root = add(''); const parent = add(''); const first = add(''); const second = add('');
    objects[root - 1] = `<< /Type /Outlines /First ${parent} 0 R /Last ${parent} 0 R /Count 3 >>`;
    objects[parent - 1] = `<< /Title (Entire book) /Parent ${root} 0 R /Dest [${pageIds[0]} 0 R /Fit] /First ${first} 0 R /Last ${second} 0 R /Count 2 >>`;
    objects[first - 1] = `<< /Title (First chapter) /Parent ${parent} 0 R /Dest [${pageIds[1]} 0 R /Fit] /Next ${second} 0 R >>`;
    objects[second - 1] = `<< /Title (Final appendix) /Parent ${parent} 0 R /Dest (appendix) /Prev ${first} 0 R >>`;
    outlineReference = `/Outlines ${root} 0 R /Dests << /appendix [${pageIds.at(-1)} 0 R /Fit] >>`;
  }
  objects[pageTree - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`;
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pageTree} 0 R ${outlineReference} ${labels ? '/PageLabels << /Nums [0 << /S /r >> 2 << /S /D /St 1 >>] >>' : ''} >>`;
  let output = '%PDF-1.7\n'; const offsets = [0];
  objects.forEach((value, index) => { offsets.push(Buffer.byteLength(output, 'latin1')); output += `${index + 1} 0 obj\n${value}\nendobj\n`; });
  const startxref = Buffer.byteLength(output, 'latin1');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return new File([Buffer.from(output, 'latin1')], 'small-book.pdf', { type: 'application/pdf' });
}

function assertCoverage(result) {
  assert.deepEqual(result.pages.map(page => page.number), Array.from({ length: result.totalPages }, (_, index) => index + 1));
  const covered = result.modules.flatMap(module => Array.from({ length: module.endPage - module.startPage + 1 }, (_, index) => module.startPage + index));
  assert.deepEqual(covered, result.pages.map(page => page.number));
}

test('A complete book retains front matter, blank pages, graphics pages, formula pages and appendix', async () => {
  const progress = [];
  const result = await analyzeBook(book(), { onProgress: event => progress.push(event) });
  assert.equal(result.totalPages, expected.pageCount);
  assert.equal(result.title, expected.title);
  assert.equal(result.method, 'pdf-book');
  assertCoverage(result);
  assert.deepEqual(result.outline, expected.outline);
  assert.deepEqual(result.modules.map(module => [module.startPage, module.endPage]), [[1, 2], [3, 6], [7, 9], [10, 11], [12, 12]]);
  assert.ok(result.modules.every(module => module.source === 'bookmarks'));
  assert.equal(result.pages[5].text, '');
  assert.equal(result.pages[5].hasText, false);
  assert.equal(result.pages[5].textStatus, 'empty');
  assert.ok(result.pages[5].width > 0 && result.pages[5].height > 0);
  for (const number of [...expected.vectorGraphicPages, ...expected.rasterGraphicPages, ...expected.formulaPages, ...expected.appendixPages]) {
    assert.equal(result.pages[number - 1].number, number);
    assert.ok(result.pages[number - 1].width > 0);
  }
  assert.ok(result.pages[3].text.includes('PV = CF / (1 + r)'));
  assert.ok(result.pages[3].text.includes('200.00'));
  assert.ok(result.pages[11].text.includes('Appendix'));
  assert.match(result.warnings.join(' '), /sin texto seleccionable/);
  assert.equal(result.fingerprint, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(progress.at(-1).progress, 1);
});

test('Real PDF labels and named nested bookmark destinations preserve physical page numbering', async () => {
  const result = await analyzeBook(smallPdf(['Cover', '', 'Body', 'Appendix text'], { labels: true, oneRootOutline: true }));
  assertCoverage(result);
  assert.deepEqual(result.pages.map(page => page.label), ['i', 'ii', '1', '2']);
  assert.deepEqual(result.outline.map(item => [item.title, item.page, item.level]), [['Entire book', 1, 0], ['First chapter', 2, 1], ['Final appendix', 4, 1]]);
  assert.deepEqual(result.modules.map(module => [module.startPage, module.endPage]), [[1, 1], [2, 3], [4, 4]]);
  assert.equal(result.modules[0].source, 'frontmatter');
  assert.equal(result.pages[1].hasText, false);
});

test('Heading fallback ignores printed TOC leaders and repeated running chapter headers', async () => {
  const result = await analyzeBook(smallPdf([
    'Contents\nCHAPTER 1 .......... 3\nAPPENDIX .......... 6',
    '',
    'CHAPTER 1: FOUNDATIONS\nA repeated explanatory sentence.\nFooter material is retained.',
    'CHAPTER 1: FOUNDATIONS\nThe continuation must stay in the same module.\nFooter material is retained.',
    { image: true },
    'Appendix A: Definitions\nThe final physical page is part of this book.',
  ]));
  assertCoverage(result);
  assert.deepEqual(result.modules.map(module => [module.startPage, module.endPage]), [[1, 2], [3, 5], [6, 6]]);
  assert.equal(result.modules[1].source, 'headings');
  assert.equal(result.pages[1].hasText, false);
  assert.equal(result.pages[4].hasText, false);
  assert.equal(result.pages[4].width, 612);
  assert.match(result.pages[3].text, /CHAPTER 1: FOUNDATIONS/);
  assert.match(result.pages[3].text, /Footer material is retained/);
});

test('Without bookmarks or headings, contiguous fallback groups include every image-only page', async () => {
  const result = await analyzeBook(smallPdf(Array.from({ length: 23 }, (_, index) => index % 2 ? { image: true } : `Ordinary paragraph ${index + 1}.`)));
  assertCoverage(result);
  assert.deepEqual(result.modules.map(module => [module.startPage, module.endPage]), [[1, 20], [21, 23]]);
  assert.ok(result.modules.every(module => module.source === 'fallback'));
  assert.equal(result.pages.filter(page => !page.hasText).length, 11);
  assert.match(result.warnings.join(' '), /sin omitir contenido/);
});

test('Unsafe ranges, duplicate starts and late appendix starts cannot create gaps or overlaps', () => {
  const modules = partitionBookModules(12, [{ page: 12, title: 'Appendix' }, { page: 3, title: 'Chapter' }, { page: 3, title: 'Duplicate' }, { page: -2, title: 'Invalid' }, { page: 13, title: 'Invalid' }, { page: 4.5, title: 'Invalid' }], 'bookmarks');
  assert.deepEqual(modules.map(module => [module.startPage, module.endPage]), [[1, 2], [3, 11], [12, 12]]);
  assert.equal(modules[1].title, 'Chapter');
  assert.throws(() => partitionBookModules(0), /al menos/);
});

test('Cancelled and oversized books fail explicitly without returning partial imports', async () => {
  const initial = new AbortController(); initial.abort();
  await assert.rejects(analyzeBook(book(), { signal: initial.signal }), error => error.name === 'AbortError');
  const during = new AbortController();
  await assert.rejects(analyzeBook(book(), { signal: during.signal, onProgress: event => { if (event.stage === 'pages' && event.current === 2) during.abort(); } }), error => error.name === 'AbortError');
  await assert.rejects(analyzeBook({ size: BOOK_IMPORT_LIMITS.bytes + 1, arrayBuffer() { throw Error('Must not read oversized input'); } }), /40 MB/);
  await assert.rejects(analyzeBook(new File(['not a PDF'], 'fake.pdf')), /PDF válido/);
  await assert.rejects(analyzeBook(smallPdf(Array.from({ length: 1001 }, () => ''))), /1.000 páginas/);
});
