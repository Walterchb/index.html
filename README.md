# Course 1 Study Reader

Lector local para **Investment Foundations — Course 1: Industry Overview and Structure**.

## Abrir localmente

1. Descarga y descomprime `course1-study-reader.zip`.
2. Abre la carpeta resultante.
3. Haz doble clic en `index.html`.

No se requieren servidores, instalaciones ni conexión para leer el contenido, usar el glosario, responder los ejercicios, guardar notas, marcar palabras o conservar el progreso. Todo se guarda en `localStorage` del navegador usado.

## Archivos

- `index.html`: estructura de la interfaz.
- `styles.css`: estilos responsive, modo claro/oscuro y accesibilidad.
- `script.js`: contenido extraído, navegación, práctica, glosario y persistencia local.
- `assets/`: reservada para recursos locales adicionales. No se han vuelto a empaquetar los PDFs originales.

## Configurar traducción al español

La web no incluye ninguna clave real. La configuración está al inicio de `script.js`:

```js
const TRANSLATION_CONFIG = {
  TRANSLATION_API_URL: "",
  API_KEY: "",
  SOURCE_LANGUAGE: "en",
  TARGET_LANGUAGE: "es"
};
```

Para producción, configura `TRANSLATION_API_URL` con la URL de un **proxy propio del lado del servidor** que proteja la clave de tu proveedor de traducción. No coloques una clave privada directamente en una página HTML estática.

La implementación realiza un `POST` JSON genérico:

```json
{
  "q": "text to translate",
  "source": "en",
  "target": "es",
  "format": "text"
}
```

Reconoce respuestas de estas formas:

```json
{ "translatedText": "..." }
```

```json
{ "translation": "..." }
```

```json
{ "data": { "translations": [{ "translatedText": "..." }] } }
```

Mientras `TRANSLATION_API_URL` permanezca vacío, la web muestra un **modo de prueba** claramente identificado: conserva el texto original y explica que la traducción no está configurada. De esa manera no agrega traducciones ni contenido académico que no figure en los documentos.

## Cobertura del material

- Se incorporan los 5 módulos, 24 lecciones y los resúmenes del paquete principal.
- Se identifican 38 preguntas y actividades del material, incluidas las actividades de Big Data y riesgos de seguros que aparecen dentro de las lecciones.
- Las respuestas/feedback del PDF se muestran únicamente después de verificar una respuesta en Práctica.
- El glosario contiene las 71 entradas del PDF complementario.
- Las imágenes, fotografías, diagramas y el diseño de tablas complejas del PDF no se incrustaron; el lector conserva títulos, texto disponible y páginas de origen.
- El paquete señala que los ejercicios calificados por computadora, videos y otras actividades se encuentran solo en el curso online. Esos recursos no están en los PDFs y no se añadieron.
