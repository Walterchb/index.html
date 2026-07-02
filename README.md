# Course 1 Study Reader — Pro v8

**Diseño editorial premium y responsive (v8).** Esta entrega conserva el contenido y los recursos visuales de la versión anterior y mejora la capa de experiencia: sistema visual más sobrio, lectura más legible y tamaños/espaciados recalibrados para móvil, tablet y escritorio.

Cambios de interfaz: paleta verde bosque y crema, contornos rectos y discretos, jerarquía tipográfica editorial, layout de escritorio sin columnas comprimidas y controles táctiles recalibrados para móviles.


Lector de estudio local para **Investment Foundations – Course 1: Industry Overview and Structure**. Está pensado para leer en trayectos, practicar y revisar vocabulario desde móvil sin depender del diseño incómodo de un PDF.

## Abrirlo

1. Descomprime el ZIP completo.
2. Conserva las carpetas `assets/` y `data/` junto a `index.html`.
3. Abre `index.html` en Chrome, Edge, Firefox o Safari.

La lectura, índice, ejercicios, glosario, marcadores, notas, resaltados y progreso funcionan localmente. La traducción necesita una conexión o un servicio configurado.

## Qué incluye

- Búsqueda contextual: los resultados resaltan la coincidencia en amarillo y llevan al fragmento dentro de la página.
- Botón flotante de Inicio cuando se desplaza por una lectura larga.
- Navegación Anterior/Siguiente alineada exactamente con el contenedor de lectura.
- Títulos de lección normalizados y notas alineadas al borde de lectura.

- **Sin PDF ni 157 capturas de páginas**: el paquete ya no incluye copias completas de las hojas ni los archivos PDF originales. Esto reduce el tamaño aproximado de 19 MB a menos de 4 MB.
- **Todas las 157 páginas siguen disponibles** como texto refluido, una página de lectura a la vez.
- **Índice de páginas real**: abre cualquier lección desde el índice y despliega sus páginas para saltar directamente a la que necesites. La página actual y las completadas se distinguen visualmente.
- **Lectura móvil rediseñada**: tamaños, espacios, botones y jerarquías se han equilibrado para pantallas angostas; la barra inferior tiene solo las tres áreas que realmente necesitas: Leer, Práctica y Glosario.
- **Visuales fieles, solo cuando importan**: se conservan 21 exhibits, tablas, diagramas, figuras y fotografías como recortes nítidos cercanos al texto que los explica. Se amplían con zoom dentro de la web.
- **Tablas simples reconstruidas semánticamente** cuando se puede preservar con seguridad la estructura; las complejas permanecen como visuales, evitando columnas desordenadas.
- **Diseño de plataforma educativa**: navegación de curso, avance visible, acciones de estudio a mano, lectura enfocada y componentes consistentes en claro u oscuro.

## Uso recomendado en móvil

- Pulsa el botón de menú superior para abrir el **índice**. Toca la flecha de una lección para ver sus páginas.
- Usa **p. X / 157** y los botones Anterior/Siguiente para sostener el ritmo de lectura.
- Mantén pulsado un fragmento de texto y selecciona: puedes traducir, escuchar, guardar, resaltar o copiar.
- Cuando aparezca un exhibit, toca **Ampliar visual**. No tienes que salir de la lectura.
- Usa los accesos **Escuchar, Nota y Practicar** debajo del texto en móvil.
- Marca una página como estudiada antes de seguir; la web guarda dónde te quedaste.

## Traducción

La configuración está al final de `index.html`:

```js
window.TRANSLATION_CONFIG = {
  PROVIDER: "mymemory", // mymemory | proxy | libretranslate
  PROXY_URL: "",
  LIBRETRANSLATE_URL: "",
  MAX_CHARS: 1400,
  TIMEOUT_MS: 9000
};
```

La opción incluida, `mymemory`, no requiere clave y está pensada para palabras, frases y fragmentos cortos. Cada traducción se guarda en IndexedDB para no repetir una solicitud en el mismo dispositivo.

Para estudiar con mayor frecuencia, configura un proxy privado o LibreTranslate siguiendo la estructura descrita en `ARCHITECTURE.md`. No guardes una API key comercial en el HTML.

## Uso sin conexión / PWA

El lector abre localmente con `index.html`. Para instalarlo como app y almacenar los recursos visitados, súbelo a un entorno privado con HTTPS y ábrelo al menos una vez con conexión. El service worker guarda el shell de la app y los contenidos que ya hayas visitado.

## Datos que se guardan en este dispositivo

- Última página y avance por página.
- Páginas favoritas y marcadas como estudiadas.
- Notas personales, resaltados y palabras guardadas.
- Resultados de práctica y estado del glosario.
- Traducciones consultadas.

Estos datos no se sincronizan entre dispositivos. Puedes limpiarlos desde **Restablecer datos locales** en el índice.

## Contenido y privacidad

La herramienta usa exclusivamente el texto y los visuales necesarios de los documentos proporcionados para estudio personal. Los recursos se mantienen locales y no deben publicarse de forma abierta si el material tiene restricciones de uso.


## Ajustes de interfaz de v8

- El panel de resultados de búsqueda permanece oculto hasta que haya una búsqueda válida.
- Los títulos de lección se renderizan como encabezados principales incluso cuando el PDF los entrega como párrafos.
- Las notas no heredan sangrías de la extracción y se alinean al borde de lectura.
- Anterior/Siguiente comparten exactamente el ancho del contenedor de lectura en móvil, tablet y escritorio.
- Un acceso flotante de Inicio aparece al desplazarte en una página de lectura larga.
- Al tocar un resultado, la coincidencia se resalta en amarillo y se centra automáticamente dentro de la lectura.
- El modo oscuro conserva contrastes específicos para notas, visuales, tablas y resaltados de búsqueda.
