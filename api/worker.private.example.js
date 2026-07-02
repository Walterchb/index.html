/**
 * Cloudflare Worker PRIVATE - reference only.
 *
 * Serve it behind Cloudflare Access or another authentication layer. Keep the
 * course materials in KV/R2 private; do not use this as a public content endpoint.
 *
 * Example KV keys:
 *   courses/course-1/manifest.json
 *   courses/course-1/page-groups/m1.json
 *   courses/course-1/search-index.json
 *   courses/course-1/exercises/m1.json
 *   courses/course-1/glossary.json
 */

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, max-age=3600"
};

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });

export default {
  async fetch(request, env) {
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/?/, "").replace(/^\/+/, "");
    const parts = path.split("/").filter(Boolean);
    if (parts[0] !== "courses" || !parts[1]) return json({ error: "Not found" }, 404);

    const courseId = decodeURIComponent(parts[1]);
    const rest = parts.slice(2);
    let key = "";

    if (rest[0] === "manifest" && rest.length === 1) key = `courses/${courseId}/manifest.json`;
    else if (rest[0] === "page-groups" && rest[1] && rest.length === 2) key = `courses/${courseId}/page-groups/${decodeURIComponent(rest[1])}.json`;
    else if (rest[0] === "search-index" && rest.length === 1) key = `courses/${courseId}/search-index.json`;
    else if (rest[0] === "exercises" && rest[1] && rest.length === 2) key = `courses/${courseId}/exercises/${decodeURIComponent(rest[1])}.json`;
    else if (rest[0] === "glossary" && rest.length === 1) key = `courses/${courseId}/glossary.json`;
    else return json({ error: "Not found" }, 404);

    const body = await env.CONTENT.get(key);
    if (!body) return json({ error: "Not found" }, 404);
    return new Response(body, { headers });
  }
};
