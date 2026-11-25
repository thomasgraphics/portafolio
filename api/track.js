/* Registra visitas de forma anónima: sin cookies y sin guardar IPs.
   Guarda conteos por día: país, ciudad, hora, fuente (red social), dispositivo, idioma
   y qué carpetas/casos se abren. Los datos se borran solos después de 400 días. */
import { pipeline, redisConfig, bogotaParts } from "./_lib/redis.js";

const TTL = 400 * 86400;
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp\/|telegrambot|headless|lighthouse|pingdom|monitor|curl|wget|python|axios|vercel/i;

const SOURCES = [
  ["instagram", /(^|\.)instagram\.com$|^l\.instagram\.com$/, /Instagram/],
  ["linkedin", /(^|\.)linkedin\.com$|^lnkd\.in$/, /LinkedInApp/],
  ["facebook", /(^|\.)facebook\.com$|^fb\.me$|(^|\.)messenger\.com$/, /FBAN|FBAV|FB_IAB/],
  ["whatsapp", /(^|\.)whatsapp\.com$|^wa\.me$/, null],
  ["x", /^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, /Twitter/],
  ["tiktok", /(^|\.)tiktok\.com$/, /musical_ly|BytedanceWebview|TikTok/],
  ["behance", /(^|\.)behance\.net$/, null],
  ["dribbble", /(^|\.)dribbble\.com$/, null],
  ["youtube", /(^|\.)youtube\.com$|^youtu\.be$/, null],
  ["pinterest", /(^|\.)pinterest\./, /Pinterest/],
  ["telegram", /^t\.me$|(^|\.)telegram\.org$/, /Telegram/],
  ["google", /(^|\.)google\.[a-z.]+$/, null],
  ["bing", /(^|\.)bing\.com$/, null],
  ["chatgpt", /(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, null],
];

function classify(ref, ua, utm, ownHost) {
  const u = String(utm || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
  if (u) {
    const hit = SOURCES.find(([name]) => u === name || u.startsWith(name) || (name === "x" && u === "twitter") || (name === "whatsapp" && u === "wa"));
    return hit ? hit[0] : u;
  }
  let host = "";
  try { host = new URL(ref).hostname.replace(/^www\./, "").toLowerCase(); } catch { /* sin referencia */ }
  if (host && host !== ownHost && !host.endsWith(".vercel.app")) {
    const hit = SOURCES.find(([, re]) => re.test(host));
    return hit ? hit[0] : "otro:" + host.slice(0, 40);
  }
  const app = SOURCES.find(([, , uaRe]) => uaRe && uaRe.test(ua));
  return app ? app[0] : "directo";
}

const device = (ua) => (/iPad|Tablet|Nexus 7|Nexus 10|SM-T/i.test(ua) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "móvil" : "computador");

async function visitorHash(ip, ua, date) {
  const salt = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").slice(-16);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${ua}|${date}|${salt}`));
  return Buffer.from(buf).toString("hex").slice(0, 20);
}

export default {
  async fetch(request) {
    const done = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    if (request.method !== "POST" || !redisConfig()) return done;
    const ua = request.headers.get("user-agent") || "";
    if (!ua || BOT.test(ua)) return done;

    const ownHost = (request.headers.get("host") || "").replace(/^www\./, "");
    const origin = request.headers.get("origin");
    if (origin) { try { if (new URL(origin).host.replace(/^www\./, "") !== ownHost) return done; } catch { return done; } }

    let b = {};
    try { const txt = await request.text(); if (txt.length > 2000) return done; b = JSON.parse(txt); } catch { return done; }

    const { date, hour } = bogotaParts();
    const k = (p) => `${p}:${date}`;
    const cmds = [];
    const inc = (prefix, field) => { cmds.push(["HINCRBY", k(prefix), String(field).slice(0, 60), 1]); };

    if (b.ev === "open") {
      const id = String(b.id || "");
      if (!/^[a-z]+:[a-z0-9_-]{1,60}$/i.test(id)) return done;
      inc("o", id);
      cmds.push(["EXPIRE", k("o"), TTL]);
    } else if (b.ev === "view") {
      const country = (request.headers.get("x-vercel-ip-country") || "XX").toUpperCase().slice(0, 2);
      let city = "";
      try { city = decodeURIComponent(request.headers.get("x-vercel-ip-city") || ""); } catch { /* */ }
      let utm = "";
      try { utm = new URLSearchParams(String(b.q || "")).get("utm_source") || ""; } catch { /* */ }
      const src = classify(String(b.ref || ""), ua, utm, ownHost);
      const lang = String(b.lang || "").toLowerCase().slice(0, 2).replace(/[^a-z]/g, "") || "??";
      const ip = (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "").split(",")[0].trim();
      inc("v", "total");
      inc("c", country);
      if (city) inc("ci", `${country}|${city}`);
      inc("h", hour);
      inc("s", src);
      inc("d", device(ua));
      inc("l", lang);
      cmds.push(["SADD", k("u"), await visitorHash(ip, ua, date)]);
      for (const p of ["v", "c", "ci", "h", "s", "d", "l", "u"]) cmds.push(["EXPIRE", k(p), TTL]);
    } else return done;

    try { await pipeline(cmds); } catch { /* nunca romper el sitio por las métricas */ }
    return done;
  },
};
