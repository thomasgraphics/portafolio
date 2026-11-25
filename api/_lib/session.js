/* Sesión del admin: cookie firmada (HMAC-SHA256) que solo puede crear el servidor.
   Variables en Vercel:
     SESSION_SECRET  texto aleatorio de 32+ caracteres
     ADMIN_EMAILS    correos de Google autorizados, separados por coma
   (Los archivos que empiezan con _ dentro de /api no se publican como funciones.) */

const enc = new TextEncoder();
export const COOKIE = "__Host-tg_admin";
export const SESSION_HOURS = 8;

const b64url = (buf) => Buffer.from(buf).toString("base64url");

async function hmacKey() {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length < 32) throw new Error("SESSION_SECRET debe tener al menos 32 caracteres.");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export function allowedEmails() {
  return (process.env.ADMIN_EMAILS || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
}
export const isAllowed = (email) => !!email && allowedEmails().includes(String(email).toLowerCase());
export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && (process.env.SESSION_SECRET || "").length >= 32 && allowedEmails().length);

export async function signSession(payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), Buffer.from(sig, "base64url"), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!p.exp || p.exp < Date.now() / 1000) return null;
    if (!isAllowed(p.email)) return null; // si quitas un correo de ADMIN_EMAILS, pierde acceso al instante
    return p;
  } catch {
    return null;
  }
}

export function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export const getSession = (request) => verifySession(readCookie(request, COOKIE));

export function sessionCookie(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// Protección CSRF: las peticiones que cambian algo deben venir de tu mismo dominio
export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const o = new URL(origin).host;
    return o === request.headers.get("host") || o === new URL(request.url).host;
  } catch {
    return false;
  }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", ...headers },
  });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
