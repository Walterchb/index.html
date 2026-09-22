import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBookRecords,
  auditBook,
  validateBookRanges,
} from "../app/book-course.js";
const fixture = () => ({
  title: "Book",
  totalPages: 3,
  pages: [
    {
      number: 1,
      label: "i",
      title: "Cover",
      text: "Cover",
      textStatus: "extracted",
    },
    { number: 2, label: "1", title: "Figure", text: "", textStatus: "empty" },
    {
      number: 3,
      label: "2",
      title: "Appendix",
      text: "a < b",
      textStatus: "extracted",
    },
  ],
  modules: [
    { title: "Introduction", startPage: 1, endPage: 2, source: "bookmarks" },
    { title: "Appendix", startPage: 3, endPage: 3, source: "bookmarks" },
  ],
  outline: [{ title: "Appendix", page: 3, level: 0 }],
  warnings: [],
  fingerprint: "hash",
  method: "pdf-book",
});
const build = (data) => {
  let seq = 0;
  return buildBookRecords(
    data,
    { fileId: "source-file", type: "application/pdf" },
    {
      courseId: "book-course",
      documentId: "book-document",
      title: data.title,
      makeId: () => `entry-${++seq}`,
    },
  );
};
test("Atomic book payload represents every physical page including image-only page and keeps printed labels separate", () => {
  const book = build(fixture());
  assert.deepEqual(
    book.lessons.map((l) => l.sourcePage),
    [1, 2, 3],
  );
  assert.equal(book.lessons[1].content, "");
  assert.equal(book.lessons[0].pageLabel, "i");
  assert.equal(book.lessons[2].content, "a < b");
  assert.equal(book.document.fileId, "source-file");
  assert.equal(
    new Set(book.records.map((x) => `${x.kind}:${x.data.id}`)).size,
    book.records.length,
  );
  assert.equal(
    auditBook(book.document, book.lessons, book.modules).complete,
    true,
  );
});
test("Missing source pages, repeated page maps and nonconsecutive ranges fail before any records are returned", () => {
  const missing = fixture();
  missing.pages.splice(1, 1);
  assert.throws(() => build(missing), /incompleto/);
  const duplicate = fixture();
  duplicate.pages[1].number = 1;
  assert.throws(() => build(duplicate), /incompleto/);
  assert.throws(
    () =>
      validateBookRanges(
        [
          { title: "A", startPage: 1, endPage: 1 },
          { title: "B", startPage: 3, endPage: 3 },
        ],
        3,
      ),
    /huecos/,
  );
  assert.throws(
    () =>
      validateBookRanges(
        [
          { title: "A", startPage: 1, endPage: 2 },
          { title: "B", startPage: 2, endPage: 3 },
        ],
        3,
      ),
    /repeticiones/,
  );
});
test("Coverage diagnoses duplicates, missing pages, out-of-range entries and orphaned pages independently of study progress", () => {
  const book = build(fixture());
  const bad = [
    book.lessons[0],
    { ...book.lessons[0], id: "duplicate" },
    { ...book.lessons[2], sourcePage: 7 },
  ];
  const audit = auditBook(book.document, bad, book.modules);
  assert.equal(audit.complete, false);
  assert.deepEqual(audit.missing, [2, 3]);
  assert.deepEqual(audit.duplicates, [1]);
  assert.equal(audit.invalid.length, 1);
  const noModules = auditBook(book.document, book.lessons, []);
  assert.equal(noModules.complete, false);
  assert.deepEqual(noModules.orphaned, [1, 2, 3]);
});
