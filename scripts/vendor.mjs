import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
await mkdir("vendor", { recursive: true });
await build({
  entryPoints: ["@supabase/supabase-js"],
  bundle: true,
  format: "esm",
  minify: true,
  outfile: "vendor/supabase.js",
});
for (const [from, to] of [
  ["dompurify/dist/purify.es.mjs", "purify.js"],
  ["pdfjs-dist/build/pdf.min.mjs", "pdf.mjs"],
  ["pdfjs-dist/build/pdf.worker.min.mjs", "pdf.worker.mjs"],
  ["tesseract.js/dist/tesseract.min.js", "tesseract.min.js"],
  ["tesseract.js/dist/worker.min.js", "tesseract-worker.min.js"],
  ["pdfjs-dist/cmaps", "cmaps"],
  ["pdfjs-dist/standard_fonts", "standard_fonts"],
  ["pdfjs-dist/wasm", "wasm"],
])
  await cp("node_modules/" + from, "vendor/" + to, { recursive: true });
console.log(
  "Dependencias del navegador preparadas. Los modelos OCR preincluidos se mantienen en vendor/.",
);

await mkdir("vendor/fonts", { recursive: true });
for (const font of ["dm-sans", "manrope"])
  for (const weight of [400, 500, 600, 700, 800])
    await cp(
      `node_modules/@fontsource/${font}/files/${font}-latin-${weight}-normal.woff2`,
      `vendor/fonts/${font}-${weight}.woff2`,
    );
