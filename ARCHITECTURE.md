# Arquitectura v8: lector ligero, fiel y escalable

## Principio de producto

La web no funciona como un visor PDF. Funciona como una plataforma de aprendizaje: una página refluida por vez, visuales precisos ubicados dentro del flujo pedagógico y una navegación de páginas que permite retomar o saltar sin perderse.

```text
index.html + styles.css + script.js       interfaz responsive, estado y accesibilidad
├── data/course-manifest.js               curso, módulos, lecciones y las 157 páginas
├── data/page-registry.js                 cargador local o remoto de contenido por grupos
├── data/page-content/<grupo>.js          texto refluido, separado por módulo
├── data/visual-registry.js               visual y ubicación pedagógica de cada exhibit
├── data/page-search-index.js             índice de búsqueda cargado solo al buscar
├── data/exercises/<módulo>.js            prácticas cargadas bajo demanda
├── data/glossary.js                      glosario cargado bajo demanda
├── assets/visuals/*.webp                 solo exhibits, tablas, diagramas y figuras necesarios
└── service-worker.js                     caché opcional en HTTPS
```

## Qué no se envía al navegador

- No se incluyen los PDFs originales.
- No se incluye una imagen completa de cada una de las 157 páginas.
- No se crean galerías o respaldos visuales que obliguen a descargar información duplicada.

Las 157 páginas se mantienen en lectura refluida. Los 21 recursos visuales se cargan únicamente en la página que los necesita y el navegador retrasa su descarga hasta que estén cerca del viewport.

## Fidelidad: texto, tabla o visual

Cada elemento se gestiona por tipo:

1. **Texto narrativo** → bloques HTML refluibles, seleccionables y compatibles con traducción, voz, resaltado y notas.
2. **Tabla simple** → tabla HTML semántica solo cuando se puede conservar título, encabezados, columnas y relación entre celdas.
3. **Tabla compleja, diagrama, esquema, fotografía o layout compuesto** → recorte visual original, nítido, con título, leyenda, página de referencia, texto alternativo y zoom integrado.
4. **Exhibit incluido como visual** → se ubica con `insertBefore` o `insertAfter` junto al texto que lo presenta. `skipBlocks` evita mostrar una extracción plana o duplicada cuando puede confundir.

Este enfoque reduce peso y evita el problema de convertir dos columnas o un layout visual en párrafos sin estructura.

## Navegación de páginas

`course-manifest.js` mantiene los rangos de cada sección. El índice se genera desde ese mapa:

- cada módulo puede abrirse o cerrarse;
- cada lección puede desplegar la grilla de sus páginas;
- la página actual se marca con un estado visible;
- las páginas completadas tienen su propio estado;
- el usuario puede ir a cualquier página sin cargar todos los textos previamente.

## Carga progresiva

| Recurso | Cuándo se solicita |
| --- | --- |
| Interfaz, manifiesto y navegación | al abrir la web |
| Texto de lectura | al abrir una página de su grupo/módulo |
| Visual de un exhibit | cuando la página lo necesita y llega al viewport |
| Ejercicios | al abrir Práctica |
| Glosario | al abrir Glosario |
| Índice de búsqueda | al escribir en Buscar |
| Traducción | solo para el fragmento seleccionado |

Los grupos de contenido locales ya tienen un modo remoto opcional en `data/page-registry.js`. Al agregar muchos cursos, conserva el mismo formato y sirve cada grupo desde una API autenticada:

```text
GET /courses/{courseId}/manifest
GET /courses/{courseId}/page-groups/{moduleId}
GET /courses/{courseId}/search-index
GET /courses/{courseId}/exercises/{moduleId}
GET /courses/{courseId}/glossary
GET /courses/{courseId}/visuals/{visualId}.webp
POST /translate
POST /progress
```

## Reglas para crecer a una biblioteca privada

- Mantén los PDFs fuente fuera del bundle público; úsalos para el proceso de preparación y control de calidad.
- Versiona manifiestos y assets visuales con nombres inmutables.
- Conserva los crops de exhibits solo cuando aportan información no reproducible con texto o tabla semántica.
- Protege API y archivos con autenticación cuando el curso tenga derechos restringidos.
- Sincroniza solo progreso, notas, tarjetas y preferencias; no es necesario duplicar el corpus académico en una base de datos de usuario.
- Agrega descarga offline por módulo, no por catálogo completo.
