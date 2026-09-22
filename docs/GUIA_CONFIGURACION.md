# CFA Study Reader — configuración paso a paso

Esta entrega contiene Reading Companion listo para copiar a tu repositorio, con lectura directa del PDF original. Si ya configuraste Supabase, conserva tus valores de `config.js`: esta actualización del lector no requiere un proyecto nuevo ni SQL adicional. Para el uso del visor, consulta `docs/LECTOR_PDF.md`.

La instalación inicial se explica a continuación. Para guardar tu avance entre computadora y celular necesitas conectar tu propio proyecto Supabase y publicar la web. La configuración pública de conexión puede conservarse en `config.js`; las contraseñas y las claves privadas no forman parte de la web. La entrega no implica un despliegue hecho en tu nombre.

**Ruta recomendada:** respaldar tu versión anterior → crear Supabase → completar `config.js` → publicar con GitHub Desktop → iniciar sesión → importar tu curso → comprobar la sincronización. La inteligencia artificial es un paso adicional opcional.

## 1. Qué guarda cada servicio

| Componente | Función | Dónde queda |
| --- | --- | --- |
| GitHub Pages | Publica la interfaz de estudio | Tu repositorio y el sitio publicado |
| Supabase Auth | Correo, contraseña y sesión | Tu proyecto Supabase |
| Base de datos | Cursos, módulos, lecciones, notas y avance | Registros privados por usuario |
| Supabase Storage | Archivos PDF y otros adjuntos admitidos | Bucket privado `cfa-documents` |
| Navegador | Copia local y cambios pendientes | El dispositivo y perfil donde estudias |
| Función `study-ai`, opcional | Genera propuestas a partir de textos seleccionados | Supabase; consulta la API de OpenAI |

La interfaz publicada puede visitarse sin cuenta. Tus registros y documentos en Supabase quedan protegidos por políticas de acceso por usuario. El código HTML y JavaScript publicado no es secreto.

## 2. Respalda antes de reemplazar

1. Abre tu web actual en el navegador donde has estudiado. Guarda cualquier exportación de avance disponible y conserva capturas de tu progreso como referencia.
2. En GitHub Desktop selecciona `Walterchb/index.html` y pulsa **Fetch origin**. Si hay cambios remotos, pulsa **Pull origin**. Conserva y revisa cualquier cambio local pendiente antes de continuar.
3. Usa **Repository → Show in Explorer**. Copia la carpeta completa a otra ubicación, por ejemplo `CFA-respaldo-antes-de-actualizar`. No trabajes sobre esa copia.
4. Descomprime el ZIP nuevo en otra carpeta. Conserva una copia de `migration/curso-original.json` fuera del repositorio: se importará desde tu disco y no debe publicarse como contenido abierto.
5. Conserva el archivo `CNAME` si tu web usa un dominio personalizado. No cambies el dominio por seguir un ejemplo de esta guía.

**El progreso anterior depende del navegador y del dominio.** La migración de avance solo puede leer los datos antiguos si abres la nueva web desde el mismo origen, navegador y perfil donde usabas la anterior. `localhost`, `walterchb.github.io` y un dominio personalizado son espacios distintos. No borres los datos del sitio antes de migrar y exportar un respaldo.

## 3. Crea tu proyecto Supabase

1. Entra en [Supabase](https://supabase.com/dashboard), crea una cuenta o inicia sesión.
2. Pulsa **New project**. Elige tu organización y un nombre, por ejemplo `cfa-study-walter`.
3. Genera una contraseña de base de datos larga y guárdala en tu gestor de contraseñas. Esta contraseña no se coloca en la web.
4. Elige una región cercana a tus dispositivos y espera a que el proyecto esté listo.
5. Abre **SQL Editor → New query**.
6. En la carpeta descargada, abre `supabase/schema.sql` con un editor de texto. Copia **todo** su contenido en el editor SQL y pulsa **Run**.
7. Comprueba que no haya errores. En **Table Editor** debe existir `study_records`. En **Storage** debe existir `cfa-documents` como bucket **Private**.
8. Revisa que `study_records` tenga **RLS habilitado**. El script incluye las políticas para que cada persona solo lea y modifique sus propios registros y archivos. No agregues políticas de acceso público para solucionar un error.

No necesitas crear una tabla a mano por cada curso ni subir los PDF desde el panel: la aplicación los administra. El esquema usa un tipo de registro para separar cursos, lecciones, notas y progreso dentro de la misma tabla.

Las políticas RLS son la protección real de los datos; las claves públicas del navegador no sustituyen esas políticas. Consulta [control de acceso de Storage](https://supabase.com/docs/guides/storage/security/access-control) si modificas el esquema.

## 4. Configura las direcciones del login

En Supabase abre **Authentication → URL Configuration**.

Si mantienes el repositorio `Walterchb/index.html` y no usas dominio personalizado:

| Campo | Valor |
| --- | --- |
| Site URL | `https://walterchb.github.io/index.html/` |
| Redirect URL de producción | `https://walterchb.github.io/index.html/` |
| Redirect URL para probar en tu computadora | `http://localhost:8080/` |

El nombre `index.html` en esa dirección es **el nombre del repositorio y de la carpeta del sitio**. La URL termina con `/`. No la reemplaces por `https://walterchb.github.io/` ni agregues otra ruta innecesariamente.

Si abres la página escribiendo expresamente `https://walterchb.github.io/index.html/index.html`, añade también esa URL exacta a los redirects, o utiliza siempre la dirección corta de la tabla. El enlace de recuperación vuelve a la ruta desde la que lo solicitas.

Con dominio personalizado, usa su dirección real como Site URL y como redirect, y conserva la entrada local para pruebas. Evita comodines amplios en producción. Estas direcciones controlan el retorno de confirmaciones y recuperación de contraseña; [Supabase explica su configuración aquí](https://supabase.com/docs/guides/auth/redirect-urls).

## 5. Crea tu cuenta personal

Para una herramienta de estudio personal, crea primero tu usuario desde el panel:

1. Entra en **Authentication → Users → Add user**.
2. Usa **Create new user**, si aparece, y establece tu correo y una contraseña de al menos 8 caracteres. Usa una contraseña única y más larga que el mínimo.
3. Si el panel permite confirmar manualmente el correo, hazlo únicamente para tu propia dirección. Si eliges **Invite user**, necesitarás recibir el correo de invitación.
4. En **Authentication → Sign In / Providers**, deja habilitado el proveedor **Email**.
5. Después de tener tu cuenta, desactiva **Allow new users to sign up** si solo la utilizarás tú. Las cuentas existentes podrán seguir entrando. Deja desactivados los accesos anónimos de Supabase: el modo local de esta web no los necesita.

También puedes registrarte desde la aplicación si permites nuevos usuarios y tienes configurado el envío de confirmaciones. [Opciones de acceso de Supabase](https://supabase.com/docs/guides/auth/general-configuration).

### Correos de confirmación y recuperación

El servidor de correo predeterminado de Supabase tiene restricciones de destinatarios, frecuencia y entrega; sirve para pruebas. Para recuperación de contraseña fiable, configura tu proveedor SMTP en **Authentication → Emails → SMTP Settings** con host, puerto, usuario, contraseña y remitente autorizado. Verifica tu dominio según las instrucciones de ese proveedor. Las credenciales SMTP se guardan en Supabase, nunca en `config.js`.

Si el correo no llega, revisa spam, destinatario permitido, límites y registros de Auth antes de repetir solicitudes. [Guía oficial de SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## 6. Completa config.js

1. Busca en el panel de Supabase la **Project URL** y la clave **Publishable**; en algunas versiones aparecen en **Connect** o **Project Settings → API / API Keys**.
2. Abre `config.js`, en la raíz de la carpeta nueva, con Visual Studio Code o Bloc de notas.
3. Esta entrega ya contiene la URL y la clave pública que proporcionaste. Si corresponden a tu proyecto, conserva el archivo. Solo para otro proyecto, reemplaza estos dos valores:

```javascript
window.CFA_CONFIG = {
  supabaseUrl: 'https://TU_REFERENCIA.supabase.co',
  supabaseAnonKey: 'sb_publishable_TU_CLAVE_PUBLICA',
  aiFunction: 'study-ai',
  storageBucket: 'cfa-documents',
  maxFileMB: 40,
};
```

Puedes usar la clave pública antigua `anon` si tu proyecto la ofrece. El nombre del campo `supabaseAnonKey` acepta ambas variantes.

**Nunca pegues una clave `service_role`, `sb_secret_…`, contraseña de base de datos o clave de OpenAI en este archivo.** `config.js` se descarga al navegador y se publica con la web. La URL y la clave publishable están diseñadas para ese uso; el acceso privado depende del login y de RLS. [Tipos de claves de Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

Guarda el archivo como `config.js`, no como `config.js.txt`. No necesitas configurar GitHub Secrets para esos dos valores públicos.

## 7. Copia y publica con GitHub Desktop

1. Vuelve a la carpeta de trabajo que abrió **Show in Explorer**.
2. Copia **el contenido** de la carpeta nueva a esa raíz y acepta reemplazar los archivos correspondientes. `index.html`, `config.js`, `app/`, `vendor/` y `.github/` deben quedar en la raíz del repositorio, no dentro de otra carpeta `cfa-study/`.
3. **No borres ni reemplaces `.git/`.** GitHub Desktop necesita esa carpeta para reconocer el repositorio y su historial. Conserva `CNAME` si lo tenías.
4. En GitHub Desktop revisa **Changes**. No deben aparecer claves privadas, archivos `.env`, respaldos personales ni PDF nuevos para publicarse.
5. El paquete incluye exclusiones y un flujo de publicación por lista permitida. Conserva `.gitignore` y `.github/workflows/`. No agregues `migration/curso-original.json` a Git por la fuerza: se importa localmente.
6. Escribe un resumen, por ejemplo `Nueva plataforma CFA con login y progreso sincronizado`. Pulsa **Commit to main** —o a la rama principal real de tu repositorio— y luego **Push origin**.
7. En la web de GitHub abre tu repositorio → **Settings → Pages → Build and deployment → Source → GitHub Actions**.
8. Abre **Actions** y ejecuta el flujo de publicación incluido si no se inició automáticamente. Espera a que termine en verde. Si tu rama principal no es `main`, ajusta la rama del workflow o ejecútalo manualmente desde la rama correcta.
9. Abre la URL que GitHub muestre en **Settings → Pages**. Para el repositorio indicado será normalmente [https://walterchb.github.io/index.html/](https://walterchb.github.io/index.html/), salvo que tengas un dominio personalizado.

El workflow publica únicamente los archivos de la aplicación que necesita el sitio. Incluye esta guía de configuración para abrirla desde Ajustes y excluye migraciones, SQL y datos heredados. No cambies el flujo a “subir todo el repositorio”, porque esos archivos no son parte de la web pública. [Cómo funcionan los workflows de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

**Publicar selectivamente no vuelve privado un repositorio público.** Los archivos ya subidos a GitHub pueden seguir siendo visibles en el repositorio o su historial aunque dejen de salir en Pages. Conserva tus materiales de estudio fuera del código publicado y súbelos mediante la aplicación a Storage privado. Si necesitas retirar material anteriormente publicado, revisa por separado el contenido y el historial del repositorio. El login nuevo protege los datos nuevos de Supabase; no puede ocultar archivos públicos anteriores.

### Prueba local opcional

La web usa módulos JavaScript, por lo que no debes abrir `index.html` haciendo doble clic. Si tienes Python instalado, abre una terminal dentro de la carpeta y ejecuta:

```powershell
py -m http.server 8080
```

Si tu equipo utiliza el comando `python`:

```powershell
python -m http.server 8080
```

Después abre `http://localhost:8080/`. No necesitas Python ni Node para que la versión publicada funcione: este servidor solo sirve para probar en tu computadora.

## 8. Entra, importa tu curso y recupera el avance

El contenido de tu repositorio corresponde a **Investment Foundations — Course 1**, no al programa completo de un nivel CFA. La conversión conserva 157 páginas, 21 figuras, 71 tarjetas de glosario y 38 actividades originales convertidas en 44 preguntas evaluables. Puedes crear y añadir otros cursos desde la nueva aplicación. El repositorio anterior no contenía el PDF fuente: la migración incluye el contenido extraído y las figuras disponibles; adjunta tus PDF originales desde la aplicación si los tienes.

1. Abre la web nueva e inicia sesión con el usuario que creaste en Supabase.
2. Confirma que la aplicación muestra tu correo y que la conexión está configurada.
3. Abre **Gestionar → Importar respaldo / curso** y elige `migration/curso-original.json` desde tu disco. Elige el archivo local; no necesitas hacer público un enlace al JSON.
4. Comprueba que aparecen el curso, sus módulos y sus lecciones. Abre varias lecciones y confirma que su contenido se corresponde con tu material.
5. Desde el mismo navegador, perfil y origen de la web anterior, usa **Ajustes → Recuperar avance anterior**. Si no encuentra datos, no significa que tu progreso estuviera en Supabase: la versión previa podía guardarlo solo en ese navegador.
6. Espera a que termine la sincronización y comprueba el indicador de cambios pendientes.
7. Usa **Ajustes → Exportar respaldo** y guarda el archivo nuevo fuera del repositorio.

La migración conserva los resúmenes históricos de ejercicios y los estados del glosario como información de recuperación. No inventa respuestas individuales, porcentajes de acierto ni un calendario de repaso a partir de esos datos. El detalle está en `docs/MIGRACION.md`.

Importar un respaldo restaura sus registros: si ya existen los mismos identificadores, puede reemplazar sus valores. Exporta primero tu estado actual y evita reimportar el curso original después de corregirlo, salvo que quieras restaurar esa versión.

### Si empezaste como invitado

El modo local y cada cuenta tienen espacios separados. Entrar a una cuenta no sube ni mezcla automáticamente los cursos del invitado.

Para trasladarlos: entra al modo local → exporta su respaldo → inicia sesión → importa ese respaldo en la cuenta deseada → espera la sincronización. Revisa el resultado antes de borrar o cambiar de dispositivo. Este paso también sirve para trasladar trabajo desde `localhost` a la web publicada.

## 9. Usa la estructura de aprendizaje

La organización es **curso → módulo → lección**. Para un libro PDF completo, cada página física tiene su entrada de lectura dentro del módulo correspondiente. El índice propone una estructura editable y valida que los rangos cubran todas las páginas, sin saltos ni repeticiones. El visor muestra directamente el PDF original; el texto extraído sirve como apoyo y no sustituye su diseño, imágenes o fórmulas. Consulta `docs/LECTOR_PDF.md`.

También puedes crear cursos, módulos y lecciones manualmente para programas o niveles diferentes.

Un ciclo útil:

1. Crea o importa el material dentro del curso correspondiente.
2. Revisa títulos, orden y texto reconocido antes de confirmar una importación.
3. Estudia una lección, toma notas y practica recuperación activa con tarjetas o preguntas.
4. Revisa las respuestas y su explicación. Corrige cualquier extracción o propuesta automática que no respete el material.
5. Marca avance y vuelve a los repasos pendientes. Leer una lección y dominar sus conceptos son actividades distintas.

Los PDF con texto pueden analizarse localmente. Los PDF escaneados requieren OCR; su calidad depende del escaneo. Tablas complejas, fórmulas y diagramas necesitan revisión humana. El reconocimiento no es una garantía de interpretación financiera correcta.

Los archivos tienen un límite inicial de **40 MB**. Mantén la configuración de la aplicación y del bucket en el mismo límite. El modo libro completo admite hasta 1.000 páginas y conserva el PDF original; si excede esos límites, divídelo en volúmenes. El reconocimiento de materiales por rangos sigue disponible para trabajar textos y escaneos por partes.

La extracción local no requiere una clave de OpenAI. El OCR es explícito; la primera ejecución descarga el motor y los idiomas desde tu propia web y necesita conexión a ella. Los archivos están incluidos en el ZIP; no depende de un CDN externo. La IA remota solo se utiliza cuando eliges esa función y tienes su configuración activa. Los detalles y límites del motor están en `docs/IMPORTACION.md`.

## 10. Activa la IA opcional

Puedes estudiar, administrar contenido, importar textos y guardar avance sin realizar este paso. Esta función añade propuestas estructuradas a partir del texto que envías: debes revisar cada resultado antes de incorporarlo.

### 10.1 Prepara Supabase

1. En **SQL Editor**, ejecuta completo `supabase/002_ai_quota.sql`, después de `schema.sql`.
2. En **Edge Functions → Secrets**, añade estos valores:

| Secreto | Valor que debes colocar |
| --- | --- |
| `OPENAI_API_KEY` | Tu clave privada de la API; nunca va en GitHub o en el navegador |
| `OPENAI_MODEL` | Opcional; el código usa `gpt-4.1-mini` si no lo cambias |
| `ALLOWED_ORIGINS` | `https://walterchb.github.io` |
| `AI_ALLOWED_EMAILS` | El correo exacto con el que entrarás a la web |

`ALLOWED_ORIGINS` contiene **orígenes sin ruta y sin barra final**. Es distinto de las URLs de retorno del login. Si pruebas localmente, puedes usar `https://walterchb.github.io,http://localhost:8080`. Para dominio personalizado, agrega su origen real. Para más de un correo autorizado, sepáralos con comas.

Los secretos se guardan en el panel del proyecto y se leen únicamente dentro de la función. [Administración oficial de secretos](https://supabase.com/docs/guides/functions/secrets).

### 10.2 Publica la función

La función no se publica al subir la web a GitHub. Debes desplegarla una vez en Supabase y repetir el despliegue cuando cambies su código.

1. Instala la CLI de Supabase siguiendo su [guía oficial](https://supabase.com/docs/guides/local-development/cli/getting-started). No necesitas ejecutar una base de datos local para este despliegue.
2. Abre la terminal en la raíz del proyecto, donde está la carpeta `supabase/`.
3. Ejecuta estos comandos, uno por uno:

```text
supabase login
supabase link --project-ref TU_REFERENCIA
supabase functions deploy study-ai --no-verify-jwt
```

`TU_REFERENCIA` es el identificador del proyecto; en `https://abcdefgh.supabase.co`, sería `abcdefgh`. No es una clave ni la URL completa.

La opción `--no-verify-jwt` corresponde a esta implementación: la función valida internamente la sesión con `auth.getUser(token)` y además verifica el correo autorizado. No retires esas validaciones. El nombre desplegado debe coincidir con `aiFunction: 'study-ai'` en `config.js`. [Despliegue de Edge Functions](https://supabase.com/docs/guides/functions/deploy).

### 10.3 Prueba y controla el uso

1. Inicia sesión en tu web y procesa un fragmento pequeño de material de prueba.
2. Solicita la propuesta de IA y revisa la estructura, las respuestas y las referencias a las páginas.
3. Comprueba los registros de **Edge Functions → study-ai → Logs** si hay un error.
4. Ajusta los controles de gasto y alertas en tu cuenta de API. La integración usa tu cuenta de API y su consumo es independiente de la sesión de esta aplicación.

Esta implementación limita las solicitudes por usuario a **20 por día UTC**. Cada lote admite como máximo **40 000 caracteres y 50 páginas**, y limita la salida del modelo. Si alcanzas el límite, vuelve a usar las funciones locales o espera al siguiente día UTC. Un curso largo se trabaja por secciones; no se procesa completo de manera silenciosa.

Solo el texto enviado en esa acción va a la función y al proveedor de IA. Utiliza materiales que puedas procesar de esa manera y conserva el original para contrastar. El OCR y la extracción local siguen siendo opciones independientes.

## 11. Que tu avance se conserve

**La sincronización necesita una cuenta y conexión.** El modo local es útil para empezar o trabajar temporalmente, pero los datos del navegador pueden borrarse al limpiar el sitio, cambiar de equipo o usar navegación privada.

Antes de cambiar de dispositivo, espera a que no haya cambios pendientes. En el segundo dispositivo inicia sesión con el mismo correo y sincroniza. No edites la misma lección en dos dispositivos desconectados simultáneamente: si hay un conflicto de versiones, abre **Ajustes → Resolver conflictos** y resuélvelo antes de seguir. La aplicación conserva el conflicto para revisión en lugar de sustituir silenciosamente una versión.

### Respaldo recomendado

1. Exporta un respaldo completo después de la migración, después de importaciones grandes y periódicamente mientras estudias.
2. Guárdalo fuera de la carpeta que publicas con GitHub Desktop; conserva al menos una copia en otro dispositivo o almacenamiento privado.
3. La exportación incluye los registros y los adjuntos. Si falta un adjunto en la copia local, intenta descargarlo desde Supabase; debe terminar sin errores para considerarla completa.
4. Conserva también tus PDF originales. Prueba una restauración con un respaldo pequeño antes de depender de ella para todo tu material.

Supabase ofrece copias de base de datos según el plan, pero esas copias **no incluyen los objetos de Storage**, solo sus metadatos. En el plan gratuito debes organizar tus exportaciones; no lo uses como único respaldo. [Alcance de las copias de Supabase](https://supabase.com/docs/guides/platform/backups).

### Disponibilidad del servicio

GitHub Pages sirve la interfaz y Supabase mantiene el acceso y los datos. El plan gratuito de Supabase puede pausar proyectos con poca actividad; si quieres evitar pausas por inactividad, utiliza un plan que lo excluya, como Pro, y revisa sus condiciones vigentes. Ningún montaje elimina todas las posibles interrupciones de internet o del proveedor. [Disponibilidad y preparación para producción](https://supabase.com/docs/guides/deployment/going-into-prod).

Actualizar el código con GitHub Desktop no borra tus registros de Supabase. No elimines el proyecto de Supabase ni ejecutes SQL destructivo para actualizar la interfaz. Mantén tus credenciales administrativas y las cuentas de GitHub y Supabase protegidas.

## 12. Comprobación final en dos dispositivos

Realiza esta prueba antes de trasladar todo tu estudio:

1. En tu computadora, inicia sesión, crea un curso de prueba y una lección corta.
2. Escribe una nota, marca avance y sube un PDF pequeño sin datos sensibles.
3. Espera a que la sincronización termine sin pendientes ni errores.
4. En tu celular u otro navegador, abre la web e inicia sesión con el mismo correo.
5. Verifica el curso, la nota, el avance y la apertura del PDF.
6. Modifica la nota desde el celular, sincroniza y comprueba el cambio desde la computadora.
7. Cierra sesión. Tus datos no deben aparecer en el espacio de invitado.
8. Si haces una prueba con otra cuenta, esta debe tener su propio espacio y no ver tu curso ni tus documentos.
9. En Supabase confirma que el bucket sigue **Private**, la tabla tiene **RLS** y el asesor de seguridad no marca acceso público para estos datos.
10. Exporta un respaldo y comprueba que puedes restaurarlo en un espacio local de prueba sin sobrescribir el trabajo que necesitas conservar.

Estas verificaciones requieren tu proyecto real y tus cuentas. La entrega del código no equivale a una prueba realizada contra tu nube ni a un sitio ya publicado.

## 13. Solución de problemas

| Síntoma | Qué revisar |
| --- | --- |
| La web muestra la versión anterior | Espera el workflow verde y recarga. Antes de limpiar datos del sitio, exporta tu progreso. Para caché antigua, desregistra el service worker en las herramientas del navegador sin borrar almacenamiento personal. |
| Página en blanco al abrir un archivo | Usa la URL publicada o un servidor local; `file://` no sirve para esta aplicación con módulos. |
| GitHub Pages devuelve 404 | Comprueba `Settings → Pages`, el workflow, su rama y que `index.html` esté en la raíz del artefacto publicado. Usa `/index.html/` como carpeta del proyecto. |
| Login sin configurar | Revisa `config.js`, los nombres de campos, comillas y que no se guardara con extensión `.txt`. Vuelve a publicar el cambio. |
| Invalid API key o error de conexión | La URL y la clave pública deben pertenecer al mismo proyecto. Comprueba que el proyecto esté activo. |
| Email not confirmed | Confirma tu correo o revisa tu usuario en el panel. No desactives controles de todos los usuarios para resolver una cuenta. |
| No llega recuperación de contraseña | Revisa SMTP, destinatarios autorizados, spam, límites de envío y las URLs de retorno. |
| El enlace de recuperación vuelve al sitio incorrecto | Corrige Site URL y Redirect URLs con la ruta exacta desde la que solicitas el enlace. Solicita uno nuevo. |
| Error RLS o permission denied al guardar | Ejecuta `schema.sql` completo, entra con tu cuenta y revisa las políticas. No vuelvas público el bucket. |
| No existe study_records o el bucket | Falta ejecutar el SQL en el proyecto cuya URL tiene `config.js`. |
| No veo el trabajo que hice antes de entrar | El invitado y la cuenta son espacios separados. Exporta desde el invitado e importa después de iniciar sesión. |
| No veo el avance en el celular | Confirma que es el mismo correo y proyecto, y que el primer dispositivo terminó de sincronizar. |
| Aparece conflicto | Revisa las versiones ofrecidas, conserva un respaldo y elige cuál mantener. Sincroniza antes de continuar en otro dispositivo. |
| Un PDF no sube | Comprueba tamaño máximo de 40 MB, conexión, cuota del proyecto y que Storage siga configurado. Conserva el archivo original. |
| Un PDF se reconoce vacío | Puede ser escaneado, protegido o contener solo imágenes. Usa OCR si corresponde; procesa capítulos y revisa el texto resultante. |
| OCR no arranca | La primera descarga de worker, núcleo e idiomas necesita internet. Revisa bloqueadores y restricciones de red. |
| IA devuelve 401 o 403 | Inicia sesión; revisa correo en `AI_ALLOWED_EMAILS`, origen en `ALLOWED_ORIGINS` y el despliegue indicado. |
| IA devuelve 429 | Se alcanzó una cuota diaria de la función o un límite del proveedor. Revisa los registros antes de repetir. |
| IA falla por configuración | Ejecuta `002_ai_quota.sql`, confirma los secretos y revisa que la función se llame `study-ai`. |
| Falló un respaldo | No lo consideres completo. Recupera conexión, comprueba acceso a los adjuntos y exporta de nuevo. |

Guía preparada para la entrega del 22 de septiembre de 2026. Los proveedores pueden cambiar los nombres de menús, límites y planes; los enlaces oficiales acompañan los pasos correspondientes.
