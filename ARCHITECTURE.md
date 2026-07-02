# Arquitectura del lector: rápida hoy y escalable después

## Principio

El lector separa la experiencia de estudio de los recursos pesados. No pone el libro completo, los ejercicios, el glosario, las imágenes y el índice de búsqueda en un solo `script.js`.

```text
index.html + styles.css + script.js       interfaz y comportamiento
├── data/course-manifest.js               navegación, módulos y 157 páginas
├── data/page-registry.js                 cargador de texto por grupo de páginas
├── data/page-content/<grupo>.js          texto refluido de cada página
├── data/page-search-index.js             índice completo, solo al buscar
├── data/exercises/<módulo>.js            práctica por módulo
├── data/glossary.js                      glosario bajo demanda
├── assets/source-pages/p###.webp         fuente visual exacta por página
├── assets/source/*.pdf                   PDFs originales locales
└── service-worker.js                     caché de la interfaz y recursos visitados
```

## Por qué no se satura

- La aplicación carga un **manifiesto pequeño** al inicio.
- El texto de lectura se carga por grupos de páginas: `front`, `m1`, `m2`, `m3`, `m4`, `m5`.
- Las imágenes de las páginas originales no se cargan hasta que se abre **Fuente visual**.
- El índice completo se difiere hasta que el usuario busca.
- Ejercicios y glosario se solicitan únicamente cuando se usan.
- El navegador puede conservar los recursos visitados mediante el service worker cuando se sirve desde HTTPS.

El resultado conserva la posibilidad de llegar a cualquier página exacta, sin obligar al teléfono a descargar y renderizar simultáneamente las 157 páginas visuales.

## Modelo de página

Cada página mantiene tres referencias:

```js
{
  page: 24,
  sectionId: "m1-l4",
  moduleId: "m1",
  blocks: [/* texto refluido */],
  plainText: "...",
  hasVisual: true,
  sourceImage: "assets/source-pages/p024.webp"
}
```

La vista **Lectura** usa `blocks`. La vista **Fuente visual** usa la imagen local exacta de la misma página. El PDF original sigue disponible como respaldo y referencia de página.

## Añadir otra lectura sin volver pesado el inicio

1. Guarda el PDF original dentro de `assets/source/`.
2. Genera una imagen visual por página en `assets/source-pages/` o en una carpeta exclusiva por curso.
3. Crea un manifiesto con módulos, secciones, grupos de páginas y rutas.
4. Divide el texto refluido en grupos razonables; una opción práctica es un grupo por módulo o por 20-40 páginas.
5. Crea un índice de búsqueda separado y difiere su carga.
6. Mantén ejercicios y glosario en archivos independientes.
7. Versiona cada curso y cada manifiesto para que una actualización no rompa el progreso existente.

No incorpores el texto del curso dentro de `script.js`; el archivo de interfaz debe seguir siendo pequeño y estable.

## Evolución recomendada: biblioteca privada con API

Para pocos cursos, los bloques estáticos locales funcionan bien y tienen la ventaja de abrirse desde `file://` en computadora. Para decenas de cursos, varios dispositivos o sincronización de notas, sirve los mismos recursos desde almacenamiento privado y agrega una API.

```text
Cliente PWA privado
   ├── GET /courses/course-1/manifest
   ├── GET /courses/course-1/page-groups/m1
   ├── GET /courses/course-1/search-index
   ├── GET /courses/course-1/exercises/m1
   ├── GET /courses/course-1/glossary
   ├── GET /courses/course-1/source-pages/024.webp
   ├── POST /translate          (proxy seguro)
   └── POST /progress           (solo si habrá cuenta y sincronización)
```

### Configuración que reconoce el lector

Antes de cargar `data/page-registry.js` y `data/content-registry.js`, define:

```html
<script>
  window.COURSE_DATA_CONFIG = {
    MODE: "remote-api",
    API_BASE_URL: "https://tu-dominio-privado.com/api",
    COURSE_ID: "course-1"
  };
</script>
```

El código actual seguirá usando el manifiesto local para el mapa de navegación, pero pedirá bajo demanda los grupos de páginas, ejercicios, glosario e índice desde la API. `api/worker.private.example.js` es una referencia para esos endpoints.

### Reglas para esa API

- Protege el origen con autenticación; no expongas materiales de curso en un repositorio o sitio público.
- Usa cache versionada para manifiestos, grupos de páginas e imágenes (`Cache-Control: public, max-age=31536000, immutable` para archivos con versión).
- Sirve las imágenes visuales desde almacenamiento de objetos o CDN privado.
- Usa un proxy de traducción para mantener las claves fuera del navegador y limitar caracteres, frecuencia y abuso.
- Sincroniza solo progreso, notas y tarjetas; el texto del curso permanece en recursos de solo lectura.
- Conserva una base local (`localStorage`/IndexedDB) para que el lector continúe funcionando cuando no haya señal.

## PWA y trayectos

El service worker actual usa una estrategia práctica:

- La interfaz se guarda al abrir la app.
- Páginas de texto, ejercicios y glosario se reutilizan desde caché tras visitarlos.
- Las páginas visuales se guardan cuando el estudiante las abre, en vez de ocupar espacio con las 157 al inicio.

Antes de un trayecto largo, abre las lecciones y exhibits que planees estudiar mientras tengas Wi-Fi. Para descargar un curso completo bajo demanda, una futura API puede incorporar un botón de "Disponible sin conexión" que muestre el tamaño a descargar y permita elegir módulos.
