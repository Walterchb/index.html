# Arquitectura de CFA Study Reader

## Aplicación estática, datos privados

`index.html` carga módulos ES locales, sin compilación necesaria para el usuario. `app/main.js` coordina vistas y acciones; `styles.css` define el sistema visual. `app/learning.js` mantiene cálculo de métricas, búsqueda y calendario de tarjetas. La interfaz usa HTML sanitizado con DOMPurify y escapado explícito para texto.

- `app/store.js`: IndexedDB independiente para invitado y cada usuario, transacciones, outbox, sincronización incremental, revisiones optimistas, tombstones, conflictos y respaldos con binarios/SHA256.
- `app/auth.js`: Supabase Auth, sesión persistente, recuperación de contraseña y callbacks diferidos para evitar locks del SDK.
- `app/book-importer.js`: analiza metadatos, marcadores y etiquetas del PDF completo; cada página física permanece representada. La extracción es auxiliar, con avisos de límites y disposición compleja.
- `app/book-course.js`: valida rangos y mapa completo, construye registros atómicos y calcula cobertura independiente del avance.
- `app/pdf-reader.js` + CSS: renderiza el PDF original en canvas HiDPI y capa de texto; navegación, enlaces, zoom, giro y descargas. El visor se conserva al actualizar notas/avance. Caché acotada por identidad de Blob; cambio de cuenta destruye el visor activo.
- `app/importer.js`: PDF.js, segmentación por página, geometría de lectura, validación, OCR Tesseract y cancelación. Los cortes por página hacen revisables las referencias.
- `app/ai.js` + `supabase/functions/study-ai/index.ts`: generación explícita, usuario verificado, correos permitidos, límites de entrada, cuota atómica y salida estructurada contrastada con páginas proporcionadas.
- `app/legacy.js`: migración no destructiva y copia exacta del almacenamiento del lector anterior.
- `app/seed.js`: curso de bienvenida propio; solo se inserta después de confirmar una cuenta vacía o en un invitado nuevo.

## Modelo de datos

Tipos de registro: courses, modules, lessons, documents, cards, questions, progress, notes, attempts, sessions, settings. Cada registro tiene un ID estable. La tabla `study_records` agrega dueño, revisión del servidor, payload JSONB y borrado lógico. El RPC `apply_study_change` exige la revisión previa esperada y es idempotente ante reintentos. Las políticas RLS se aplican también a lecturas directas.

Archivos inmutables en Storage `cfa-documents`, ruta `<userId>/<fileId>`. No se suben claves secretas al navegador. Una cuenta no puede leer ni sobrescribir fuentes de otra. El borrado de la ficha no elimina físicamente fuentes: permite recuperación, pero liberar espacio requiere limpiar Storage tras un respaldo. MIME permitidos restringidos; HTML/SVG ejecutables no se abren como adjuntos.

La sincronización compara metadatos de revisiones y descarga solo cuerpos nuevos o cambiados. La edición local se conserva si otra versión llega antes de enviar. Conflictos explícitos se resuelven en Ajustes, con copias conservadas en el respaldo. Una edición abierta verifica que el registro no haya cambiado antes de guardar.

## Libros completos

Un documento `kind: pdf-book` conserva `fileId`, SHA256, total de páginas, etiquetas, marcadores y avisos de reconocimiento. Un curso apunta a `sourceDocumentId`; cada lección `kind: pdf-page` apunta a `documentId` y una `sourcePage` física inmutable. El nombre impreso no cambia esa referencia. Los módulos guardan rangos propuestos y origen de estructura.

`putBatch` crea el curso y su mapa en una sola transacción local; la sincronización conserva las revisiones individuales de cada registro. Al reorganizar, actualiza módulos/páginas y materiales vinculados, incluyendo tombstones de módulos retirados, en la misma transacción. Los IDs de página se conservan para mantener notas y progreso. No hay migración SQL ni cambio de nombre de IndexedDB/auth/backup: todos los campos nuevos viajan en payloads JSONB existentes.

La nube sincroniza registros de manera incremental. En un segundo dispositivo debe terminar la sincronización antes de considerar completa la descarga del curso. La fuente se almacena primero como archivo inmutable; una importación cancelada antes del lote de registros puede dejar un archivo local sin referencia, nunca un curso parcial. El archivo queda disponible para recuperación/limpieza posterior.

## Aprendizaje

Marcar una lección como estudiada mide cobertura, no dominio. Aciertos usa todos los intentos. Práctica permite una o varias respuestas, explicación posterior y filtro de errores/sin responder. Las tarjetas usan intervalos simples adaptados de SM-2; Otra vez=10min, Difícil reduce el salto, Bien/Fácil aumentan intervalo. No es una estimación calibrada de probabilidad de aprobar un examen.

## Escala y límites

La biblioteca activa se representa en memoria para buscar sin servidor. Adecuada para estudio personal; bibliotecas de miles de documentos muy grandes requerirán paginación e índices del servidor. El OCR corre en WebAssembly local y puede tardar en equipos modestos. Los respaldos JSON incluyen binarios base64, por lo que pueden ser grandes y consumir memoria. Ningún plan gratuito garantiza disponibilidad perpetua: consulta la guía para planes, pausas y copias externas.

## Publicación y actualizaciones

`node scripts/build.mjs` copia una lista explícita al directorio dist. GitHub Actions publica ese directorio. Nunca publica SQL, claves privadas, backups, corpus de migración ni node_modules. El service worker guarda únicamente recursos estáticos del propio sitio y limpia solo cachés propias o del lector anterior. Los datos privados siguen en IndexedDB por cuenta; los requests a Supabase nunca se cachean en el service worker.

Al actualizar `vendor/`, fijar versiones, regenerar, revisar licencias, ejecutar auditoría de dependencias y pruebas. Al modificar la estructura persistida, subir versión IndexedDB y escribir migración compatible. Al cambiar tablas/RPC, usar una migración SQL y probar aislamiento entre dos usuarios.
