# Reading Companion — estudiar desde el PDF original

La lectura vuelve a ser el centro de la aplicación: índice del curso a la izquierda, página de estudio en el centro y herramientas de apoyo al costado. El diseño recupera el fondo papel, el verde oscuro y los controles compactos de tu lector anterior.

## 1. Importa un libro completo

1. Pulsa **Cargar PDF** y selecciona tu archivo. Puedes indicar un nombre para el curso o usar el título del documento.
2. Pulsa **Crear curso de lectura** y espera a que se analicen todas sus páginas. No cierres la pestaña durante el análisis.
3. El archivo original se guarda y se crea una entrada de lectura por cada página física. El motor usa primero los marcadores internos del PDF; si no sirven para dividirlo, busca encabezados conservadores. Cuando no hay una estructura fiable, propone bloques consecutivos de páginas.
4. En el panel de lectura, abre **Ver índice y cobertura** y revisa el resultado. Comprueba el principio, una página intermedia y el final del libro.
5. Para corregir la organización, entra en **Ajustar módulos y rangos**. Cambia títulos y límites; deben cubrir desde la página física 1 hasta la última, en orden, sin saltos ni repeticiones.
6. Pulsa **Guardar estructura completa**. La reorganización conserva las páginas y el avance vinculado a ellas.

**No se reconstruye el libro a partir del texto reconocido.** Las tablas, ecuaciones, imágenes, pies de página y distribución visual se leen directamente desde el PDF. La extracción de texto es una ayuda adicional para buscar, seleccionar contenido y preparar material de estudio.

El PDF debe ocupar como máximo **40 MB** y tener como máximo **1.000 páginas**. Si supera el límite, la importación lo indica; no guarda silenciosamente una parte del libro. Puedes comprimirlo conservando todas las páginas o dividirlo en volúmenes identificados.

## 2. Navega por las páginas

El índice lateral organiza el curso por módulos. Abre un módulo y elige una página. El visor incluye:

| Control | Uso |
| --- | --- |
| Página | Ir a un número físico del PDF |
| Anterior / siguiente | Recorrer las páginas sin volver al índice |
| Zoom − / + | Reducir o ampliar la vista |
| Ajustar ancho | Aprovechar el ancho disponible |
| Página completa | Ver la página completa dentro del visor |
| Girar | Leer tablas o páginas apaisadas |
| Pantalla completa | Dedicar más espacio a la lectura |
| Descargar | Recuperar el PDF original |

Los números físicos cuentan desde la primera página del archivo. El número impreso dentro del libro puede ser distinto: una portada o las páginas preliminares también forman parte del documento. Cuando el PDF contiene etiquetas de página, se conservan como referencia, junto con el número físico utilizado para navegar.

Los enlaces internos del PDF que apuntan a páginas válidas permiten desplazarse dentro del libro. El visor no ejecuta JavaScript incrustado ni los archivos adjuntos del PDF.

## 3. PDF original y texto extraído

Usa **PDF original** para leer el documento con su apariencia original. Cambia a **Texto extraído** cuando quieras trabajar con una versión adaptable del texto disponible.

Una página escaneada puede verse perfectamente en PDF original y no tener texto seleccionable. Eso no significa que falte la página. También puede contener muy poco texto, por ejemplo un gráfico o una portada.

La extracción puede equivocarse con columnas, tablas y notación matemática. Compara las cifras y las fórmulas contra PDF original. El presupuesto de extracción de **3 millones de caracteres** limita solo el texto auxiliar: cuando se alcanza, las páginas físicas y el PDF siguen conservándose y el resultado indica qué páginas quedaron sin texto extraído.

El análisis del libro completo no aplica OCR automáticamente. Para una página escaneada, pulsa **Reconocer esta página (OCR)** en el panel de lectura, elige el idioma, revisa el texto obtenido y guárdalo como texto auxiliar de esa página. El archivo original permanece intacto. El importador de otros materiales también permite reconocer escaneos por rangos, con un máximo de 10 páginas OCR por lote. Consulta `docs/IMPORTACION.md` para los detalles del motor de extracción.

## 4. Notas, avance y estudio activo

- Selecciona texto de una página para usarlo como punto de partida de una nota o tarjeta cuando el PDF incluya una capa de texto.
- En una página escaneada, puedes escribir la nota manualmente y mantenerla vinculada a esa página.
- Marca una página como estudiada después de trabajarla. Esa marca mide cobertura de lectura; las preguntas y los repasos aportan información distinta sobre lo que recuerdas.
- Usa las notas y las referencias del panel lateral para volver al contexto original.
- Crea y edita las tarjetas y preguntas desde las herramientas de estudio. Las propuestas de IA, cuando la integración está configurada, requieren revisión antes de incorporarse.

Los cursos, módulos y lecciones que crees manualmente siguen funcionando. Los contenidos del lector anterior también pueden estudiarse como texto adaptado. Como el repositorio original no incluía su PDF fuente, esa migración no puede inventar el archivo: importa tu copia del PDF si quieres usar el visor con ese libro.

## 5. Qué significa la cobertura

La revisión de cobertura comprueba que cada página física del libro tiene una entrada de lectura, pertenece a un módulo y aparece una sola vez. Detecta páginas faltantes, repetidas o fuera del rango del documento.

**Cobertura completa no significa reconocimiento perfecto ni dominio del tema.** Comprueba por separado el PDF original, la calidad del texto extraído y tu avance de estudio. Una página sin texto reconocido puede estar íntegramente disponible en el visor.

## 6. Conservación y acceso desde otro dispositivo

Si inicias sesión, el libro se guarda como archivo privado en tu cuenta de Supabase y el avance se sincroniza con tus otros registros. Espera a que termine la subida del PDF antes de intentar abrirlo por primera vez desde otro dispositivo.

Para abrirlo desde un equipo nuevo necesitas conexión y la misma cuenta. Cuando el archivo ya está disponible en la copia local, puede volver a abrirse desde ese navegador; no dependas de esa copia como único respaldo. Exporta respaldos y conserva tus archivos originales.

**Si Supabase ya está configurado, esta actualización del lector no necesita un proyecto nuevo ni SQL adicional.** Conserva tus valores en `config.js` y publica los archivos actualizados, incluyendo `app/`, `vendor/` y `styles.css`. No sobrescribas tu configuración personal con campos vacíos. La guía de instalación completa sigue en `docs/GUIA_CONFIGURACION.html`.

## 7. Si algo no se ve como esperabas

| Situación | Acción |
| --- | --- |
| El PDF se ve demasiado pequeño | Usa Ajustar ancho o amplía el zoom |
| Una tabla queda cortada horizontalmente | Amplía y desplázate dentro del visor; también puedes girar la página |
| No puedes seleccionar palabras | Comprueba si es una página escaneada; usa una nota manual o reconocimiento OCR aparte |
| Texto extraído vacío, pero Original se ve bien | La página está conservada; el reconocimiento de texto es independiente |
| Los módulos propuestos no coinciden con el libro | Abre Ver índice y cobertura → Ajustar módulos y rangos; la detección es una propuesta editable |
| Falta espacio en el celular | Cierra el índice lateral y utiliza pantalla completa si el navegador la admite |
| El archivo no está disponible en otro dispositivo | Comprueba que la primera subida terminó y que ambas sesiones usan la misma cuenta |
| El PDF está protegido | Para crear el curso, utiliza una copia desbloqueada que estés autorizado a abrir; la importación completa no acepta PDFs cifrados |
| El visor no puede abrir el documento | Conserva el original, revisa conexión y archivo; no reemplaces el PDF por el texto extraído |

El código del lector está preparado para tu sitio. Su publicación y el acceso a tu proyecto real dependen de tu configuración y de la comprobación en tus dispositivos.
