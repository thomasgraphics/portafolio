/* GET  → datos de la sesión actual (o 401) y configuración pública del login
   POST → cerrar sesión */
import { json, getSession, sameOrigin, sessionCookie, googleConfigured } from "./_lib/session.js";

export default {
  async fetch(request) {
    if (request.method === "POST") {
      if (!sameOrigin(request)) return json({ error: "Origen no permitido" }, 403);
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
    }
    if (request.method !== "GET") return json({ error: "Método no permitido" }, 405);

    const config = { googleClientId: process.env.GOOGLE_CLIENT_ID || "", googleReady: googleConfigured(), serverPublish: !!process.env.GITHUB_TOKEN };
    const s = googleConfigured() ? await getSession(request) : null;
    if (!s) return json({ authenticated: false, ...config }, 401);
    return json({ authenticated: true, email: s.email, name: s.name, ...config });
  },
};
