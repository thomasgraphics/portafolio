/* Enlace para compartir un proyecto: thomgraphics.com/p/<id>
   - A WhatsApp, LinkedIn, Facebook, X, Slack, Telegram… les entrega una página con la portada,
     el título y el resumen del proyecto (vista previa bonita).
   - A las personas las lleva directo al proyecto abierto en el escritorio (/#/case/<id>). */

const BOTS = /facebookexternalhit|facebot|whatsapp|linkedinbot|twitterbot|slackbot|telegrambot|discordbot|skypeuripreview|pinterest|embedly|googlebot|bingbot|applebot|redditbot|vkshare|iframely|outbrain|quora|tumblr|xing|mastodon|bluesky|signal/i;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tx = (v, lang = "es") => (v && typeof v === "object" ? v[lang] || v.es || v.en || "" : v || "");
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const id = (url.searchParams.get("id") || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
    const origin = url.origin;
    const target = id ? `${origin}/#/case/${id}` : `${origin}/`;
    const ua = request.headers.get("user-agent") || "";

    // Personas: directo al proyecto
    if (!BOTS.test(ua)) return Response.redirect(target, 302);

    let D = null;
    try { D = await (await fetch(`${origin}/content/data.json`, { headers: { accept: "application/json" } })).json(); } catch { /* sin datos */ }
    const c = D && D.cases && D.cases[id];
    if (!c || c.hidden) return Response.redirect(`${origin}/`, 302);

    const abs = (p) => (!p ? "" : /^https?:/i.test(p) ? p : `${origin}/${String(p).replace(/^\//, "")}`);
    const firstP = ((c.sections || []).find((s) => tx(s.p)) || {}).p;
    const title = `${c.title} · ${tx(c.subtitle)}`;
    const desc = clip(tx(firstP) || tx(c.subtitle), 190);
    const image = abs(c.shareImage || c.cover || (D.seo && D.seo.shareImage));
    const pageUrl = `${origin}/p/${id}`;
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(title)} — Thomgraphics</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Thomgraphics">
<meta property="og:locale" content="es_CO">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(c.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
</head><body><a href="${esc(target)}">${esc(c.title)}</a></body></html>`;
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300", "X-Robots-Tag": "noindex" },
    });
  },
};
