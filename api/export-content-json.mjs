/**
 * Exporta los bloques JS locales a JSON para subirlos a KV, R2 o cualquier API.
 * Ejecuta desde la carpeta principal:
 *   node api/export-content-json.mjs
 *
 * Salida: api/content-export/
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const data = path.join(root, "data");
const out = path.join(here, "content-export");

function parseSecondArgument(source, fnName) {
  const marker = `register${fnName}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`No se encontró ${marker}`);
  const firstComma = source.indexOf(",", start + marker.length);
  const jsonText = source.slice(firstComma + 1, source.lastIndexOf(");")).trim();
  return JSON.parse(jsonText);
}

function parseOneArgument(source, fnName) {
  const marker = `register${fnName}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`No se encontró ${marker}`);
  const jsonText = source.slice(start + marker.length, source.lastIndexOf(");")).trim();
  return JSON.parse(jsonText);
}

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, "sections"), { recursive: true });
await mkdir(path.join(out, "exercises"), { recursive: true });

for (const file of await readdir(path.join(data, "sections"))) {
  const source = await readFile(path.join(data, "sections", file), "utf8");
  const section = parseSecondArgument(source, "Section");
  await writeFile(path.join(out, "sections", file.replace(/\.js$/, ".json")), JSON.stringify(section));
}
for (const file of await readdir(path.join(data, "exercises"))) {
  const source = await readFile(path.join(data, "exercises", file), "utf8");
  const exercises = parseSecondArgument(source, "Exercises");
  await writeFile(path.join(out, "exercises", file.replace(/\.js$/, ".json")), JSON.stringify({ exercises }));
}

const glossary = parseOneArgument(await readFile(path.join(data, "glossary.js"), "utf8"), "Glossary");
const index = parseOneArgument(await readFile(path.join(data, "search-index.js"), "utf8"), "SearchIndex");
await writeFile(path.join(out, "glossary.json"), JSON.stringify({ glossary }));
await writeFile(path.join(out, "search-index.json"), JSON.stringify({ index }));

console.log(`Exportación creada en ${out}`);
