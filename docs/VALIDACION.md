# Validación de la entrega · versión 4

## Lector PDF y curso completo

Se verificó un PDF sintético de 12 páginas con índice jerárquico, portada, fórmulas, tabla, gráfico vectorial, imagen, página en blanco y apéndice. No se proporcionó un libro real de Derivatives en esta conversación.

El recorrido `tests/ui-pdf-book.mjs` comprueba:

- Crear curso automáticamente, generar módulos y conservar una referencia por cada página física.
- Identidad SHA256 del PDF guardado y descargado; comprobación de colores de gráficos renderizados.
- Texto original seleccionable, nota a partir de una selección, marcas de estudio y guardados.
- Rechazo de rangos incompletos; división y unión de módulos preservando IDs y actualizando notas, tarjetas y preguntas relacionadas.
- Página en blanco y apéndice disponibles; texto con etiquetas aparentes mostrado literalmente sin interpretarlo como HTML.
- Persistencia tras recarga y regreso a la página leída; interfaz móvil sin desbordamiento ni errores JavaScript.

Las pruebas unitarias/de integración (`npm test`) son 25: incluyen estructura de libros con marcadores anidados y nombres de destino, etiquetas de página, fallback sin índice, cancelación, límites y detección de páginas huérfanas. El visor además se probó con zoom, giro, enlaces, selección, errores de archivo y redimensionamiento mientras se introduce una página.

## Funciones existentes

Se probaron localmente estos recorridos con Chromium real:

- Acceso local, creación/edición/orden de cursos, módulos y lecciones; sanitización HTML.
- Notas, guardados y cobertura de lectura; persistencia tras recarga.
- Preguntas de una y varias respuestas, aciertos/errores y feedback en filtros.
- Revelar tarjetas y programar su siguiente repaso.
- Exportar/restaurar respaldo, eliminación en cascada e importación completa del curso original.
- Recuperación del almacenamiento del lector anterior y notas visibles.
- Extracción de un PDF real, páginas seleccionadas, fórmulas repetidas conservadas.
- OCR de una imagen real con inglés/español usando exclusivamente recursos locales.
- Vistas de escritorio y móvil sin desbordamiento horizontal ni errores JavaScript en los recorridos probados.

## Datos y permisos

40 pruebas en navegador verificaron IndexedDB, separación de invitado/cuentas, CAS y resolución de conflictos, reintentos y cambios mientras se sincroniza, borrado lógico, archivos y MIME, respaldos/corrupción y recuperación tardía de autenticación. Los lotes de creación/reorganización prueban atomicidad ante validación, cuota, cambio de cuenta y borrado con conflictos. El transporte Supabase se simuló de forma controlada para provocar errores y conflictos reproducibles.

El SQL se ejecutó dos veces en PostgreSQL/PGlite para comprobar idempotencia, roles, políticas RLS, revisiones y acceso Storage. Son pruebas de lógica PostgreSQL; no sustituyen la comprobación en el proyecto real de Supabase.

Pruebas del importador, aprendizaje y función de IA validan segmentación, entradas, referencias, selección múltiple, permisos, cuotas y salidas inválidas. La conversión auditada conserva 157 páginas, 1.460 bloques, 21 imágenes, 38 actividades fuente y 71 definiciones; produce 44 preguntas válidas.

## Repetir pruebas

```sh
npm ci
npm test
npm audit --omit=dev
node tests/ui-smoke.mjs
node tests/ui-pdf-book.mjs
node supabase/tests/store-browser.mjs
```

Las pruebas de navegador requieren Playwright y Chromium (CHROMIUM_PATH para persistencia y CFA_BROWSER para interfaz; Playwright instalado o CODEX_PRIMARY_RUNTIME_NODE_MODULES). El ZIP no incluye ejecutables de navegador. La prueba de SQL usa PGlite instalado aparte, o ejecuta la prueba SQL suministrada en un proyecto de desarrollo con usuarios de prueba; lee sus instrucciones antes de ejecutarla.

## Pendiente en tu cuenta

No se accedió a tu cuenta GitHub/Supabase ni se publicaron cambios. Queda ejecutar la guía y verificar: inicio de sesión real, confirmación y recuperación de correo, permisos con dos usuarios, documentos privados y sincronización en dos dispositivos. La IA generativa requiere desplegar la función y probarla con tu propia clave/facturación de OpenAI. No se consumió una API generativa real durante esta entrega.

El OCR no garantiza fidelidad en toda clase de escaneos, columnas o fórmulas. Los avances que solo existan en el almacenamiento del lector original pueden migrarse desde el navegador que aún los conserve; los datos que ya sincronizaste con la versión 3 mantienen el mismo esquema y cuenta. El tiempo de estudio se registra al finalizar cada sesión; se avisa antes de cerrar una pestaña con sesión activa.
