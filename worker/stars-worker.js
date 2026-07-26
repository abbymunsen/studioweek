/**
 * Star-sync Worker: the write path from browser to annotation store.
 *
 * Deployed behind the same Cloudflare Access policy as the site, so the
 * browser authenticates with its Access session cookie — no long-lived
 * credential ever lives client-side. The scheduled fetch reads KV with a
 * Cloudflare API token held in Actions secrets and mirrors the value back
 * into annotations/stars.json, preserving versioned history in git.
 *
 * Deploy (once):
 *   wrangler kv namespace create STARS
 *   wrangler deploy worker/stars-worker.js --name studioweek-stars \
 *     --kv STARS=<namespace-id> --compatibility-date 2026-01-01
 *   ...then put the worker route behind your Cloudflare Access application.
 */

const KEY = "starred";

export default {
  async fetch(request, env) {
    const headers = {
      "content-type": "application/json",
      "cache-control": "no-store",
    };
    if (request.method === "GET") {
      const value = (await env.STARS.get(KEY)) ?? "[]";
      return new Response(value, { headers });
    }
    if (request.method === "PUT") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response('{"error":"invalid JSON"}', { status: 400, headers });
      }
      if (!Array.isArray(body) || !body.every((k) => typeof k === "string" && k.length < 200)) {
        return new Response('{"error":"expected an array of recurring keys"}', { status: 400, headers });
      }
      await env.STARS.put(KEY, JSON.stringify([...new Set(body)].sort()));
      return new Response('{"ok":true}', { headers });
    }
    return new Response('{"error":"method not allowed"}', { status: 405, headers });
  },
};
