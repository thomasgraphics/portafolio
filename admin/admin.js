/* =========================================================================
   Thomgraphics · Admin
   Edita content/data.json y sube imágenes directo a tu repositorio de GitHub.
   Al guardar se crea UN commit; Vercel/Netlify vuelve a publicar el sitio solo.
   ========================================================================= */
(() => {
  "use strict";

  // ---------- Utilidades ----------
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  // Credenciales: por defecto solo durante la sesión (se borran al cerrar el navegador)
  const creds = {
    get() {
      try { return JSON.parse(sessionStorage.getItem("tgadmin:gh") || localStorage.getItem("tgadmin:gh") || "null"); } catch { return null; }
    },
    set(v, remember) {
      try {
        this.clear();
        (remember ? localStorage : sessionStorage).setItem("tgadmin:gh", JSON.stringify(v));
      } catch { /* */ }
    },
    clear() { try { sessionStorage.removeItem("tgadmin:gh"); localStorage.removeItem("tgadmin:gh"); } catch { /* */ } },
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem("tgadmin:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("tgadmin:" + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
    del(k) { try { localStorage.removeItem("tgadmin:" + k); } catch { /* */ } },
  };
  const t = (v) => (v == null ? "" : typeof v === "object" ? v.es || v.en || "" : String(v));
  const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

  let toastTimer;
  function toast(msg, kind = "") {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast show " + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = "toast " + kind), kind === "error" ? 6000 : 3200);
  }

  const MONO = `<svg viewBox="0 0 64 64" width="22" height="22"><path d="M14 16h36v9H36.5v25h-9V25H14z" fill="#f4f1e8"/><circle cx="48" cy="46" r="5" fill="#c9a96e"/></svg>`;

  // ---------- Estado ----------
  let D = null;           // contenido (data.json)
  let mode = null;        // "github" | "local"
  let gh = null;          // { owner, repo, branch, token }
  let pending = {};       // archivos por subir: path -> { b64, url }
  let dirty = false;
  let section = store.get("section", "general");
  const openCases = new Set();

  function touch() {
    if (!dirty) { dirty = true; updateTopbar(); }
  }
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- GitHub API ----------
  async function api(path, opts = {}) {
    const r = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}${path}`, {
      method: opts.method || "GET",
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      headers: {
        Authorization: `Bearer ${gh.token}`,
        Accept: opts.accept || "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!r.ok) {
      let msg = "";
      try { msg = (await r.json()).message; } catch { /* */ }
      const hints = { 401: "El token no es válido o expiró.", 403: "El token no tiene permiso de escritura (Contents: Read and write).", 404: "No se encontró el repositorio, la rama o el archivo. Revisa usuario, repo y rama." };
      throw new Error(hints[r.status] || `GitHub respondió ${r.status}${msg ? ": " + msg : ""}`);
    }
    return opts.raw ? r.text() : r.json();
  }

  async function loadFromGitHub() {
    const raw = await api(`/contents/content/data.json?ref=${encodeURIComponent(gh.branch)}`, { accept: "application/vnd.github.raw+json", raw: true });
    return JSON.parse(raw);
  }
  async function loadFromSite() {
    const r = await fetch("/content/data.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("No se pudo leer content/data.json");
    return r.json();
  }

  function cleanup(o) {
    // Quita campos opcionales vacíos para dejar el JSON limpio
    (o.desktop || []).forEach((d) => ["icon", "poster", "href", "src"].forEach((k) => { if (d[k] === "") delete d[k]; }));
    Object.keys(o.dockIcons || {}).forEach((k) => { if (!o.dockIcons[k]) delete o.dockIcons[k]; });
    Object.keys(o.uiText || {}).forEach((k) => { const v = o.uiText[k]; if (!v || (!v.es && !v.en)) delete o.uiText[k]; });
    return o;
  }

  // Reescribe las etiquetas de SEO / vista previa / favicon de index.html
  function rewriteIndex(html) {
    const S = D.seo || {};
    const base = String(S.siteUrl || "").trim().replace(/\/+$/, "");
    const a = (v) => String(v || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const abs = (p) => (!p ? "" : /^https?:/i.test(p) ? p : `${base}/${String(p).replace(/^\//, "")}`);
    const set = (re, val) => { html = html.replace(re, (m, pre, post) => pre + val + post); };
    if (S.title) {
      html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${a(S.title)}</title>`);
      set(/(<meta property="og:title" content=")[^"]*(")/, a(S.title));
    }
    if (S.description) {
      set(/(<meta name="description" content=")[^"]*(")/, a(S.description));
      set(/(<meta property="og:description" content=")[^"]*(")/, a(S.description));
    }
    if (base) {
      set(/(<meta property="og:url" content=")[^"]*(")/, a(base + "/"));
      set(/(<link rel="canonical" href=")[^"]*(")/, a(base + "/"));
    }
    if (S.shareImage && base) set(/(<meta property="og:image" content=")[^"]*(")/, a(abs(S.shareImage)));
    if (S.favicon) {
      const ext = (S.favicon.split(".").pop() || "").toLowerCase();
      const mime = { svg: "image/svg+xml", png: "image/png", ico: "image/x-icon", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg" }[ext] || "image/png";
      html = html.replace(/<link rel="icon"[^>]*>/, () => `<link rel="icon" href="/${a(S.favicon.replace(/^\//, ""))}" type="${mime}" />`);
    }
    return html;
  }

  async function publish(btn) {
    cleanup(D);
    const json = JSON.stringify(D, null, 2) + "\n";
    const files = [{ path: "content/data.json", content: json, encoding: "utf-8" }];
    for (const [p, f] of Object.entries(pending)) if (json.includes(p)) files.push({ path: p, content: f.b64, encoding: "base64" });

    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span> Publicando…`;
    try {
      if (D.seo) {
        try {
          const oldHtml = await api(`/contents/index.html?ref=${encodeURIComponent(gh.branch)}`, { accept: "application/vnd.github.raw+json", raw: true });
          const newHtml = rewriteIndex(oldHtml);
          if (newHtml !== oldHtml) files.push({ path: "index.html", content: newHtml, encoding: "utf-8" });
        } catch { /* si no se puede leer index.html, se publica el resto */ }
      }
      const ref = await api(`/git/ref/heads/${encodeURIComponent(gh.branch)}`);
      const baseSha = ref.object.sha;
      const baseCommit = await api(`/git/commits/${baseSha}`);
      const tree = [];
      for (const f of files) {
        const blob = await api("/git/blobs", { method: "POST", body: { content: f.content, encoding: f.encoding } });
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
      }
      const newTree = await api("/git/trees", { method: "POST", body: { base_tree: baseCommit.tree.sha, tree } });
      const uploads = files.filter((f) => f.encoding === "base64").length;
      const commit = await api("/git/commits", {
        method: "POST",
        body: { message: `Actualiza contenido desde el admin${uploads ? ` (+${uploads} archivo${uploads > 1 ? "s" : ""})` : ""}`, tree: newTree.sha, parents: [baseSha] },
      });
      await api(`/git/refs/heads/${encodeURIComponent(gh.branch)}`, { method: "PATCH", body: { sha: commit.sha } });
      pending = {};
      dirty = false;
      toast("¡Publicado! Tu sitio se actualiza en 1–2 minutos.");
      updateTopbar(true);
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
      btn.textContent = "Guardar y publicar";
    }
  }

  function downloadJSON() {
    cleanup(D);
    const blob = new Blob([JSON.stringify(D, null, 2) + "\n"], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: "data.json" });
    document.body.append(a); a.click(); a.remove();
    toast("Descargado. Reemplaza content/data.json en tu proyecto con este archivo.");
  }

  // ---------- Subida de archivos ----------
  async function upload(file, f) {
    if (mode !== "github") { toast("Conecta tu GitHub para subir archivos. En modo local escribe la ruta a mano.", "warn"); return null; }
    let blob = file;
    let ext = (file.name.split(".").pop() || "bin").toLowerCase();
    if (f.type === "image" && !f.keepFormat && /^image\/(jpeg|png|webp)$/.test(file.type)) {
      try {
        const bmp = await createImageBitmap(file);
        const max = f.max || 2400;
        const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const c = h("canvas", { width: Math.round(bmp.width * s), height: Math.round(bmp.height * s) });
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(bmp, 0, 0, c.width, c.height);
        blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
        ext = "jpg";
      } catch { /* si falla, se sube el original */ }
    }
    if (blob.size > 25 * 1024 * 1024) { toast("El archivo pesa más de 25 MB. Comprímelo antes de subirlo.", "error"); return null; }
    const path = `assets/uploads/${stamp()}-${slug(file.name.replace(/\.[^.]+$/, "")) || "archivo"}.${ext}`;
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
    pending[path] = { b64, url: URL.createObjectURL(blob) };
    return path;
  }
  const resolve = (p) => (pending[p] ? pending[p].url : p ? (/^(https?:|\/)/.test(p) ? p : "/" + p) : "");

  // ---------- Campos de formulario ----------
  function i18nObj(obj, key) {
    let v = obj[key];
    if (v == null || typeof v !== "object") { v = { es: v || "", en: v || "" }; obj[key] = v; }
    return v;
  }

  function field(obj, f, rerender) {
    if (f.when && !f.when(obj)) return null;
    const ctl = h("div", { class: "ctl" });
    const row = h("div", { class: "row" + (f.type === "list" || f.wide ? " wide" : "") },
      f.type === "list" ? null : h("div", { class: "lbl" }, f.label, f.hint ? h("small", {}, f.hint) : null), ctl);

    switch (f.type) {
      case "text":
      case "number": {
        const inp = h("input", { type: f.type === "number" ? "number" : "text", value: obj[f.key] ?? "", placeholder: typeof f.ph === "string" ? f.ph : "", step: f.step, min: f.min, max: f.max });
        inp.addEventListener("input", () => {
          obj[f.key] = f.type === "number" ? (inp.value === "" ? 0 : +inp.value) : inp.value;
          touch();
        });
        ctl.append(inp);
        break;
      }
      case "toggle": {
        const cb = h("input", { type: "checkbox", class: "switch", checked: obj[f.key] !== false });
        cb.addEventListener("change", () => { obj[f.key] = cb.checked; touch(); });
        ctl.append(h("label", { class: "toggle" }, cb, h("span", {}, f.on || "Mostrar")));
        break;
      }
      case "color": {
        const val = /^#[0-9a-f]{6}$/i.test(obj[f.key] || "") ? obj[f.key] : f.def || "#0a64d8";
        const pick = h("input", { type: "color", value: val });
        const txt = h("input", { type: "text", value: val, class: "path" });
        pick.addEventListener("input", () => { obj[f.key] = pick.value; txt.value = pick.value; touch(); });
        txt.addEventListener("input", () => { if (/^#[0-9a-f]{6}$/i.test(txt.value)) { obj[f.key] = txt.value; pick.value = txt.value; touch(); } });
        ctl.append(h("div", { class: "colorrow" }, pick, txt));
        break;
      }
      case "textarea": {
        const ta = h("textarea", { rows: f.rows || 3, placeholder: f.ph || "" });
        ta.value = obj[f.key] ?? "";
        ta.addEventListener("input", () => { obj[f.key] = ta.value; touch(); });
        ctl.append(ta);
        break;
      }
      case "select": {
        const options = typeof f.options === "function" ? f.options(obj) : f.options;
        if (obj[f.key] == null && options.length) obj[f.key] = options[0][0];
        const sel = h("select", {}, options.map(([v, l]) => h("option", { value: v, selected: obj[f.key] === v }, l)));
        sel.addEventListener("change", () => { obj[f.key] = sel.value; touch(); if (f.rerender) rerender(); });
        ctl.append(sel);
        break;
      }
      case "i18n":
      case "i18nArea": {
        const v = i18nObj(obj, f.key);
        ["es", "en"].forEach((l) => {
          const inp = f.type === "i18nArea" ? h("textarea", { rows: f.rows || 3 }) : h("input", { type: "text" });
          inp.placeholder = f.ph && typeof f.ph === "object" ? f.ph[l] : l === "es" ? "Español" : "English";
          inp.value = v[l] || "";
          inp.addEventListener("input", () => { v[l] = inp.value; touch(); });
          ctl.append(h("div", { class: "lang" }, h("span", { class: "flag" }, l.toUpperCase()), inp));
        });
        break;
      }
      case "image":
      case "file":
        ctl.append(mediaCtl(obj, f));
        break;
      case "list":
        ctl.append(h("div", { class: "lbl" }, f.label, f.hint ? h("small", {}, f.hint) : null), listCtl(obj, f));
        break;
    }
    return row;
  }

  function mediaCtl(obj, f) {
    const wrap = h("div", { class: "media" });
    const draw = () => {
      wrap.innerHTML = "";
      const val = obj[f.key] || "";
      const isImg = /\.(jpe?g|png|webp|gif|svg|avif)$/i.test(val);
      const thumb = h("div", { class: "thumb" + (f.keepFormat ? " icon" : "") },
        val ? (isImg ? h("img", { src: resolve(val), alt: "" }) : h("span", {}, (val.split(".").pop() || "").toUpperCase())) : h("span", { class: "empty" }, "Vacío"));
      const input = h("input", { type: "file", accept: f.accept || "image/*", hidden: true });
      input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return;
        const p = await upload(file, f);
        if (p) { obj[f.key] = p; touch(); draw(); }
      });
      const path = h("input", { type: "text", class: "path", value: val, placeholder: "assets/…" });
      path.addEventListener("input", () => { obj[f.key] = path.value; touch(); });
      path.addEventListener("change", draw);
      wrap.append(thumb, h("div", { class: "media-side" },
        h("div", { class: "btns" },
          h("button", { class: "btn sm", type: "button", onclick: () => input.click() }, val ? "Cambiar…" : "Subir…"),
          val && f.optional ? h("button", { class: "btn sm ghost danger", type: "button", onclick: () => { obj[f.key] = ""; touch(); draw(); } }, "Quitar") : null),
        path, pending[val] ? h("span", { class: "pend" }, "Nuevo · se sube al publicar") : null, input));
    };
    draw();
    return wrap;
  }

  function listCtl(obj, f) {
    if (!Array.isArray(obj[f.key])) obj[f.key] = [];
    const arr = obj[f.key];
    const wrap = h("div", { class: "list" });
    const complex = !!f.item.fields;
    const draw = () => {
      wrap.innerHTML = "";
      arr.forEach((item, i) => {
        const move = (d) => { const j = i + d; [arr[i], arr[j]] = [arr[j], arr[i]]; touch(); draw(); };
        const tools = h("div", { class: "li-tools" },
          h("button", { class: "ib", type: "button", title: "Subir", disabled: i === 0, onclick: () => move(-1) }, "↑"),
          h("button", { class: "ib", type: "button", title: "Bajar", disabled: i === arr.length - 1, onclick: () => move(1) }, "↓"),
          h("button", { class: "ib danger", type: "button", title: "Eliminar", onclick: () => { arr.splice(i, 1); touch(); draw(); } }, "✕"));
        const body = h("div", { class: "li-fields" });
        if (complex) {
          const redraw = () => { body.innerHTML = ""; f.item.fields.forEach((sf) => { const e = field(item, sf, redraw); if (e) body.append(e); }); };
          redraw();
        } else {
          const box = { get v() { return arr[i]; }, set v(x) { arr[i] = x; } };
          body.append(field(box, { ...f.item, key: "v", label: "" }, draw));
        }
        const title = f.item.title ? f.item.title(item, i) : `${f.item.noun || "Elemento"} ${i + 1}`;
        wrap.append(h("div", { class: "li" + (complex ? "" : " simple") },
          h("div", { class: "li-head" }, h("span", { class: "li-n" }, title), tools), body));
      });
      wrap.append(h("button", { class: "add", type: "button", onclick: () => { arr.push(f.item.make ? f.item.make() : complex ? {} : ""); touch(); draw(); } }, "+ " + (f.addLabel || "Agregar")));
    };
    draw();
    return wrap;
  }

  const group = (title, desc, obj, fields) => {
    const box = h("div", { class: "box" });
    const draw = () => { box.innerHTML = ""; fields.forEach((f) => { const e = field(obj, f, draw); if (e) box.append(e); }); };
    draw();
    return h("section", { class: "group" }, h("h3", {}, title), desc ? h("p", {}, desc) : null, box);
  };

  // ---------- Opciones ----------
  const TYPES = [["folder", "Carpeta"], ["note", "Nota (Sobre mí)"], ["pdf", "PDF (CV)"], ["photo", "Foto"], ["video", "Video"], ["link", "Enlace externo"]];
  const COLORS = [["blue", "Azul"], ["pink", "Rosado"], ["purple", "Morado"], ["green", "Verde"], ["orange", "Naranja"], ["teal", "Verde agua"], ["gray", "Gris"]];
  const typeName = (v) => (TYPES.find((x) => x[0] === v) || [, v])[1];
  const ICON_ACCEPT = "image/png,image/svg+xml,image/webp";

  function ensureFolders() {
    D.folders = D.folders || {};
    D.desktop.filter((d) => d.type === "folder").forEach((d) => {
      if (!D.folders[d.id]) D.folders[d.id] = { title: JSON.parse(JSON.stringify(d.label || { es: d.id, en: d.id })), intro: { es: "", en: "" }, items: [] };
    });
  }

  // ---------- Secciones ----------
  const SECTIONS = [
    { id: "general", name: "General", color: "#8e8e93", icon: `<svg viewBox="0 0 16 16" fill="#fff"><circle cx="8" cy="8" r="2.4"/><path d="M8 1.5l1.2 1.7 2-.5.3 2 1.9.8-.8 1.9 1.3 1.6-1.7 1.2.5 2-2 .3-.8 1.9-1.9-.8L8 14.5l-1.2-1.7-2 .5-.3-2-1.9-.8.8-1.9L2.1 7l1.7-1.2-.5-2 2-.3.8-1.9 1.9.8z" fill="none" stroke="#fff" stroke-width="1.3"/></svg>` },
    { id: "cv", name: "CV y showreel", color: "#e5484d", icon: `<svg viewBox="0 0 16 16" fill="#fff"><path d="M4 1.5h5.5l3 3V14a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5z"/><rect x="5" y="8" width="6" height="1.2" fill="#e5484d"/><rect x="5" y="10.3" width="4" height="1.2" fill="#e5484d"/></svg>` },
    { id: "about", name: "Sobre mí", color: "#f5b82e", icon: `<svg viewBox="0 0 16 16" fill="#fff"><circle cx="8" cy="5.5" r="2.8"/><path d="M2.5 14c.6-3 2.9-4.5 5.5-4.5s4.9 1.5 5.5 4.5z"/></svg>` },
    { id: "intro", name: "Intro", color: "#ff5f6d", icon: `<svg viewBox="0 0 16 16" fill="#fff"><path d="M5 3.5v9l7-4.5z"/></svg>` },
    { id: "desktop", name: "Escritorio e íconos", color: "#34aadc", icon: `<svg viewBox="0 0 16 16" fill="#fff"><rect x="2" y="3" width="12" height="8" rx="1.5"/><rect x="6" y="12" width="4" height="1.6" rx=".8"/></svg>` },
    { id: "folders", name: "Carpetas", color: "#0a84ff", icon: `<svg viewBox="0 0 16 16" fill="#fff"><path d="M1.5 4a1.5 1.5 0 0 1 1.5-1.5h3l1.5 1.5H13A1.5 1.5 0 0 1 14.5 5.5v6A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5z"/></svg>` },
    { id: "seo", name: "SEO y compartir", color: "#30b0c7", icon: `<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.6"><circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 14 14"/></svg>` },
    { id: "look", name: "Apariencia", color: "#ff9500", icon: `<svg viewBox="0 0 16 16" fill="#fff"><path d="M8 1.5a6.5 6.5 0 1 0 0 13c.9 0 1.3-.6 1.3-1.2 0-.8-.6-1-.6-1.7 0-.6.5-1.1 1.2-1.1h1.6a3 3 0 0 0 3-3c0-3.3-2.9-6-6.5-6z"/><circle cx="4.8" cy="7.5" r="1" fill="#ff9500"/><circle cx="7" cy="4.6" r="1" fill="#ff9500"/><circle cx="10.4" cy="5.2" r="1" fill="#ff9500"/></svg>` },
    { id: "texts", name: "Textos de la interfaz", color: "#5856d6", icon: `<svg viewBox="0 0 16 16" fill="#fff"><path d="M3 3h10v2.2h-1.4V4.4H8.7v7.2h1.5V13H5.8v-1.4h1.5V4.4H4.4v.8H3z"/></svg>` },
    { id: "cases", name: "Casos de estudio", color: "#af52de", icon: `<svg viewBox="0 0 16 16" fill="#fff"><rect x="2" y="2.5" width="12" height="11" rx="1.6"/><rect x="4" y="5" width="8" height="1.4" rx=".7" fill="#af52de"/><rect x="4" y="8" width="5" height="1.4" rx=".7" fill="#af52de"/></svg>` },
  ];

  // Textos editables de la interfaz del sitio (vacío = texto por defecto)
  const UI_KEYS = [
    ["skip", "Botón saltar intro", "Saltar intro", "Skip intro"], ["now", "Hora de la notificación", "ahora", "now"],
    ["info", "Menú «Info»", "Info", "Info"], ["instagram", "Menú «Instagram» / dock", "Instagram", "Instagram"],
    ["all", "Filtro «Todo»", "Todo", "All"], ["cases", "Filtro «Casos»", "Casos", "Cases"], ["photos", "Filtro «Fotos»", "Fotos", "Photos"], ["videos", "Filtro «Videos»", "Videos", "Videos"],
    ["items", "Contador de elementos ({n} = número)", "{n} elementos", "{n} items"], ["caseBadge", "Etiqueta de caso", "Caso de estudio", "Case study"], ["video", "Etiqueta de video", "Video", "Video"],
    ["client", "Ficha: Cliente", "Cliente", "Client"], ["role", "Ficha: Rol", "Rol", "Role"], ["year", "Ficha: Año", "Año", "Year"], ["tools", "Ficha: Herramientas", "Herramientas", "Tools"],
    ["prev", "Botón caso anterior", "← Anterior", "← Previous"], ["next", "Botón caso siguiente", "Siguiente →", "Next →"],
    ["favorites", "Barra lateral: Favoritos", "Favoritos", "Favorites"], ["more", "Barra lateral: Más", "Más", "More"],
    ["download", "Botón descargar CV", "Descargar", "Download"], ["openTab", "Abrir PDF en pestaña", "Abrir en pestaña nueva", "Open in new tab"],
    ["pdfMobile", "Aviso del PDF en celular", "Toca el botón para ver el PDF.", "Tap the button to view the PDF."],
    ["whatsapp", "Dock: WhatsApp", "WhatsApp", "WhatsApp"], ["linkedin", "Dock: LinkedIn", "LinkedIn", "LinkedIn"], ["behance", "Dock: Behance", "Behance", "Behance"], ["email", "Dock: Correo", "Correo", "Email"],
    ["close", "Botón cerrar ventana", "Cerrar", "Close"],
  ];

  // Mini escritorio para mover íconos arrastrando
  function positionEditor() {
    const stage = h("div", { class: "stage", style: `background-image:url("${resolve(D.wallpaper)}")` });
    D.desktop.forEach((it) => {
      const chip = h("div", { class: "chip " + (it.type || ""), style: `left:${it.x}%;top:${it.y}%` }, t(it.label) || it.id);
      chip.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        chip.setPointerCapture(e.pointerId);
        chip.classList.add("drag");
        const r = stage.getBoundingClientRect();
        const move = (ev) => {
          it.x = Math.round(Math.min(96, Math.max(4, ((ev.clientX - r.left) / r.width) * 100)) * 2) / 2;
          it.y = Math.round(Math.min(90, Math.max(5, ((ev.clientY - r.top) / r.height) * 100)) * 2) / 2;
          chip.style.left = it.x + "%"; chip.style.top = it.y + "%";
        };
        const up = () => {
          chip.removeEventListener("pointermove", move);
          chip.classList.remove("drag");
          touch();
          const sc = $(".content").scrollTop; render(); $(".content").scrollTop = sc;
        };
        chip.addEventListener("pointermove", move);
        chip.addEventListener("pointerup", up, { once: true });
      });
      stage.append(chip);
    });
    return h("section", { class: "group" }, h("h3", {}, "Vista del escritorio"), h("p", {}, "Arrastra los íconos para acomodarlos. Así se verán en computador (en celular se ordenan solos)."), stage);
  }

  const RENDER = {
    cv() {
      const pdfs = D.desktop.filter((d) => d.type === "pdf");
      const vids = D.desktop.filter((d) => d.type === "video");
      const out = [];
      if (!pdfs.length) out.push(h("div", { class: "banner" }, "No tienes un CV en el escritorio. ", h("button", { class: "btn sm", type: "button", onclick: () => { D.desktop.push({ id: "cv", type: "pdf", x: 58, y: 38, label: "CV", src: "" }); touch(); render(); } }, "+ Agregar CV")));
      pdfs.forEach((d) => out.push(group(`Documento: ${t(d.label) || d.id}`, "Sube tu CV en PDF (menos de 25 MB). Se abre en una ventana y se puede descargar.", d, [
        { key: "src", type: "file", label: "Archivo PDF", accept: "application/pdf" },
        { key: "label", type: "i18n", label: "Nombre del ícono" },
      ])));
      vids.forEach((d) => out.push(group(`Video: ${t(d.label) || d.id}`, "MP4 (H.264) de menos de 25 MB. Si pesa más, comprímelo con HandBrake.", d, [
        { key: "src", type: "file", label: "Archivo de video", accept: "video/mp4" },
        { key: "poster", type: "image", label: "Miniatura", optional: true, max: 1600 },
        { key: "label", type: "i18n", label: "Nombre del ícono" },
      ])));
      if (!vids.length) out.push(h("button", { class: "add", type: "button", onclick: () => { D.desktop.push({ id: "showreel", type: "video", x: 37, y: 31, label: "Showreel.mp4", src: "" }); touch(); render(); } }, "+ Agregar showreel"));
      return out;
    },

    seo() {
      D.seo = D.seo || {};
      return [
        group("Cómo se ve tu enlace al compartirlo", "Esto es lo que aparece en Google, WhatsApp, LinkedIn y en la pestaña del navegador.", D.seo, [
          { key: "siteUrl", type: "text", label: "Dirección del sitio", ph: "https://www.thomgraphics.com" },
          { key: "title", type: "text", label: "Título", hint: "Máx. 60 caracteres" },
          { key: "description", type: "textarea", label: "Descripción", hint: "Máx. 160 caracteres" },
          { key: "shareImage", type: "image", label: "Imagen al compartir", hint: "1200×630 px", max: 1200 },
          { key: "favicon", type: "image", label: "Favicon (ícono de pestaña)", hint: "SVG o PNG cuadrado 512×512", keepFormat: true, accept: "image/svg+xml,image/png,image/x-icon" },
        ]),
        h("p", { class: "intro-text" }, "WhatsApp y LinkedIn guardan la vista previa por unos días: si no ves el cambio, prueba en linkedin.com/post-inspector."),
      ];
    },

    look() {
      D.theme = D.theme || {};
      return [
        group("Color y fondo", null, D.theme, [
          { key: "accent", type: "color", label: "Color de acento", hint: "Selección de íconos y detalles", def: "#0a64d8" },
        ]),
        group("Fondo en celular (opcional)", "Si lo dejas vacío, se usa el mismo fondo del computador. Ideal: foto vertical.", D, [
          { key: "wallpaperMobile", type: "image", label: "Fondo vertical", optional: true, max: 1600 },
        ]),
        group("Elementos del escritorio", null, D.theme, [
          { key: "showIntro", type: "toggle", label: "Intro de fotos", on: "Mostrar al entrar" },
          { key: "showNotification", type: "toggle", label: "Notificación", on: "Mostrar" },
          { key: "showSticky", type: "toggle", label: "Nota adhesiva", on: "Mostrar" },
        ]),
      ];
    },

    texts() {
      D.uiText = D.uiText || {};
      return [group("Textos de botones y etiquetas", "Déjalos vacíos para usar el texto por defecto (el gris).", D.uiText,
        UI_KEYS.map(([key, label, es, en]) => ({ key, type: "i18n", label, ph: { es, en } })))];
    },

    general() {
      D.links = D.links || {}; D.notification = D.notification || {}; D.sticky = D.sticky || {}; D.dockIcons = D.dockIcons || {};
      return [
        group("Identidad", null, D, [
          { key: "brand", type: "text", label: "Marca", hint: "Aparece en la barra de menú" },
          { key: "fullName", type: "text", label: "Nombre completo" },
          { key: "role", type: "i18n", label: "Rol / cargo" },
          { key: "location", type: "text", label: "Ubicación" },
          { key: "defaultLang", type: "select", label: "Idioma por defecto", options: [["es", "Español"], ["en", "English"]] },
          { key: "wallpaper", type: "image", label: "Fondo de escritorio", hint: "Foto horizontal, mínimo 2400 px de ancho" },
        ]),
        group("Contacto (dock)", "Deja vacío lo que no quieras mostrar.", D.links, [
          { key: "whatsapp", type: "text", label: "WhatsApp", ph: "https://wa.me/573001234567", hint: "wa.me/57 + tu número, sin espacios" },
          { key: "instagram", type: "text", label: "Instagram", ph: "https://instagram.com/usuario" },
          { key: "linkedin", type: "text", label: "LinkedIn", ph: "https://www.linkedin.com/in/usuario" },
          { key: "behance", type: "text", label: "Behance", ph: "https://behance.net/usuario" },
          { key: "email", type: "text", label: "Correo", ph: "hola@thomgraphics.com", hint: "Tu correo (con o sin mailto:)" },
        ]),
        group("Íconos del dock (opcional)", "Si subes un ícono propio reemplaza el dibujado. PNG 512×512 con fondo transparente o SVG.", D.dockIcons,
          ["whatsapp", "instagram", "linkedin", "behance", "email"].map((k) => ({ key: k, type: "image", label: k[0].toUpperCase() + k.slice(1), keepFormat: true, optional: true, accept: ICON_ACCEPT }))),
        group("Notificación de bienvenida", null, D.notification, [
          { key: "app", type: "i18n", label: "App", hint: "Ej: Mensajes" },
          { key: "title", type: "i18n", label: "Título" },
          { key: "body", type: "i18nArea", label: "Mensaje" },
          { key: "opens", type: "select", label: "Al hacer clic abre", options: () => D.desktop.map((d) => [d.id, `${t(d.label)} (${typeName(d.type)})`]) },
        ]),
        group("Nota adhesiva", null, D.sticky, [
          { key: "title", type: "i18n", label: "Título" },
          { key: "text", type: "i18n", label: "Texto" },
        ]),
      ];
    },

    about() {
      D.about = D.about || {};
      return [
        group("Nota «Sobre mí»", "El primer párrafo sale en negrita.", D.about, [
          { key: "date", type: "i18n", label: "Fecha de la nota" },
          { key: "paragraphs", type: "list", label: "Párrafos", addLabel: "Agregar párrafo", item: { type: "i18nArea", rows: 3, noun: "Párrafo" } },
          { key: "skills", type: "list", label: "Habilidades (etiquetas)", addLabel: "Agregar habilidad", item: { type: "text", noun: "Habilidad" } },
        ]),
      ];
    },

    intro() {
      return [
        group("Fotos de la intro", "Aparecen una sobre otra antes de mostrar el escritorio. Fotos verticales.", D, [
          { key: "intro", type: "list", label: "Fotos", addLabel: "Agregar foto", item: {
            title: (it, i) => it.name || `Foto ${i + 1}`,
            make: () => ({ src: "", name: `IMG_${Math.floor(1000 + Math.random() * 9000)}.jpg` }),
            fields: [
              { key: "src", type: "image", label: "Foto", max: 1400 },
              { key: "name", type: "text", label: "Nombre en la ventana", hint: "Ej: IMG_2041.jpg" },
            ] } },
        ]),
      ];
    },

    desktop() {
      return [
        positionEditor(),
        group("Íconos del escritorio", "Posición X/Y en porcentaje de la pantalla (0 a 100). En celular se ordenan solos en cuadrícula. También puedes moverlos arrastrándolos en el sitio, pero eso solo se guarda en tu navegador.", D, [
          { key: "desktop", type: "list", label: "Íconos", addLabel: "Agregar ícono", item: {
            title: (it) => `${typeName(it.type)} · ${t(it.label) || it.id}`,
            make: () => ({ id: "nuevo-" + Date.now().toString(36).slice(-4), type: "folder", color: "blue", x: 50, y: 50, label: { es: "Nueva carpeta", en: "New folder" } }),
            fields: [
              { key: "type", type: "select", label: "Tipo", options: TYPES, rerender: true },
              { key: "label", type: "i18n", label: "Nombre" },
              { key: "id", type: "text", label: "ID", hint: "Sin espacios ni tildes. Es el enlace: tudominio.com/#/ID" },
              { key: "color", type: "select", label: "Color de carpeta", options: COLORS, when: (o) => o.type === "folder" },
              { key: "icon", type: "image", label: "Ícono propio", hint: "Opcional. PNG/SVG con fondo transparente", keepFormat: true, optional: true, accept: ICON_ACCEPT },
              { key: "src", type: "image", label: "Foto", when: (o) => o.type === "photo", max: 2000 },
              { key: "src", type: "file", label: "Archivo de video", hint: "MP4 (H.264), menos de 25 MB", accept: "video/mp4", when: (o) => o.type === "video" },
              { key: "poster", type: "image", label: "Miniatura del video", when: (o) => o.type === "video", optional: true, max: 1600 },
              { key: "src", type: "file", label: "Archivo PDF", accept: "application/pdf", when: (o) => o.type === "pdf" },
              { key: "href", type: "text", label: "URL", ph: "https://…", when: (o) => o.type === "link" },
              { key: "x", type: "number", label: "Posición X (%)", min: 0, max: 100, step: 0.5 },
              { key: "y", type: "number", label: "Posición Y (%)", min: 0, max: 100, step: 0.5 },
            ] } },
        ]),
      ];
    },

    folders() {
      ensureFolders();
      const ids = [...new Set([...D.desktop.filter((d) => d.type === "folder").map((d) => d.id), ...Object.keys(D.folders)])];
      const caseOpts = () => Object.keys(D.cases || {}).map((id) => [id, D.cases[id].title || id]);
      const out = [h("p", { class: "intro-text" }, "Cada carpeta del escritorio tiene su contenido aquí. Para crear una carpeta nueva, agrégala en «Escritorio e íconos».")];
      ids.forEach((id) => {
        const f = D.folders[id];
        const onDesk = D.desktop.some((d) => d.id === id && d.type === "folder");
        if (!onDesk) out.push(h("button", { class: "btn sm ghost danger", type: "button", onclick: () => { delete D.folders[id]; touch(); render(); } }, `Eliminar carpeta «${t(f.title) || id}» (no está en el escritorio)`));
        out.push(group(`${t(f.title) || id}`, onDesk ? `ID: ${id}` : `ID: ${id} · no está en el escritorio (no se muestra)`, f, [
          { key: "title", type: "i18n", label: "Título" },
          { key: "intro", type: "i18nArea", label: "Descripción" },
          { key: "items", type: "list", label: "Contenido", addLabel: "Agregar elemento", item: {
            title: (it) => it.type === "case" ? `Caso · ${(D.cases[it.case] || {}).title || it.case || "—"}` : `${it.type === "video" ? "Video" : "Imagen"} · ${t(it.title) || (it.src || "").split("/").pop()}`,
            make: () => ({ type: "image", src: "", title: { es: "", en: "" } }),
            fields: [
              { key: "type", type: "select", label: "Tipo", options: [["case", "Caso de estudio"], ["image", "Imagen"], ["video", "Video"]], rerender: true },
              { key: "case", type: "select", label: "Caso", options: caseOpts, when: (o) => o.type === "case" },
              { key: "src", type: "image", label: "Imagen", when: (o) => o.type === "image" },
              { key: "src", type: "file", label: "Video (MP4)", accept: "video/mp4", when: (o) => o.type === "video" },
              { key: "poster", type: "image", label: "Miniatura", when: (o) => o.type === "video", max: 1600 },
              { key: "title", type: "i18n", label: "Título", when: (o) => o.type !== "case" },
            ] } },
        ]));
      });
      return out;
    },

    cases() {
      D.cases = D.cases || {};
      const idInput = h("input", { type: "text", placeholder: "id-del-nuevo-caso (ej: app-delivery)" });
      const create = () => {
        const id = slug(idInput.value);
        if (!id) { toast("Escribe un ID para el caso.", "warn"); return; }
        if (D.cases[id]) { toast("Ya existe un caso con ese ID.", "warn"); return; }
        D.cases[id] = { title: idInput.value.trim(), subtitle: { es: "", en: "" }, cover: "", meta: { client: { es: "", en: "" }, role: { es: "", en: "" }, year: "", tools: "" }, tags: [], sections: [{ h: { es: "El reto", en: "The challenge" }, p: { es: "", en: "" }, img: "" }] };
        openCases.add(id);
        touch();
        render();
        toast("Caso creado. Recuerda agregarlo a una carpeta en «Carpetas».");
      };
      idInput.addEventListener("keydown", (e) => { if (e.key === "Enter") create(); });
      const out = [
        h("p", { class: "intro-text" }, "Estructura que funciona con reclutadores: reto → proceso → decisiones → resultado (con métricas)."),
        h("div", { class: "newbar" }, idInput, h("button", { class: "btn", type: "button", onclick: create }, "+ Nuevo caso")),
      ];
      Object.keys(D.cases).forEach((id) => {
        const c = D.cases[id];
        c.meta = c.meta || {};
        let confirmDel = false;
        const delBtn = h("button", { class: "btn sm ghost danger", type: "button" }, "Eliminar");
        delBtn.addEventListener("click", (e) => {
          e.preventDefault();
          if (!confirmDel) { confirmDel = true; delBtn.textContent = "¿Seguro? Clic otra vez"; setTimeout(() => { confirmDel = false; delBtn.textContent = "Eliminar"; }, 3000); return; }
          delete D.cases[id];
          Object.values(D.folders || {}).forEach((f) => { f.items = (f.items || []).filter((it) => !(it.type === "case" && it.case === id)); });
          openCases.delete(id);
          touch(); render();
        });
        const box = h("div", { class: "box" });
        const fill = () => {
          box.innerHTML = "";
          const add = (obj, f) => { const e = field(obj, f, fill); if (e) box.append(e); };
          add(c, { key: "title", type: "text", label: "Título" });
          add(c, { key: "subtitle", type: "i18n", label: "Subtítulo" });
          add(c, { key: "cover", type: "image", label: "Portada", hint: "Horizontal, 1600×1000 aprox." });
          add(c.meta, { key: "client", type: "i18n", label: "Cliente" });
          add(c.meta, { key: "role", type: "i18n", label: "Tu rol" });
          add(c.meta, { key: "year", type: "text", label: "Año" });
          add(c.meta, { key: "tools", type: "text", label: "Herramientas" });
          add(c, { key: "tags", type: "list", label: "Etiquetas", addLabel: "Agregar etiqueta", item: { type: "i18n", noun: "Etiqueta" } });
          add(c, { key: "sections", type: "list", label: "Secciones del caso", addLabel: "Agregar sección", item: {
            title: (s, i) => `${i + 1}. ${t(s.h) || "Sección"}`,
            make: () => ({ h: { es: "", en: "" }, p: { es: "", en: "" }, img: "" }),
            fields: [
              { key: "h", type: "i18n", label: "Título" },
              { key: "p", type: "i18nArea", label: "Texto", rows: 4 },
              { key: "img", type: "image", label: "Imagen", optional: true },
            ] } });
        };
        const d = h("details", { class: "case", open: openCases.has(id) },
          h("summary", {}, h("span", { class: "chev" }, "›"), c.cover ? h("img", { src: resolve(c.cover), alt: "" }) : null,
            h("span", { class: "grow" }, h("b", {}, c.title || id), h("small", {}, `${t(c.subtitle)} · ID: ${id}`)), delBtn),
          box);
        d.addEventListener("toggle", () => { if (d.open) { openCases.add(id); if (!box.childElementCount) fill(); } else openCases.delete(id); });
        if (d.open) fill();
        out.push(d);
      });
      return out;
    },
  };

  // ---------- Interfaz principal ----------
  function render() {
    const app = $("#app");
    const sec = SECTIONS.find((s) => s.id === section) || SECTIONS[0];
    const side = h("aside", { class: "side", id: "side" },
      h("div", { class: "side-head" }, h("span", { class: "mono", html: MONO }), h("span", {}, h("b", {}, "Admin del portafolio"), h("small", {}, mode === "github" ? `${gh.owner}/${gh.repo} · ${gh.branch}` : "Modo local"))),
      h("nav", { class: "nav" }, SECTIONS.map((s) => h("button", {
        type: "button", "aria-current": s.id === section,
        onclick: () => { section = s.id; store.set("section", s.id); render(); },
      }, h("span", { class: "ic", style: `background:${s.color}`, html: s.icon }), s.name))),
      h("div", { class: "side-foot" },
        h("a", { class: "btn", href: "/", target: "_blank", rel: "noopener" }, "Ver sitio ↗"),
        h("button", { class: "btn", type: "button", onclick: downloadJSON }, "Descargar copia (JSON)"),
        h("button", { class: "btn ghost", type: "button", onclick: logout }, mode === "github" ? "Desconectar" : "Conectar GitHub")));

    const content = h("div", { class: "content" }, h("div", { class: "inner" },
      mode === "local" ? h("div", { class: "banner" }, "Modo local: puedes editar y descargar el JSON, pero para subir imágenes y publicar con un clic conecta tu GitHub.") : null,
      RENDER[sec.id]()));
    const main = h("div", { class: "main" },
      h("div", { class: "topbar" },
        h("button", { class: "btn sm menu-btn", type: "button", onclick: () => $("#side").classList.toggle("open") }, "☰"),
        h("h2", {}, sec.name),
        h("span", { class: "pill", id: "state" }),
        mode === "github" ? h("button", { class: "btn primary", id: "save", type: "button", onclick: (e) => publish(e.currentTarget) }, "Guardar y publicar")
          : h("button", { class: "btn primary", id: "save", type: "button", onclick: downloadJSON }, "Descargar data.json")),
      content);
    app.replaceChildren(h("div", { class: "shell" }, side, main));
    updateTopbar();
  }

  function updateTopbar(justSaved) {
    const pill = $("#state"), btn = $("#save");
    if (!pill) return;
    const n = Object.keys(pending).length;
    pill.className = "pill " + (dirty ? "dirty" : justSaved ? "ok" : "");
    pill.textContent = dirty ? `Cambios sin publicar${n ? ` · ${n} archivo${n > 1 ? "s" : ""} nuevo${n > 1 ? "s" : ""}` : ""}` : justSaved ? "Publicado ✓" : "Todo publicado";
    if (btn && mode === "github") { btn.disabled = !dirty; if (!btn.querySelector(".spin")) btn.textContent = "Guardar y publicar"; }
  }

  function logout() {
    if (dirty && !window.confirm?.("Tienes cambios sin publicar. ¿Salir igual?")) return;
    creds.clear();
    gh = null; mode = null; D = null; pending = {}; dirty = false;
    renderLogin();
  }

  // ---------- Pantalla de conexión ----------
  function renderLogin() {
    const saved = creds.get() || {};
    const owner = h("input", { type: "text", value: saved.owner || "", placeholder: "tu-usuario" });
    const repo = h("input", { type: "text", value: saved.repo || "portafolio", placeholder: "portafolio" });
    const branch = h("input", { type: "text", value: saved.branch || "main", placeholder: "main" });
    const token = h("input", { type: "password", value: saved.token || "", placeholder: "github_pat_…", autocomplete: "off" });
    const remember = h("input", { type: "checkbox", checked: !!(saved.token && (() => { try { return localStorage.getItem("tgadmin:gh"); } catch { return null; } })()) });
    const err = h("div", { class: "err" });
    const go = h("button", { class: "btn primary big", type: "submit" }, "Conectar");

    const form = h("form", { class: "login-card" },
      h("div", { class: "logo", html: MONO }),
      h("h1", {}, "Admin del portafolio"),
      h("p", {}, "Conecta tu repositorio de GitHub para editar y publicar."),
      h("div", { class: "two" }, h("div", {}, h("label", {}, "Usuario de GitHub"), owner), h("div", {}, h("label", {}, "Repositorio"), repo)),
      h("label", {}, "Rama"), branch,
      h("label", {}, "Token de acceso"), token,
      h("label", { class: "check" }, remember, "Recordar en este computador (solo si es tuyo)"),
      h("details", {}, h("summary", {}, "¿Cómo creo el token?"),
        h("ol", {},
          h("li", {}, "GitHub → tu foto → Settings → Developer settings."),
          h("li", {}, "Personal access tokens → Fine-grained tokens → Generate new token."),
          h("li", {}, "Repository access: Only select repositories → tu repo del portafolio."),
          h("li", {}, "Permissions → Contents: Read and write."),
          h("li", {}, "Genera el token, cópialo y pégalo aquí. Úsalo solo en tu computador."))),
      err,
      h("div", { class: "actions" }, go,
        h("button", { class: "btn ghost", type: "button", onclick: startLocal }, "Entrar sin GitHub (modo local)")));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      gh = { owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || "main", token: token.value.trim() };
      if (!gh.owner || !gh.repo || !gh.token) { err.textContent = "Completa usuario, repositorio y token."; return; }
      if (![gh.owner, gh.repo].every((v) => /^[A-Za-z0-9_.-]+$/.test(v)) || !/^[A-Za-z0-9_./-]+$/.test(gh.branch)) { err.textContent = "Usuario, repositorio o rama tienen caracteres no válidos."; return; }
      go.disabled = true; go.innerHTML = `<span class="spin"></span> Conectando…`;
      try {
        D = await loadFromGitHub();
        mode = "github";
        creds.set(gh, remember.checked);
        render();
        toast("Conectado. Los cambios se publican al presionar «Guardar y publicar».");
      } catch (ex) {
        err.textContent = /Failed to fetch|NetworkError|Load failed/i.test(ex.message) ? "No se pudo conectar con GitHub. Revisa tu internet." : ex.message;
        go.disabled = false; go.textContent = "Conectar";
      }
    });
    $("#app").replaceChildren(h("div", { class: "login" }, form));
  }

  async function startLocal() {
    try {
      D = await loadFromSite();
      mode = "local";
      render();
    } catch (ex) {
      toast(ex.message + ". Abre el admin desde tu sitio publicado o con un servidor local.", "error");
    }
  }

  // ---------- Bloqueo por inactividad (30 min) ----------
  let idle;
  const resetIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (mode === "github" && !dirty) { try { sessionStorage.removeItem("tgadmin:gh"); } catch { /* */ } gh = null; mode = null; D = null; renderLogin(); toast("Sesión cerrada por inactividad.", "warn"); }
    }, 30 * 60 * 1000);
  };
  ["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, resetIdle, { passive: true }));
  resetIdle();

  // ---------- Inicio ----------
  (async () => {
    const saved = creds.get();
    if (saved && saved.token) {
      gh = saved;
      try { D = await loadFromGitHub(); mode = "github"; render(); return; } catch { /* vuelve al login */ }
    }
    renderLogin();
  })();
})();
