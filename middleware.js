/* =========================================================================
   Candado del /admin (Vercel Routing Middleware)
   Se ejecuta en el servidor ANTES de entregar cualquier archivo del admin.

   Modo Google (recomendado) — variables en Vercel:
     GOOGLE_CLIENT_ID  ID de cliente OAuth de Google
     SESSION_SECRET    texto aleatorio de 32+ caracteres
     ADMIN_EMAILS      correos autorizados (separados por coma)
   Sin sesión válida → te lleva a /login/ para entrar con Google.

   Modo respaldo — si Google no está configurado, pide usuario y contraseña:
     ADMIN_USER / ADMIN_PASSWORD
   Si no hay nada configurado, el admin queda bloqueado (falla cerrado).
   ========================================================================= */
import { googleConfigured, getSession } from "./api/_lib/session.js";

export const config = { matcher: ["/admin", "/admin/:path*"] };

const enc = new TextEncoder();
function safeEqual(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

const BASE_HEADERS = { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" };

export default async function middleware(request) {
  // ---- Modo Google ----
  if (googleConfigured()) {
    if (await getSession(request)) return; // sesión válida: sigue al admin
    const url = new URL("/login/", request.url);
    return new Response(null, { status: 302, headers: { Location: url.toString(), "Cache-Control": "no-store" } });
  }

  // ---- Modo respaldo: usuario y contraseña ----
  const user = (process.env.ADMIN_USER || "").trim();
  const pass = (process.env.ADMIN_PASSWORD || "").trim();
  if (!user || !pass) {
    return new Response("Admin bloqueado: configura el acceso con Google (o ADMIN_USER y ADMIN_PASSWORD) en Vercel.", { status: 503, headers: BASE_HEADERS });
  }
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try {
      const bin = atob(header.slice(6).trim());
      decoded = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    } catch { /* cabecera inválida */ }
    const i = decoded.indexOf(":");
    if (i > -1) {
      const okUser = safeEqual(decoded.slice(0, i).trim(), user);
      const okPass = safeEqual(decoded.slice(i + 1), pass);
      if (okUser && okPass) return;
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return new Response("Acceso restringido.", {
    status: 401,
    headers: { ...BASE_HEADERS, "WWW-Authenticate": 'Basic realm="Admin Thomgraphics", charset="UTF-8"' },
  });
}
