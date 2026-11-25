/* Puente seguro entre el admin y GitHub.
   El token de GitHub vive SOLO aquí (variable GITHUB_TOKEN en Vercel), nunca en el navegador.
   Solo responde a una sesión válida del admin y solo puede tocar archivos permitidos. */
import { json, getSession, sameOrigin } from "./_lib/session.js";

const REPO = process.env.GITHUB_REPO || "thomasgraphics/portafolio";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const READABLE = new Set(["content/data.json", "index.html"]);
const WRITABLE = /^(content\/data\.json|index\.html|assets\/uploads\/[A-Za-z0-9._-]{1,120})$/;

async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    method: opts.method || "GET",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: opts.accept || "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "thomgraphics-admin",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!r.ok) {
    const hints = { 401: "El GITHUB_TOKEN de Vercel no es válido o expiró.", 403: "El GITHUB_TOKEN no tiene permiso de escritura (Contents: Read and write).", 404: "No se encontró el repositorio o la rama." };
    throw Object.assign(new Error(hints[r.status] || `GitHub respondió ${r.status}`), { status: 502 });
  }
  return opts.raw ? r.text() : r.json();
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);
    if (!sameOrigin(request)) return json({ error: "Origen no permitido" }, 403);
    const session = await getSession(request);
    if (!session) return json({ error: "Tu sesión expiró. Vuelve a entrar con Google." }, 401);
    if (!process.env.GITHUB_TOKEN) return json({ error: "Falta la variable GITHUB_TOKEN en Vercel." }, 503);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Solicitud inválida" }, 400); }

    try {
      switch (body.op) {
        case "get": {
          if (!READABLE.has(body.path)) return json({ error: "Archivo no permitido" }, 400);
          const text = await gh(`/contents/${body.path}?ref=${encodeURIComponent(BRANCH)}`, { accept: "application/vnd.github.raw+json", raw: true });
          return json({ text });
        }
        case "blob": {
          if (!["utf-8", "base64"].includes(body.encoding) || typeof body.content !== "string") return json({ error: "Archivo inválido" }, 400);
          const b = await gh("/git/blobs", { method: "POST", body: { content: body.content, encoding: body.encoding } });
          return json({ sha: b.sha });
        }
        case "commit": {
          const files = Array.isArray(body.files) ? body.files : [];
          if (!files.length || files.length > 60) return json({ error: "Nada que publicar" }, 400);
          for (const f of files) {
            if (!WRITABLE.test(f.path || "") || !/^[0-9a-f]{40}$/.test(f.sha || "")) return json({ error: `Ruta no permitida: ${f.path}` }, 400);
          }
          const ref = await gh(`/git/ref/heads/${encodeURIComponent(BRANCH)}`);
          const base = await gh(`/git/commits/${ref.object.sha}`);
          const tree = await gh("/git/trees", { method: "POST", body: { base_tree: base.tree.sha, tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", sha: f.sha })) } });
          const message = `${String(body.message || "Actualiza contenido desde el admin").slice(0, 120)}\n\nPublicado por ${session.email}`;
          const commit = await gh("/git/commits", { method: "POST", body: { message, tree: tree.sha, parents: [ref.object.sha] } });
          await gh(`/git/refs/heads/${encodeURIComponent(BRANCH)}`, { method: "PATCH", body: { sha: commit.sha } });
          return json({ ok: true, commit: commit.sha });
        }
        default:
          return json({ error: "Operación desconocida" }, 400);
      }
    } catch (err) {
      return json({ error: err.message || "Error con GitHub" }, err.status || 500);
    }
  },
};
