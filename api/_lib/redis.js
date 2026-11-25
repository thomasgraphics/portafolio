/* Conexión a Upstash Redis (base de datos gratuita conectada desde Vercel → Storage).
   Vercel crea solas las variables KV_REST_API_URL / KV_REST_API_TOKEN
   (o UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). */
export function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

export async function pipeline(commands) {
  const cfg = redisConfig();
  if (!cfg) throw new Error("not-configured");
  const r = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`Redis ${r.status}`);
  return r.json(); // [{ result }, ...]
}

// Fecha y hora en Colombia (los reportes se ven en tu zona horaria)
const TZ = "America/Bogota";
export function bogotaParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour % 24 };
}
export function lastDates(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(bogotaParts(new Date(Date.now() - i * 86400000)).date);
  return [...new Set(out)];
}
