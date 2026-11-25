/* Inicio de sesión con Google para el admin */
(() => {
  "use strict";
  const msg = document.getElementById("msg");
  const btn = document.getElementById("gbtn");
  const say = (t) => { msg.textContent = t; };

  async function onCredential(resp) {
    say("Verificando…");
    try {
      const r = await fetch("/api/auth-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ credential: resp.credential }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { say(data.error || "No se pudo iniciar sesión."); return; }
      location.replace("/admin/");
    } catch {
      say("No hay conexión. Intenta de nuevo.");
    }
  }

  async function start() {
    let cfg = {};
    try {
      const r = await fetch("/api/auth-session", { credentials: "same-origin" });
      cfg = await r.json();
      if (cfg.authenticated) { location.replace("/admin/"); return; }
    } catch { /* sigue */ }
    if (!cfg.googleClientId || !cfg.googleReady) {
      say("El acceso con Google aún no está configurado en Vercel (GOOGLE_CLIENT_ID, SESSION_SECRET y ADMIN_EMAILS).");
      return;
    }
    const wait = (n = 0) => {
      if (window.google && google.accounts && google.accounts.id) {
        google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: onCredential, ux_mode: "popup", auto_select: false, itp_support: true });
        google.accounts.id.renderButton(btn, { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", locale: "es", width: 300 });
      } else if (n < 50) setTimeout(() => wait(n + 1), 100);
      else say("No se pudo cargar el botón de Google. Revisa tu conexión o bloqueadores.");
    };
    wait();
  }
  start();
})();
