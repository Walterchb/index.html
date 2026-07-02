# Course 1 Study Reader - edición de lectura móvil

Lector de estudio local para **Investment Foundations - Course 1: Industry Overview and Structure**. Está pensado para reemplazar la fricción de navegar un PDF largo desde el celular: muestra texto refluido y legible, pero conserva una vista visual exacta de cada página cuando necesites revisar un cuadro, tabla, imagen, figura, respuesta o detalle de diseño del material original.

## Abrirlo

1. Descomprime el ZIP sin cambiar la estructura de carpetas.
2. Abre `index.html` con Chrome, Edge o Firefox.
3. Mantén `assets/` y `data/` en la misma carpeta que `index.html`.

La lectura, el índice, las prácticas, el glosario, las notas y el progreso funcionan sin conexión. La traducción requiere internet o un servicio local configurado.

## Qué contiene

- **157 páginas del reading packet**, mapeadas una por una.
- **Lectura refluida**: texto del PDF con tipografía, ancho de línea, espacio y jerarquía pensados para pantallas pequeñas.
- **Fuente visual**: las 157 páginas originales están incluidas como imágenes WebP locales de alta resolución. Ahí se ven las tablas, exhibits, diagramas, fotos, cuadros, respuestas y composición original tal como aparece en el PDF.
- **PDF original local**: está en `assets/source/course-1-original.pdf`; también se incluye el PDF del glosario.
- **Prácticas y glosario**: mantienen el material disponible en los documentos, con progreso guardado en el navegador.

> La lectura refluida prioriza la comodidad. Para cualquier tabla, figura, layout complejo o detalle que deba verificarse visualmente, usa la pestaña **Fuente visual**. El botón **PDF original** abre el documento local en la página correspondiente.

## Uso recomendado para estudiar en trayectos

- Usa **Lectura** como modo principal: una página por vez, texto grande y controles de tamaño.
- Toca **Marcar leída** antes de avanzar; el progreso se conserva localmente.
- Guarda páginas importantes con el icono de guardado y añade una nota corta con la idea que debas repasar.
- Selecciona una palabra, frase o párrafo para traducir, escucharlo, copiarlo, resaltarlo o guardarlo.
- Cuando un párrafo mencione un *Exhibit*, una tabla o una imagen, abre **Fuente visual** para verla sin salir de la página actual.
- En la pestaña **Práctica**, responde primero y recién después revisa la explicación y la referencia de origen.

## Rendimiento y carga progresiva

El lector no descarga todo al abrirse:

| Recurso | Momento de carga |
|---|---|
| Interfaz, índice y mapa de páginas | Al iniciar |
| Texto refluido | Solo el bloque del módulo que estás leyendo |
| Página visual, tabla o imagen | Solo al abrir **Fuente visual** de esa página |
| Ejercicios de una unidad | Al entrar a Práctica |
| Glosario | Al abrir Glosario |
| Índice de búsqueda completo | Solo cuando usas la búsqueda global |

Esta organización evita que una biblioteca futura de lecturas se convierta en un único archivo pesado. Las páginas visitadas quedan en la caché del navegador cuando la app se sirve desde un origen privado con HTTPS.

## Uso móvil y sin conexión

Para el uso más cómodo en un teléfono, publica esta carpeta **en un origen privado con HTTPS** y abre la web una vez con Wi-Fi. El `service-worker.js` guardará la interfaz y las páginas que visites; las páginas visuales se almacenan cuando las abres. Luego puedes usar el lector en el bus o taxi incluso si pierdes la señal, siempre que esos recursos ya se hayan visitado.

Abrir `index.html` directamente también funciona para lectura local en computadora. Algunos navegadores no permiten instalar una aplicación web ni usar caché avanzada desde `file://`; por eso el modo privado con HTTPS es mejor para el celular.

## Traducción

La configuración está al final de `index.html`, dentro de `window.TRANSLATION_CONFIG`.

### Opción incluida: MyMemory

```js
window.TRANSLATION_CONFIG = {
  PROVIDER: "mymemory",
  PROXY_URL: "",
  LIBRETRANSLATE_URL: "",
  MAX_CHARS: 1400,
  TIMEOUT_MS: 9000
};
```

El lector envía únicamente el fragmento seleccionado. Cada traducción se guarda en IndexedDB para no repetir la consulta. MyMemory es útil para fragmentos cortos, pero puede tener límites y respuesta variable al ser un servicio público.

### Alternativa privada: proxy propio o LibreTranslate

No pongas claves de DeepL, Google, Azure u otros proveedores dentro de los archivos del navegador. Para una biblioteca privada, crea un proxy que reciba `q`, `source`, `target` y `format`, y devuelva:

```json
{ "translatedText": "traducción en español" }
```

Luego cambia la configuración:

```js
window.TRANSLATION_CONFIG = {
  PROVIDER: "proxy",
  PROXY_URL: "https://tu-dominio-privado.com/api/translate",
  LIBRETRANSLATE_URL: "",
  MAX_CHARS: 1400,
  TIMEOUT_MS: 9000
};
```

## API privada opcional

La edición incluida usa archivos locales bajo demanda y no necesita una API para un solo curso. Para una biblioteca privada de muchos cursos, puedes activar el cargador remoto antes de los scripts de contenido en `index.html`:

```html
<script>
  window.COURSE_DATA_CONFIG = {
    MODE: "remote-api",
    API_BASE_URL: "https://tu-dominio-privado.com/api",
    COURSE_ID: "course-1"
  };
</script>
```

En ese modo el lector pide únicamente el grupo de páginas, ejercicios, glosario o índice que se necesita. `api/worker.private.example.js` documenta el contrato de endpoints y debe estar protegido con autenticación. Las imágenes fuente y PDFs pueden permanecer en una ruta privada de almacenamiento/CDN, actualizando las rutas del manifiesto.

## Datos guardados en el navegador

- Página actual y páginas completadas.
- Guardados, notas, resaltados y palabras personales.
- Resultados de práctica y progreso de tarjetas.
- Traducciones ya solicitadas.

Para reiniciar el lector, borra los datos del sitio desde la configuración del navegador. Las notas y avances no se sincronizan entre dispositivos en esta edición local.

## Material y uso privado

Esta herramienta incorpora copias locales de los archivos que proporcionaste para tu estudio personal. Mantén los PDFs, las páginas fuente y cualquier publicación privada conforme a los términos de uso y derechos aplicables al material del curso. No publiques ni compartas el paquete si esos términos no lo permiten.

## Escalar a más lecturas

Consulta `ARCHITECTURE.md`. El formato actual ya separa contenido, visuales, ejercicios, glosario y búsqueda. Para una biblioteca grande, puede migrarse a almacenamiento privado + API sin cargar todo el corpus en cada sesión.
