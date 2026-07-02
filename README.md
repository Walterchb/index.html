# Course 1 Study Reader Pro v4

Lector de estudio local para **Investment Foundations - Course 1: Industry Overview and Structure**. Convierte el reading packet en una experiencia de lectura, práctica y repaso que se puede usar desde celular, tablet o computadora sin tener que volver a navegar el PDF original para entender una tabla, exhibit, diagrama o fotografía.

## Abrirlo

1. Descomprime el archivo ZIP sin cambiar las carpetas internas.
2. Abre `index.html` con Chrome, Edge, Firefox o Safari.
3. Conserva `assets/` y `data/` junto a `index.html`.

El índice, las lecturas, los recursos visuales, las prácticas, el glosario, las notas y el progreso funcionan localmente. La traducción necesita conexión o un servicio de traducción configurado.

## Qué incluye

- **157 páginas del reading packet**, disponibles como lectura refluida y como páginas fuente integradas.
- **Exhibits, tablas, diagramas, figuras y fotografías** colocados junto al bloque de lectura que los introduce o explica.
- **Tablas semánticas reconstruidas** cuando la estructura podía preservarse sin ambigüedad: por ejemplo, *Debt and Equity Securities* (p. 7) y *Competitive and Liquid Markets* (p. 16).
- **Tablas complejas conservadas como visuales nítidos** cuando una reconstrucción podía alterar relaciones de filas y columnas. Se pueden ampliar dentro de la web.
- **Fuente visual integrada por página**: las 157 páginas están incluidas dentro de la herramienta, por lo que no es necesario salir al archivo original para revisar un detalle de diseño, una imagen o un elemento que no se refluye bien.
- **Práctica, glosario y tarjetas** derivados exclusivamente de los documentos incluidos.
- Guardado local de avance, favoritos, notas, resaltados, términos personales, tarjetas y resultados.

## Cómo estudiar en un trayecto

- Usa **Lectura** para avanzar con un ancho de línea, tamaño e interlineado cómodos.
- Toca el icono de ajustes para adaptar la página a tu pantalla o cansancio visual.
- Cuando aparezca un exhibit, tabla o figura, ábrelo con **Ampliar**. La vista se abre encima de la lectura y tiene zoom.
- En una tabla larga, desliza horizontalmente para comparar columnas sin romper el diseño móvil.
- Mantén pulsado y selecciona una palabra, frase u oración: puedes traducir, escuchar, resaltar, copiar o guardar.
- Marca la página estudiada antes de pasar a la siguiente; el lector recuerda dónde te quedaste.
- Usa **Práctica** después de la lectura. Las respuestas y feedback se revelan solo después del intento.

## Diseño y rendimiento

El lector carga recursos progresivamente:

| Recurso | Cuándo se carga |
| --- | --- |
| Interfaz, navegación y preferencias | Al abrir el lector |
| Texto de lectura | Solo el grupo del módulo solicitado |
| Exhibit o visual inline | Solo cuando llega a esa página |
| Página visual completa | Solo al abrir Fuente visual |
| Ejercicios | Solo al entrar a Práctica |
| Glosario | Solo al entrar a Glosario |
| Índice completo de búsqueda | Solo al usar el buscador |

Esta organización evita renderizar las 157 páginas visuales o todo el índice de búsqueda al mismo tiempo. También permite incorporar cursos futuros usando el mismo formato sin convertir la aplicación en un único archivo pesado.

## Uso móvil y sin conexión

Para instalarla como app y conservar recursos visitados para trayectos, publícala en un origen privado con HTTPS y ábrela una vez con Wi-Fi. El `service-worker.js` guarda la interfaz y reutiliza el contenido visitado.

Abrir `index.html` directamente funciona para el uso local. Algunos navegadores restringen la instalación PWA y la caché avanzada cuando el archivo se abre con `file://`; para teléfono, HTTPS privado es más confiable.

## Traducción

La configuración está al final de `index.html`, dentro de `window.TRANSLATION_CONFIG`.

### Opción incluida: MyMemory

```js
window.TRANSLATION_CONFIG = {
  PROVIDER: "mymemory", // mymemory | proxy | libretranslate
  PROXY_URL: "",
  LIBRETRANSLATE_URL: "",
  MAX_CHARS: 1400,
  TIMEOUT_MS: 9000
};
```

El lector envía solo el fragmento seleccionado y guarda cada resultado en IndexedDB. Para estudiar, selecciona fragmentos cortos; un servicio público puede tener límites de uso o respuesta variable.

### Opción recomendada para uso frecuente: proxy o LibreTranslate

No coloques claves de servicios comerciales dentro de `index.html`. Configura un proxy privado o una instancia de LibreTranslate que reciba texto, idioma de origen e idioma de destino, y devuelve:

```json
{ "translatedText": "traducción en español" }
```

Después configura:

```js
window.TRANSLATION_CONFIG = {
  PROVIDER: "proxy",
  PROXY_URL: "https://tu-dominio-privado.com/api/translate",
  LIBRETRANSLATE_URL: "",
  MAX_CHARS: 1400,
  TIMEOUT_MS: 9000
};
```

## Datos guardados localmente

- Última página y progreso por página/sección.
- Favoritos, notas, resaltados y selecciones personales.
- Respuestas e intentos de práctica.
- Estado de tarjetas del glosario.
- Traducciones ya solicitadas.

La edición local no sincroniza esos datos entre dispositivos. Para reiniciar, usa **Restablecer datos locales** desde el índice.

## Escalar a más cursos

Revisa `ARCHITECTURE.md`. El paquete mantiene separados el manifiesto, contenido por grupos, búsqueda, glosario, ejercicios, visuales de exhibits y páginas fuente. Se puede migrar a almacenamiento privado y una API sin obligar al navegador a descargar toda una biblioteca al inicio.

## Uso privado del material

Esta herramienta incorpora copias locales de los documentos proporcionados únicamente para estudio personal. Mantén los archivos, recursos visuales y cualquier publicación privada conforme a los términos de uso y derechos aplicables al material del curso.
