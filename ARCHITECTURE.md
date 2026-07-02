# Arquitectura del lector: rápida, fiel y escalable

## Principio

La interfaz no contiene el libro completo ni todas las imágenes en un solo archivo. El lector separa texto, visuales, búsqueda, práctica y glosario para que pueda abrir rápido hoy y crecer hacia una biblioteca privada después.

```text
index.html + styles.css + script.js       interfaz, accesibilidad y comportamiento
├── data/course-manifest.js               mapa del curso, módulos y secciones
├── data/page-registry.js                 cargador de texto por grupo de páginas
├── data/page-content/<grupo>.js          contenido refluido de cada página
├── data/visual-registry.js               ubicación y metadata de cada visual inline
├── data/page-search-index.js             índice completo, cargado al buscar
├── data/exercises/<módulo>.js            prácticas por módulo
├── data/glossary.js                      glosario bajo demanda
├── assets/visuals/*.webp                 crops nítidos de exhibits/tablas/diagramas
├── assets/source-pages/p###.webp         vista completa de cada página fuente
├── assets/source/*.pdf                   copias locales de referencia
└── service-worker.js                     caché para uso instalado/HTTPS
```

## Fidelity-first: texto versus visual

Cada recurso se decide de forma individual:

1. **Texto narrativo** se convierte a bloques refluibles, seleccionables y compatibles con traducción/voz.
2. **Tabla simple** se reconstruye como tabla HTML semántica solo cuando se puede mantener con seguridad título, encabezados, celdas, orden y relaciones.
3. **Tabla compleja, esquema, diagrama, fotografía o layout compuesto** se mantiene como una imagen recortada de alta resolución, localizada junto al texto que la presenta. Incluye título, leyenda, página fuente, texto alternativo y ampliación integrada.
4. **Página fuente completa** está siempre disponible dentro del módulo Fuente visual; es un respaldo interno de fidelidad, no un requisito para leer el curso.

Esto evita el problema típico de extraer una tabla como párrafos intercalados y alterar las columnas o el significado.

## Carga progresiva

- La app abre con un manifiesto pequeño y una interfaz estática.
- El texto se pide por grupo de páginas (`front`, `m1`, `m2`, etc.).
- Los visuales inline utilizan `loading="lazy"`; no se descargan todos al abrir el curso.
- Las 157 páginas fuente solo se cargan si la persona abre Fuente visual.
- Práctica, glosario y búsqueda se solicitan únicamente al usarlos.
- Las traducciones se almacenan en IndexedDB, de modo que un fragmento ya consultado no se vuelve a enviar al servicio.

## Modelo de página

```js
{
  page: 7,
  sectionId: "m1-l1",
  moduleId: "m1",
  blocks: [/* texto refluido */],
  plainText: "...",
  hasVisual: true
}
```

`data/visual-registry.js` añade el vínculo pedagógico entre una página y su visual:

```js
{
  kind: "semantic-table", // o "figure"
  insertAfter: 0,
  asset: "assets/visuals/p007-exhibit-1-debt-equity.webp",
  sourcePage: 7,
  title: "Debt and Equity Securities",
  alt: "...",
  skipBlocks: [/* solo cuando el visual reemplaza extracción desordenada */]
}
```

Con `skipBlocks`, una tabla visual no se duplica ni se muestra como texto mal ordenado. Cuando se reconstruye una tabla semántica, el mismo registro mantiene una imagen original ampliable para auditoría visual.

## Agregar otra lectura

1. Mantén el PDF original en almacenamiento privado.
2. Renderiza la página fuente y revisa visualmente la extracción.
3. Separa texto narrativo, exhibits y ejercicios por páginas/secciones.
4. Revisa cada tabla. Usa HTML solo si la reconstrucción respeta la estructura; de lo contrario, usa un visual nítido inline.
5. Crea un registro visual con página, ubicación (`insertBefore` / `insertAfter`), título, leyenda y texto alternativo.
6. Divide los datos en grupos pequeños y crea un índice de búsqueda diferido.
7. Versiona el curso y el `STORAGE_KEY` cuando un cambio de estructura pueda invalidar los datos locales.

## Evolución: biblioteca privada y API

Para uno o pocos cursos, los archivos estáticos son simples y rápidos. Para muchos cursos, múltiples dispositivos o sincronización, sirve los mismos recursos desde almacenamiento privado y agrega una API:

```text
Cliente PWA privado
   ├── GET /courses/course-1/manifest
   ├── GET /courses/course-1/page-groups/m1
   ├── GET /courses/course-1/visual-registry
   ├── GET /courses/course-1/search-index
   ├── GET /courses/course-1/exercises/m1
   ├── GET /courses/course-1/glossary
   ├── GET /courses/course-1/visuals/p007.webp
   ├── GET /courses/course-1/source-pages/007.webp
   ├── POST /translate
   └── POST /progress
```

### Reglas para una versión privada

- Protege los PDFs y assets con autenticación; no expongas materiales de curso en una publicación pública.
- Usa nombres de recursos versionados y caché larga para assets inmutables.
- Mantén la traducción detrás de un proxy para no exponer claves ni permitir abuso.
- Sincroniza progreso, notas y tarjetas; no es necesario copiar el texto académico a una base de datos de usuario.
- Permite descargar módulos concretos para offline en vez de todo el catálogo.

## PWA y trayectos

El service worker guarda la interfaz al instalar la app y conserva los recursos visitados. Antes de un trayecto largo, abre las lecciones y visuales que planees revisar mientras tengas Wi-Fi. Una futura API puede ofrecer "Descargar este módulo" con una estimación de tamaño antes de guardar todos sus textos y visuales.
