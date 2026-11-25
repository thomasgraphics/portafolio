/* Recibe la credencial de "Iniciar sesión con Google", la verifica con Google
   y, si el correo está autorizado, crea la sesión del admin. */
import { json, sameOrigin, isAllowed, googleConfigured, signSession, sessionCookie, SESSION_HOURS, sleep } from "./_lib/session.js";

export default {
  async fetch(request) {
    if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);
    if (!sameOrigin(request)) return json({ error: "Origen no permitido" }, 403);
    if (!googleConfigured()) return json({ error: "Falta configurar GOOGLE_CLIENT_ID, SESSION_SECRET y ADMIN_EMAILS en Vercel." }, 503);

    let credential;
    try { ({ credential } = await request.json()); } catch { /* cuerpo inválido */ }
    if (typeof credential !== "string" || credential.length < 20 || credential.length > 4096) return json({ error: "Solicitud inválida" }, 400);

    // Google valida la firma del token y devuelve sus datos
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
    if (!r.ok) { await sleep(800); return json({ error: "No se pudo verificar tu cuenta de Google." }, 401); }
    const t = await r.json();

    const validIssuer = t.iss === "accounts.google.com" || t.iss === "https://accounts.google.com";
    if (t.aud !== process.env.GOOGLE_CLIENT_ID || !validIssuer || String(t.email_verified) !== "true" || +t.exp < Date.now() / 1000) {
      await sleep(800);
      return json({ error: "La credencial de Google no es válida." }, 401);
    }
    if (!isAllowed(t.email)) {
      await sleep(1200);
      return json({ error: `La cuenta ${t.email} no tiene acceso a este admin.` }, 403);
    }

    const maxAge = SESSION_HOURS * 3600;
    const token = await signSession({ email: String(t.email).toLowerCase(), name: t.name || "", exp: Math.floor(Date.now() / 1000) + maxAge });
    return json({ ok: true, email: t.email }, 200, { "Set-Cookie": sessionCookie(token, maxAge) });
  },
};
