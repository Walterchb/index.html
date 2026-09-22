# Importar material y convertirlo en estudio

## Flujo recomendado

1. Crea un curso y sus módulos en la biblioteca.
2. Abre la importación, elige el módulo de destino y selecciona el documento.
3. Si es un PDF con texto seleccionable, deja OCR desactivado. Para un escaneo o una imagen, activa OCR.
4. Espera la extracción. La pantalla muestra el avance; puedes cancelar. Revisa las advertencias.
5. Revisa y corrige títulos, orden y texto antes de guardar las lecciones. Los borradores automáticos no son material verificado.
6. Usa las tarjetas y la práctica para comprobar lo aprendido. Generar material con IA requiere una acción separada y la configuración opcional descrita en `GUIA_CONFIGURACION.md`.

## Qué hace cada motor

| Función | Procesamiento | Revisión necesaria |
| --- | --- | --- |
| PDF con texto | PDF.js dentro del navegador; conserva números de página y agrupa el texto por posición | Columnas, tablas, superíndices, fórmulas y gráficos |
| PDF escaneado e imágenes | Tesseract OCR dentro del navegador, en inglés y español | Cifras, signos, fórmulas y texto de baja resolución |
| TXT / Markdown | Lectura UTF-8, detección de encabezados y segmentación por párrafos | Jerarquía de títulos y división final |
| División en lecciones | Reglas locales para títulos, márgenes repetidos y bloques de hasta unas 5.500 letras/caracteres; mantiene el límite de cada página | Confirmar que cada bloque tenga sentido por sí mismo |
| Tarjetas sugeridas | Extracción local de definiciones explícitas; no usa IA | La pregunta y su respuesta se deben revisar |
| Resumen / tarjetas / preguntas con IA | Texto seleccionado enviado a la función privada `study-ai` y a OpenAI | Exactitud, citas, cálculos, alternativas y explicación |

La extracción por sí sola no sube el archivo. El guardado del original y la sincronización son acciones de la aplicación. La IA recibe únicamente el lote de texto seleccionado y sus números de página; el motor local no envía automáticamente tus documentos a OpenAI.

## Límites explícitos

- Archivo: hasta **40 MB** para mantener el mismo límite que el almacenamiento privado configurado.
- PDF: hasta **1.000 páginas por importación** y hasta **3 millones de caracteres**. Divide documentos mayores.
- OCR: hasta **10 páginas con poco texto por lote**. Las páginas con texto seleccionable se extraen normalmente y no consumen ese límite. Si queda texto sin reconocer, el importador indica las páginas pendientes; usa otro rango o divide el PDF.
- IA: hasta **50 páginas y 40.000 caracteres por solicitud**. No se recorta el material en silencio: un lote demasiado grande se rechaza para que lo dividas.
- IA: hasta **20 intentos diarios por usuario**, reiniciados a las 00:00 UTC. Los intentos fallidos después de reservar el cupo también cuentan. La salida está limitada a 4.500 tokens, hasta 12 tarjetas y hasta 8 preguntas por solicitud.

Los números de página son los físicos del archivo (la primera hoja es página 1), que pueden diferir de la numeración impresa del libro. En TXT y Markdown todo pertenece a la página 1.

## OCR y conexión

El motor completo se incluye en `vendor`: Tesseract.js, su worker, el núcleo WebAssembly y los idiomas inglés/español. En la primera ejecución, el navegador descarga esos archivos **desde tu propia web**. No depende de un CDN externo ni requiere una clave de OCR. Si los archivos faltan o la descarga falla, se muestra un error; no se sustituye el reconocimiento por texto inventado. La lectura de PDF con texto también usa archivos PDF.js locales.

No necesitas cambiar las rutas incluidas. Si decides alojar el motor o los idiomas en otra ruta de tu dominio, conserva todos los archivos y las licencias y configura rutas absolutas completas:

```js
// Dentro de window.CFA_CONFIG:
ocr: {
  workerPath: 'https://TU-DOMINIO/TU-RUTA/vendor/tesseract-worker.min.js',
  corePath: 'https://TU-DOMINIO/TU-RUTA/vendor/tesseract-core',
  langPath: 'https://TU-DOMINIO/TU-RUTA/vendor/tessdata'
}
```

`corePath` debe ser una carpeta con todas las variantes del núcleo, no un único archivo JavaScript. `langPath` no lleva `/` final. Los valores predeterminados apuntan a `vendor/tesseract-core` (6.1.2) y `vendor/tessdata` dentro de la web. El reconocimiento se realiza en tu dispositivo. Se necesita conexión inicial a tu sitio para descargar estos recursos; no se promete OCR sin conexión si aún no se descargaron. Las fuentes y licencias de los datos se detallan en `vendor/tessdata/SOURCES.md`.

## IA opcional: comportamiento y revisión

La función autentica cada solicitud contra Supabase, exige correo verificado y comprueba que el correo esté en `AI_ALLOWED_EMAILS`. La clave OpenAI se almacena solo como secreto del servidor. Antes de contactar al proveedor, se reserva de forma atómica el cupo diario en `ai_usage`. Esa tabla guarda contadores; no guarda textos ni respuestas.

La generación usa Responses API con JSON Schema estricto y `store: false`. El servidor valida los campos, las alternativas y que las páginas citadas existan en el lote. Esta validación de estructura no demuestra que la explicación financiera sea correcta. Comprueba cada borrador contra el original antes de incorporarlo a tu curso. Las preguntas generadas no se presentan como preguntas oficiales del CFA Institute.

`store: false` evita almacenar la respuesta como objeto recuperable de Responses API; no equivale a una promesa de retención cero del proveedor. Revisa sus condiciones de datos si vas a cargar contenido sensible.

La configuración y los costos de la API son independientes de una suscripción a ChatGPT. Configura presupuesto y alertas en el proyecto OpenAI. Cambia `OPENAI_MODEL` en los secretos si tu cuenta utiliza otro modelo compatible con Responses y salidas estructuradas.

## Intercambio estructurado para desarrolladores

El módulo `app/importer.js` exporta `validateStructuredImport(input)`, que valida este formato sin aceptar IDs ni campos de propietario externos:

```json
{
  "title": "Quantitative Methods",
  "description": "Mi material revisado",
  "modules": [
    {
      "title": "Time Value of Money",
      "lessons": [
        { "title": "Valor presente", "text": "Contenido de la lección…" }
      ]
    }
  ]
}
```

Esta utilidad admite hasta 100 módulos, 2.000 lecciones y 3 millones de caracteres. Es un contrato para extender el importador; el respaldo completo de la aplicación utiliza su propio formato y debe restaurarse desde la opción de respaldo.

## Referencias técnicas

- [Ejemplos oficiales de PDF.js](https://mozilla.github.io/pdf.js/examples/).
- [API oficial de Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/api.md).
- [OpenAI: salidas estructuradas](https://developers.openai.com/api/docs/guides/structured-outputs).
- [OpenAI: controles de datos](https://developers.openai.com/api/docs/guides/your-data).

Se verificaron los contratos de documentación y se probó en Chromium la extracción de un PDF real de tres páginas (incluido un rango parcial) y el OCR real de una imagen usando los dos idiomas incluidos. El despliegue real de Supabase/OpenAI requiere tus credenciales; no se ha ejecutado una solicitud facturable en tu cuenta.
