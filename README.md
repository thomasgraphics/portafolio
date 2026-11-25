# Thomgraphics · Portafolio

Es un portafolio que se ve como un escritorio de macOS y trae un panel **/admin** para editar todo sin tocar código. Está hecho con HTML, CSS y JavaScript, sin dependencias ni compilación.

```
portafolio/
├── index.html            ← el sitio (cambia aquí tu dominio en las etiquetas og:)
├── content/data.json     ← TODO el contenido (lo edita el admin)
├── js/app.js · css/      ← lógica y diseño del sitio
├── admin/                ← panel de administración
├── middleware.js         ← candado con usuario y contraseña para /admin
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

## 3. Usar el admin

1. **Crea tu token de GitHub** (se hace una sola vez):
   1. Ve a GitHub → tu foto → *Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token*.
   2. En *Repository access* elige **Only select repositories** y marca `portafolio`.
   3. En *Permissions* busca **Contents** y ponle **Read and write**. No le des ningún otro permiso.
   4. En *Expiration* pon 90 días. Cuando venza, creas otro.
2. Entra a `tudominio.com/admin`, escribe tu usuario y contraseña, y luego tu usuario de GitHub, el repositorio y el token.
3. Edita lo que quieras y haz clic en **Guardar y publicar**. Se crea un solo cambio en GitHub y Vercel actualiza el sitio en 1–2 minutos.

**Qué puedes editar (todo el sitio):**
- **General:** nombre, rol, fondo, enlaces de contacto, íconos del dock, notificación y nota adhesiva.
- **CV y showreel:** subir y cambiar tu CV en PDF y tu video.
- **Sobre mí** e **Intro.**
- **Escritorio e íconos:** mini escritorio para acomodar los íconos arrastrándolos; agregar, quitar, cambiar tipo y color, o subir un ícono propio.
- **Carpetas** y **Casos de estudio:** crear, editar y eliminar.
- **SEO y compartir:** título, descripción, imagen que aparece al compartir el enlace y favicon (se actualiza `index.html` automáticamente).
- **Diseño y apariencia:** fondo y textura (enfoque al entrar, desenfoque, profundidad de campo, grano estático o animado), modo oscuro automático de noche (horario configurable, fondo de noche opcional; pruébalo con `?modo=oscuro`), tipografías (sube las tuyas en WOFF2/WOFF/TTF/OTF o usa Google Fonts, para textos y títulos), grosor de títulos, todos los colores (acento, textos, ventanas, notas, barra de menú, dock), opacidades, esquinas, tamaño de íconos y dock, fondo para celular y mostrar/ocultar intro, notificación y nota, con vista previa en vivo y botón para restablecer.
- **Textos de la interfaz:** todos los botones y etiquetas del sitio en español e inglés.

Lo único que **no** se cambia desde el admin, por seguridad, es la contraseña del propio admin (va en Vercel → Environment Variables).

Las fotos que subas se optimizan solas: se reducen a 2400 px como máximo y se guardan en JPG. Los íconos conservan la transparencia.

---

## Estadísticas de visitas

En el admin → **Estadísticas**: visitas por día, a qué horas y qué días te visitan, países y ciudades, de qué red social llegan, dispositivos, idiomas y qué proyectos abren más. Anónimo: sin cookies y sin guardar IPs.

**Activarlas (una vez):** Vercel → proyecto → **Storage → Create Database → Upstash for Redis** (gratis) → conéctala al proyecto → **Redeploy**.

Usa los **enlaces con seguimiento** del panel (`?utm_source=instagram`, `whatsapp`, etc.) en cada red para saber cuál funciona mejor. Activa "No contar mis visitas" en tus navegadores.

## 4. Seguridad (qué te protege)

| Capa | Qué hace |
|---|---|
| **Candado de /admin** (`middleware.js`) | Pide usuario y contraseña en el servidor **antes** de entregar cualquier archivo del admin. Si falla, espera 1,2 s antes de responder para frenar ataques por fuerza bruta, y compara las claves en tiempo constante. Si faltan las variables, bloquea todo. |
| **Token de GitHub limitado** | Solo puede tocar **ese** repositorio y **solo** sus archivos. No sirve para tu cuenta ni para otros repos. Vence solo. |
| **Token fuera del código** | Nunca se sube al repositorio. Por defecto solo vive mientras el navegador está abierto. "Recordar" lo guarda en ese computador, así que úsalo solo en tu equipo. |
| **Cierre por inactividad** | La sesión del admin se cierra tras 30 minutos sin uso. |
| **Cabeceras de seguridad** (`vercel.json`) | Content-Security-Policy estricta (el sitio solo ejecuta su propio código, sin scripts externos inyectados), HTTPS obligatorio (HSTS), y protección contra clickjacking y contra la detección errónea de tipos de archivo (*MIME sniffing*). |
| **Contenido escapado** | Todo texto del JSON se muestra como texto, nunca como código, aunque alguien meta etiquetas HTML. |
| **Admin oculto de Google** | Tiene `noindex` y aparece en `robots.txt`. |
| **Historial en GitHub** | Cada publicación queda registrada. Si algo sale mal, puedes volver a cualquier versión anterior. |

**Si sospechas que alguien entró:**
1. Cambia `ADMIN_PASSWORD` en Vercel y haz *Redeploy*.
2. En GitHub, revoca el token (*Developer settings → Fine-grained tokens → Delete*) y crea uno nuevo.
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
- [ ] Variables `ADMIN_USER` y `ADMIN_PASSWORD` creadas en Vercel
- [ ] Verificación en dos pasos activa en GitHub y Vercel
- [ ] Dominio conectado y cambiado en `index.html`
- [ ] Probado en el celular y en una ventana de incógnito
