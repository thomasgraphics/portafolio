/* =========================================================================
   Candado del /admin (Vercel Routing Middleware)
   Pide usuario y contraseña ANTES de entregar cualquier archivo del admin.
   Configura en Vercel → Settings → Environment Variables:
     ADMIN_USER       tu usuario
     ADMIN_PASSWORD   una contraseña larga (16+ caracteres, sin tildes ni ñ)
   Si no existen, el admin queda bloqueado (falla cerrado).
   ========================================================================= */

export const config = { matcher: ["/admin", "/admin/:path*"] };

const enc = new TextEncoder();
// Comparación en tiempo constante (no revela cuántos caracteres acertaste)
function safeEqual(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

const SECURITY = {
  "Cache-Control": "no-store",
  "Content-Type": "text/plain; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow",
};

export default async function middleware(request) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) {
    return new Response("Admin bloqueado: configura ADMIN_USER y ADMIN_PASSWORD en Vercel.", { status: 503, headers: SECURITY });
  }

  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try { decoded = atob(header.slice(6)); } catch { /* cabecera inválida */ }
    const i = decoded.indexOf(":");
    if (i > -1) {
      const okUser = safeEqual(decoded.slice(0, i), user);
      const okPass = safeEqual(decoded.slice(i + 1), pass);
      if (okUser && okPass) return; // acceso concedido: sigue al archivo pedido
    }
    // Frena los intentos de adivinar la contraseña
    await new Promise((r) => setTimeout(r, 1200));
  }

  return new Response("Acceso restringido.", {
    status: 401,
    headers: { ...SECURITY, "WWW-Authenticate": 'Basic realm="Admin Thomgraphics", charset="UTF-8"' },
  });
}
