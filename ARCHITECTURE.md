# Arquitectura escalable del lector

## Objetivo

Evitar que una biblioteca de lecturas extensas cargue todo su contenido, glosarios y ejercicios al abrir una sola página.

## Capa actual: bloques estáticos bajo demanda

La aplicación usa `data/content-registry.js` como adaptador de contenido. En modo `local-chunks`, el adaptador inyecta pequeños `<script>` locales cuando se solicita una lectura. Esta técnica funciona incluso al abrir `index.html` directamente desde el sistema de archivos, donde `fetch()` a archivos JSON suele estar bloqueado por el navegador.

```text
index.html
├── data/content-manifest.js       → navegación y metadatos pequeños
├── data/content-registry.js       → carga y caché de bloques
├── data/sections/<section-id>.js  → texto de cada sección
├── data/exercises/<module-id>.js  → preguntas de cada unidad
├── data/glossary.js               → glosario bajo demanda
└── data/search-index.js           → índice completo, solo al buscar
```

## Cómo añadir otro curso

1. Crea un identificador de curso, por ejemplo `course2`.
2. Genera un manifiesto ligero con módulos, títulos, ids de secciones, rango de páginas y conteos.
3. Almacena una sección por archivo, por ejemplo `data/sections/course2-m1-l1.js`.
4. Almacena los ejercicios de cada módulo en su propio bloque.
5. Extiende el `content-registry` para aceptar el prefijo del curso o publica cada curso en una ruta propia, por ejemplo `/course-2/`.
6. No agregues el texto completo al archivo de interfaz `script.js`.

## Capa recomendada al publicar: Content API

Para una biblioteca con decenas de cursos, usa CDN + API. El cliente ya está preparado para `MODE: "remote-api"`.

| Endpoint | Respuesta esperada |
|---|---|
| `GET /sections/:id` | Un objeto `section` o la sección directamente. |
| `GET /exercises?module=:moduleId` | `{ "exercises": [...] }` o el arreglo directamente. |
| `GET /glossary` | `{ "glossary": [...] }` o el arreglo directamente. |
| `GET /search-index` | `{ "index": [...] }` o el arreglo directamente. |

### Ejemplo de sección

```json
{
  "id": "course2-m1-l1",
  "moduleId": "m1",
  "label": "Lesson 1",
  "title": "Title",
  "pages": [
    { "page": 1, "text": "Original extracted text." }
  ]
}
```

### Reglas de rendimiento

- Devuelve `Cache-Control: public, max-age=31536000, immutable` para recursos con id versionado.
- Versiona el manifiesto y los ids si se corrige el contenido.
- Mantén ejercicios y secciones en requests independientes.
- Carga el índice completo únicamente al iniciar una búsqueda de dos o más caracteres.
- Evita consultar un API de traducción en lote. Traduce solo texto seleccionado y almacena la respuesta por idioma y texto normalizado.
- Para guardar usuarios con cuenta, usa una API distinta para progreso y notas. Para lectura local sin cuenta, conserva `localStorage` e IndexedDB.

## Migración sugerida

1. Mantén `local-chunks` mientras prepares el contenido y valides UX.
2. Publica las rutas JSON en KV, R2 o un origen estático.
3. Configura `MODE: "remote-api"` solo en la versión online.
4. Conserva el formato de datos para que el mismo `script.js` funcione en ambos modos.
