#!/usr/bin/env node
/** Convert the trusted original repository corpus into a private import file.
 * Usage: node scripts/convert-legacy.mjs --source /path/to/original --out migration
 * Do not publish the generated payload. No dependency or network request is needed.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const source = path.resolve(flag('--source', root));
const output = path.resolve(flag('--out', path.join(root, 'migration')));
const courseId = 'legacy-course-1';
const pageId = n => `legacy-page-${String(n).padStart(3, '0')}`;
const slug = text => String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const html = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const groups = {}, exercises = {}, glossary = [];
const hashes = {};
const window = {
  CoursePages: { registerGroup: (id, rows) => { groups[id] = rows; } },
  StudyContentRegistry: {
    registerExercises: (id, rows) => { exercises[id] = rows; },
    registerGlossary: rows => glossary.push(...rows)
  }
};
const sandbox = vm.createContext({ window });
function read(relative) {
  const bytes = fs.readFileSync(path.join(source, relative));
  hashes[relative] = crypto.createHash('sha256').update(bytes).digest('hex');
  return bytes;
}
function load(relative) {
  vm.runInContext(read(relative).toString('utf8'), sandbox, { filename: relative, timeout: 1000 });
}
load('data/course-manifest.js');
load('data/visual-registry.js');
const manifest = window.COURSE_MANIFEST;
for (const group of Object.values(manifest.pageGroups)) load(`data/${group.path}`);
for (const module of manifest.modules.filter(x => x.id !== 'front')) load(`data/exercises/${module.id}.js`);
load('data/glossary.js');
const pages = Object.values(groups).flat().sort((a, b) => a.page - b.page);
const rawExercises = Object.values(exercises).flat();
const visualRegistry = window.VISUAL_REGISTRY;
const expectedPages = manifest.course.mainPages;
assert.equal(pages.length, expectedPages, 'The complete source page count must be preserved.');
assert.equal(new Set(pages.map(x => x.page)).size, expectedPages, 'Duplicate source pages.');
for (let n = 1; n <= expectedPages; n++) assert.equal(pages[n - 1].page, n, `Missing source page ${n}.`);

const visuals = new Map();
for (const [page, visual] of Object.entries(visualRegistry)) {
  const bytes = read(visual.asset);
  visuals.set(Number(page), { ...visual, src: `data:image/webp;base64,${bytes.toString('base64')}` });
}
assert.equal(visuals.size, manifest.coverage.inlineVisuals, 'Every registered visual must be preserved.');

function renderBlock(block) {
  const text = html(block.text).replace(/\n/g, '<br>');
  if (block.kind === 'heading') return `<h3>${text}</h3>`;
  if (block.kind === 'bullets') {
    const items = block.text.split('\n').filter(Boolean).map(line => `<li>${html(line.replace(/^\s*[•●▪]\s*/, ''))}</li>`).join('');
    return `<ul>${items}</ul>`;
  }
  if (block.kind === 'note') return `<blockquote><p>${text}</p></blockquote>`;
  if (block.kind === 'question') return `<p><strong>${text}</strong></p>`;
  return `<p>${text}</p>`;
}
function renderVisual(visual) {
  return `<figure><img src="${visual.src}" alt="${html(visual.alt || visual.title)}" loading="lazy"><figcaption>${html(visual.label)} · ${html(visual.title)} · p. ${visual.sourcePage}</figcaption></figure>`;
}
const lessons = pages.map(page => {
  const visual = visuals.get(page.page);
  const fragments = [];
  page.blocks.forEach((block, index) => {
    // Keep every source text block, including accessible table text.
    fragments.push(renderBlock(block));
    if (visual && index === visual.insertAfter) fragments.push(renderVisual(visual));
  });
  if (visual && !fragments.some(fragment => fragment.startsWith('<figure>'))) fragments.push(renderVisual(visual));
  return {
    id: pageId(page.page), courseId, moduleId: `legacy-${page.moduleId}`,
    title: `${page.sectionTitle} · p. ${page.page}`,
    content: fragments.join('\n'), sourcePage: page.page, order: page.page,
    sourceLabel: 'Investment Foundations · Course 1 · material original',
    sectionId: page.sectionId, sectionTitle: page.sectionTitle,
    legacySource: { ...page, visual: visual ? { ...visualRegistry[page.page], sha256: hashes[visual.asset] } : null }
  };
});

function commonQuestion(q) {
  assert.ok(pages.some(page => page.page === q.page), `Question ${q.id} points to a missing page.`);
  return {
    id: `legacy-${q.id}`, courseId, moduleId: `legacy-${q.moduleId}`, lessonId: pageId(q.page),
    prompt: q.question, sourcePage: q.page, sourceLabel: 'Ejercicio del material original',
    explanation: q.feedback || '', level: q.level, legacyExerciseId: q.id, legacyType: q.type
  };
}
const questions = rawExercises.flatMap(q => {
  const base = commonQuestion(q);
  if (q.type === 'single') {
    assert.equal(q.answer.length, 1, `Single question ${q.id} has multiple answers.`);
    return [{ ...base, options: q.options.map(x => x[1]), correctIndex: q.options.findIndex(x => x[0] === q.answer[0]) }];
  }
  if (q.type === 'multiple') {
    assert.ok(q.options.length > 1 && q.options.length <= 6, `Question ${q.id} has unsupported option count.`);
    return [{ ...base,
      type: 'multiple', options: q.options.map(option => option[1]), correctIndex: -1,
      correctIndices: q.answer.map(answer => q.options.findIndex(option => option[0] === answer)).sort((a, b) => a - b)
    }];
  }
  if (q.type === 'matching') return q.pairs.map(pair => ({
    ...base, id: `${base.id}-${pair.key}`, prompt: `${q.question}\n\n${pair.label}`,
    options: q.matchOptions.map(x => x[1]), correctIndex: q.matchOptions.findIndex(x => x[0] === pair.answer), legacyPart: pair.key
  }));
  if (q.type === 'matrix') return q.matrixRows.map(row => ({
    ...base, id: `${base.id}-${row[0]}`, prompt: `${q.question}\n\n${row[1]}`,
    options: [...q.matrixOptions], correctIndex: q.matrixOptions.indexOf(row[2]), legacyPart: row[0]
  }));
  throw new Error(`Unsupported exercise type: ${q.type}`);
});
for (const q of questions) {
  if (q.type === 'multiple') {
    assert.ok(q.correctIndices.length > 0, `No correct answers: ${q.id}`);
    assert.equal(new Set(q.correctIndices).size, q.correctIndices.length, `Duplicate correct answer: ${q.id}`);
    q.correctIndices.forEach(index => assert.ok(index >= 0 && index < q.options.length, `Invalid correct answer: ${q.id}`));
    const original = rawExercises.find(original => original.id === q.legacyExerciseId);
    assert.deepEqual(Array.from(q.correctIndices, index => original.options[index][0]).sort(), Array.from(original.answer).sort(), `Answer set changed: ${q.id}`);
    assert.deepEqual(Array.from(q.options), Array.from(original.options, option => option[1]), `Multiple-answer option text changed: ${q.id}`);
  } else assert.ok(q.correctIndex >= 0 && q.correctIndex < q.options.length, `Invalid correct answer: ${q.id}`);
}
assert.equal(new Set(questions.map(x => x.id)).size, questions.length, 'Duplicate question IDs.');

const cards = glossary.map(entry => ({
  id: `legacy-glossary-${slug(entry.term)}`, courseId,
  moduleId: `legacy-${entry.origin?.moduleId || 'front'}`,
  lessonId: entry.origin?.page ? pageId(entry.origin.page) : undefined,
  front: entry.term,
  back: `${entry.definition}${entry.example ? `\n\nEjemplo del material:\n${entry.example}` : ''}`,
  sourcePage: entry.origin?.page || null, glossaryPage: entry.glossaryPage,
  dueAt: 0, interval: 0, ease: 2.5, repetitions: 0, legacyTerm: entry.term,
  legacySource: entry
}));
assert.equal(new Set(cards.map(x => x.id)).size, glossary.length, 'Duplicate glossary IDs.');
const packet = {
  format: 'cfa-study-workspace', schemaVersion: 1,
  courses: [{ id: courseId, title: manifest.course.title,
    description: 'Material original de Investment Foundations: 157 páginas, 5 módulos académicos, ejercicios y glosario. No equivale al temario completo del CFA Program.',
    color: '#1c8b7a', order: 0 }],
  modules: manifest.modules.map((module, order) => ({
    id: `legacy-${module.id}`, courseId, title: module.id === 'front' ? 'Inicio y referencias' : `${module.number} · ${module.title}`,
    description: module.id === 'front' ? 'Portada, derechos de uso e introducción del material original.' : module.title,
    order, legacyModuleId: module.id
  })),
  lessons, questions, cards,
  settings: [{ id: 'legacy-source-records', manifest, exercises: rawExercises, glossary, sourceHashes: hashes }],
  metadata: {
    originalCourse: manifest.course.title, sourcePageCount: pages.length, sourceVisualCount: visuals.size,
    sourceExerciseCount: rawExercises.length, convertedQuestionCount: questions.length, glossaryTermCount: cards.length,
    privateImport: true, conversion: 'Source text and original records preserved; matching and matrix split into independent questions; multiple-answer retains native selection and the exact original answer set.'
  }
};

const report = {
  status: 'passed', checks: {
    consecutivePages: pages.length, uniquePageIds: new Set(lessons.map(x => x.id)).size,
    embeddedVisuals: lessons.reduce((n, x) => n + (x.content.match(/data:image\/webp;base64,/g) || []).length, 0),
    sourceBlocksPreserved: pages.reduce((n, x) => n + x.blocks.length, 0),
    sourceExercisesPreserved: rawExercises.length, usableQuestions: questions.length,
    validCorrectAnswers: questions.length, nativeMultipleAnswerQuestions: questions.filter(q => q.type === 'multiple').length, glossaryDefinitionsPreserved: cards.length
  },
  sourceExerciseTypes: rawExercises.reduce((counts, q) => ({ ...counts, [q.type]: (counts[q.type] || 0) + 1 }), {}),
  observations: [
    'Original matrix activity had no dedicated matrix renderer/grader; converted into six independent decisions.',
    'Original glossary status is learned/review/new, not a historical spaced-repetition schedule; import does not invent review sessions.',
    'Every block is retained, including table text alongside original visual crops. No original PDFs were present in the repository.',
    'This is Investment Foundations Course 1, not the full CFA Program curriculum.',
    'Source feedback has been preserved, not independently fact-checked against a newer curriculum edition.',
    'The conversion is a private local import. Keep generated files out of a public GitHub Pages deployment.'
  ],
  sourceHashes: hashes
};
assert.equal(report.checks.embeddedVisuals, visuals.size, 'Embedded visual count differs.');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'curso-original.json'), JSON.stringify(packet));
fs.writeFileSync(path.join(output, 'auditoria-conversion.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, bytes: fs.statSync(path.join(output, 'curso-original.json')).size, ...report.checks }, null, 2));
