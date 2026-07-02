# Course 1 Study Reader — Pro v9

Lector de estudio local para **Investment Foundations – Course 1: Industry Overview and Structure**. Está pensado para leer en trayectos, practicar y revisar vocabulario desde móvil sin depender del formato rígido de un PDF.

## Abrirlo

1. Descomprime el ZIP completo.
2. Conserva las carpetas `assets/` y `data/` junto a `index.html`.
3. Abre `index.html` en Chrome, Edge, Firefox o Safari.

La lectura, índice, ejercicios, glosario, marcadores, notas, resaltados y progreso funcionan localmente. La traducción necesita conexión o un servicio configurado.

## Novedades de v9

- El acceso a **Inicio** ya no flota sobre el contenido: en móvil está integrado con **Leer**, **Práctica** y **Glosario** en la navegación inferior.
- La práctica se organizó como un flujo claro: **configura unidad y tipo → consulta el mapa → responde → revisa → avanza**.
- El mapa de preguntas muestra cuál es la actual, cuáles están pendientes, cuáles fueron correctas y cuáles necesitan refuerzo.
- Se añadieron controles visibles de **Anterior**, **Siguiente** e **Ir a una pregunta**. También se mantienen las flechas izquierda/derecha en escritorio para desplazarse entre preguntas.
- Las opciones elegidas quedan visualmente marcadas antes de verificar.
- **Intentar otra vez** ahora oculta correctamente el resultado previo para que puedas resolver de nuevo la misma pregunta.
- Las preguntas se cargan solo al abrir Práctica y se mantienen dentro del filtro elegido para conservar velocidad en móvil.

## Qué incluye

- **157 páginas** de lectura refluida, una a la vez.
- Índice desplegable por módulo, lección y página.
- Búsqueda contextual: resalta coincidencias en amarillo y abre el fragmento dentro de la lectura.
- **21 visuales relevantes** —exhibits, tablas, diagramas, figuras y fotografías— ubicados junto al texto que explican y ampliables con zoom.
- Tablas simples reconstruidas semánticamente; las complejas permanecen como visuales para evitar errores de columnas o jerarquía.
- Prácticas basadas únicamente en los knowledge checks del material.
- Glosario, notas, favoritos, pronunciación, resaltado y progreso guardados en el dispositivo.
- Modo claro y oscuro, con navegación y controles adaptados a móvil, tablet y escritorio.

## Uso recomendado en móvil

- Pulsa el menú superior para abrir el **índice** y navegar por módulo, lección o página.
- En la barra inferior usa **Inicio** para volver al comienzo de la vista actual, **Leer** para la lectura, **Práctica** para reforzar y **Glosario** para vocabulario.
- Mantén pulsado un fragmento de lectura y selecciona: puedes traducir, escuchar, guardar, resaltar o copiar.
- En Práctica, elige unidad y tipo. Usa el **mapa de preguntas** o el selector **Ir a** para retomar un punto específico.
- Cuando aparezca un exhibit, toca **Ampliar visual**. No necesitas salir de la lectura.
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
