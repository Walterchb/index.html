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

## Traducción al español: ya activada en modo gratuito

La versión actual usa **MyMemory** de forma predeterminada para traducir el texto que selecciones. No requiere cuenta ni clave para usarlo en modo personal. La página necesita conexión a internet solo al traducir; la lectura, el glosario y el progreso continúan funcionando localmente.

- Puedes seleccionar una palabra, frase, oración o párrafo corto y elegir **Traducir**.
- La aplicación envía únicamente el fragmento seleccionado al servicio; no envía el libro completo.
- MyMemory permite hasta **5,000 caracteres diarios** en uso anónimo. Si deseas mayor uso, se puede configurar un correo en `MYMEMORY_EMAIL`; consulta sus condiciones antes de hacerlo.
- Para evitar solicitudes excesivas, la web limita cada traducción a 1,800 caracteres.

La configuración está al inicio de `script.js`:

```js
const TRANSLATION_CONFIG = {
  PROVIDER: "mymemory",
  TRANSLATION_API_URL: "",
  API_KEY: "",
  SOURCE_LANGUAGE: "en",
  TARGET_LANGUAGE: "es",
  MYMEMORY_EMAIL: "",
  MAX_CHARS_PER_REQUEST: 1800
};
```

### Alternativa sin cuotas de un servicio público: LibreTranslate local

Para usar una solución gratuita y autoalojada, instala Docker Desktop y ejecuta:

```bash
docker run --rm -p 5000:5000 libretranslate/libretranslate --load-only en,es
```

Después cambia la configuración a:

```js
const TRANSLATION_CONFIG = {
  PROVIDER: "libretranslate",
  TRANSLATION_API_URL: "http://localhost:5000/translate",
  API_KEY: "",
  SOURCE_LANGUAGE: "en",
  TARGET_LANGUAGE: "es",
  MYMEMORY_EMAIL: "",
  MAX_CHARS_PER_REQUEST: 1800
};
```

LibreTranslate es software libre y se ejecuta en tu equipo. La primera ejecución puede descargar modelos de idiomas; después podrás utilizarlo desde la web local mientras el contenedor esté activo.

### Opción de mejor calidad con clave protegida

DeepL API Free ofrece hasta 500,000 caracteres mensuales gratuitos, pero necesita una clave. No coloques esa clave en `script.js`, porque cualquier persona podría verla. Para esa alternativa, configura un proxy del lado del servidor —por ejemplo, un Cloudflare Worker— y usa `PROVIDER: "proxy"` junto con la URL del Worker.

## Cobertura del material

- Se incorporan los 5 módulos, 24 lecciones y los resúmenes del paquete principal.
- Se identifican 38 preguntas y actividades del material, incluidas las actividades de Big Data y riesgos de seguros que aparecen dentro de las lecciones.
- Las respuestas/feedback del PDF se muestran únicamente después de verificar una respuesta en Práctica.
- El glosario contiene las 71 entradas del PDF complementario.
- Las imágenes, fotografías, diagramas y el diseño de tablas complejas del PDF no se incrustaron; el lector conserva títulos, texto disponible y páginas de origen.
- El paquete señala que los ejercicios calificados por computadora, videos y otras actividades se encuentran solo en el curso online. Esos recursos no están en los PDFs y no se añadieron.
