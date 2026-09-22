# Recuperar el curso y el avance anterior

El archivo `migration/curso-original.json` contiene tu material anterior convertido al formato de Study Atlas. Se importa desde tu computadora; no es necesario publicarlo en GitHub ni abrirlo como una página web.

## Qué se conserva

| Contenido original | Resultado |
| --- | --- |
| Investment Foundations, Course 1 | Un curso con su nombre original |
| 5 módulos académicos y material inicial | 6 grupos ordenados |
| 157 páginas consecutivas | 157 lecciones con referencia de página |
| 1.460 bloques de texto | Texto completo y metadatos originales |
| 21 figuras, tablas y diagramas | 21 imágenes incorporadas en las lecciones |
| 38 actividades originales | 44 preguntas evaluables |
| 71 términos del glosario | 71 tarjetas con definición y ejemplo original |

Las actividades de relacionar y la matriz de datos se dividen en preguntas independientes. La matriz original de seis decisiones no tenía un evaluador adecuado en el lector anterior; ahora cada decisión tiene una respuesta comprobable. Los cinco ejercicios de selección múltiple conservan las alternativas y el conjunto completo de respuestas correctas, con selección múltiple nativa. Las explicaciones se mantienen tal como estaban en los archivos de origen.

Este contenido corresponde a **Investment Foundations Course 1**; no es un temario completo del CFA Program. El repositorio anterior incluía texto y recortes de imágenes, pero no los PDF originales. La migración no reconstruye un PDF que no existía.

## Importa primero el material

1. Guarda el ZIP y conserva `migration/curso-original.json` en tu computadora, fuera de los archivos que publiques.
2. Abre Study Atlas. Si ya configuraste Supabase, inicia sesión en la cuenta donde quieres estudiar. Si entras en modo local, el material se guardará en ese navegador.
3. Entra a **Gestionar → Importar respaldo / curso**.
4. Selecciona `curso-original.json` y espera a que termine la importación.
5. Selecciona el curso de Investment Foundations. Comprueba que hay 157 lecciones, 44 preguntas y 71 tarjetas.
6. Abre, por ejemplo, las páginas 7, 29 y 146 para comprobar que aparecen las figuras y tablas junto al texto.

## Recupera las marcas y notas

1. Usa el **mismo navegador, perfil y origen** donde estudiabas antes. Por ejemplo, `https://walterchb.github.io` y un dominio personalizado guardan sus datos por separado. También `localhost` y `file://` son contextos distintos.
2. Importa el curso antes de recuperar el avance.
3. Entra a **Ajustes → Recuperar avance anterior**.
4. Comprueba tus lecciones estudiadas, guardadas y notas. Los subrayados anteriores se convierten en notas que conservan el texto seleccionado.
5. Revisa las tarjetas creadas desde palabras personales. El lector anterior guardaba el fragmento, pero no necesariamente una definición: completa el reverso antes de practicar.
6. Exporta un respaldo desde **Ajustes → Exportar respaldo**. Si usas Supabase, espera a que se sincronicen los cambios y comprueba el resultado en otro dispositivo.

La migración no borra las claves anteriores. Lee, en ese orden, `course1StudyReader.v5`, `.v4`, `.v3` y `.v2`; si una versión está dañada, intenta la siguiente. Conserva las cadenas originales en el respaldo interno `legacy-backup` antes de escribir el progreso. Las notas ya importadas no se sobrescriben al repetir la operación.

Los resultados antiguos de práctica se conservan como historial de origen. Como el lector anterior no almacenaba qué respuesta seleccionaste en cada intento, no se inventan intentos individuales ni se mezclan con la precisión de tus nuevas sesiones. El estado antiguo del glosario —aprendida, repasar o nueva— también se conserva. El calendario de repaso comienza con una comprobación real; no se inventan fechas ni repeticiones anteriores.

Si no encuentra el avance, revisa el navegador y el dominio de la web antigua. Sin una copia previa no es posible recuperar datos que ya se borraron del navegador. El material del curso sí puede volver a importarse desde el JSON.

## Verificación y mantenimiento

`migration/auditoria-conversion.json` registra las comprobaciones de cobertura y los SHA-256 de los archivos fuente. El archivo importado conserva los registros originales de páginas, ejercicios y glosario para que puedas revisar su correspondencia.

Para repetir la conversión desde una copia del repositorio anterior, con Node instalado:

```bash
node scripts/convert-legacy.mjs --source /ruta/al/repositorio-anterior --out migration
```

El conversor usa los archivos locales del repositorio anterior y no hace solicitudes de red. Si falta una página, figura o respuesta válida, se detiene en lugar de crear un paquete incompleto. La conversión preserva el material de origen; no certifica su vigencia académica ni sustituye una revisión de sus respuestas.

Los archivos de migración y los respaldos son para tu importación personal. Conserva las exclusiones de Git y la publicación por lista permitida del proyecto para que no se sirvan junto con la aplicación pública. La [guía de configuración](GUIA_CONFIGURACION.md) explica GitHub Desktop, Supabase, el inicio de sesión y la sincronización.
