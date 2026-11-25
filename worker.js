const ALLOWED_ORIGIN = "https://karaage-chikin.github.io";
const MAX_DATA_CHARS = 1_500_000;
const TTL_SECONDS = 30 * 24 * 60 * 60;

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(origin) }
  });
}
function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
function validBase64Png(value) {
  if (typeof value !== "string" || value.length < 32 || value.length > MAX_DATA_CHARS) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return false;
  try {
    const binary = atob(value.slice(0, 32));
    return binary.charCodeAt(0) === 137 && binary.slice(1, 4) === "PNG";
  } catch { return false; }
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (origin !== ALLOWED_ORIGIN) return json({ error: "許可されていないアクセス元です。" }, 403, origin);
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/blueprints") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "JSON形式が正しくありません。" }, 400, origin); }
      if (!body || !validBase64Png(body.data)) return json({ error: "PNGデータが不正か、サイズ上限を超えています。" }, 400, origin);
      const now = Math.floor(Date.now() / 1000);
      const id = randomId();
      try {
        await env.DB.prepare("INSERT INTO blueprints (id, data, created_at, expires_at) VALUES (?, ?, ?, ?)")
          .bind(id, body.data, now, now + TTL_SECONDS).run();
        return json({ id, expiresAt: now + TTL_SECONDS }, 201, origin);
      } catch (error) {
        return json({ error: "データベースへの保存に失敗しました。" }, 500, origin);
      }
    }
    const match = url.pathname.match(/^\/api\/blueprints\/([a-f0-9]{24})$/);
    if (request.method === "GET" && match) {
      try {
        const row = await env.DB.prepare("SELECT data, expires_at FROM blueprints WHERE id = ? AND expires_at > ?")
          .bind(match[1], Math.floor(Date.now() / 1000)).first();
        if (!row) return json({ error: "設計図が見つからないか、有効期限が切れています。" }, 404, origin);
        return json({ data: row.data, expiresAt: row.expires_at }, 200, origin);
      } catch (error) {
        return json({ error: "データベースから読み込めませんでした。" }, 500, origin);
      }
    }
    return json({ error: "Not found" }, 404, origin);
  }
};
