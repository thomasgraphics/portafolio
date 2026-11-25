/* Devuelve las estadísticas al admin. Protegido con el mismo usuario y contraseña del admin
   (el navegador los envía solo porque se pide desde /admin/stats). */
import { pipeline, redisConfig, lastDates } from "./_lib/redis.js";

const enc = new TextEncoder();
function safeEqual(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
function authorized(request) {
  const user = (process.env.ADMIN_USER || "").trim(), pass = (process.env.ADMIN_PASSWORD || "").trim();
  const h = request.headers.get("authorization") || "";
  if (!user || !pass || !h.startsWith("Basic ")) return false;
  try {
    const bin = atob(h.slice(6).trim());
    const dec = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const i = dec.indexOf(":");
    return i > -1 && safeEqual(dec.slice(0, i).trim(), user) && safeEqual(dec.slice(i + 1), pass);
  } catch { return false; }
}
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

const toObj = (arr) => { const o = {}; for (let i = 0; i < (arr || []).length; i += 2) o[arr[i]] = +arr[i + 1] || 0; return o; };
const addInto = (acc, o) => { for (const [k, v] of Object.entries(o)) acc[k] = (acc[k] || 0) + v; return acc; };
const sorted = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([key, n]) => ({ key, n }));

export default {
  async fetch(request) {
    if (request.method !== "GET") return json({ error: "Método no permitido" }, 405);
    if (!authorized(request)) return json({ error: "No autorizado" }, 401);
    if (!redisConfig()) return json({ configured: false });

    const days = Math.min(365, Math.max(1, parseInt(new URL(request.url).searchParams.get("days") || "30", 10) || 30));
    const dates = lastDates(days);
    const P = ["v", "c", "ci", "h", "s", "d", "l", "o"];
    const cmds = [];
    for (const d of dates) { for (const p of P) cmds.push(["HGETALL", `${p}:${d}`]); cmds.push(["SCARD", `u:${d}`]); }

    let res;
    try { res = await pipeline(cmds); } catch (e) { return json({ error: "No se pudo leer la base de datos." }, 502); }

    const agg = { c: {}, ci: {}, s: {}, d: {}, l: {}, o: {} };
    const daily = [];
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0)); // [díaSemana lun=0][hora]
    const hours = Array(24).fill(0);
    let i = 0;
    for (const d of dates) {
      const row = {};
      for (const p of P) row[p] = toObj(res[i++]?.result);
      const uniques = +res[i++]?.result || 0;
      daily.push({ date: d, visits: row.v.total || 0, uniques });
      for (const k of ["c", "ci", "s", "d", "l", "o"]) addInto(agg[k], row[k]);
      const wd = (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7;
      for (const [h, n] of Object.entries(row.h)) { if (+h >= 0 && +h < 24) { heat[wd][+h] += n; hours[+h] += n; } }
    }
    const visits = daily.reduce((a, x) => a + x.visits, 0);
    return json({
      configured: true, days, timezone: "America/Bogota",
      totals: { visits, uniques: daily.reduce((a, x) => a + x.uniques, 0) },
      daily, heat, hours,
      countries: sorted(agg.c), cities: sorted(agg.ci).slice(0, 30), sources: sorted(agg.s),
      devices: sorted(agg.d), languages: sorted(agg.l), opens: sorted(agg.o).slice(0, 30),
    });
  },
};
