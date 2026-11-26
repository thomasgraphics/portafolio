/* =========================================================================
   Thomgraphics · Portafolio — lógica del escritorio
   No necesitas tocar este archivo: el contenido vive en content/data.json
   y se edita desde el panel /admin.
   ========================================================================= */
(async () => {
  "use strict";
  let D;
  try {
    const r = await fetch("content/data.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    D = await r.json();
  } catch (err) {
    document.body.innerHTML = `<div style="font:15px/1.6 -apple-system,Inter,sans-serif;max-width:520px;margin:15vh auto;padding:24px;background:#fff;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.15)">
      <b>No se pudo cargar el contenido (content/data.json).</b><br>
      Si abriste el archivo con doble clic, ábrelo con un servidor local (Live Server en VS Code o <code>npx serve .</code>).</div>`;
    return;
  }
  D.links = D.links || {};
  // Acepta el correo sin "mailto:" y el WhatsApp solo con el número
  if (D.links.email && !/^mailto:/i.test(D.links.email) && D.links.email.includes("@")) D.links.email = "mailto:" + D.links.email.trim();
  if (D.links.whatsapp && /^\+?[\d\s-]{8,}$/.test(D.links.whatsapp)) D.links.whatsapp = "https://wa.me/" + D.links.whatsapp.replace(/\D/g, "");
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ---------- Almacenamiento seguro ----------
  const mkStore = (kind) => ({
    get(k, d) { try { const v = window[kind].getItem("tg:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { window[kind].setItem("tg:" + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  });
  const store = mkStore("localStorage");
  const sess = mkStore("sessionStorage");

  // ---------- Idioma ----------
  let lang = store.get("lang", D.defaultLang || "es");
  const t = (v) => (v == null ? "" : typeof v === "object" && !Array.isArray(v) ? v[lang] ?? v.es ?? v.en ?? "" : v);
  const UI = {
    es: {
      info: "Info", skip: "Saltar intro", now: "ahora", all: "Todo", cases: "Casos", photos: "Fotos", videos: "Videos",
      items: (n) => `${n} ${n === 1 ? "elemento" : "elementos"}`, caseBadge: "Caso de estudio", video: "Video",
      close: "Cerrar", min: "Minimizar", max: "Maximizar", download: "Descargar", openTab: "Abrir en pestaña nueva",
      client: "Cliente", role: "Rol", year: "Año", tools: "Herramientas", prev: "← Anterior", next: "Siguiente →",
      pdfMobile: "Toca el botón para ver el PDF.", desktop: "Escritorio", contact: "Contacto",
      whatsapp: "WhatsApp", instagram: "Instagram", linkedin: "LinkedIn", behance: "Behance", email: "Correo",
      favorites: "Favoritos", more: "Más", about: "Sobre mí", rotate: "Gira tu teléfono para ver el portafolio",
    },
    en: {
      info: "Info", skip: "Skip intro", now: "now", all: "All", cases: "Cases", photos: "Photos", videos: "Videos",
      items: (n) => `${n} ${n === 1 ? "item" : "items"}`, caseBadge: "Case study", video: "Video",
      close: "Close", min: "Minimize", max: "Zoom", download: "Download", openTab: "Open in new tab",
      client: "Client", role: "Role", year: "Year", tools: "Tools", prev: "← Previous", next: "Next →",
      pdfMobile: "Tap the button to view the PDF.", desktop: "Desktop", contact: "Contact",
      whatsapp: "WhatsApp", instagram: "Instagram", linkedin: "LinkedIn", behance: "Behance", email: "Email",
      favorites: "Favorites", more: "More", about: "About me", rotate: "Rotate your phone to view the portfolio",
    },
  };
  // Textos de la interfaz: se pueden reemplazar desde el admin (D.uiText)
  const ui = (k, ...a) => {
    const o = D.uiText && D.uiText[k] && t(D.uiText[k]);
    if (o) return k === "items" ? o.replace("{n}", a[0]) : o;
    const v = UI[lang][k];
    return typeof v === "function" ? v(...a) : v;
  };
  const TH = Object.assign({ showIntro: true, showNotification: true, showSticky: true }, D.theme || {});

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isMobile = () => matchMedia("(max-width: 760px)").matches;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // ---------- Diseño editable desde el admin (tipografía, colores, formas) ----------
  const FONTS = ["Inter", "DM Sans", "Manrope", "Plus Jakarta Sans", "Outfit", "Space Grotesk", "Poppins", "Montserrat", "Work Sans", "IBM Plex Sans", "Sora", "Urbanist", "Figtree", "Geist", "Instrument Sans", "Onest", "Lexend", "Rubik", "Nunito Sans", "Raleway", "Playfair Display", "Fraunces", "DM Serif Display", "Instrument Serif", "Libre Baskerville", "Space Mono", "JetBrains Mono"];
  const SYS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, Arial, sans-serif';
  const hex = (v) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
  const rgba = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const FMT = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };
  const cleanFam = (v) => String(v || "").replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, 40);
  function applyDesign(T) {
    const root = document.documentElement.style;
    // Tipografías subidas desde el admin (@font-face)
    const custom = (T.customFonts || []).map((f) => ({
      fam: cleanFam(f && f.family),
      src: String((f && f.src) || ""),
      w: [100, 200, 300, 400, 500, 600, 700, 800, 900].includes(+f.weight) ? +f.weight : 400,
      st: f && f.style === "italic" ? "italic" : "normal",
    })).filter((c) => c.fam && /^[A-Za-z0-9_./-]+$/.test(c.src) && !c.src.includes("..") && FMT[c.src.split(".").pop().toLowerCase()]);
    if (custom.length) {
      const st = document.createElement("style");
      st.textContent = custom.map((c) => `@font-face{font-family:"${c.fam}";src:url("/${c.src.replace(/^\//, "")}") format("${FMT[c.src.split(".").pop().toLowerCase()]}");font-weight:${c.w};font-style:${c.st};font-display:swap}`).join("");
      document.head.append(st);
    }
    const customNames = new Set(custom.map((c) => c.fam));
    const okFont = (f) => FONTS.includes(f) || customNames.has(f);
    const fams = [T.font, T.fontHead].filter((f) => FONTS.includes(f));
    if (fams.length) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?" + [...new Set(fams)].map((f) => "family=" + f.replace(/ /g, "+") + ":wght@400;500;600;700;800").join("&") + "&display=swap";
      document.head.append(l);
    }
    if (okFont(T.font)) root.setProperty("--font", `"${T.font}", ${SYS}`);
    if (okFont(T.fontHead)) root.setProperty("--font-head", `"${T.fontHead}", ${SYS}`);
    if ([400, 500, 600, 700, 800].includes(+T.headWeight)) root.setProperty("--head-weight", +T.headWeight);
    applyColors(T);
    if (+T.radius >= 0 && +T.radius <= 32) root.setProperty("--radius-win", +T.radius + "px");
    if (+T.dockSize >= 36 && +T.dockSize <= 80) root.setProperty("--dk-size", +T.dockSize + "px");
    if (+T.iconScale >= 60 && +T.iconScale <= 160) root.setProperty("--icon-scale", +T.iconScale / 100);
    // Fondo y textura
    if (T.wallpaperBlur !== undefined && T.wallpaperBlur !== "" && +T.wallpaperBlur >= 0 && +T.wallpaperBlur <= 30) root.setProperty("--wp-blur", +T.wallpaperBlur + "px");
    if (T.noiseOpacity !== undefined && T.noiseOpacity !== "" && +T.noiseOpacity >= 0 && +T.noiseOpacity <= 50) root.setProperty("--noise-o", +T.noiseOpacity / 100);
    const b = document.body.classList;
    b.toggle("no-dof", T.dof === false);
    b.toggle("no-noise", T.noise === false);
    b.toggle("noise-anim", T.noiseAnimated === true && !reducedMotion);
    b.toggle("no-focus-in", T.focusIn === false);
  }
  // ---------- Modo oscuro automático (de noche, según la hora del visitante) ----------
  // Prueba manual: tudominio.com/?modo=oscuro  o  ?modo=claro
  const COLOR_MAP = { ink: "--ink", ink2: "--ink-2", muted: "--muted", winBg: "--win-bg", winBar: "--win-bar", noteBg: "--note-bg", stickyBg: "--sticky-bg", labelInk: "--label-ink", menubarInk: "--menubar-ink" };
  const forced = (new URLSearchParams(location.search).get("modo") || "").toLowerCase();
  function isDark() {
    if (forced === "oscuro" || forced === "dark") return true;
    if (forced === "claro" || forced === "light") return false;
    const T = D.theme || {};
    if (T.autoDark === false) return false;
    const from = Number.isFinite(+T.darkFrom) && T.darkFrom !== "" ? +T.darkFrom : 18;
    const to = Number.isFinite(+T.darkTo) && T.darkTo !== "" ? +T.darkTo : 6;
    const h = new Date().getHours();
    return from === to ? false : from > to ? h >= from || h < to : h >= from && h < to;
  }
  // Los colores personalizados aplican en modo claro; de noche se usa la paleta oscura (el acento se mantiene)
  function applyColors(T) {
    const root = document.documentElement.style;
    const dark = document.documentElement.classList.contains("dark");
    [...Object.values(COLOR_MAP), "--accent", "--menubar-bg", "--dock-bg"].forEach((v) => root.removeProperty(v));
    if (hex(T.accent)) root.setProperty("--accent", T.accent);
    if (dark) return;
    Object.entries(COLOR_MAP).forEach(([k, v]) => { if (hex(T[k])) root.setProperty(v, T[k]); });
    if (hex(T.menubarBg)) root.setProperty("--menubar-bg", rgba(T.menubarBg, Math.min(1, Math.max(0, (+T.menubarOpacity || 16) / 100))));
    if (hex(T.dockBg)) root.setProperty("--dock-bg", rgba(T.dockBg, Math.min(1, Math.max(0, (+T.dockOpacity || 38) / 100))));
  }
  function updateMode(first) {
    const dark = isDark();
    const html = document.documentElement;
    if (!first && dark === html.classList.contains("dark")) return;
    html.classList.toggle("dark", dark);
    applyColors(D.theme || {});
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#1c1c1e" : "#cfd2bf";
    if (!first) setWallpaper();
  }
  function setWallpaper() {
    let src = String(wallpaperUrl() || "").replace(/["\\\n]/g, "");
    if (src && !/^(https?:|data:|blob:|\/)/i.test(src)) src = "/" + src;
    const url = `url("${src}")`;
    document.querySelectorAll(".wallpaper").forEach((el) => el.style.setProperty("--wp", url));
  }
  const wallpaperUrl = () =>
    document.documentElement.classList.contains("dark") && D.wallpaperDark ? D.wallpaperDark : (isMobile() && D.wallpaperMobile ? D.wallpaperMobile : D.wallpaper);

  // =========================================================================
  // Íconos SVG (genéricos, dibujados a mano)
  // =========================================================================
  // Colores de carpeta: [frente claro, frente oscuro, fondo claro, fondo oscuro]
  const FOLDER_COLORS = {
    blue: ["#b4e0ff", "#62b3f7", "#5aa6ec", "#3f8fdc"],
    pink: ["#ffd0e2", "#f294bb", "#e889b0", "#d46c98"],
    purple: ["#ddd2ff", "#a690f2", "#9a85ea", "#7d66d6"],
    green: ["#cdf0c2", "#7cc96a", "#72bd60", "#56a447"],
    orange: ["#ffdcb0", "#f7a752", "#f19c45", "#da822c"],
    teal: ["#c4ece4", "#78c8b8", "#6dbcac", "#52a394"],
    gray: ["#ececec", "#bcbcbc", "#b0b0b0", "#949494"],
  };
  let gid = 0;
  const uid = () => "g" + gid++;
  const svgFolder = (c = "blue") => {
    const [f1, f2, b1, b2] = FOLDER_COLORS[c] || FOLDER_COLORS.blue;
    const gb = uid(), gf = uid();
    return `<svg viewBox="0 0 100 84" aria-hidden="true"><defs>
      <linearGradient id="${gb}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/></linearGradient>
      <linearGradient id="${gf}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${f1}"/><stop offset="1" stop-color="${f2}"/></linearGradient></defs>
      <path d="M4 12a7 7 0 0 1 7-7h23.5a6 6 0 0 1 4.6 2.2L44 13h45a7 7 0 0 1 7 7v54a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill="url(#${gb})"/>
      <g class="papers">
        <g class="paper p2"><rect x="24" y="22" width="58" height="40" rx="3" fill="#f2f2f2"/><path d="M31 31h34M31 37h40M31 43h28" stroke="#d6d6d6" stroke-width="2.2" stroke-linecap="round"/></g>
        <g class="paper p1"><rect x="16" y="24" width="60" height="42" rx="3" fill="#fff"/><path d="M23 33h36M23 39h44M23 45h30" stroke="#cfcfcf" stroke-width="2.2" stroke-linecap="round"/></g>
      </g>
      <g class="front">
        <path d="M4 30a7 7 0 0 1 7-7h78a7 7 0 0 1 7 7v44a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill="url(#${gf})"/>
        <path d="M11 23.7h78" stroke="#fff" stroke-opacity=".75" stroke-width="1.3"/>
        <path d="M4.5 74a5.5 5.5 0 0 0 5.5 5.5h80a5.5 5.5 0 0 0 5.5-5.5" fill="none" stroke="#000" stroke-opacity=".12"/>
      </g></svg>`;
  };
  const svgNote = () => {
    const gy = uid(), gp = uid();
    return `<svg viewBox="0 0 100 84" aria-hidden="true"><defs>
      <linearGradient id="${gy}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f5c02f"/></linearGradient>
      <linearGradient id="${gp}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f3f1ea"/></linearGradient></defs>
      <rect x="20" y="2" width="60" height="80" rx="9" fill="url(#${gp})"/>
      <path d="M20 11a9 9 0 0 1 9-9h42a9 9 0 0 1 9 9v10H20z" fill="url(#${gy})"/>
      <g fill="#c99a12" opacity=".55">${[30, 40, 50, 60, 70].map((x) => `<circle cx="${x}" cy="21" r="1.3"/>`).join("")}</g>
      <g stroke="#dcd8cc" stroke-width="1.6" stroke-linecap="round"><line x1="29" y1="37" x2="71" y2="37"/><line x1="29" y1="47" x2="71" y2="47"/><line x1="29" y1="57" x2="71" y2="57"/><line x1="29" y1="67" x2="56" y2="67"/></g>
      <rect x="20.5" y="2.5" width="59" height="79" rx="8.5" fill="none" stroke="#000" stroke-opacity=".08"/></svg>`;
  };
  const svgPdf = () => {
    const gp = uid();
    return `<svg viewBox="0 0 100 84" aria-hidden="true"><defs><linearGradient id="${gp}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f1f1f1"/></linearGradient></defs>
      <path d="M26 2h34l20 20v56a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z" fill="url(#${gp})" stroke="#000" stroke-opacity=".08"/>
      <path d="M60 2v16a4 4 0 0 0 4 4h16z" fill="#dedede"/>
      <circle cx="36" cy="18" r="6" fill="#d3b17a"/><g stroke="#cfcfcf" stroke-width="2" stroke-linecap="round"><line x1="46" y1="15" x2="54" y2="15"/><line x1="46" y1="21" x2="52" y2="21"/><line x1="31" y1="34" x2="71" y2="34"/><line x1="31" y1="41" x2="71" y2="41"/><line x1="31" y1="48" x2="64" y2="48"/><line x1="31" y1="55" x2="68" y2="55"/></g>
      <rect x="30" y="63" width="26" height="12" rx="3" fill="#e5484d"/><text x="43" y="72" text-anchor="middle" font-size="8.5" font-weight="700" fill="#fff" font-family="-apple-system,Inter,Arial">PDF</text></svg>`;
  };

  // Íconos del dock: forma "squircle" con degradado y brillo, estilo macOS (dibujos originales)
  const SQ = "M50 2C85 2 98 15 98 50S85 98 50 98 2 85 2 50 15 2 50 2Z";
  const dockTile = (c1, c2, glyph) => {
    const g = uid(), h = uid();
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><defs>
      <linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
      <linearGradient id="${h}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <path d="${SQ}" fill="url(#${g})"/><path d="${SQ}" fill="url(#${h})"/>${glyph}
      <path d="${SQ}" fill="none" stroke="#000" stroke-opacity=".1"/></svg>`;
  };
  const DOCK_ICONS = {
    whatsapp: () => dockTile("#86f3a0", "#1fb64c", `<ellipse cx="60" cy="38" rx="21" ry="16" fill="#fff" opacity=".5"/>
      <path d="M42 33c-15 0-26 9.4-26 21 0 6.2 3.2 11.7 8.3 15.5L21.5 79l11.2-5.2c2.9.9 6 1.3 9.3 1.3 15 0 26-9.4 26-21S57 33 42 33z" fill="#fff"/>
      <g fill="#2fc45c"><circle cx="31" cy="54" r="3.6"/><circle cx="42" cy="54" r="3.6"/><circle cx="53" cy="54" r="3.6"/></g>`),
    instagram: () => dockTile("#ffb067", "#f2466f", `<rect x="21" y="33" width="58" height="42" rx="11" fill="#fff"/><rect x="38" y="25" width="22" height="12" rx="4" fill="#fff"/>
      <circle cx="50" cy="54" r="14" fill="#f5677a"/><circle cx="50" cy="54" r="9" fill="#fff" opacity=".35"/><circle cx="68" cy="42" r="3" fill="#f5677a"/>`),
    linkedin: () => dockTile("#6db6ff", "#1462d4", `<path d="M40 34v-5a5 5 0 0 1 5-5h10a5 5 0 0 1 5 5v5" fill="none" stroke="#fff" stroke-width="5"/>
      <rect x="19" y="33" width="62" height="42" rx="8" fill="#fff"/><rect x="19" y="49" width="62" height="5" fill="#cfe3ff"/><rect x="45" y="46" width="10" height="11" rx="2" fill="#1f6fde"/>`),
    behance: () => dockTile("#5a5a5f", "#1c1c1e", `<g fill="#fff"><rect x="24" y="24" width="23" height="23" rx="5"/><rect x="53" y="24" width="23" height="23" rx="5" opacity=".8"/><rect x="24" y="53" width="23" height="23" rx="5" opacity=".8"/><rect x="53" y="53" width="23" height="23" rx="5" opacity=".5"/></g>`),
    email: () => dockTile("#7fd0ff", "#1878ee", `<rect x="18" y="29" width="64" height="44" rx="7" fill="#fff"/><path d="M21 33l29 22 29-22" fill="none" stroke="#9cc8f5" stroke-width="4" stroke-linejoin="round"/>`),
  };
  const WIFI_SVG = `<svg viewBox="0 -1.2 18 14.4" width="17" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M1.4 3.9a10.6 10.6 0 0 1 15.2 0"/><path d="M3.8 6.3a7.2 7.2 0 0 1 10.4 0"/><path d="M6.2 8.7a3.8 3.8 0 0 1 5.6 0"/><circle cx="9" cy="11.3" r="1.35" fill="currentColor" stroke="none"/></svg>`;
  const BATT_SVG = `<svg viewBox="0 0 27 12" width="25" height="12" aria-hidden="true"><rect x=".5" y=".5" width="23" height="11" rx="3" fill="none" stroke="currentColor" stroke-opacity=".55"/><rect x="2" y="2" width="17" height="8" rx="1.6" fill="currentColor"/><path d="M25 4v4a2 2 0 0 0 0-4z" fill="currentColor" fill-opacity=".55"/></svg>`;
  // Isotipo TG (logo de Thomgraphics) en el color del texto de la barra (blanco por defecto)
  const MONO_SVG = `<svg viewBox="0 0 274 242" width="17" height="15" aria-hidden="true"><path fill="currentColor" d="M91 76 L29 82 L29 241 L91 234Z M273 70 L189 78 L188 132 L273 123Z M100 76 L100 234 L273 216 L273 131 L217 137 L216 161 L158 167 L157 70Z M273 0 L0 26 L0 77 L273 50Z"/></svg>`;
  const SB_FOLDER = `<svg viewBox="0 0 20 16" aria-hidden="true"><path d="M1.5 3.2c0-.9.7-1.7 1.7-1.7h4.2c.4 0 .8.2 1.1.5l1.2 1.3h7.1c.9 0 1.7.7 1.7 1.7v8.3c0 .9-.7 1.7-1.7 1.7H3.2c-.9 0-1.7-.7-1.7-1.7z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M1.5 6h17" stroke="currentColor" stroke-width="1.2"/></svg>`;
  const SB_DOC = `<svg viewBox="0 0 20 16" aria-hidden="true"><path d="M5 1.5h6.5l3.5 3.5v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-11.5a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7 8h6M7 11h4" stroke="currentColor" stroke-width="1.2"/></svg>`;
  const X_SVG = `<svg viewBox="0 0 10 10"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5"/></svg>`;
  const MIN_SVG = `<svg viewBox="0 0 10 10"><path d="M2 5h6"/></svg>`;
  const MAX_SVG = `<svg viewBox="0 0 10 10"><path d="M3 7V3h4M7 3v4H3" /></svg>`;

  // =========================================================================
  // Barra de menú y reloj
  // =========================================================================
  const menubar = $("#menubar");
  function renderMenubar() {
    menubar.innerHTML = `
      <button class="mb-item mb-logo" data-open="about" aria-label="${esc(D.brand)}">${MONO_SVG}</button>
      <button class="mb-item mb-brand" data-open="about">${esc(D.brand)}</button>
      <span class="mb-item mb-app mb-hide-sm" id="mb-app"></span>
      <button class="mb-item mb-hide-sm" data-open="about">${ui("info")}</button>
      ${D.links.instagram ? `<a class="mb-item mb-hide-sm" href="${esc(D.links.instagram)}" data-net="instagram" target="_blank" rel="noopener">${esc(ui("instagram"))}</a>` : ""}
      <span class="mb-spacer"></span>
      <span class="mb-lang">
        <button data-lang="es" aria-pressed="${lang === "es"}"><span class="long">Español</span><span class="short">ES</span></button>/
        <button data-lang="en" aria-pressed="${lang === "en"}"><span class="long">English</span><span class="short">EN</span></button>
      </span>
      <span class="mb-status" aria-hidden="true">${BATT_SVG}${WIFI_SVG}</span>
      <span class="mb-clock" id="clock"></span>`;
    updateAppName();
    tick();
  }
  menubar.addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]");
    if (o) openItem(o.dataset.open, o);
    const l = e.target.closest("[data-lang]");
    if (l) setLang(l.dataset.lang);
  });
  function tick() {
    const el = $("#clock");
    if (!el) return;
    const d = new Date();
    const loc = lang === "es" ? "es-CO" : "en-US";
    const clean = (s) => s.replace(/\./g, "").replace(",", "");
    const wd = clean(d.toLocaleDateString(loc, { weekday: "short" }));
    const mon = clean(d.toLocaleDateString(loc, { month: "short" }));
    const time = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false });
    el.textContent = isMobile() ? time : lang === "es" ? `${wd} ${d.getDate()} ${mon} ${time}` : `${wd} ${mon} ${d.getDate()} ${time}`;
  }
  setInterval(tick, 15000);

  // =========================================================================
  // Íconos del escritorio (arrastrables)
  // =========================================================================
  const iconsEl = $("#icons");
  const positions = store.get("positions", {});
  const itemById = (id) => D.desktop.find((d) => d.id === id);

  function iconArt(item) {
    if (item.icon) return `<img class="icon-img" src="${esc(item.icon)}" alt="" draggable="false">`;
    switch (item.type) {
      case "folder": return svgFolder(item.color);
      case "note": return svgNote();
      case "pdf": return svgPdf();
      case "photo": return `<span class="thumb-photo"><img src="${esc(item.src)}" alt="" loading="lazy" draggable="false"></span>`;
      case "video": return `<span class="thumb-video">${item.poster ? `<img src="${esc(item.poster)}" alt="" draggable="false">` : ""}</span>`;
      default: return svgNote();
    }
  }
  function renderIcons() {
    iconsEl.innerHTML = D.desktop.map((item, i) => {
      const p = positions[item.id] || item;
      return `<button class="icon" data-id="${esc(item.id)}" style="--x:${p.x};--y:${p.y};--i:${i}">
        <span class="icon-art">${iconArt(item)}</span><span class="icon-label">${esc(t(item.label))}</span></button>`;
    }).join("");
  }
  function relabelIcons() {
    $$(".icon", iconsEl).forEach((el) => { $(".icon-label", el).textContent = t(itemById(el.dataset.id).label); });
  }
  const select = (el) => { $$(".icon.selected").forEach((i) => i !== el && i.classList.remove("selected")); el && el.classList.add("selected"); };

  let drag = null, lastTap = { id: null, time: 0 }, pointerType = "mouse";
  iconsEl.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".icon");
    if (!el) return;
    pointerType = e.pointerType;
    select(el);
    if (isMobile() || e.button !== 0) return;
    const rect = $("#desktop").getBoundingClientRect();
    drag = { el, id: el.dataset.id, sx: e.clientX, sy: e.clientY, ox: parseFloat(el.style.getPropertyValue("--x")), oy: parseFloat(el.style.getPropertyValue("--y")), w: rect.width, h: rect.height, moved: false };
    el.setPointerCapture(e.pointerId);
  });
  iconsEl.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    drag.el.classList.add("dragging");
    const x = Math.min(96, Math.max(4, drag.ox + (dx / drag.w) * 100));
    const y = Math.min(90, Math.max(5, drag.oy + (dy / drag.h) * 100));
    drag.el.style.setProperty("--x", x.toFixed(2));
    drag.el.style.setProperty("--y", y.toFixed(2));
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) {
      drag.el.classList.remove("dragging");
      positions[drag.id] = { x: +drag.el.style.getPropertyValue("--x"), y: +drag.el.style.getPropertyValue("--y") };
      store.set("positions", positions);
      const moved = drag.el;
      moved.dataset.justDragged = "1";
      setTimeout(() => delete moved.dataset.justDragged, 60);
    }
    drag = null;
  };
  iconsEl.addEventListener("pointerup", endDrag);
  iconsEl.addEventListener("pointercancel", endDrag);
  iconsEl.addEventListener("click", (e) => {
    const el = e.target.closest(".icon");
    if (!el || el.dataset.justDragged) { if (el) delete el.dataset.justDragged; return; }
    openItem(el.dataset.id, el);
  });
  $("#desktop").addEventListener("pointerdown", (e) => { if (!e.target.closest(".icon")) select(null); });

  // =========================================================================
  // Ventanas
  // =========================================================================
  const layer = $("#windows");
  const notif = $("#notification");
  const wins = new Map();
  let zTop = 100;

  function openWindow(key, opts) {
    if (wins.has(key)) {
      const w = wins.get(key);
      if (w.minimized) restoreWin(key);
      Object.assign(w, opts);
      paint(w);
      focusWin(key);
      return w;
    }
    const el = document.createElement("section");
    el.className = "win " + (opts.cls || "");
    el.setAttribute("role", "dialog");
    el.innerHTML = `
      <div class="win-bar">
        <div class="traffic">
          <button class="t-close" data-act="close"><span>${X_SVG}</span></button>
          <button class="t-min" data-act="min"><span>${MIN_SVG}</span></button>
          <button class="t-max" data-act="max"><span>${MAX_SVG}</span></button>
        </div>
        <div class="win-title"></div>
        <div class="win-actions"></div>
      </div>
      <div class="win-body"></div>`;

    const vw = layer.clientWidth, vh = layer.clientHeight;
    const width = Math.min(opts.w || 860, vw - 40);
    const height = Math.min(opts.h || 600, vh - 150);
    const n = wins.size % 6;
    const left = Math.max(20, (vw - width) / 2 + n * 26 - 13 * Math.min(wins.size, 5));
    const top = Math.max(14, Math.min((vh - 100 - height) / 2 + n * 22, vh - 96 - height));
    Object.assign(el.style, { width: width + "px", height: height + "px", left: left + "px", top: top + "px" });

    // La ventana "crece" desde el ícono que la abrió
    if (opts.origin && opts.origin.getBoundingClientRect) {
      const r = opts.origin.getBoundingClientRect(), lr = layer.getBoundingClientRect();
      el.style.setProperty("--ox", r.left + r.width / 2 - lr.left - left + "px");
      el.style.setProperty("--oy", r.top + r.height / 2 - lr.top - top + "px");
    }

    const w = { key, el, ...opts };
    wins.set(key, w);
    layer.appendChild(el);
    paint(w);
    bindWindow(w);
    focusWin(key);
    document.body.classList.add("has-window");
    updateDock();
    return w;
  }

  function paint(w) {
    const title = typeof w.title === "function" ? w.title() : t(w.title);
    $(".win-title", w.el).textContent = title;
    w.el.setAttribute("aria-label", title);
    $(".t-close", w.el).setAttribute("aria-label", ui("close"));
    $(".t-min", w.el).setAttribute("aria-label", ui("min"));
    $(".t-max", w.el).setAttribute("aria-label", ui("max"));
    $(".win-actions", w.el).innerHTML = w.actions ? w.actions() : "";
    const body = $(".win-body", w.el);
    w.render(body, w);
    if (w.resetScroll) { body.scrollTop = 0; w.resetScroll = false; }
  }

  function focusWin(key) {
    const w = wins.get(key);
    if (!w) return;
    if (w.minimized) { restoreWin(key); return; }
    w.el.style.zIndex = ++zTop;
    wins.forEach((o) => o.el.classList.toggle("inactive", o !== w));
    updateAppName();
    setHash(w.hash || "");
  }
  function topWin() {
    let best = null;
    wins.forEach((w) => { if (!w.minimized && (!best || +w.el.style.zIndex > +best.el.style.zIndex)) best = w; });
    return best;
  }
  function closeWin(key) {
    const w = wins.get(key);
    if (!w) return;
    wins.delete(key);
    $$("video", w.el).forEach((v) => v.pause());
    w.el.style.animation = "";
    const tile = dock.querySelector(`.dk-min[data-restore="${CSS.escape(key)}"]`);
    if (tile) { tile.remove(); renderMin(); }
    w.el.classList.add("closing");
    const rm = () => w.el.remove();
    w.el.addEventListener("animationend", rm, { once: true });
    setTimeout(rm, 400);
    const next = topWin();
    if (next) focusWin(next.key);
    else { document.body.classList.remove("has-window"); updateAppName(); setHash(""); }
    updateDock();
  }

  // ---------- Minimizar al Dock con efecto "genio" (como macOS) ----------
  // Genio de macOS: la ventana se desliza por un "tubo" de lados curvos (curva en S) que va del
  // ancho de la ventana al ancho del ícono del Dock. Primero se curva y se absorbe la parte de abajo,
  // luego la de arriba la sigue. Se dibuja cuadro a cuadro con un contorno de muchos puntos (bordes suaves).
  function genie(el, tile, reverse, done) {
    const r = el.getBoundingClientRect(), ic = tile.getBoundingClientRect();
    const W = r.width, H = r.height;
    const iL = ic.left + ic.width * 0.08, iR = ic.right - ic.width * 0.08, iT = ic.top + ic.height * 0.12, iB = ic.bottom - ic.height * 0.08;
    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const lerp = (a, b, k) => a + (b - a) * k;
    const sCurve = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(u));
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const easeIn = (x) => x * x * (2.2 - 1.2 * x);
    const tubeTop = r.top, tubeBot = Math.max(iT, r.bottom - 1);
    const side = (Y, bend, left) => {
      const sg = sCurve((Y - tubeTop) / (iT - tubeTop || 1));
      const from = left ? r.left : r.right, to = left ? iL : iR;
      return lerp(from, lerp(from, to, sg), bend);
    };
    const DUR = reducedMotion ? 1 : 640, N = 34;
    el.style.transformOrigin = "0 0";
    el.style.willChange = "transform, clip-path, filter";
    let start = null;
    const frame = (now) => {
      if (start === null) start = now;
      const p = clamp01((now - start) / DUR);
      const k = reverse ? 1 - p : p;
      const bend = ease(clamp01(k / 0.42));
      const bottomY = lerp(r.bottom, iB, easeIn(clamp01((k - 0.12) / 0.78)));
      const topY = Math.min(bottomY - ic.height * 0.8, lerp(r.top, iT, easeIn(clamp01((k - 0.3) / 0.7))));
      const Lt = side(topY, bend, true), Rt = side(topY, bend, false);
      const sx = Math.max(0.001, (Rt - Lt) / W), sy = Math.max(0.001, (bottomY - topY) / H);
      el.style.transform = `translate(${(Lt - r.left).toFixed(2)}px, ${(topY - r.top).toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
      const L = [], R = [];
      for (let i = 0; i <= N; i++) {
        const Y = lerp(topY, bottomY, i / N), ly = ((Y - topY) / sy).toFixed(1);
        L.push(`${((side(Y, bend, true) - Lt) / sx).toFixed(1)}px ${ly}px`);
        R.push(`${((side(Y, bend, false) - Lt) / sx).toFixed(1)}px ${ly}px`);
      }
      el.style.clipPath = `polygon(${L.join(",")},${R.reverse().join(",")})`;
      el.style.filter = `blur(${(Math.sin(Math.PI * k) * 1.4 * (0.4 + 0.6 * k)).toFixed(2)}px)`;
      el.style.opacity = String(1 - clamp01((k - 0.86) / 0.14) * 0.55);
      if (tile.classList.contains("entering") && k > 0.82) tile.classList.remove("entering");
      if (p < 1) requestAnimationFrame(frame);
      else {
        ["transform", "clipPath", "filter", "opacity", "willChange", "transformOrigin"].forEach((x) => (el.style[x] = ""));
        if (done) done();
      }
    };
    frame(performance.now()); // primer cuadro de inmediato: sin parpadeo al restaurar
  }
  function miniThumb(w) {
    const img = [...w.el.querySelectorAll(".win-body img")].find((i) => i.complete && i.naturalWidth);
    const vid = w.el.querySelector(".win-body video[poster]");
    const src = img ? img.currentSrc || img.src : vid ? vid.getAttribute("poster") : "";
    const title = typeof w.title === "function" ? w.title() : t(w.title);
    return `<span class="mini"><i class="mini-bar"><b></b><b></b><b></b></i>${src ? `<img src="${esc(src)}" alt="" draggable="false">` : `<em>${esc(title)}</em>`}</span><span class="tip">${esc(title)}</span>`;
  }
  function renderMin() {
    const tiles = $$(".dk-min", dock);
    let sep = $(".min-sep", dock);
    if (tiles.length && !sep) { sep = document.createElement("span"); sep.className = "sep min-sep"; dock.insertBefore(sep, tiles[0]); }
    if (!tiles.length && sep) sep.remove();
  }
  function minimizeWin(key) {
    const w = wins.get(key);
    if (!w || w.minimized) return;
    if (isMobile()) { closeWin(key); return; }
    $$("video", w.el).forEach((v) => v.pause());
    const title = typeof w.title === "function" ? w.title() : t(w.title);
    const tile = document.createElement("button");
    tile.className = "dk dk-min entering";
    tile.dataset.restore = key;
    tile.setAttribute("aria-label", (lang === "es" ? "Restaurar: " : "Restore: ") + title);
    tile.innerHTML = miniThumb(w);
    dock.appendChild(tile); renderMin();
    w.minimized = true;
    w.el.style.animation = "none"; // que no se repita la animación de apertura al restaurar
    w.el.style.zIndex = 5000; // la ventana que se minimiza pasa por encima de las demás
    w.el.classList.add("genie");
    requestAnimationFrame(() => genie(w.el, tile, false, () => { w.el.style.display = "none"; w.el.classList.remove("genie"); tile.classList.remove("entering"); }));
    const next = topWin();
    if (next) focusWin(next.key);
    else { document.body.classList.remove("has-window"); updateAppName(); setHash(""); }
    track("open", { id: "min:" + key });
  }
  function restoreWin(key) {
    const w = wins.get(key);
    if (!w || !w.minimized) return;
    const tile = dock.querySelector(`.dk-min[data-restore="${CSS.escape(key)}"]`);
    w.minimized = false;
    w.el.style.display = "";
    document.body.classList.add("has-window");
    focusWin(key);
    if (tile) {
      w.el.classList.add("genie");
      tile.classList.add("leaving");
      genie(w.el, tile, true, () => { w.el.classList.remove("genie"); tile.remove(); renderMin(); });
    }
  }

  function bindWindow(w) {
    const el = w.el, bar = $(".win-bar", el);
    el.addEventListener("pointerdown", () => focusWin(w.key));
    bar.addEventListener("click", (e) => {
      const a = e.target.closest("[data-act]");
      if (!a) return;
      if (a.dataset.act === "close") closeWin(w.key);
      if (a.dataset.act === "min") minimizeWin(w.key);
      if (a.dataset.act === "max") el.classList.toggle("maximized");
    });
    bar.addEventListener("dblclick", (e) => { if (!e.target.closest("button,a")) el.classList.toggle("maximized"); });
    let d = null;
    bar.addEventListener("pointerdown", (e) => {
      if (isMobile() || e.target.closest("button,a") || el.classList.contains("maximized")) return;
      d = { sx: e.clientX, sy: e.clientY, l: el.offsetLeft, t: el.offsetTop };
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener("pointermove", (e) => {
      if (!d) return;
      const maxL = layer.clientWidth - 80, maxT = layer.clientHeight - 60;
      el.style.left = Math.min(maxL, Math.max(80 - el.offsetWidth, d.l + e.clientX - d.sx)) + "px";
      el.style.top = Math.min(maxT, Math.max(0, d.t + e.clientY - d.sy)) + "px";
    });
    const stop = () => (d = null);
    bar.addEventListener("pointerup", stop);
    bar.addEventListener("pointercancel", stop);
  }

  function updateAppName() {
    const el = $("#mb-app");
    if (!el) return;
    const w = topWin();
    el.textContent = w ? (typeof w.title === "function" ? w.title() : t(w.title)) : "";
  }

  // ---------- URL compartible (#/ux, #/case/hunter-track, #/about) ----------
  let routing = false;
  function setHash(h) {
    if (routing) return;
    const target = h ? "#/" + h : " ";
    if (location.hash.replace(/^#\/?/, "") === h) return;
    try { history.replaceState(null, "", h ? target : location.pathname + location.search); } catch { /* file:// */ }
  }
  function openFromHash() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    if (!h) return false;
    routing = true;
    const [kind, id] = h.split("/");
    if (kind === "case" && D.cases[id]) openCase(id);
    else if (itemById(kind)) openItem(kind);
    else if (D.folders[kind]) openFolder(kind);
    routing = false;
    const top = topWin();
    if (top) setHash(top.hash);
    return !!top;
  }

  // =========================================================================
  // Tipos de ventana
  // =========================================================================
  // ---------- Métricas anónimas (sin cookies). Se desactivan desde el admin en tu navegador ----------
  const tracked = new Set();
  function track(ev, extra) {
    try { if (localStorage.getItem("tg-notrack") === "1") return; } catch { /* */ }
    if (ev === "open") { if (tracked.has(extra.id)) return; tracked.add(extra.id); }
    const body = JSON.stringify({ ev, ref: document.referrer || "", q: location.search, lang: navigator.language || "", ...extra });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "text/plain" }));
      else fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
    } catch { /* */ }
  }

  function openItem(id, origin) {
    const item = itemById(id);
    if (item && item.type !== "folder") track("open", { id: "item:" + id });
    if (!item) { if (D.folders[id]) openFolder(id, origin); return; }
    const label = item.label;
    switch (item.type) {
      case "folder": return openFolder(id, origin);
      case "note": return openAbout(origin);
      case "pdf": return openPdf(item, origin);
      case "photo": return openImage(item.src, label, origin, id);
      case "video": return openVideo(item.src, label, item.poster, origin, id, item);
      case "link": return window.open(item.href, "_blank", "noopener");
    }
  }

  function openFolder(id, origin) {
    track("open", { id: "folder:" + id });
    if (!D.folders[id]) return;
    const startKey = "folder:" + id;
    if (wins.has(startKey)) return focusWin(startKey);
    const state = { id, filter: "all" };
    const kindOf = (it) => (it.type === "case" ? "case" : it.type === "video" ? "video" : "image");
    const folderIds = D.desktop.filter((d) => d.type === "folder" && D.folders[d.id]).map((d) => d.id);
    openWindow(startKey, {
      state, origin, w: 1000, h: 650, hash: id, cls: "finder",
      title: () => t(D.folders[state.id].title),
      render(body, w) {
        const f = D.folders[state.id];
        // Filtros: por categoría (si los elementos tienen categoría) o por tipo (casos / fotos / videos)
        const catKey = (it) => (it.category ? (typeof it.category === "object" ? it.category.es || it.category.en || "" : String(it.category)) : "");
        const catLabel = {};
        f.items.forEach((it) => { const k = catKey(it); if (k) catLabel[k] = t(it.category); });
        const cats = Object.keys(catLabel);
        const useCats = cats.length > 0;
        const kinds = useCats ? cats : [...new Set(f.items.map(kindOf))];
        const groupOf = (it) => (useCats ? catKey(it) : kindOf(it));
        if (state.filter !== "all" && !kinds.includes(state.filter)) state.filter = "all";
        const list = f.items.filter((it) => state.filter === "all" || groupOf(it) === state.filter);
        const labels = useCats ? catLabel : { case: ui("cases"), image: ui("photos"), video: ui("videos") };
        const extras = D.desktop.filter((d) => d.type === "note" || d.type === "pdf");
        body.innerHTML = `
          <aside class="sidebar">
            <div class="sb-h">${ui("favorites")}</div>
            ${folderIds.map((fid) => `<button class="sb-item" data-folder="${esc(fid)}" aria-current="${fid === state.id}">${SB_FOLDER}<span>${esc(t(D.folders[fid].title))}</span></button>`).join("")}
            <div class="sb-h">${ui("more")}</div>
            ${extras.map((x) => `<button class="sb-item" data-open="${esc(x.id)}">${SB_DOC}<span>${esc(t(x.label))}</span></button>`).join("")}
          </aside>
          <div class="main">
            <div class="folder-head">
              <h1>${esc(t(f.title))}</h1>
              <p>${esc(t(f.intro))}</p>
              <div class="filters">
                ${kinds.length > 1 || useCats ? `<div class="seg" role="group">${["all", ...kinds].map((k) => `<button data-filter="${esc(k)}" aria-pressed="${state.filter === k}">${k === "all" ? ui("all") : esc(labels[k])}</button>`).join("")}</div>` : ""}
                <span class="count">${ui("items", list.length)}</span>
              </div>
            </div>
            <div class="grid">${list.map((it, i) => tile(it, i)).join("")}</div>
          </div>`;
        body.onclick = (e) => {
          const nav = e.target.closest("[data-folder]");
          if (nav) {
            const fid = nav.dataset.folder, nk = "folder:" + fid;
            if (fid === state.id) return;
            if (wins.has(nk)) { focusWin(nk); return; }
            wins.delete(w.key); w.key = nk; wins.set(nk, w);
            state.id = fid; state.filter = "all"; w.hash = fid;
            paint(w); focusWin(nk); updateDock();
            return;
          }
          const ex = e.target.closest("[data-open]");
          if (ex) { openItem(ex.dataset.open, ex); return; }
          const fb = e.target.closest("[data-filter]");
          if (fb) { state.filter = fb.dataset.filter; w.render(body, w); return; }
          const tEl = e.target.closest(".tile");
          if (!tEl) return;
          const it = list[+tEl.dataset.idx];
          if (it.type === "case") openCase(it.case, tEl, f.items.filter((x) => x.type === "case").map((x) => x.case));
          else if (it.type === "video") openVideo(it.src, it.title, it.poster, tEl, null, it);
          else openImage(it.src, it.title, tEl);
        };
      },
    });
  }

  function tile(it, i) {
    if (it.type === "case") {
      const c = D.cases[it.case];
      if (!c) return "";
      return `<button class="tile is-case" data-idx="${i}" style="--i:${i}">
        <img src="${esc(c.cover)}" alt="${esc(c.title)}" loading="lazy" draggable="false">
        <span class="badge${c.badge && t(c.badge) ? " special" : ""}">${esc((c.badge && t(c.badge)) || ui("caseBadge"))}</span>
        <span class="cap"><strong>${esc(c.title)}</strong><span>${esc(t(c.subtitle))}</span></span></button>`;
    }
    const src = it.type === "video" ? it.poster : it.src;
    return `<button class="tile" data-idx="${i}" style="--i:${i}">
      <img src="${esc(src)}" alt="${esc(t(it.title))}" loading="lazy" draggable="false">
      ${it.type === "video" ? `<span class="badge">${ui("video")}</span>` : ""}</button>`;
  }

  // Botón del caso (ej. "Ver manual interactivo") — solo enlaces https
  function ctaHtml(c) {
    const url = c.link && String(c.link.url || "").trim();
    if (!url || !/^https:\/\//i.test(url)) return "";
    const label = t(c.link.label) || (lang === "es" ? "Ver proyecto" : "View project");
    return `<a class="mac-btn secondary case-cta" href="${esc(url)}" target="_blank" rel="noopener" data-cta="${esc(c.title)}">${esc(label)} <span aria-hidden="true">↗</span></a>`;
  }
  document.addEventListener("click", (e) => { const a = e.target.closest("a[data-cta]"); if (a) track("open", { id: "link:" + (a.dataset.cta || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) }); });

  // ---------- Prototipos y videos incrustados (se cargan al hacer clic) ----------
  function embedUrl(type, id) {
    id = String(id || "").trim();
    const safe = /^[A-Za-z0-9_\-\/]+$/.test(id);
    if (type === "youtube" && /^[A-Za-z0-9_-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1&playsinline=1`;
    if (type === "figma") {
      const u = /^https:\/\/(www\.)?figma\.com\//.test(id) ? id : safe ? "https://www.figma.com/" + id : "";
      return u ? "https://www.figma.com/embed?embed_host=thomgraphics&url=" + encodeURIComponent(u) : "";
    }
    if (type === "xd" && /^[A-Za-z0-9-]+$/.test(id)) return `https://xd.adobe.com/embed/${id}/`;
    return "";
  }
  function embedHtml(s, c) {
    const url = embedUrl(s.embedType, s.embedId);
    if (!url) return "";
    const video = s.embedType === "youtube";
    const label = video ? (lang === "es" ? "Reproducir video" : "Play video") : (lang === "es" ? "Abrir prototipo interactivo" : "Open interactive prototype");
    const note = s.embedType === "xd" ? "Adobe XD" : s.embedType === "figma" ? "Figma" : "YouTube";
    const ratio = ["mobile", "desktop", "video"].includes(s.embedRatio) ? s.embedRatio : video ? "video" : "desktop";
    return `<div class="case-embed r-${ratio}" data-embed="${esc(url)}" role="button" tabindex="0" aria-label="${esc(label)}">
      ${c.cover ? `<img class="ce-bg" src="${esc(c.cover)}" alt="" aria-hidden="true">` : ""}
      <span class="mac-btn primary ce-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg>${esc(label)}</span>
      <small class="ce-note">${note}</small>
    </div>`;
  }
  function loadEmbed(el) {
    if (el.classList.contains("on")) return;
    const f = document.createElement("iframe");
    f.src = el.dataset.embed; f.loading = "lazy"; f.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
    f.allowFullscreen = true; f.referrerPolicy = "strict-origin-when-cross-origin"; f.title = el.getAttribute("aria-label") || "";
    el.innerHTML = ""; el.appendChild(f); el.classList.add("on"); el.removeAttribute("role"); el.removeAttribute("tabindex");
    track("open", { id: "embed:" + (el.dataset.embed.match(/youtube|figma|xd\.adobe/) || ["x"])[0] });
  }
  document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-embed]")) { e.preventDefault(); loadEmbed(e.target); } });

  function openCase(id, origin, list) {
    track("open", { id: "case:" + id });
    const order = list && list.length ? list : Object.keys(D.cases);
    const existing = wins.get("case");
    const state = existing ? existing.state : { id, order };
    state.id = id; state.order = order;
    openWindow("case", {
      state, origin, w: 900, h: 700, resetScroll: true, cls: "casewin",
      get hash() { return "case/" + state.id; },
      title: () => D.cases[state.id].title,
      render(body) {
        const c = D.cases[state.id];
        const m = c.meta || {};
        const idx = state.order.indexOf(state.id);
        const prev = state.order[(idx - 1 + state.order.length) % state.order.length];
        const next = state.order[(idx + 1) % state.order.length];
        body.innerHTML = `
          <article class="case">
            <img class="case-cover" src="${esc(c.cover)}" alt="${esc(c.title)}">
            <div class="case-inner">
              <div class="case-tags">${(c.tags || []).map((g) => `<span class="chip">${esc(t(g))}</span>`).join("")}</div>
              <h1>${esc(c.title)}</h1>
              <p class="sub">${esc(t(c.subtitle))}</p>
              ${ctaHtml(c)}
              <dl class="case-meta">
                ${["client", "role", "year", "tools"].filter((k) => m[k]).map((k) => `<div><dt>${ui(k)}</dt><dd>${esc(t(m[k]))}</dd></div>`).join("")}
              </dl>
              ${(c.sections || []).map((s) => `
                <section>
                  ${s.h ? `<h2>${esc(t(s.h))}</h2>` : ""}
                  ${s.p ? `<p>${esc(t(s.p))}</p>` : ""}
                  ${s.img ? `<img src="${esc(s.img)}" alt="${esc(t(s.h) || c.title)}" loading="lazy" data-zoom>` : ""}
                  ${embedHtml(s, c)}
                </section>`).join("")}
              ${c.link && c.link.url ? `<div class="case-cta-end">${ctaHtml(c)}</div>` : ""}
              ${talkHtml(c, state.id)}
              ${state.order.length > 1 ? `<nav class="case-nav">
                <button class="mac-btn secondary" data-go="${esc(prev)}">${ui("prev")} ${esc(D.cases[prev].title)}</button>
                <button class="mac-btn secondary" data-go="${esc(next)}">${esc(D.cases[next].title)} ${ui("next")}</button></nav>` : ""}
            </div>
          </article>`;
        body.onclick = (e) => {
          const em = e.target.closest("[data-embed]");
          if (em) { loadEmbed(em); return; }
          const go = e.target.closest("[data-go]");
          if (go) { openCase(go.dataset.go, null, state.order); return; }
          const z = e.target.closest("[data-zoom]");
          if (z) openImage(z.getAttribute("src"), z.alt, z);
        };
      },
    });
  }

  function openAbout(origin) {
    const a = D.about;
    openWindow("about", {
      title: { es: "Sobre mí", en: "About me" }, origin, w: 580, h: 560, hash: "about",
      render(body) {
        body.innerHTML = `<div class="note">
          <div class="date">${esc(t(a.date))}</div>
          ${(Array.isArray(a.paragraphs) ? a.paragraphs.map(t) : t(a.paragraphs) || []).map((p) => `<p>${esc(p)}</p>`).join("")}
          <div class="skills">${(a.skills || []).map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div></div>`;
      },
    });
  }

  function openPdf(item, origin) {
    openWindow("pdf:" + item.id, {
      title: item.label, origin, w: 780, h: 760, hash: item.id,
      actions: () => `<a href="${esc(item.src)}" download>${ui("download")}</a>`,
      render(body) {
        body.style.overflow = "hidden";
        body.innerHTML = isMobile()
          ? `<div class="pdf-fallback">${ui("pdfMobile")}<br><a class="btn" href="${esc(item.src)}" target="_blank" rel="noopener">${ui("openTab")}</a></div>`
          : `<iframe class="pdf-frame" src="${esc(item.src)}#view=FitH" title="${esc(t(item.label))}"></iframe>`;
      },
    });
  }

  function fitSize(nw, nh, maxW = Math.min(900, layer.clientWidth - 40), maxH = Math.min(760, layer.clientHeight - 150)) {
    const s = Math.min(maxW / nw, (maxH - 38) / nh, 1.2);
    return { w: Math.round(nw * s), h: Math.round(nh * s) + 38 };
  }
  function openImage(src, title, origin, hashId) {
    const key = "img:" + src;
    if (wins.has(key)) return focusWin(key);
    const img = new Image();
    const go = () => {
      const { w, h } = img.naturalWidth ? fitSize(img.naturalWidth, img.naturalHeight) : { w: 720, h: 560 };
      openWindow(key, {
        title: title || src.split("/").pop(), origin, w, h, hash: hashId || "",
        render(body) { body.innerHTML = `<div class="viewer"><img src="${esc(src)}" alt="${esc(t(title))}" draggable="false"></div>`; },
      });
    };
    img.onload = go; img.onerror = go; img.src = src;
  }
  function openVideo(src, title, poster, origin, hashId, item) {
    // En el celular se usa la versión vertical (formato reel) si existe
    if (isMobile() && item && item.srcMobile) { src = item.srcMobile; poster = item.posterMobile || poster; }
    openWindow("vid:" + src, {
      title, origin, w: 880, h: 533, hash: hashId || "",
      render(body) {
        if ($("video", body)) return; // no reiniciar el video al cambiar idioma
        body.innerHTML = `<div class="viewer"><video src="${esc(src)}" ${poster ? `poster="${esc(poster)}"` : ""} controls autoplay playsinline></video></div>`;
      },
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { const w = topWin(); if (w) closeWin(w.key); }
    if (e.key === "Enter" && e.target.classList?.contains("icon")) { e.preventDefault(); openItem(e.target.dataset.id, e.target); }
  });

  // =========================================================================
  // Notificación, nota adhesiva y dock
  // =========================================================================
  function renderNotification() {
    const n = D.notification;
    if (!n) return;
    notif.innerHTML = `
      <button class="n-close" aria-label="${ui("close")}">✕</button>
      <div class="n-head"><span class="n-app-icon"><svg viewBox="0 0 24 24" fill="#fff"><path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.6 1.3 4.9 3.4 6.5L4.6 21.5l3.8-1.9c1.1.3 2.3.5 3.6.5 5.5 0 10-3.9 10-8.7S17.5 3 12 3z"/></svg></span>
        <span>${esc(t(n.app))}</span><span class="n-time">${ui("now")}</span></div>
      <div class="n-title">${esc(t(n.title))}</div>
      <div class="n-body">${esc(t(n.body))}</div>`;
  }
  const dismissNotif = () => { notif.classList.remove("show"); setTimeout(() => (notif.hidden = true), 500); };
  notif.addEventListener("click", (e) => {
    if (e.target.closest(".n-close")) { e.stopPropagation(); dismissNotif(); return; }
    if (D.notification.opens) openItem(D.notification.opens, notif);
    dismissNotif();
  });
  notif.addEventListener("keydown", (e) => { if (e.key === "Enter") notif.click(); });

  const sticky = $("#sticky");
  let typing = null;
  function renderSticky(animate) {
    const s = D.sticky;
    if (!s || !TH.showSticky) { sticky.remove(); return; }
    clearInterval(typing);
    // Texto principal + líneas adicionales (editables en el admin)
    const lines = [s.text, ...(Array.isArray(s.lines) ? s.lines : [])].map(t).filter(Boolean);
    sticky.innerHTML = `<h2>${esc(t(s.title))}</h2>` + lines.map(() => `<p><span class="txt"></span></p>`).join("");
    const outs = $$(".txt", sticky);
    const caret = document.createElement("span");
    caret.className = "caret";
    if (!animate || reducedMotion) {
      outs.forEach((el, i) => (el.textContent = lines[i]));
      if (outs.length) outs[outs.length - 1].after(caret);
      return;
    }
    let li = 0, ci = 0;
    if (outs.length) outs[0].after(caret);
    typing = setInterval(() => {
      if (li >= lines.length) { clearInterval(typing); return; }
      outs[li].textContent = lines[li].slice(0, ++ci);
      outs[li].after(caret);
      if (ci >= lines[li].length) { li++; ci = 0; }
    }, 45);
  }

  // La nota también se puede mover
  (() => {
    let d = null;
    sticky.addEventListener("pointerdown", (e) => {
      if (isMobile()) return;
      d = { sx: e.clientX, sy: e.clientY, l: sticky.offsetLeft, t: sticky.offsetTop };
      sticky.setPointerCapture(e.pointerId);
    });
    sticky.addEventListener("pointermove", (e) => {
      if (!d) return;
      sticky.style.left = d.l + e.clientX - d.sx + "px";
      sticky.style.top = d.t + e.clientY - d.sy + "px";
    });
    sticky.addEventListener("pointerup", () => (d = null));
  })();

  const dock = $("#dock");
  function renderDock() {
    dock.setAttribute("aria-label", ui("contact"));
    const links = ["whatsapp", "instagram", "linkedin", "behance", "email"].filter((k) => D.links[k]).map((k) => {
      const href = D.links[k], ext = /^https?:/.test(href);
      const custom = D.dockIcons && D.dockIcons[k];
      return `<a class="dk${custom ? " custom" : ""}" href="${esc(href)}" data-net="${k}" ${ext ? 'target="_blank" rel="noopener"' : ""} aria-label="${ui(k)}">
        ${custom ? `<img src="${esc(custom)}" alt="" draggable="false">` : DOCK_ICONS[k]()}<span class="tip">${ui(k)}</span></a>`;
    });
    const mins = $$(".dk-min", dock);
    dock.innerHTML = links.join("");
    mins.forEach((m) => dock.appendChild(m));
    renderMin();
    updateDock();
  }
  function updateDock() {
    $$("[data-win]", dock).forEach((b) => b.classList.toggle("open", wins.has(b.dataset.win)));
  }
  dock.addEventListener("click", (e) => {
    const m = e.target.closest("[data-restore]");
    if (m) { restoreWin(m.dataset.restore); return; }
    const b = e.target.closest("[data-open]");
    if (b) openItem(b.dataset.open, b);
  });

  // ---------- En el celular: abrir la app de la red social si está instalada ----------
  // Android: enlace "intent" con el paquete de la app y regreso al navegador si no está instalada.
  // iPhone: se abre el enlace normal en la misma pestaña, así iOS lo pasa a la app (Universal Links).
  const APP_PKG = { instagram: "com.instagram.android", linkedin: "com.linkedin.android", facebook: "com.facebook.katana", x: "com.twitter.android", tiktok: "com.zhiliaoapp.musically", behance: "com.behance.behance", whatsapp: "com.whatsapp", youtube: "com.google.android.youtube" };
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function appUrl(net, href) {
    let u;
    try { u = new URL(href); } catch { return href; }
    if (!/^https?:$/.test(u.protocol)) return href;
    // WhatsApp: esquema propio de la app (más confiable que wa.me en celulares)
    if (net === "whatsapp" && /(^|\.)wa\.me$|whatsapp\.com$/i.test(u.host)) {
      const phone = (u.searchParams.get("phone") || u.pathname.replace(/\D/g, "")).replace(/\D/g, "");
      const q = "send?phone=" + phone + (u.searchParams.get("text") ? "&text=" + encodeURIComponent(u.searchParams.get("text")) : "");
      if (isAndroid) return `intent://${q}#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=${encodeURIComponent(href)};end`;
      if (isIOS) return "whatsapp://" + q;
    }
    if (isAndroid && APP_PKG[net]) {
      let path = u.pathname + u.search;
      if (net === "instagram") { const user = u.pathname.split("/").filter(Boolean)[0]; if (user) path = `/_u/${user}/`; }
      return `intent://${u.host}${path}#Intent;scheme=https;package=${APP_PKG[net]};S.browser_fallback_url=${encodeURIComponent(href)};end`;
    }
    return href;
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-net]");
    if (!a) return;
    track("open", { id: "link:" + a.dataset.net });
    if (!(isAndroid || isIOS) || !/^https?:/i.test(a.href)) return; // computador: pestaña nueva normal
    e.preventDefault();
    const href = a.getAttribute("href"), target = appUrl(a.dataset.net, href);
    location.href = target;
    // iPhone sin la app instalada: si seguimos en la página, abre la versión web
    if (isIOS && target !== href) {
      const fallback = setTimeout(() => { if (!document.hidden) location.href = href; }, 1600);
      document.addEventListener("visibilitychange", () => clearTimeout(fallback), { once: true });
    }
  });
  // Liquid Glass: el brillo especular sigue al cursor
  document.addEventListener("pointermove", (e) => {
    const g = e.target.closest && e.target.closest(".mac-btn, .dock, .seg, .notification, .case-talk");
    if (!g) return;
    const r = g.getBoundingClientRect();
    g.style.setProperty("--mx", (e.clientX - r.left).toFixed(0) + "px");
    g.style.setProperty("--my", (e.clientY - r.top).toFixed(0) + "px");
  }, { passive: true });
  // Magnificación del dock al pasar el mouse (como en macOS)
  dock.addEventListener("mousemove", (e) => {
    if (isMobile() || reducedMotion) return;
    $$(".dk", dock).forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(e.clientX - (r.left + r.width / 2));
      const k = Math.max(0, 1 - d / 120);
      el.style.setProperty("--mag", (1 + 0.5 * k * k).toFixed(3));
    });
  });
  dock.addEventListener("mouseleave", () => $$(".dk", dock).forEach((el) => el.style.setProperty("--mag", 1)));

  // =========================================================================
  // Cambio de idioma
  // =========================================================================
  // Bloqueo de horizontal: el aviso lo maneja CSS; aquí solo el texto y, si el navegador lo permite
  // (app instalada / pantalla completa), se fija la orientación vertical.
  function setRotateText() { const el = $("#rotate-text"); if (el) el.textContent = ui("rotate"); }
  try { if (isMobile() && screen.orientation && screen.orientation.lock) screen.orientation.lock("portrait").catch(() => {}); } catch { /* no soportado */ }

  function setLang(l) {
    if (l === lang || !UI[l]) return;
    lang = l;
    store.set("lang", l);
    document.documentElement.lang = l;
    renderMenubar();
    relabelIcons();
    renderNotification();
    renderSticky(false);
    renderDock();
    setRotateText();
    const skip = $("#skip-intro");
    if (skip) skip.textContent = ui("skip");
    wins.forEach((w) => paint(w));
  }

  // =========================================================================
  // Intro y arranque
  // =========================================================================
  function boot() {
    // El fondo arranca desenfocado y se enfoca cuando la foto ya cargó
    const reveal = () => requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("booted")));
    const pre = new Image();
    let shown = false;
    const go = () => { if (!shown) { shown = true; reveal(); } };
    pre.onload = go; pre.onerror = go; pre.src = wallpaperUrl();
    setTimeout(go, 1500);
    renderIcons();
    const opened = openFromHash();
    setTimeout(() => renderSticky(true), 700);
    if (D.notification && TH.showNotification) {
      setTimeout(() => { notif.hidden = false; requestAnimationFrame(() => notif.classList.add("show")); }, 1100);
    }
  }

  function runIntro() {
    const intro = $("#intro");
    const stack = $("#intro-stack");
    const skipBtn = $("#skip-intro");
    skipBtn.textContent = ui("skip");
    intro.style.backgroundImage = `url("${wallpaperUrl()}")`;
    let finished = false;
    const timers = [];
    const finish = () => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      sess.set("introSeen", true);
      intro.classList.add("done");
      setTimeout(() => intro.remove(), 800);
      boot();
    };
    skipBtn.addEventListener("click", finish);

    const photos = D.intro || [];
    if (!TH.showIntro || !photos.length || sess.get("introSeen", false) || reducedMotion || location.hash.length > 2) { intro.remove(); boot(); return; }

    const offsets = [[-22, -64], [16, -18], [-10, 26], [8, 6], [-16, -30], [20, 30]];
    photos.forEach((p, i) => { const im = new Image(); im.src = p.src; });
    const start = 500, step = 650;
    photos.forEach((p, i) => {
      timers.push(setTimeout(() => {
        const [dx, dy] = offsets[i % offsets.length];
        const w = document.createElement("div");
        w.className = "intro-win";
        w.style.setProperty("--dx", dx + "px");
        w.style.setProperty("--dy", dy + "px");
        w.innerHTML = `<div class="bar"><i></i><i></i><i></i><span>${esc(p.name || "")}</span></div><img src="${esc(p.src)}" alt="">`;
        stack.appendChild(w);
      }, start + i * step));
    });
    timers.push(setTimeout(finish, start + photos.length * step + 900));
  }


  // =========================================================================
  // "Hablar con el crack" — botón de WhatsApp al final de cada proyecto
  // =========================================================================
  const TALK_DEF = {
    enabled: true,
    title: { es: "¿Te gustó lo que viste?", en: "Liked what you saw?" },
    text: { es: "Cuéntame tu idea y la aterrizamos juntos.", en: "Tell me your idea and let's shape it together." },
    cta: { es: "Hablar con el crack", en: "Talk to the designer" },
    message: { es: "Hola Thomas, vi el proyecto «{proyecto}» en tu portafolio y me gustaría hablar contigo.", en: "Hi Thomas, I saw the «{proyecto}» project in your portfolio and I'd like to talk with you." },
  };
  const hasText = (v) => (v && typeof v === "object" ? !!(v.es || v.en) : v !== "" && v != null);
  const TALK = Object.assign({}, TALK_DEF, Object.fromEntries(Object.entries(D.caseContact || {}).filter(([, v]) => hasText(v) || typeof v === "boolean")));
  const WA_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.9 3 3 6.6 3 11c0 2.3 1.1 4.4 2.9 5.9L5 21l4.3-2.2c.9.2 1.8.3 2.7.3 5.1 0 9-3.6 9-8.1S17.1 3 12 3Z"/></svg>`;
  function talkHtml(c, id) {
    if (!TALK.enabled || !D.links.whatsapp) return "";
    const base = D.links.whatsapp;
    const msg = t(TALK.message).replace(/\{proyecto\}/g, c.title || "");
    const href = base + (base.includes("?") ? "&" : "?") + "text=" + encodeURIComponent(msg);
    return `<aside class="case-talk">
      <span class="ct-mark" aria-hidden="true">${MONO_SVG}</span>
      <div class="ct-copy"><strong>${esc(t(TALK.title))}</strong><span>${esc(t(TALK.text))}</span></div>
      <a class="mac-btn primary ct-btn" href="${esc(href)}" target="_blank" rel="noopener" data-net="whatsapp" data-talk="${esc(id)}">${WA_SVG}${esc(t(TALK.cta))}</a>
    </aside>`;
  }
  document.addEventListener("click", (e) => { const a = e.target.closest("a[data-talk]"); if (a) track("open", { id: "talk:" + a.dataset.talk }); });

  // ---------- Inicio ----------
  document.documentElement.lang = lang;
  if (D.seo && t(D.seo.title)) document.title = t(D.seo.title);
  updateMode(true);
  applyDesign(TH);
  setInterval(() => updateMode(false), 60 * 1000);
  setWallpaper();
  renderMenubar();
  renderNotification();
  renderDock();
  setRotateText();
  track("view", {});
  window.addEventListener("hashchange", openFromHash);
  window.addEventListener("resize", tick);
  runIntro();
})();
