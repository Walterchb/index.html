import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
const output = path.resolve("dist");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const allow = [
  "index.html",
  "404.html",
  "practica.html",
  "glosario.html",
  "styles.css",
  "config.js",
  "manifest.webmanifest",
  "service-worker.js",
  "app",
  "vendor",
  "assets/app-icon.svg",
  "docs/GUIA_CONFIGURACION.html",
  "docs/GUIA_CONFIGURACION.md",
  "docs/IMPORTACION.md",
  "docs/MIGRACION.md",
];
for (const item of allow) {
  await mkdir(path.dirname(path.join(output, item)), { recursive: true });
  await cp(item, path.join(output, item), { recursive: true });
}
try {
  await stat("CNAME");
  await cp("CNAME", path.join(output, "CNAME"));
} catch {}
await import("node:fs/promises").then((fs) =>
  fs.writeFile(path.join(output, ".nojekyll"), ""),
);
console.log(
  "Sitio listo en dist/. El material de migration/, supabase/, tests/ y data/ no se publica.",
);
