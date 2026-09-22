# Validación de la entrega

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

25 pruebas en navegador verificaron IndexedDB, separación de invitado/cuentas, CAS y resolución de conflictos, reintentos y cambios mientras se sincroniza, borrado lógico, archivos y MIME, respaldos/corrupción y recuperación tardía de autenticación. El transporte Supabase se simuló de forma controlada para provocar errores y conflictos reproducibles.

El SQL se ejecutó dos veces en PostgreSQL/PGlite para comprobar idempotencia, roles, políticas RLS, revisiones y acceso Storage. Son pruebas de lógica PostgreSQL; no sustituyen la comprobación en el proyecto real de Supabase.

Pruebas del importador, aprendizaje y función de IA validan segmentación, entradas, referencias, selección múltiple, permisos, cuotas y salidas inválidas. La conversión auditada conserva 157 páginas, 1.460 bloques, 21 imágenes, 38 actividades fuente y 71 definiciones; produce 44 preguntas válidas.

## Repetir pruebas

```sh
npm ci
npm test
npm audit --omit=dev
node tests/ui-smoke.mjs
node supabase/tests/store-browser.mjs
```

Las pruebas de navegador requieren Playwright y Chromium (CHROMIUM_PATH para persistencia y CFA_BROWSER para interfaz; Playwright instalado o CODEX_PRIMARY_RUNTIME_NODE_MODULES). El ZIP no incluye ejecutables de navegador. La prueba de SQL usa PGlite instalado aparte, o ejecuta la prueba SQL suministrada en un proyecto de desarrollo con usuarios de prueba; lee sus instrucciones antes de ejecutarla.

## Pendiente en tu cuenta

No se accedió a tu cuenta GitHub/Supabase ni se publicaron cambios. Queda ejecutar la guía y verificar: inicio de sesión real, confirmación y recuperación de correo, permisos con dos usuarios, documentos privados y sincronización en dos dispositivos. La IA generativa requiere desplegar la función y probarla con tu propia clave/facturación de OpenAI. No se consumió una API generativa real durante esta entrega.

El OCR no garantiza fidelidad en toda clase de escaneos, columnas o fórmulas. Los datos del curso anterior no estaban respaldados en la nube: solo pueden migrarse desde el navegador que aún los conserve. El tiempo de estudio se registra al finalizar cada sesión; se avisa antes de cerrar una pestaña con sesión activa.
