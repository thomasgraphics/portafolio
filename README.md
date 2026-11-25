# Thomgraphics · Portafolio

Es un portafolio que se ve como un escritorio de macOS y trae un panel **/admin** para editar todo sin tocar código. Está hecho con HTML, CSS y JavaScript, sin dependencias ni compilación.

```
portafolio/
├── index.html            ← el sitio (cambia aquí tu dominio en las etiquetas og:)
├── content/data.json     ← TODO el contenido (lo edita el admin)
├── js/app.js · css/      ← lógica y diseño del sitio
├── admin/                ← panel de administración
├── middleware.js         ← candado de /admin (Google o contraseña)
├── api/                  ← funciones del servidor: login con Google y publicación segura
├── login/                ← página de inicio de sesión con Google
├── vercel.json           ← cabeceras de seguridad
├── assets/               ← imágenes, CV, video · assets/uploads = lo que subes desde el admin
└── robots.txt · package.json · .gitignore
```

---

## 1. Publicar el sitio (GitHub + Vercel, gratis)

1. **GitHub**
   1. Crea una cuenta en github.com y **activa la verificación en dos pasos** (Settings → Password and authentication).
   2. Crea un repositorio nuevo llamado `portafolio`.
   3. Haz clic en *uploading an existing file* y arrastra **el contenido** de esta carpeta, incluidos `.gitignore`, `vercel.json` y `middleware.js`.
   4. Haz clic en *Commit changes*.
   > Si no ves `.gitignore` al arrastrar, actívalo en Windows: Explorador → Vista → Mostrar → Elementos ocultos. O usa GitHub Desktop.
2. **Vercel**
   1. Entra a vercel.com con tu cuenta de GitHub.
   2. Ve a *Add New → Project* e importa `portafolio`.
   3. En *Framework Preset* elige **Other** y haz clic en **Deploy**.
3. **Contraseña del admin** (en Vercel → tu proyecto → *Settings → Environment Variables*). Agrega dos variables:
   - `ADMIN_USER`: el usuario que quieras.
   - `ADMIN_PASSWORD`: una contraseña de **16 caracteres o más**, sin tildes ni ñ. Usa un gestor de contraseñas.

   Después ve a *Deployments → ⋯ → Redeploy* para que las tome. Sin estas variables el admin queda bloqueado.

---

## 2. Conectar tu dominio

### En Vercel
Ve a *Settings → Domains*, escribe `tudominio.com` y haz clic en *Add*. Acepta también `www.tudominio.com`. Vercel te mostrará los registros DNS exactos: **copia los valores de esa tarjeta**.

### Donde compraste el dominio (GoDaddy, Hostinger, Namecheap, etc.)
Entra a *DNS / Administrar DNS* y crea estos registros:

| Tipo | Nombre / Host | Valor |
|---|---|---|
| A | `@` | El de la tarjeta de Vercel (normalmente `76.76.21.21`) |
| CNAME | `www` | El de la tarjeta de Vercel |

- **Borra** cualquier otro registro `A` o `AAAA` con `@` (el "parking" del proveedor).
- **No toques** los registros `MX`, porque son los de tu correo.
- Espera de unos minutos a 24 horas. Cuando Vercel muestre **Valid Configuration**, tu sitio ya funciona con HTTPS (el certificado es automático).

### Último ajuste
En `index.html`, reemplaza las 3 apariciones de `https://tudominio.com` por tu dominio y sube el cambio.

---

## 3. Entrar al admin con Google (recomendado)

Entras con tu cuenta de Google y publicas sin pegar ningún token: el token de GitHub vive guardado en Vercel (servidor), nunca en el navegador.

### 3.1 Crear el "ID de cliente" de Google (una sola vez)
1. Entra a **console.cloud.google.com** con tu cuenta de Google → arriba, **Seleccionar proyecto → Proyecto nuevo** → nombre `Portafolio admin` → Crear.
2. Menú → **APIs y servicios → Pantalla de consentimiento de OAuth** (o *Google Auth Platform*) → **Comenzar**:
   - Nombre de la app: `Admin Thomgraphics`, correo de asistencia: el tuyo.
   - Público: **Externo** → correo de contacto → Aceptar → Crear.
   - En **Público / Usuarios de prueba** agrega tu correo de Google.
3. **Clientes → Crear cliente** → Tipo: **Aplicación web** → Nombre: `Admin`.
   - **Orígenes autorizados de JavaScript** (agrega los 3):
     `https://www.thomgraphics.com` · `https://thomgraphics.com` · `https://portafolio-ten-virid-47.vercel.app`
   - No necesitas "URI de redireccionamiento".
   - **Crear** → copia el **ID de cliente** (termina en `.apps.googleusercontent.com`).

### 3.2 Token de GitHub para el servidor
GitHub → Settings → Developer settings → **Fine-grained tokens → Generate new token**: solo el repo `portafolio`, **Contents: Read and write**, 90 días. Cópialo (solo lo pegarás en Vercel).

### 3.3 Variables en Vercel (Settings → Environment Variables)
| Variable | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | El ID de cliente del paso 3.1 |
| `ADMIN_EMAILS` | Tu correo de Google (varios: separados por coma) |
| `SESSION_SECRET` | Una clave aleatoria de **40+ caracteres** (genérala con un gestor de contraseñas) |
| `GITHUB_TOKEN` | El token del paso 3.2 |

Luego **Deployments → ⋯ → Redeploy**. Listo: `tudominio.com/admin` te lleva a **Iniciar sesión con Google**.

> Mientras Google no esté configurado, el admin sigue pidiendo `ADMIN_USER` / `ADMIN_PASSWORD`. Cuando Google funcione, puedes borrar esas dos variables.

### Cómo se usa
Entra a `/admin` → Google → edita → **Guardar y publicar** → en 1–2 min está en línea. La sesión dura 8 horas.

**Qué puedes editar (todo el sitio):**
- **General:** nombre, rol, fondo, enlaces de contacto, íconos del dock, notificación y nota adhesiva.
- **CV y showreel:** subir y cambiar tu CV en PDF y tu video.
- **Sobre mí** e **Intro.**
- **Escritorio e íconos:** mini escritorio para acomodar los íconos arrastrándolos; agregar, quitar, cambiar tipo y color, o subir un ícono propio.
- **Carpetas** y **Casos de estudio:** crear, editar y eliminar.
- **SEO y compartir:** título, descripción, imagen al compartir el enlace y favicon.
- **Diseño y apariencia:** tipografías (sube las tuyas o usa Google Fonts), colores, opacidades, esquinas, tamaños, fondo para celular y mostrar/ocultar elementos, con vista previa.
- **Textos de la interfaz:** todos los botones y etiquetas en español e inglés.

**Límite de archivos con Google:** 3 MB por archivo (fotos se optimizan solas). Para PDFs o videos más pesados: comprímelos, o usa **Modo avanzado (token)** desde la barra lateral del admin (hasta 25 MB).

## 4. Seguridad (qué te protege)

| Capa | Qué hace |
|---|---|
| **Inicio con Google** (`middleware.js` + `/api`) | El servidor verifica con Google que la cuenta es tuya y que el correo está en `ADMIN_EMAILS`. Crea una sesión en una cookie firmada (HttpOnly, Secure) que dura 8 horas. Sin sesión válida, ningún archivo del admin se entrega. Si quitas un correo de la lista, pierde acceso al instante. |
| **Token solo en el servidor** | `GITHUB_TOKEN` vive en Vercel. El navegador nunca lo ve. El puente `/api/github` solo acepta tu sesión, solo peticiones de tu propio dominio (anti-CSRF) y solo puede escribir `content/data.json`, `index.html` y `assets/uploads/`. Cada publicación queda firmada con tu correo en GitHub. |
| **Respaldo con contraseña** | Si Google no está configurado, el admin pide `ADMIN_USER`/`ADMIN_PASSWORD` (con freno anti fuerza bruta). Si no hay nada configurado, queda bloqueado. |
| **Token de GitHub limitado** | Solo puede tocar **ese** repositorio y **solo** sus archivos. No sirve para tu cuenta ni para otros repos. Vence solo. |
| **Token fuera del código** | Nunca se sube al repositorio. Por defecto solo vive mientras el navegador está abierto. "Recordar" lo guarda en ese computador, así que úsalo solo en tu equipo. |
| **Cierre por inactividad** | La sesión del admin se cierra tras 30 minutos sin uso. |
| **Cabeceras de seguridad** (`vercel.json`) | Content-Security-Policy estricta (el sitio solo ejecuta su propio código, sin scripts externos inyectados), HTTPS obligatorio (HSTS), y protección contra clickjacking y contra la detección errónea de tipos de archivo (*MIME sniffing*). |
| **Contenido escapado** | Todo texto del JSON se muestra como texto, nunca como código, aunque alguien meta etiquetas HTML. |
| **Admin oculto de Google** | Tiene `noindex` y aparece en `robots.txt`. |
| **Historial en GitHub** | Cada publicación queda registrada. Si algo sale mal, puedes volver a cualquier versión anterior. |

**Si sospechas que alguien entró:**
1. Cambia `SESSION_SECRET` en Vercel y haz *Redeploy*: todas las sesiones abiertas se cierran.
2. Activa la verificación en dos pasos de tu cuenta de Google (myaccount.google.com → Seguridad).
3. En GitHub, revoca el token (*Developer settings → Fine-grained tokens → Delete*), crea uno nuevo y ponlo en `GITHUB_TOKEN`.
3. Revisa el historial de commits del repo y revierte lo que no reconozcas.

**Hábitos:**
- Mantén activa la verificación en dos pasos en GitHub y en Vercel.
- No compartas el token por WhatsApp ni por correo.
- No marques "Recordar" en computadores ajenos.

---

## 5. Trabajar en tu computador

Abre la carpeta con **VS Code**, instala la extensión **Live Server** y haz clic derecho en `index.html` → *Open with Live Server*. Si abres el archivo con doble clic, el sitio no carga el contenido.

Para el admin en local, usa *Entrar sin GitHub (modo local)*. Puedes editar y descargar el `data.json`, que luego reemplazas en `content/`. El candado de contraseña solo funciona ya publicado en Vercel.

---

## Checklist antes de compartir
- [ ] Fondo, intro y fotos reales (súbelas desde el admin)
- [ ] Ningún `[TODO]` en los casos de estudio
- [ ] WhatsApp, LinkedIn, Instagram y correo correctos
- [ ] CV real (en *Escritorio*, ícono CV → Archivo PDF)
- [ ] Variables `GOOGLE_CLIENT_ID`, `ADMIN_EMAILS`, `SESSION_SECRET` y `GITHUB_TOKEN` creadas en Vercel
- [ ] Verificación en dos pasos activa en GitHub y Vercel
- [ ] Dominio conectado y cambiado en `index.html`
- [ ] Probado en el celular y en una ventana de incógnito
