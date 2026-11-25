const ALLOWED_ORIGIN = "https://karaage-chikin.github.io";
const MAX_DATA_CHARS = 1_500_000;
const MAX_BODY_BYTES = 1_600_000;
const TTL_SECONDS = 30 * 24 * 60 * 60;
const SAVE_WINDOW_SECONDS = 10 * 60;
const SAVE_LIMIT = 10;
const READ_WINDOW_SECONDS = 60;
const READ_LIMIT = 120;

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
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
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
async function readLimitedJson(request) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  if (!request.body) throw new Error("INVALID_JSON");
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error("INVALID_JSON"); }
}
function validBase64Png(value) {
  if (typeof value !== "string" || value.length < 80 || value.length > MAX_DATA_CHARS || value.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    const head = Uint8Array.from(atob(value.slice(0, 40)), c => c.charCodeAt(0));
    if (head.length < 33) return false;
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((v, i) => head[i] === v)) return false;
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    const chunkLength = view.getUint32(8, false);
    const isIHDR = head[12] === 73 && head[13] === 72 && head[14] === 68 && head[15] === 82;
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return chunkLength === 13 && isIHDR && width > 0 && height > 0 &&
      width <= 8192 && height <= 8192 && width * height <= 16_777_216 &&
      head[24] === 8 && head[25] === 6;
  } catch { return false; }
}
async function rateLimit(env, request, route, limit, windowSeconds) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + ":" + route));
  const keyHash = Array.from(new Uint8Array(digest).slice(0, 16), b => b.toString(16).padStart(2, "0")).join("");
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const row = await env.DB.prepare(
    "INSERT INTO api_rate_limits (key_hash, window_start, count) VALUES (?, ?, 1) " +
    "ON CONFLICT(key_hash, window_start) DO UPDATE SET count = count + 1 RETURNING count"
  ).bind(keyHash, windowStart).first();
  return { allowed: Number(row?.count || 0) <= limit, retryAfter: windowSeconds - (now - windowStart) };
}
async function cleanup(env) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("DELETE FROM blueprints WHERE expires_at <= ?").bind(now).run();
  await env.DB.prepare("DELETE FROM api_rate_limits WHERE window_start < ?").bind(now - 86400).run();
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (origin !== ALLOWED_ORIGIN) return new Response(JSON.stringify({ error: "許可されていないアクセス元です。" }), {
      status: 403, headers: { "Content-Type": "application/json; charset=utf-8" }
    });
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/blueprints") {
      let body;
      try { body = await readLimitedJson(request); }
      catch (error) {
        if (error.message === "BODY_TOO_LARGE") return json({ error: "送信データが大きすぎます（上限約1.6MB）。" }, 413, origin);
        return json({ error: "JSON形式が正しくありません。" }, 400, origin);
      }
      if (!body || !validBase64Png(body.data)) return json({ error: "PNGデータが不正か、画像サイズの上限を超えています。" }, 400, origin);
      try {
        const rate = await rateLimit(env, request, "save", SAVE_LIMIT, SAVE_WINDOW_SECONDS);
        if (!rate.allowed) return new Response(JSON.stringify({ error: "保存回数が上限に達しました。しばらく待ってから再試行してください。" }), {
          status: 429, headers: { "Content-Type": "application/json; charset=utf-8", "Retry-After": String(rate.retryAfter), ...corsHeaders(origin) }
        });
        const now = Math.floor(Date.now() / 1000);
        const id = randomId();
        await env.DB.prepare("INSERT INTO blueprints (id, data, created_at, expires_at) VALUES (?, ?, ?, ?)")
          .bind(id, body.data, now, now + TTL_SECONDS).run();
        return json({ id, expiresAt: now + TTL_SECONDS }, 201, origin);
      } catch (error) {
        console.error("Blueprint save failed", error);
        return json({ error: "クラウド保存に失敗しました。時間をおいて再試行してください。" }, 500, origin);
      }
    }
    const match = url.pathname.match(/^\/api\/blueprints\/([a-f0-9]{32})$/);
    if (request.method === "GET" && match) {
      try {
        const rate = await rateLimit(env, request, "read", READ_LIMIT, READ_WINDOW_SECONDS);
        if (!rate.allowed) return new Response(JSON.stringify({ error: "アクセスが集中しています。少し待ってから再試行してください。" }), {
          status: 429, headers: { "Content-Type": "application/json; charset=utf-8", "Retry-After": String(rate.retryAfter), ...corsHeaders(origin) }
        });
        const row = await env.DB.prepare("SELECT data, expires_at FROM blueprints WHERE id = ? AND expires_at > ?")
          .bind(match[1], Math.floor(Date.now() / 1000)).first();
        if (!row) return json({ error: "設計図が見つからないか、有効期限が切れています。" }, 404, origin);
        return json({ data: row.data, expiresAt: row.expires_at }, 200, origin);
      } catch (error) {
        console.error("Blueprint read failed", error);
        return json({ error: "クラウドから読み込めませんでした。時間をおいて再試行してください。" }, 500, origin);
      }
    }
    return json({ error: "Not found" }, 404, origin);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(cleanup(env));
  }
};
