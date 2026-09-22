# CFA Study Reader · v4

Lector de estudio con el diseño editorial de la versión original. Carga un PDF y crea automáticamente un curso completo: índice editable, módulos, una lectura por página, notas vinculadas, preguntas y repasos. El visor muestra el archivo original para conservar gráficos, tablas, fórmulas y anexos.

**Empieza por [`docs/GUIA_CONFIGURACION.html`](docs/GUIA_CONFIGURACION.html)**. Es una guía visual paso a paso que puedes abrir directamente desde el ZIP.

## Para Walter: instalación con GitHub Desktop

1. Guarda un respaldo de tu repositorio actual.
2. Copia el contenido de esta carpeta a tu repositorio local `index.html`, conservando su carpeta `.git` y tu `CNAME` si usas dominio propio.
3. `config.js` ya incluye la URL y la clave pública de Supabase proporcionadas por Walter. Si la versión anterior ya sincronizaba, no ejecutes más SQL ni crees otro proyecto. Para una instalación inicial, sigue la guía.
4. En GitHub Desktop, haz Commit y Push. En GitHub → Settings → Pages elige **GitHub Actions**.
5. Abre la misma dirección de tu web, inicia sesión con la misma cuenta y pulsa **Cargar PDF**. Si aún no recuperaste tu curso anterior, importa `migration/curso-original.json` desde **Gestionar → Importar respaldo / curso**.
6. Solo si migras por primera vez desde el lector original: en el mismo navegador y dominio anterior, usa **Ajustes → Recuperar avance anterior**.

La guía amplía cada paso, el alta del usuario, URLs, SMTP, recuperación de contraseña y comprobaciones en un segundo dispositivo. La configuración pública ya está incluida; la cuenta real y el despliegue siguen bajo tu control. No se han modificado ni comprobado tus datos remotos durante esta entrega.

## Probar en tu computadora

En Windows con Python 3 instalado, ejecuta `INICIAR_WINDOWS.bat`. O abre una terminal en esta carpeta:

```sh
python -m http.server 8080
```

Abre http://localhost:8080/. No abras index.html con doble clic: módulos JavaScript y OCR necesitan un servidor HTTP/HTTPS. El modo local funciona sin Supabase. Para trasladar datos locales a tu cuenta, expórtalos y luego impórtalos después de iniciar sesión.

## Contenido conservado

El curso anterior es **Investment Foundations — Course 1**, no un currículo completo de CFA Level I. La importación conserva 157 páginas, 21 visuales y 71 definiciones. Las 38 actividades originales se convierten en 44 preguntas funcionales: los emparejamientos y matrices se separan en decisiones evaluables y las 5 preguntas de respuesta múltiple mantienen su selección nativa. Los detalles están en `migration/auditoria-conversion.json` y `docs/MIGRACION.md`.

La publicación usa una lista explícita de archivos públicos. `migration/`, `supabase/`, pruebas y el corpus anterior no se copian al sitio. **Esto no vuelve privado un repositorio GitHub público ni su historial.** Los materiales importados a tu cuenta se guardan bajo políticas por usuario; el material ya publicado requiere revisar su repositorio y sus derechos por separado.

## Motor de libros y visor

- Curso completo desde un PDF: metadatos, marcadores internos, etiquetas impresas e índice jerárquico navegable.
- Cuando no hay marcadores utilizables, detecta encabezados de forma conservadora o propone bloques consecutivos de 20 páginas. La estructura es editable.
- Conserva cada página física, incluida portada, página en blanco y apéndice. El informe identifica cobertura, duplicados y páginas sin texto auxiliar.
- El visor local PDF.js incluye zoom, ajuste al ancho o página, giro, texto seleccionable, enlaces internos, descarga y pantalla completa.
- El original se guarda sin reconstruirlo. Las fórmulas y gráficos se leen visualmente desde ese archivo. El texto extraído se muestra literalmente y puede corregirse.
- Importación local atómica: no deja un curso parcialmente creado. Reorganización atómica que conserva IDs de página, notas, tarjetas, preguntas y avance.
- Hasta 40 MB y 1.000 páginas por libro; hasta 3 millones de caracteres de texto auxiliar, con aviso si se alcanza. Los límites no recortan silenciosamente las páginas.
- OCR inglés/español a petición por página, con revisión antes de guardar. Los libros escaneados no se reconocen íntegramente por OCR de forma automática.
- TXT, Markdown e imágenes siguen disponibles en «Otros materiales». IA opcional para borradores de estudio; requiere configuración separada.
- Bibliotecas, fuentes y modelos OCR incluidos localmente. Login, datos por cuenta y sincronización Supabase conservan el esquema y los espacios de la versión 3.

Consulta [la guía del lector](docs/LECTOR_PDF.md). La cobertura completa verifica inclusión de páginas; no garantiza reconocimiento semántico perfecto ni dominio académico.

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
