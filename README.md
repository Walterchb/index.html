# Course 1 · Study Reader — edición optimizada

Este lector está diseñado para abrirse localmente desde `index.html`, sin servidor ni instalación. La edición actual mejora la interfaz de lectura y práctica, y separa el contenido académico en bloques pequeños que se cargan solo cuando el usuario los necesita.

## Abrir la web

1. Descomprime el archivo ZIP sin modificar la estructura de carpetas.
2. Abre `index.html` en Chrome, Edge o Firefox.
3. Mantén la carpeta `data/` junto a `index.html`: contiene las lecturas, ejercicios, glosario e índice de búsqueda.

## Qué cambió en esta versión

- **Lector más estructurado**: cabecera de sección, métrica de palabras, estado de avance, tarjetas de contenido, panel lateral de estudio y modo enfoque.
- **Prácticas más claras**: ruta visual de cuatro niveles, filtros por unidad, tarjetas de respuesta, feedback después del intento y evaluación con puntaje.
- **Glosario más ágil**: carga al abrirlo, muestra inicial limitada a 24 entradas y botón “Mostrar más”.
- **Rendimiento escalable**: al abrir la web no se carga el libro completo, los ejercicios, el glosario ni el buscador de texto completo.
- **Caché de traducciones**: las traducciones ya solicitadas se guardan en IndexedDB del navegador; no vuelven a requerir una llamada a la API.
- **Estado ligero**: notas, progreso, favoritos y respuestas se guardan de forma compacta en `localStorage`.

## Arquitectura de contenido bajo demanda

| Recurso | Cuándo se carga |
|---|---|
| `data/content-manifest.js` | Al iniciar. Solo contiene metadatos de navegación. |
| `data/sections/*.js` | Al abrir una sección concreta. |
| `data/exercises/*.js` | Al entrar a Práctica y elegir una unidad. |
| `data/glossary.js` | Al abrir el Glosario. |
| `data/search-index.js` | Solo la primera vez que se usa el buscador global. |

Esta estructura permite añadir lecturas extensas sin convertir `script.js` en un archivo pesado. Para una nueva lectura, agrega sus secciones como nuevos archivos dentro de `data/sections/` y actualiza el manifiesto. Consulta `ARCHITECTURE.md` para el esquema recomendado y una alternativa mediante API.

## Traducción

La configuración está al inicio de `script.js`, en `TRANSLATION_CONFIG`.

### Opción actual: MyMemory sin clave

```js
PROVIDER: "mymemory"
```

Funciona para palabras, oraciones y párrafos cortos. Es un servicio público compartido, por lo que puede responder lento o tener límites temporales. Por eso el lector envía únicamente el fragmento seleccionado, cancela solicitudes anteriores y guarda resultados locales.

### Opción rápida en tu red: LibreTranslate local

Con Docker instalado, ejecuta:

```bash
docker run -d --name libretranslate -p 5000:5000 libretranslate/libretranslate
```

Luego reemplaza la configuración en `script.js` por:

```js
PROVIDER: "libretranslate",
TRANSLATION_API_URL: "http://localhost:5000/translate",
API_KEY: "",
```

Esto evita depender de un servicio público. El rendimiento dependerá de tu computadora; es la alternativa más privada para traducción local.

### Opción recomendada para una web publicada: proxy propio

No coloques claves de DeepL, Google, Azure u otro proveedor dentro de `script.js`. Configura un proxy o Cloudflare Worker y usa:

```js
PROVIDER: "proxy",
TRANSLATION_API_URL: "https://tu-dominio.com/api/translate",
API_KEY: "",
```

El proxy debe recibir un JSON con `q`, `source`, `target` y `format`, y responder al menos con:

```json
{ "translatedText": "traducción en español" }
```

## API de contenido para una biblioteca grande

El modo local es el predeterminado porque funciona al abrir el archivo. Si publicas muchas lecturas, cambia la configuración incluida en `index.html`:

```js
window.CONTENT_CONFIG = {
  MODE: "remote-api",
  API_BASE_URL: "https://tu-dominio.com/api"
};
```

El lector solicitará solo los endpoints que necesita:

- `GET /sections/:id`
- `GET /exercises?module=m1`
- `GET /glossary`
- `GET /search-index`

En `api/` hay un Worker de Cloudflare de referencia y una utilidad para exportar los bloques locales a JSON antes de subirlos a KV o R2.

## Privacidad

El contenido de los PDFs no se envía automáticamente a internet. Solo el fragmento que elijas traducir se transmite al proveedor de traducción configurado. Progreso, notas, favoritos, palabras guardadas y traducciones quedan almacenados en el navegador local.
