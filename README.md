# Study Atlas

Plataforma personal de aprendizaje: biblioteca de cursos y módulos, lector, notas, preguntas con una o varias respuestas, tarjetas con repaso espaciado, documentos privados y avance sincronizado.

**Empieza por [`docs/GUIA_CONFIGURACION.html`](docs/GUIA_CONFIGURACION.html)**. Es una guía visual paso a paso que puedes abrir directamente desde el ZIP.

## Para Walter: instalación con GitHub Desktop

1. Guarda un respaldo de tu repositorio actual.
2. Copia el contenido de esta carpeta a tu repositorio local `index.html`, conservando su carpeta `.git` y tu `CNAME` si usas dominio propio.
3. Configura Supabase con `supabase/schema.sql`; completa solo las dos claves públicas indicadas en `config.js`.
4. En GitHub Desktop, haz Commit y Push. En GitHub → Settings → Pages elige **GitHub Actions**.
5. Abre tu web, inicia sesión e importa `migration/curso-original.json` desde **Gestionar → Importar respaldo / curso**.
6. En el mismo navegador y dominio anterior, usa **Ajustes → Recuperar avance anterior**.

La guía amplía cada paso, el alta del usuario, URLs, SMTP, recuperación de contraseña y comprobaciones en un segundo dispositivo. La nube real necesita tu proyecto y tu cuenta; no hay credenciales ni servicios externos ya aprovisionados en el ZIP.

## Probar en tu computadora

En Windows con Python 3 instalado, ejecuta `INICIAR_WINDOWS.bat`. O abre una terminal en esta carpeta:

```sh
python -m http.server 8080
```

Abre http://localhost:8080/. No abras index.html con doble clic: módulos JavaScript y OCR necesitan un servidor HTTP/HTTPS. El modo local funciona sin Supabase. Para trasladar datos locales a tu cuenta, expórtalos y luego impórtalos después de iniciar sesión.

## Contenido conservado

El curso anterior es **Investment Foundations — Course 1**, no un currículo completo de CFA Level I. La importación conserva 157 páginas, 21 visuales y 71 definiciones. Las 38 actividades originales se convierten en 44 preguntas funcionales: los emparejamientos y matrices se separan en decisiones evaluables y las 5 preguntas de respuesta múltiple mantienen su selección nativa. Los detalles están en `migration/auditoria-conversion.json` y `docs/MIGRACION.md`.

La publicación usa una lista explícita de archivos públicos. `migration/`, `supabase/`, pruebas y el corpus anterior no se copian al sitio. **Esto no vuelve privado un repositorio GitHub público ni su historial.** Los materiales importados a tu cuenta se guardan bajo políticas por usuario; el material ya publicado requiere revisar su repositorio y sus derechos por separado.

## Motor de documentos

- PDF con texto, TXT y Markdown; archivos PNG/JPG/WebP con OCR inglés y español.
- Hasta 40 MB por archivo. OCR máximo 10 páginas por importación; permite rangos.
- Bibliotecas, modelos OCR y tipografías incluidos localmente: no depende de un CDN.
- Extracción por página, revisión editable, detección de duplicados, avisos de columnas y conservación de fuente original.
- IA opcional para resúmenes, tarjetas y preguntas, con fuentes, validación y revisión antes de guardar. Necesita la función Supabase, clave de OpenAI en el servidor, lista de correos permitidos y límites de consumo.
- No se garantiza interpretación exacta de fórmulas, tablas o escaneos difíciles. Contrasta con el original.

## Desarrollo y mantenimiento

La web ya está preparada: no es obligatorio instalar Node para publicar. Las dependencias del navegador están en `vendor/` y versionadas en package-lock.json.

```sh
npm ci
npm test
npm run vendor
npm run build
```

`dist/` contiene únicamente lo publicable. El workflow construye con Node22 sin instalar dependencias porque el código del navegador está preincluido. `scripts/vendor.mjs` regenera los SDK y tipografías; el motor OCR y los modelos locales se conservan en vendor/tesseract-core y vendor/tessdata (ver `docs/IMPORTACION.md` para ubicaciones exactas). Las licencias están en `vendor/licenses/`.

## Validación

Ver `docs/VALIDACION.md` para alcance real de las pruebas y los pasos pendientes en tu nube. No se simulan porcentajes de aprendizaje: lectura, aciertos, tarjetas y tiempo se calculan por separado con tus registros.
