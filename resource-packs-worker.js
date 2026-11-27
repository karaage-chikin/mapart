const ORIGIN = "https://karaage-chikin.github.io";
const SESSION_MS = 8 * 60 * 60 * 1000;
const encoder = new TextEncoder();

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff"
  };
}
function reply(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors(origin) }
  });
}
function b64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function unb64url(value) {
  const base = value.replace(/-/g,"+").replace(/_/g,"/");
  const binary = atob(base + "=".repeat((4 - base.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
async function makeToken(secret) {
  const payload = b64url(encoder.encode(JSON.stringify({ role: "admin", exp: Date.now() + SESSION_MS })));
  return payload + "." + b64url(await hmac(secret, payload));
}
async function isAdmin(request, secret) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer ([A-Za-z0-9_.-]+)$/);
  if (!match) return false;
  const parts = match[1].split(".");
  if (parts.length !== 2) return false;
  try {
    const expected = await hmac(secret, parts[0]);
    const actual = unb64url(parts[1]);
    if (expected.length !== actual.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
    if (diff !== 0) return false;
    const payload = JSON.parse(new TextDecoder().decode(unb64url(parts[0])));
    return payload.role === "admin" && Number(payload.exp) > Date.now();
  } catch { return false; }
}
function galleryFromJson(value) {
  try { const parsed=JSON.parse(value||"[]"); return Array.isArray(parsed)?parsed.filter(x=>typeof x==="string").slice(0,8):[]; } catch { return []; }
}
function normalize(row) {
  const allowed=Number(row.direct_download_allowed||0)===1;
  return {
    id:row.id,title:row.title,author:row.author||"",category:row.category||"その他",
    description:row.description||"",sourceUrl:row.source_url,compatibility:row.compatibility||"配布元で確認",
    source:row.source||"管理者登録",createdAt:row.created_at,thumbnailUrl:row.thumbnail_url||"",
    galleryImages:galleryFromJson(row.gallery_json),directDownloadAllowed:allowed,
    directDownloadUrl:allowed?(row.direct_download_url||""):""
  };
}
function validatePack(input) {
  if(!input||typeof input!=="object")return "入力内容が不正です。";
  const title=String(input.title||"").trim(),url=String(input.sourceUrl||"").trim(),description=String(input.description||"").trim();
  if(!title||title.length>160)return "パック名を1〜160文字で入力してください。";
  if(!description||description.length>1200)return "説明を1〜1200文字で入力してください。";
  const isHttps=value=>{try{const u=new URL(value);return u.protocol==="https:"&&!!u.hostname.includes(".");}catch{return false;}};
  if(!isHttps(url))return "配布元URLはhttps://から始まるURLにしてください。";
  if(String(input.author||"").length>120||String(input.category||"").length>60||String(input.compatibility||"").length>120)return "入力が長すぎます。";
  const thumb=String(input.thumbnailUrl||"").trim();
  if(thumb&&!isHttps(thumb))return "サムネイル画像URLはhttps://から始まるURLにしてください。";
  const gallery=Array.isArray(input.galleryImages)?input.galleryImages:[];
  if(gallery.length>8||gallery.some(x=>typeof x!=="string"||x.length>2000||!isHttps(x.trim())))return "ギャラリー画像はhttps://のURLを8件以内で入力してください。";
  const download=String(input.directDownloadUrl||"").trim();
  if(download&&!isHttps(download))return "直接ダウンロードURLはhttps://から始まるURLにしてください。";
  if(input.directDownloadAllowed===true&&!download)return "直接ダウンロードを許可する場合はファイルURLを入力してください。";
  return null;
}
async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 20000) throw new Error("送信データが大きすぎます。");
  return await request.json();
}
async function loginAllowed(env, request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(ip + ":resource-pack-admin"));
  const key = b64url(new Uint8Array(digest).slice(0,18));
  const now = Math.floor(Date.now()/1000);
  const row = await env.DB.prepare(
    "INSERT INTO resource_pack_login_attempts (ip_hash, attempts, window_started) VALUES (?, 1, ?) " +
    "ON CONFLICT(ip_hash) DO UPDATE SET " +
    "attempts = CASE WHEN window_started < ? THEN 1 ELSE attempts + 1 END, " +
    "window_started = CASE WHEN window_started < ? THEN ? ELSE window_started END " +
    "RETURNING attempts"
  ).bind(key,now,now-900,now-900,now).first();
  return Number(row?.attempts || 0) <= 5;
}
async function resetLoginAttempts(env, request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(ip + ":resource-pack-admin"));
  const key = b64url(new Uint8Array(digest).slice(0,18));
  await env.DB.prepare("DELETE FROM resource_pack_login_attempts WHERE ip_hash = ?").bind(key).run();
}
function extractPostImages(post) {
  const urls=[];
  const featured=post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
  if(featured)urls.push(featured);
  const html=String(post.content?.rendered||"");
  for(const match of html.matchAll(/(?:src|data-src)=["']([^"']+)["']/gi))urls.push(match[1].replace(/&amp;/g,"&"));
  return [...new Set(urls.map(raw=>{try{const u=new URL(raw);return u.protocol==="https:"&&(u.hostname==="mcpedl.com"||u.hostname.endsWith(".mcpedl.com"))?u.href:"";}catch{return "";}}).filter(Boolean))].slice(0,8);
}
async function fetchMcpedlPosts() {
  const headers={"User-Agent":"KaraageChikinResourcePackDirectory/1.1","Accept":"application/json"};
  const cr=await fetch("https://mcpedl.com/wp-json/wp/v2/categories?slug=texture-packs",{headers});
  if(!cr.ok)throw new Error("MCPEDLカテゴリを取得できませんでした（HTTP "+cr.status+"）。");
  const cats=await cr.json();
  if(!Array.isArray(cats)||!cats[0]?.id)throw new Error("MCPEDLのTexture Packsカテゴリが見つかりません。");
  const pr=await fetch("https://mcpedl.com/wp-json/wp/v2/posts?categories="+cats[0].id+"&per_page=100&orderby=date&order=desc&_embed=author,wp:featuredmedia",{headers});
  if(!pr.ok)throw new Error("MCPEDL投稿一覧を取得できませんでした（HTTP "+pr.status+"）。");
  const posts=await pr.json();if(!Array.isArray(posts))throw new Error("MCPEDLの応答形式が不正です.");
  return posts;
}
async function enrichMcpedlImages(env) {
  const posts=await fetchMcpedlPosts();let updated=0;
  for(const p of posts){
    const images=extractPostImages(p);
    if(!images.length)continue;
    const result=await env.DB.prepare("UPDATE resource_packs SET thumbnail_url=?,gallery_json=?,updated_at=? WHERE source_url=?")
      .bind(images[0],JSON.stringify(images),Date.now(),String(p.link||"")).run();
    updated+=Number(result?.meta?.changes||0);
  }
  return {scanned:posts.length,updated};
}

async function discoverMcpedl(env) {
  const posts=await fetchMcpedlPosts();let added=0,skipped=0;
  for(const p of posts){
    const link=String(p.link||"");let valid=false;try{valid=new URL(link).hostname==="mcpedl.com";}catch{}
    const clean=s=>String(s||"").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&#8217;|&#8216;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
    const title=clean(p.title?.rendered),description=clean(p.excerpt?.rendered).slice(0,1000),author=String(p._embedded?.author?.[0]?.name||"").slice(0,120),images=extractPostImages(p);
    if(!valid||!title||!description){skipped++;continue;}
    const published=await env.DB.prepare("SELECT id FROM resource_packs WHERE source_url=? LIMIT 1").bind(link).first();
    if(published){skipped++;continue;}
    const r=await env.DB.prepare("INSERT OR IGNORE INTO resource_pack_candidates (id,title,author,description,source_url,provider,discovered_at,status,thumbnail_url,gallery_json) VALUES (?,?,?,?,?,?,?,'pending',?,?)")
      .bind(crypto.randomUUID(),title,author,description,link,"MCPEDL",Date.now(),images[0]||"",JSON.stringify(images)).run();
    if(Number(r?.meta?.changes||0)===1)added++;else skipped++;
  }
  return {added,skipped,scanned:posts.length,provider:"MCPEDL"};
}
function normalizeCandidate(r){return {id:r.id,title:r.title,author:r.author,description:r.description,sourceUrl:r.source_url,provider:r.provider,discoveredAt:r.discovered_at,thumbnailUrl:r.thumbnail_url||"",galleryImages:galleryFromJson(r.gallery_json)};}
export default {
  async scheduled(controller, env, ctx) { ctx.waitUntil(discoverMcpedl(env).catch(e=>console.error("Scheduled discovery failed",e))); },
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      if (origin !== ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (origin !== ORIGIN) return new Response("Forbidden", { status: 403, headers: { "X-Content-Type-Options": "nosniff" } });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") {
      try {
        await env.DB.prepare("SELECT 1 AS ok").first();
        return reply({ ok: true }, 200, origin);
      } catch { return reply({ ok: false }, 503, origin); }
    }
    if (request.method === "GET" && url.pathname === "/api/packs") {
      try {
        const result = await env.DB.prepare(
          "SELECT id,title,author,category,description,source_url,compatibility,source,created_at FROM resource_packs ORDER BY created_at DESC, title COLLATE NOCASE"
        ).all();
        return reply({ packs: (result.results || []).map(normalize) }, 200, origin);
      } catch (error) {
        console.error("Pack listing failed", error);
        return reply({ error: "一覧を読み込めませんでした。" }, 503, origin);
      }
    }
    if (request.method === "POST" && url.pathname === "/api/admin/login") {
      if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return reply({ error: "管理者認証がまだ設定されていません。管理者用シークレットを設定してください。" }, 503, origin);
      try {
        if (!(await loginAllowed(env, request))) return reply({ error: "ログイン試行回数の上限です。15分ほど待ってください。" }, 429, origin);
        const body = await readJson(request);
        const supplied = String(body.password || "");
        const a = await crypto.subtle.digest("SHA-256", encoder.encode(supplied));
        const b = await crypto.subtle.digest("SHA-256", encoder.encode(env.ADMIN_PASSWORD));
        const aa = new Uint8Array(a), bb = new Uint8Array(b);
        let diff = aa.length ^ bb.length;
        for (let i=0;i<Math.min(aa.length,bb.length);i++) diff |= aa[i] ^ bb[i];
        if (diff !== 0) return reply({ error: "パスワードが違います。" }, 401, origin);
        await resetLoginAttempts(env, request);
        return reply({ token: await makeToken(env.SESSION_SECRET), expiresIn: SESSION_MS }, 200, origin);
      } catch (error) {
        return reply({ error: error.message || "ログインできませんでした。" }, 400, origin);
      }
    }
    if (url.pathname.startsWith("/api/admin/")) {
      if (!env.SESSION_SECRET || !(await isAdmin(request, env.SESSION_SECRET))) return reply({ error: "管理者としてログインしてください。" }, 401, origin);
      if (request.method === "GET" && url.pathname === "/api/admin/session") return reply({ ok: true }, 200, origin);
      if (request.method === "GET" && url.pathname === "/api/admin/candidates") {
        const r=await env.DB.prepare("SELECT id,title,author,description,source_url,provider,discovered_at FROM resource_pack_candidates WHERE status='pending' ORDER BY discovered_at DESC LIMIT 100").all();
        return reply({candidates:(r.results||[]).map(normalizeCandidate)},200,origin);
      }
      if (request.method === "POST" && url.pathname === "/api/admin/discover") {
        try{return reply(await discoverMcpedl(env),200,origin);}catch(e){console.error(e);return reply({error:e.message||"候補を取得できませんでした。"},502,origin);}
      }
      const cm=url.pathname.match(/^\/api\/admin\/candidates\/([A-Za-z0-9_-]{1,80})(?:\/approve)?$/);
      if(cm && request.method==="POST" && url.pathname.endsWith("/approve")){
        try{
          const c=await env.DB.prepare("SELECT * FROM resource_pack_candidates WHERE id=? AND status='pending'").bind(cm[1]).first();
          if(!c)return reply({error:"候補が見つかりません。"},404,origin);
          const body=await readJson(request), category=String(body.category||"その他").slice(0,60), id=crypto.randomUUID(), now=Date.now();
          await env.DB.prepare("INSERT INTO resource_packs (id,title,author,category,description,source_url,compatibility,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,c.title,c.author,category,c.description,c.source_url,"配布元で確認","MCPEDL自動発見（管理者承認）",now,now).run();
          await env.DB.prepare("DELETE FROM resource_pack_candidates WHERE id=?").bind(c.id).run();
          const row=await env.DB.prepare("SELECT * FROM resource_packs WHERE id=?").bind(id).first();
          return reply({pack:normalize(row)},201,origin);
        }catch(e){console.error(e);return reply({error:"候補を公開できませんでした。"},500,origin);}
      }
      if(cm && request.method==="DELETE" && !url.pathname.endsWith("/approve")){await env.DB.prepare("DELETE FROM resource_pack_candidates WHERE id=?").bind(cm[1]).run();return reply({ok:true},200,origin);}
      if (request.method === "POST" && url.pathname === "/api/admin/packs") {
        try {
          const body = await readJson(request), invalid = validatePack(body);
          if (invalid) return reply({ error: invalid }, 400, origin);
          const id = crypto.randomUUID();
          const now = Date.now();
          await env.DB.prepare(
            "INSERT INTO resource_packs (id,title,author,category,description,source_url,compatibility,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
          ).bind(id,String(body.title).trim(),String(body.author||"").trim(),String(body.category||"その他"),String(body.description).trim(),String(body.sourceUrl).trim(),String(body.compatibility||"配布元で確認"),"管理者登録",now,now).run();
          const row = await env.DB.prepare("SELECT * FROM resource_packs WHERE id=?").bind(id).first();
          return reply({ pack: normalize(row) }, 201, origin);
        } catch (error) { console.error(error); return reply({ error: "登録できませんでした。" }, 500, origin); }
      }
      const match = url.pathname.match(/^\/api\/admin\/packs\/([A-Za-z0-9_-]{1,80})$/);
      if (match && request.method === "PUT") {
        try {
          const body = await readJson(request), invalid = validatePack(body);
          if (invalid) return reply({ error: invalid }, 400, origin);
          const now = Date.now();
          const result = await env.DB.prepare(
            "UPDATE resource_packs SET title=?,author=?,category=?,description=?,source_url=?,compatibility=?,updated_at=? WHERE id=?"
          ).bind(String(body.title).trim(),String(body.author||"").trim(),String(body.category||"その他"),String(body.description).trim(),String(body.sourceUrl).trim(),String(body.compatibility||"配布元で確認"),now,match[1]).run();
          if (Number(result?.meta?.changes||0) !== 1) return reply({ error: "対象のパックが見つかりません。" }, 404, origin);
          const row = await env.DB.prepare("SELECT * FROM resource_packs WHERE id=?").bind(match[1]).first();
          return reply({ pack: normalize(row) }, 200, origin);
        } catch (error) { console.error(error); return reply({ error: "更新できませんでした。" }, 500, origin); }
      }
      if (match && request.method === "DELETE") {
        const result = await env.DB.prepare("DELETE FROM resource_packs WHERE id=?").bind(match[1]).run();
        if (Number(result?.meta?.changes||0) !== 1) return reply({ error: "対象のパックが見つかりません。" }, 404, origin);
        return reply({ ok: true }, 200, origin);
      }
    }
    return reply({ error: "Not found" }, 404, origin);
  }
};