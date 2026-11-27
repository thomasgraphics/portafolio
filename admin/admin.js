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
      if (k.startsWith("aria-") && typeof v === "boolean") { el.setAttribute(k, String(v)); continue; }
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
    (o.desktop || []).forEach((d) => ["icon", "poster", "href", "src", "srcMobile", "posterMobile"].forEach((k) => { if (d[k] === "") delete d[k]; }));
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
    if (S.shareImage && base) set(/(<meta name="twitter:image" content=")[^"]*(")/, a(abs(S.shareImage)));
    if (S.description) set(/(<meta name="twitter:description" content=")[^"]*(")/, a(S.description));
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
    let blob = file, thumbJob = null;
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
        // WebP (más liviano); si el navegador no lo genera, JPEG
        const enc = async (canvas, q) => { const b = await new Promise((r) => canvas.toBlob(r, "image/webp", q)); return b && b.type === "image/webp" ? [b, "webp"] : [await new Promise((r) => canvas.toBlob(r, "image/jpeg", q + 0.04)), "jpg"]; };
        [blob, ext] = await enc(c, 0.8);
        // Miniatura de 640 px para tarjetas e íconos (carga más rápido)
        if (c.width > 760) {
          const tw = 640, th = Math.round(c.height * tw / c.width);
          const t = h("canvas", { width: tw, height: th }); t.getContext("2d").drawImage(c, 0, 0, tw, th);
          const [tb, tx] = await enc(t, 0.74);
          thumbJob = { blob: tb, ext: tx };
        }
      } catch { /* si falla, se sube el original */ }
    }
    if (blob.size > 25 * 1024 * 1024) { toast("El archivo pesa más de 25 MB. Comprímelo antes de subirlo.", "error"); return null; }
    const path = `assets/uploads/${stamp()}-${slug(file.name.replace(/\.[^.]+$/, "")) || "archivo"}.${ext}`;
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
    pending[path] = { b64, url: URL.createObjectURL(blob) };
    if (thumbJob) {
      const tpath = path.replace(/\.[a-z]+$/, "") + "-sm." + thumbJob.ext;
      const tb64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(thumbJob.blob); });
      pending[tpath] = { b64: tb64, url: URL.createObjectURL(thumbJob.blob) };
      (D.thumbs = D.thumbs || {})[path] = tpath;
    }
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
        if (f.refresh) inp.addEventListener("change", () => { const sc = $(".content").scrollTop; render(); $(".content").scrollTop = sc; });
        inp.addEventListener("input", () => {
          if (f.type === "number" && inp.value === "") { if (f.ph) delete obj[f.key]; else obj[f.key] = 0; }
          else obj[f.key] = f.type === "number" ? +inp.value : inp.value;
          touch();
        });
        ctl.append(inp);
        break;
      }
      case "visible": {
        // Muestra u oculta un elemento del portafolio sin borrarlo
        const cb = h("input", { type: "checkbox", class: "switch", checked: !obj.hidden });
        cb.addEventListener("change", () => { if (cb.checked) delete obj.hidden; else obj.hidden = true; touch(); });
        ctl.append(h("label", { class: "toggle" }, cb, h("span", {}, "Visible en el portafolio")));
        break;
      }
      case "toggle": {
        const cb = h("input", { type: "checkbox", class: "switch", checked: obj[f.key] === undefined ? f.def !== false : obj[f.key] !== false });
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
    { id: "stats", name: "Estadísticas", color: "#34c759", icon: `<svg viewBox="0 0 16 16" fill="#fff"><rect x="2" y="8" width="2.6" height="6" rx="1"/><rect x="6.7" y="4" width="2.6" height="10" rx="1"/><rect x="11.4" y="1.8" width="2.6" height="12.2" rx="1"/></svg>` },
    { id: "general", name: "General", color: "#8e8e93", icon: `<svg viewBox="0 0 16 16" fill="#fff"><circle cx="8" cy="8" r="2.4"/><path d="M8 1.5l1.2 1.7 2-.5.3 2 1.9.8-.8 1.9 1.3 1.6-1.7 1.2.5 2-2 .3-.8 1.9-1.9-.8L8 14.5l-1.2-1.7-2 .5-.3-2-1.9-.8.8-1.9L2.1 7l1.7-1.2-.5-2 2-.3.8-1.9 1.9.8z" fill="none" stroke="#fff" stroke-width="1.3"/></svg>` },
    { id: "cv", name: "CV y showreel", color: "#e5484d", icon: `<svg viewBox="0 0 16 16" fill="#fff"><path d="M4 1.5h5.5l3 3V14a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5z"/><rect x="5" y="8" width="6" height="1.2" fill="#e5484d"/><rect x="5" y="10.3" width="4" height="1.2" fill="#e5484d"/></svg>` },
    { id: "about", name: "Sobre mí", color: "#f5b82e", icon: `<svg viewBox="0 0 16 16" fill="#fff"><circle cx="8" cy="5.5" r="2.8"/><path d="M2.5 14c.6-3 2.9-4.5 5.5-4.5s4.9 1.5 5.5 4.5z"/></svg>` },
    { id: "intro", name: "Intro", color: "#ff5f6d", icon: `<svg viewBox="0 0 16 16" fill="#fff"><path d="M5 3.5v9l7-4.5z"/></svg>` },
    { id: "desktop", name: "Escritorio e íconos", color: "#34aadc", icon: `<svg viewBox="0 0 16 16" fill="#fff"><rect x="2" y="3" width="12" height="8" rx="1.5"/><rect x="6" y="12" width="4" height="1.6" rx=".8"/></svg>` },
    { id: "folders", name: "Carpetas", color: "#0a84ff", icon: `<svg viewBox="0 0 16 16" fill="#fff"><path d="M1.5 4a1.5 1.5 0 0 1 1.5-1.5h3l1.5 1.5H13A1.5 1.5 0 0 1 14.5 5.5v6A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5z"/></svg>` },
    { id: "trash", name: "Papelera", color: "#8e8e93", icon: `<svg viewBox="0 0 16 16" fill="#fff"><rect x="2.5" y="3" width="11" height="1.8" rx=".9"/><path d="M3.8 5.6h8.4l-.8 7.6a1.2 1.2 0 0 1-1.2 1.1H5.8a1.2 1.2 0 0 1-1.2-1.1z"/></svg>` },
    { id: "seo", name: "SEO y compartir", color: "#30b0c7", icon: `<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.6"><circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 14 14"/></svg>` },
    { id: "look", name: "Diseño y apariencia", color: "#ff9500", icon: `<svg viewBox="0 0 16 16" fill="#fff"><path d="M8 1.5a6.5 6.5 0 1 0 0 13c.9 0 1.3-.6 1.3-1.2 0-.8-.6-1-.6-1.7 0-.6.5-1.1 1.2-1.1h1.6a3 3 0 0 0 3-3c0-3.3-2.9-6-6.5-6z"/><circle cx="4.8" cy="7.5" r="1" fill="#ff9500"/><circle cx="7" cy="4.6" r="1" fill="#ff9500"/><circle cx="10.4" cy="5.2" r="1" fill="#ff9500"/></svg>` },
    { id: "texts", name: "Textos de la interfaz", color: "#5856d6", icon: `<svg viewBox="0 0 16 16" fill="#fff"><path d="M3 3h10v2.2h-1.4V4.4H8.7v7.2h1.5V13H5.8v-1.4h1.5V4.4H4.4v.8H3z"/></svg>` },
    { id: "cases", name: "Proyectos", color: "#af52de", icon: `<svg viewBox="0 0 16 16" fill="#fff"><rect x="2" y="2.5" width="12" height="11" rx="1.6"/><rect x="4" y="5" width="8" height="1.4" rx=".7" fill="#af52de"/><rect x="4" y="8" width="5" height="1.4" rx=".7" fill="#af52de"/></svg>` },
  ];


  // =========================================================================
  // Estadísticas (datos anónimos guardados por /api/track)
  // =========================================================================
  let statsDays = store.get("statsDays", 30);
  const SOCIAL = { instagram: "Instagram", linkedin: "LinkedIn", facebook: "Facebook", whatsapp: "WhatsApp", x: "X (Twitter)", tiktok: "TikTok", behance: "Behance", dribbble: "Dribbble", youtube: "YouTube", pinterest: "Pinterest", telegram: "Telegram" };
  const OTHER_SRC = { google: "Google", bing: "Bing", chatgpt: "ChatGPT", directo: "Directo / sin referencia" };
  const srcName = (k) => SOCIAL[k] || OTHER_SRC[k] || (k.startsWith("otro:") ? k.slice(5) : k);
  const flag = (cc) => (/^[A-Z]{2}$/.test(cc) && cc !== "XX" ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : "🌐");
  const regionName = (() => { try { const dn = new Intl.DisplayNames(["es"], { type: "region" }); return (cc) => (cc === "XX" ? "Desconocido" : dn.of(cc) || cc); } catch { return (cc) => cc; } })();
  const langName = (() => { try { const dn = new Intl.DisplayNames(["es"], { type: "language" }); return (l) => (l === "??" ? "Desconocido" : dn.of(l) || l); } catch { return (l) => l; } })();
  const fmt = (n) => Number(n || 0).toLocaleString("es-CO");
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  let tipEl = null;
  function tipOn(container) {
    if (!tipEl) { tipEl = h("div", { class: "vz-tip", role: "tooltip" }); document.body.append(tipEl); }
    container.addEventListener("pointermove", (e) => {
      const t = e.target.closest("[data-tip]");
      if (!t) { tipEl.classList.remove("on"); return; }
      tipEl.textContent = t.dataset.tip;
      tipEl.classList.add("on");
      const x = Math.min(window.innerWidth - tipEl.offsetWidth - 8, e.clientX + 12);
      tipEl.style.left = x + "px"; tipEl.style.top = e.clientY - tipEl.offsetHeight - 10 + "px";
    });
    container.addEventListener("pointerleave", () => tipEl.classList.remove("on"));
  }

  function barList(rows, total, nameFn, max = 10) {
    const top = rows.slice(0, max);
    const peak = Math.max(1, ...top.map((r) => r.n));
    if (!top.length) return h("p", { class: "vz-empty" }, "Aún no hay datos.");
    return h("div", { class: "vz-bars" }, top.map((r) => h("div", { class: "vz-row", "data-tip": `${nameFn(r.key)}: ${fmt(r.n)} (${pct(r.n, total)}%)` },
      h("span", { class: "vz-name" }, nameFn(r.key)),
      h("span", { class: "vz-track" }, h("span", { class: "vz-fill", style: `width:${Math.max(2, (r.n / peak) * 100)}%` })),
      h("span", { class: "vz-val" }, fmt(r.n), h("small", {}, ` ${pct(r.n, total)}%`)))));
  }

  function card(title, sub, ...body) {
    return h("section", { class: "vz-card" }, h("h3", {}, title), sub ? h("p", { class: "vz-sub" }, sub) : null, ...body);
  }

  function utmBuilder() {
    const base = ((D.seo && D.seo.siteUrl) || location.origin).replace(/\/+$/, "") + "/";
    const chans = [["instagram", "Bio de Instagram"], ["linkedin", "Perfil / posts de LinkedIn"], ["whatsapp", "WhatsApp"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["behance", "Behance"], ["cv", "Tu CV en PDF"], ["email", "Firma de correo"]];
    return card("Enlaces con seguimiento", "WhatsApp y algunas apps no avisan de dónde viene la visita. Usa estos enlaces en cada red y sabrás exactamente cuál funciona.",
      h("div", { class: "vz-utm" }, chans.map(([k, label]) => {
        const url = `${base}?utm_source=${k}`;
        const btn = h("button", { class: "btn sm", type: "button" }, "Copiar");
        btn.addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(url); btn.textContent = "¡Copiado!"; setTimeout(() => (btn.textContent = "Copiar"), 1500); } catch { toast(url); }
        });
        return h("div", { class: "vz-utm-row" }, h("span", {}, label), h("code", {}, url), btn);
      })));
  }

  function setupCard(msg) {
    return card("Activa las estadísticas (una sola vez, 3 minutos)", msg || null,
      h("ol", { class: "vz-steps" },
        h("li", {}, "En Vercel abre tu proyecto ", h("b", {}, "portafolio"), " → pestaña ", h("b", {}, "Storage"), "."),
        h("li", {}, h("b", {}, "Create Database"), " → elige ", h("b", {}, "Upstash for Redis"), " (plan gratuito) → región cercana (ej. São Paulo o Washington) → ", h("b", {}, "Create"), "."),
        h("li", {}, "Conéctala al proyecto ", h("b", {}, "portafolio"), " (marca Production, Preview y Development) → ", h("b", {}, "Connect"), ". Vercel crea solas las variables."),
        h("li", {}, "Ve a ", h("b", {}, "Deployments → ⋯ → Redeploy"), ". Desde ese momento se empiezan a contar las visitas.")));
  }

  function renderStatsBody(box, data) {
    box.innerHTML = "";
    if (!data.configured) { box.append(setupCard("Las métricas ya están programadas; solo falta conectar la base de datos gratuita."), utmBuilder()); return; }
    const total = data.totals.visits;
    const socialN = data.sources.filter((s) => SOCIAL[s.key]).reduce((a, s) => a + s.n, 0);
    const topC = data.countries[0];
    const kpi = (label, value, note) => h("div", { class: "vz-kpi" }, h("span", {}, label), h("b", {}, value), note ? h("small", {}, note) : null);

    // Visitas por día
    const peak = Math.max(1, ...data.daily.map((d) => d.visits));
    const step = Math.ceil(data.daily.length / 8);
    const daily = h("div", { class: "vz-daily" },
      h("div", { class: "vz-cols" }, data.daily.map((d) => {
        const dt = new Date(d.date + "T12:00:00");
        const label = dt.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
        return h("div", { class: "vz-col", "data-tip": `${label}: ${fmt(d.visits)} visitas · ${fmt(d.uniques)} visitantes` },
          h("span", { class: "vz-colbar" + (d.visits ? "" : " zero"), style: `height:${d.visits ? Math.max(3, (d.visits / peak) * 100) : 0}%` }));
      })),
      h("div", { class: "vz-xaxis" }, data.daily.map((d, i) => h("span", {}, i % step === 0 ? new Date(d.date + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : ""))));

    // Mapa de calor día × hora
    const hPeak = Math.max(1, ...data.heat.flat());
    const heat = h("div", { class: "vz-heat" },
      h("span", {}), ...Array.from({ length: 24 }, (_, hh) => h("span", { class: "vz-hl" }, hh % 3 === 0 ? `${hh}h` : "")),
      ...data.heat.flatMap((row, wd) => [h("span", { class: "vz-dl" }, DAYS_ES[wd]), ...row.map((n, hh) => h("span", {
        class: "vz-cell", style: n ? `background:rgba(51,140,237,${(0.18 + 0.82 * (n / hPeak)).toFixed(2)})` : "",
        "data-tip": `${DAYS_ES[wd]} ${hh}:00–${hh}:59 · ${fmt(n)} visita${n === 1 ? "" : "s"}`,
      }))]));
    const bestH = data.hours.indexOf(Math.max(...data.hours));

    const opensNames = (k) => {
      const [type, id] = k.split(":");
      if (type === "case") return `Proyecto · ${(D.cases[id] || {}).title || id}`;
      if (type === "folder") return `Carpeta · ${t((D.folders[id] || {}).title) || id}`;
      const it = D.desktop.find((d) => d.id === id);
      return `${it ? t(it.label) : id}`;
    };
    const cityName = (k) => { const [cc, c] = k.split("|"); return `${flag(cc)} ${c}`; };
    const totalOpens = data.opens.reduce((a, x) => a + x.n, 0);

    const grid = h("div", { class: "vz-grid" },
      card("Visitas por día", `Últimos ${data.days} días · hora de Colombia`, daily,
        h("details", { class: "vz-table" }, h("summary", {}, "Ver tabla"),
          h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Fecha"), h("th", {}, "Visitas"), h("th", {}, "Visitantes"))),
            h("tbody", {}, [...data.daily].reverse().map((d) => h("tr", {}, h("td", {}, d.date), h("td", {}, fmt(d.visits)), h("td", {}, fmt(d.uniques)))))))),
      card("¿A qué horas te visitan?", total ? `La hora con más visitas: ${bestH}:00–${bestH}:59 (hora de Colombia)` : "Cada cuadro es una hora; más intenso = más visitas.", heat),
      card("¿De dónde llegan?", "Redes sociales, buscadores o directo", barList(data.sources, total, srcName, 12)),
      card("Países", null, barList(data.countries, total, (cc) => `${flag(cc)} ${regionName(cc)}`)),
      card("Ciudades", null, barList(data.cities, total, cityName)),
      card("Lo más visto", "Carpetas, casos y archivos que abren", barList(data.opens, totalOpens, opensNames)),
      card("Dispositivos", null, barList(data.devices, total, (k) => k[0].toUpperCase() + k.slice(1))),
      card("Idioma del navegador", null, barList(data.languages, total, langName)),
      card("Edad de los visitantes", null, h("p", { class: "vz-sub" }, "Un sitio web no puede saber la edad de quien lo visita. Solo Google Analytics la estima, y únicamente con mucho tráfico (miles de visitas) porque usa datos de cuentas de Google. Si en el futuro lo necesitas, se puede conectar Google Analytics además de estas métricas.")),
    );

    box.append(
      h("div", { class: "vz-kpis" },
        kpi("Visitas", fmt(total)),
        kpi("Visitantes", fmt(data.totals.uniques), "únicos por día, sumados"),
        kpi("Desde redes sociales", `${pct(socialN, total)}%`, `${fmt(socialN)} visitas`),
        kpi("País principal", topC ? `${flag(topC.key)} ${regionName(topC.key)}` : "—", topC ? `${pct(topC.n, total)}% de las visitas` : null)),
      grid, utmBuilder());
    tipOn(box);
  }

  function statsSection() {
    const box = h("div", { class: "vz" }, h("p", { class: "intro-text" }, "Cargando estadísticas…"));
    const load = async () => {
      try {
        const r = await fetch(`/admin/stats?days=${statsDays}`, { credentials: "same-origin", cache: "no-store" });
        if (r.status === 404) throw new Error("local");
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || r.status);
        renderStatsBody(box, data);
      } catch (e) {
        box.innerHTML = "";
        box.append(e.message === "local" || /Failed to fetch|JSON/.test(e.message)
          ? card("Estadísticas", "Las estadísticas se ven en tu sitio publicado (www.thomgraphics.com/admin), no en una copia local.")
          : card("No se pudieron cargar las estadísticas", e.message), utmBuilder());
      }
    };
    let noTrack = false;
    try { noTrack = localStorage.getItem("tg-notrack") === "1"; } catch { /* */ }
    const nt = h("input", { type: "checkbox", class: "switch", checked: noTrack });
    nt.addEventListener("change", () => { try { nt.checked ? localStorage.setItem("tg-notrack", "1") : localStorage.removeItem("tg-notrack"); } catch { /* */ } toast(nt.checked ? "Tus visitas desde este navegador ya no se cuentan." : "Tus visitas desde este navegador se vuelven a contar."); });
    const bar = h("div", { class: "vz-bar" },
      h("div", { class: "seg-a" }, [7, 30, 90].map((n) => h("button", { type: "button", "aria-pressed": statsDays === n, onclick: () => { statsDays = n; store.set("statsDays", n); render(); } }, `${n} días`))),
      h("button", { class: "btn sm", type: "button", onclick: () => { box.innerHTML = ""; box.append(h("p", { class: "intro-text" }, "Actualizando…")); load(); } }, "↻ Actualizar"),
      h("span", { class: "grow" }),
      h("label", { class: "toggle" }, nt, h("span", {}, "No contar mis visitas en este navegador")));
    load();
    return [bar, box];
  }

  // ---------- Diseño: fuentes y vista previa ----------
  const FONTS = ["Inter", "DM Sans", "Manrope", "Plus Jakarta Sans", "Outfit", "Space Grotesk", "Poppins", "Montserrat", "Work Sans", "IBM Plex Sans", "Sora", "Urbanist", "Figtree", "Geist", "Instrument Sans", "Onest", "Lexend", "Rubik", "Nunito Sans", "Raleway", "Playfair Display", "Fraunces", "DM Serif Display", "Instrument Serif", "Libre Baskerville", "Space Mono", "JetBrains Mono"];
  const DESIGN_KEYS = ["autoDark", "darkFrom", "darkTo", "focusIn", "wallpaperBlur", "dof", "noise", "noiseOpacity", "noiseAnimated", "font", "fontHead", "headWeight", "accent", "ink", "ink2", "muted", "winBg", "winBar", "noteBg", "stickyBg", "labelInk", "menubarInk", "menubarBg", "menubarOpacity", "dockBg", "dockOpacity", "radius", "iconScale", "dockSize"];
  const loadedFonts = new Set();
  function loadFont(f) {
    if (!FONTS.includes(f) || loadedFonts.has(f)) return;
    loadedFonts.add(f);
    document.head.append(h("link", { rel: "stylesheet", href: `https://fonts.googleapis.com/css2?family=${f.replace(/ /g, "+")}:wght@400;500;600;700;800&display=swap` }));
  }
  const FMT = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };
  const cleanFam = (v) => String(v || "").replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, 40);
  const customFonts = () => ((D.theme || {}).customFonts || []).filter((f) => f && cleanFam(f.family) && f.src);
  const customFamilies = () => [...new Set(((D.theme || {}).customFonts || []).map((f) => cleanFam(f && f.family)).filter(Boolean))];
  let fontStyleEl = null;
  function injectCustomFonts() {
    if (!fontStyleEl) { fontStyleEl = h("style", {}); document.head.append(fontStyleEl); }
    fontStyleEl.textContent = customFonts().map((f) => {
      const ext = f.src.split(".").pop().toLowerCase();
      return FMT[ext] ? `@font-face{font-family:"${cleanFam(f.family)}";src:url("${resolve(f.src)}") format("${FMT[ext]}");font-weight:${+f.weight || 400};font-style:${f.style === "italic" ? "italic" : "normal"};font-display:swap}` : "";
    }).join("");
  }
  const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
  const rgbaA = (hx, a) => { const n = parseInt(hx.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  let previewEl = null;
  function paintPreview() {
    if (!previewEl || !previewEl.isConnected) return;
    const T = D.theme || {};
    const SYS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif';
    loadFont(T.font); loadFont(T.fontHead); injectCustomFonts();
    const ok = (f) => FONTS.includes(f) || customFamilies().includes(f);
    const v = {
      "--p-font": ok(T.font) ? `"${T.font}", ${SYS}` : SYS,
      "--p-head": ok(T.fontHead) ? `"${T.fontHead}", ${SYS}` : ok(T.font) ? `"${T.font}", ${SYS}` : SYS,
      "--p-weight": T.headWeight || 700,
      "--p-accent": isHex(T.accent) ? T.accent : "#0a64d8",
      "--p-ink": isHex(T.ink) ? T.ink : "#1c1c1e",
      "--p-ink2": isHex(T.ink2) ? T.ink2 : "#3a3a3c",
      "--p-muted": isHex(T.muted) ? T.muted : "#6e6e73",
      "--p-win": isHex(T.winBg) ? T.winBg : "#ffffff",
      "--p-bar": isHex(T.winBar) ? T.winBar : "#f3f2ef",
      "--p-sticky": isHex(T.stickyBg) ? T.stickyBg : "rgba(255,255,255,.82)",
      "--p-label": isHex(T.labelInk) ? T.labelInk : "#ffffff",
      "--p-mb-ink": isHex(T.menubarInk) ? T.menubarInk : "#ffffff",
      "--p-mb": isHex(T.menubarBg) ? rgbaA(T.menubarBg, (+T.menubarOpacity || 16) / 100) : "rgba(30,30,30,.16)",
      "--p-dock": isHex(T.dockBg) ? rgbaA(T.dockBg, (+T.dockOpacity || 38) / 100) : "rgba(255,255,255,.38)",
      "--p-radius": (T.radius !== undefined && T.radius !== "" ? +T.radius : 12) + "px",
      "--p-dk": Math.round((+T.dockSize || 52) * 0.62) + "px",
      "--p-icon": (+T.iconScale || 100) / 100,
    };
    Object.entries(v).forEach(([k, val]) => previewEl.style.setProperty(k, val));
  }
  function designPreview() {
    previewEl = h("div", { class: "dprev", style: `background-image:url("${resolve(D.wallpaper)}")`, html: `
      <div class="dp-menu"><b>${(D.brand || "Thomgraphics").replace(/[<>&"]/g, "")}</b><span>Info</span><span class="sp"></span><span>mar 24 nov 21:50</span></div>
      <div class="dp-sticky"><b>Recordatorio:</b><span>Diseña para personas</span></div>
      <div class="dp-icon"><i></i><span>Branding</span></div>
      <div class="dp-win"><div class="dp-bar"><em></em><em></em><em></em><span>UX/UI &amp; Producto</span></div>
        <div class="dp-body"><h4>UX/UI &amp; Producto</h4><p>Productos digitales diseñados de punta a punta.</p><div class="dp-chip">Manual interactivo</div><a>Ver proyecto →</a></div></div>
      <div class="dp-dock"><i></i><i></i><i></i><i></i></div>` });
    requestAnimationFrame(paintPreview);
    return h("section", { class: "group" }, h("h3", {}, "Vista previa"), h("p", {}, "Se actualiza mientras editas. El sitio cambia al publicar."), previewEl);
  }
  document.addEventListener("input", () => { if (section === "look") paintPreview(); });
  document.addEventListener("change", () => { if (section === "look") paintPreview(); });

  // Textos editables de la interfaz del sitio (vacío = texto por defecto)
  const UI_KEYS = [
    ["skip", "Botón saltar intro", "Saltar intro", "Skip intro"], ["now", "Hora de la notificación", "ahora", "now"],
    ["info", "Menú «Info»", "Info", "Info"], ["instagram", "Menú «Instagram» / dock", "Instagram", "Instagram"],
    ["all", "Filtro «Todo»", "Todo", "All"], ["cases", "Filtro «Casos»", "Casos", "Cases"], ["photos", "Filtro «Fotos»", "Fotos", "Photos"], ["videos", "Filtro «Videos»", "Videos", "Videos"],
    ["items", "Contador de elementos ({n} = número)", "{n} elementos", "{n} items"], ["video", "Etiqueta de video", "Video", "Video"],
    ["client", "Ficha: Cliente", "Cliente", "Client"], ["role", "Ficha: Rol", "Rol", "Role"], ["year", "Ficha: Año", "Año", "Year"], ["tools", "Ficha: Herramientas", "Herramientas", "Tools"],
    ["prev", "Botón caso anterior", "← Anterior", "← Previous"], ["next", "Botón caso siguiente", "Siguiente →", "Next →"],
    ["favorites", "Barra lateral: Favoritos", "Favoritos", "Favorites"], ["more", "Barra lateral: Más", "Más", "More"],
    ["download", "Botón descargar CV", "Descargar", "Download"], ["openTab", "Abrir PDF en pestaña", "Abrir en pestaña nueva", "Open in new tab"],
    ["pdfMobile", "Aviso del PDF en celular", "Toca el botón para ver el PDF.", "Tap the button to view the PDF."],
    ["whatsapp", "Dock: WhatsApp", "WhatsApp", "WhatsApp"], ["linkedin", "Dock: LinkedIn", "LinkedIn", "LinkedIn"], ["behance", "Dock: Behance", "Behance", "Behance"], ["email", "Dock: Correo", "Correo", "Email"],
    ["close", "Botón cerrar ventana", "Cerrar", "Close"],
    ["rotate", "Aviso al girar el teléfono", "Gira tu teléfono para ver el portafolio", "Rotate your phone to view the portfolio"],
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
    stats() { return statsSection(); },

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
        { key: "srcMobile", type: "file", label: "Video vertical para celular (9:16)", hint: "Opcional. Formato reel 1080×1920; en el celular se muestra este", accept: "video/mp4", optional: true },
        { key: "posterMobile", type: "image", label: "Miniatura vertical", optional: true, max: 1280 },
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
      const T = D.theme;
      const mine = customFamilies().map((f) => [f, `${f} (tu fuente)`]);
      const fontOpts = [["", "Sistema (SF Pro en Mac / Segoe en Windows)"], ...mine, ...FONTS.map((f) => [f, f])];
      const reset = h("button", { class: "btn sm ghost danger", type: "button", onclick: () => {
        DESIGN_KEYS.forEach((k) => delete T[k]); touch(); render(); toast("Diseño restablecido. Publica para aplicarlo.");
      } }, "Restablecer diseño original");
      return [
        designPreview(),
        group("Tus tipografías", "Sube tus fuentes (WOFF2 recomendado; también WOFF, TTF u OTF). Sube un archivo por grosor/estilo con el MISMO nombre de familia, y luego elígela abajo. Usa solo fuentes con licencia para web.", T, [
          { key: "customFonts", type: "list", label: "Fuentes subidas", addLabel: "Agregar fuente", item: {
            title: (f) => f.family ? `${cleanFam(f.family)} · ${f.weight || 400}${f.style === "italic" ? " itálica" : ""}` : "Nueva fuente",
            make: () => ({ family: "", src: "", weight: "400", style: "normal" }),
            fields: [
              { key: "family", type: "text", label: "Nombre de la familia", hint: "Ej: Thomgraphics Sans", ph: "Mi Fuente", refresh: true },
              { key: "src", type: "file", label: "Archivo", accept: ".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" },
              { key: "weight", type: "select", label: "Grosor", options: [["400", "Regular (400)"], ["100", "Thin (100)"], ["200", "Extra light (200)"], ["300", "Light (300)"], ["500", "Medium (500)"], ["600", "Semibold (600)"], ["700", "Bold (700)"], ["800", "Extra bold (800)"], ["900", "Black (900)"]] },
              { key: "style", type: "select", label: "Estilo", options: [["normal", "Normal"], ["italic", "Itálica"]] },
            ] } },
        ]),
        group("Tipografía", "Elige tus fuentes o una de Google Fonts. Combina una de texto con una de títulos.", T, [
          { key: "font", type: "select", label: "Fuente de textos", options: fontOpts },
          { key: "fontHead", type: "select", label: "Fuente de títulos", options: [["", "La misma de los textos"], ...mine, ...FONTS.map((f) => [f, f])] },
          { key: "headWeight", type: "select", label: "Grosor de títulos", options: [["700", "Bold (700)"], ["800", "Extra bold (800)"], ["600", "Semibold (600)"], ["500", "Medium (500)"], ["400", "Regular (400)"]] },
        ]),
        group("Colores", null, T, [
          { key: "accent", type: "color", label: "Acento", hint: "Selección, enlaces y detalles", def: "#0a64d8" },
          { key: "ink", type: "color", label: "Texto principal", def: "#1c1c1e" },
          { key: "ink2", type: "color", label: "Texto de párrafos", def: "#3a3a3c" },
          { key: "muted", type: "color", label: "Texto secundario", def: "#6e6e73" },
          { key: "winBg", type: "color", label: "Fondo de ventanas", def: "#ffffff" },
          { key: "winBar", type: "color", label: "Barra de ventanas", def: "#f3f2ef" },
          { key: "noteBg", type: "color", label: "Fondo de «Sobre mí»", def: "#fffdf6" },
          { key: "stickyBg", type: "color", label: "Nota adhesiva", def: "#ffffff" },
          { key: "labelInk", type: "color", label: "Nombres de íconos", def: "#ffffff" },
        ]),
        group("Barra de menú y dock", null, T, [
          { key: "menubarInk", type: "color", label: "Texto de la barra", def: "#ffffff" },
          { key: "menubarBg", type: "color", label: "Color de la barra", def: "#1e1e1e" },
          { key: "menubarOpacity", type: "number", label: "Opacidad de la barra (%)", min: 0, max: 100, step: 1, ph: "16" },
          { key: "dockBg", type: "color", label: "Color del dock", def: "#ffffff" },
          { key: "dockOpacity", type: "number", label: "Opacidad del dock (%)", min: 0, max: 100, step: 1, ph: "38" },
        ]),
        group("Forma y tamaños", null, T, [
          { key: "radius", type: "number", label: "Esquinas de ventanas (px)", min: 0, max: 32, step: 1, ph: "12" },
          { key: "iconScale", type: "number", label: "Tamaño de íconos (%)", min: 60, max: 160, step: 5, ph: "100" },
          { key: "dockSize", type: "number", label: "Tamaño del dock (px)", min: 36, max: 80, step: 2, ph: "52" },
        ]),
        group("Fondo y textura", "Efectos del fondo del escritorio.", T, [
          { key: "focusIn", type: "toggle", label: "Enfoque al entrar", on: "El fondo arranca desenfocado y se enfoca" },
          { key: "wallpaperBlur", type: "number", label: "Desenfoque del fondo (px)", min: 0, max: 30, step: 1, ph: "4", hint: "0 = foto nítida" },
          { key: "dof", type: "toggle", label: "Profundidad de campo", on: "Más desenfoque en los bordes" },
          { key: "noise", type: "toggle", label: "Textura de ruido (grano)", on: "Mostrar" },
          { key: "noiseOpacity", type: "number", label: "Intensidad del grano (%)", min: 0, max: 50, step: 1, ph: "22" },
          { key: "noiseAnimated", type: "toggle", label: "Grano animado", on: "Efecto de película", def: false },
        ]),
        group("Modo oscuro automático", "De noche el portafolio cambia solo a modo oscuro, según la hora de quien lo visita. Tus colores personalizados aplican de día; de noche se usa la paleta oscura (el acento se mantiene). Para probarlo: tudominio.com/?modo=oscuro", T, [
          { key: "autoDark", type: "toggle", label: "Modo oscuro de noche", on: "Activado" },
          { key: "darkFrom", type: "number", label: "Empieza a las (hora 0–23)", min: 0, max: 23, step: 1, ph: "18" },
          { key: "darkTo", type: "number", label: "Termina a las (hora 0–23)", min: 0, max: 23, step: 1, ph: "6" },
        ]),
        group("Fondo de noche (opcional)", "Si lo dejas vacío, de noche se oscurece el fondo normal.", D, [
          { key: "wallpaperDark", type: "image", label: "Fondo en modo oscuro", optional: true },
        ]),
        group("Fondo en celular (opcional)", "Si lo dejas vacío, se usa el mismo fondo del computador. Ideal: foto vertical.", D, [
          { key: "wallpaperMobile", type: "image", label: "Fondo vertical", optional: true, max: 1600 },
        ]),
        group("Elementos del escritorio", null, T, [
          { key: "showIntro", type: "toggle", label: "Intro de fotos", on: "Mostrar al entrar" },
          { key: "showNotification", type: "toggle", label: "Notificación", on: "Mostrar" },
          { key: "showSticky", type: "toggle", label: "Nota adhesiva", on: "Mostrar" },
        ]),
        reset,
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
        group("Botón «Hablar con el crack»", "Aparece al final de cada proyecto y abre WhatsApp con un mensaje listo. {proyecto} se reemplaza por el nombre del proyecto.", (D.caseContact = D.caseContact || {}), [
          { key: "enabled", type: "toggle", label: "Mostrar el botón", on: "Activado" },
          { key: "title", type: "i18n", label: "Título", ph: { es: "¿Te gustó lo que viste?", en: "Liked what you saw?" } },
          { key: "text", type: "i18n", label: "Texto", ph: { es: "Cuéntame tu idea y la aterrizamos juntos.", en: "Tell me your idea and let's shape it together." } },
          { key: "cta", type: "i18n", label: "Texto del botón", ph: { es: "Hablar con el crack", en: "Talk to the designer" } },
          { key: "message", type: "i18nArea", label: "Mensaje que se escribe en WhatsApp", rows: 2 },
        ]),
        group("Nota adhesiva", "Agrega las líneas que quieras: frase, cargo actual, disponibilidad…", D.sticky, [
          { key: "title", type: "i18n", label: "Título" },
          { key: "text", type: "i18n", label: "Primera línea" },
          { key: "lines", type: "list", label: "Más líneas", addLabel: "Agregar línea", item: { type: "i18n", noun: "Línea" } },
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

    trash() {
      D.trash = D.trash || { enabled: true, items: [] };
      D.trash.items = D.trash.items || [];
      return [
        group("Papelera del Dock", "Carpetas «eliminadas» que aparecen en la Papelera, al final del Dock. Al abrir una, sale un aviso estilo macOS con su mensaje.", D.trash, [
          { key: "enabled", type: "toggle", label: "Mostrar la Papelera en el Dock" },
          { key: "items", type: "list", label: "Carpetas eliminadas", addLabel: "Agregar carpeta", item: {
            title: (it, i) => t(it.name) || `Carpeta ${i + 1}`,
            make: () => ({ name: { es: "", en: "" }, note: { es: "", en: "" }, date: { es: "Ayer", en: "Yesterday" } }),
            fields: [
              { key: "hidden", type: "visible", label: "Visible" },
              { key: "name", type: "i18n", label: "Nombre de la carpeta" },
              { key: "note", type: "i18nArea", label: "Mensaje al intentar abrirla" },
              { key: "date", type: "i18n", label: "Fecha que se muestra", hint: "Ej: Ayer, Hace un año" },
            ] } },
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
              { key: "hidden", type: "visible", label: "Visibilidad", hint: "Apágalo para ocultar este ícono del escritorio" },
              { key: "icon", type: "image", label: "Ícono propio", hint: "Opcional. PNG/SVG con fondo transparente", keepFormat: true, optional: true, accept: ICON_ACCEPT },
              { key: "src", type: "image", label: "Foto", when: (o) => o.type === "photo", max: 2000 },
              { key: "src", type: "file", label: "Archivo de video", hint: "MP4 (H.264), menos de 25 MB", accept: "video/mp4", when: (o) => o.type === "video" },
              { key: "poster", type: "image", label: "Miniatura del video", when: (o) => o.type === "video", optional: true, max: 1600 },
              { key: "srcMobile", type: "file", label: "Video vertical para celular (9:16)", hint: "Opcional. Formato reel; en el celular se muestra este", accept: "video/mp4", when: (o) => o.type === "video", optional: true },
              { key: "posterMobile", type: "image", label: "Miniatura vertical", when: (o) => o.type === "video", optional: true, max: 1280 },
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
          { key: "shareImage", type: "image", label: "Portada al compartir (clic derecho → compartir)", hint: "1200×630 px", max: 1200 },
          { key: "items", type: "list", label: "Contenido", addLabel: "Agregar elemento", item: {
            title: (it) => it.type === "case" ? `Proyecto · ${(D.cases[it.case] || {}).title || it.case || "—"}` : `${it.type === "video" ? "Video" : "Imagen"} · ${t(it.title) || (it.src || "").split("/").pop()}`,
            make: () => ({ type: "image", src: "", title: { es: "", en: "" } }),
            fields: [
              { key: "type", type: "select", label: "Tipo", options: [["case", "Proyecto"], ["image", "Imagen"], ["video", "Video"]], rerender: true },
              { key: "case", type: "select", label: "Caso", options: caseOpts, when: (o) => o.type === "case" },
              { key: "src", type: "image", label: "Imagen", when: (o) => o.type === "image" },
              { key: "src", type: "file", label: "Video (MP4)", accept: "video/mp4", when: (o) => o.type === "video" },
              { key: "poster", type: "image", label: "Miniatura", when: (o) => o.type === "video", max: 1600 },
              { key: "title", type: "i18n", label: "Título", when: (o) => o.type !== "case" },
              { key: "hidden", type: "visible", label: "Visibilidad" },
              { key: "category", type: "i18n", label: "Categoría", hint: "Opcional. Crea filtros dentro de la carpeta (ej: Manuales interactivos). Usa el mismo nombre para agrupar." },
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
          add(c, { key: "hidden", type: "visible", label: "Visibilidad", hint: "Apágalo para ocultar el proyecto sin borrarlo" });
          add(c, { key: "title", type: "text", label: "Título" });
          add(c, { key: "subtitle", type: "i18n", label: "Subtítulo" });
          add(c, { key: "cover", type: "image", label: "Portada", hint: "Horizontal, 1600×1000 aprox." });
          add(c.meta, { key: "client", type: "i18n", label: "Cliente" });
          add(c.meta, { key: "role", type: "i18n", label: "Tu rol" });
          add(c.meta, { key: "year", type: "text", label: "Año" });
          add(c.meta, { key: "tools", type: "text", label: "Herramientas" });
          add(c, { key: "badge", type: "i18n", label: "Etiqueta de la tarjeta", hint: "Ej: Manual interactivo. Vacío = sin etiqueta" });
          c.link = c.link || {};
          add(c.link, { key: "url", type: "text", label: "Enlace del botón", ph: "https://…", hint: "Opcional: muestra un botón para ver el proyecto en vivo" });
          add(c.link, { key: "label", type: "i18n", label: "Texto del botón", ph: { es: "Ver proyecto", en: "View project" } });
          add(c, { key: "tags", type: "list", label: "Etiquetas", addLabel: "Agregar etiqueta", item: { type: "i18n", noun: "Etiqueta" } });
          add(c, { key: "sections", type: "list", label: "Secciones del caso", addLabel: "Agregar sección", item: {
            title: (s, i) => `${i + 1}. ${t(s.h) || "Sección"}`,
            make: () => ({ h: { es: "", en: "" }, p: { es: "", en: "" }, img: "" }),
            fields: [
              { key: "h", type: "i18n", label: "Título" },
              { key: "p", type: "i18nArea", label: "Texto", rows: 4 },
              { key: "img", type: "image", label: "Imagen", optional: true },
              { key: "video", type: "file", label: "Video MP4", hint: "Opcional. MP4 (H.264), menos de 25 MB. Se reproduce dentro del caso", accept: "video/mp4", optional: true },
              { key: "embedType", type: "select", rerender: true, label: "Prototipo o video incrustado", options: [["", "Ninguno"], ["figma", "Prototipo de Figma"], ["xd", "Prototipo de Adobe XD"], ["youtube", "Video de YouTube"], ["web", "Sitio web propio (GitHub Pages)"]] },
              { key: "embedId", type: "text", label: "Enlace o ID", hint: "Figma: pega el enlace del prototipo · XD: el código después de /view/ · YouTube: el código del video · Sitio web: el enlace de thomasgraphics.github.io", when: (o) => !!o.embedType },
              { key: "embedRatio", type: "select", label: "Formato", options: [["desktop", "Escritorio (16:10)"], ["mobile", "Celular (vertical)"], ["video", "Video (16:9)"]], when: (o) => !!o.embedType },
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
