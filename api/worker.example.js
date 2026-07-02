/**
 * Cloudflare Worker de referencia para servir contenido bajo demanda.
 *
 * Requiere un KV namespace llamado CONTENT. Carga en KV estos keys:
 *   sections/<id>.json
 *   exercises/<module-id>.json
 *   glossary.json
 *   search-index.json
 *
 * El cliente usa `window.CONTENT_CONFIG = { MODE: "remote-api", API_BASE_URL: "https://.../api" }`.
 */

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=86400",
  "Access-Control-Allow-Origin": "*"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: jsonHeaders });
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/?/, "").replace(/^\/+/, "");
    let key = "";

    if (path.startsWith("sections/")) {
      const id = decodeURIComponent(path.slice("sections/".length));
      key = `sections/${id}.json`;
    } else if (path === "exercises") {
      const moduleId = url.searchParams.get("module");
      if (!moduleId) return json({ error: "Missing module" }, 400);
      key = `exercises/${moduleId}.json`;
    } else if (path === "glossary") {
      key = "glossary.json";
    } else if (path === "search-index") {
      key = "search-index.json";
    } else {
      return json({ error: "Not found" }, 404);
    }

    const body = await env.CONTENT.get(key);
    if (!body) return json({ error: "Not found" }, 404);
    return new Response(body, { headers: jsonHeaders });
  }
};
