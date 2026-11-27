import fs from "node:fs";
const path = "resource-packs.json";
const packs = JSON.parse(fs.readFileSync(path, "utf8"));
const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
const known = new Map(packs.map(p => [String(p.sourceUrl || "").replace(/\/+$/, "").toLowerCase(), p]));
const headers = { "User-Agent": "Mozilla/5.0 (compatible; KaraageChikinBedrockPackDirectory/2.1)", "Accept": "text/html,application/xhtml+xml" };
const clean = s => String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&#8216;/g, "'").replace(/&quot;/g, '"').replace(/&#160;|&nbsp;/g, " ").replace(/&#8211;/g, "–").replace(/\s+/g, " ").trim();
const restricted = /\b(gun|guns|weapon|weapons|knife|knives|sword|swords|rifle|pistol|shotgun|grenade|ammo|ammunition|blade|crossbow|mace|spear)\b/i;
const unsafeAtStart = packs.length;
for (let i = packs.length - 1; i >= 0; i--) {
  if (restricted.test(String(packs[i].title || "") + " " + String(packs[i].sourceUrl || "") + " " + String(packs[i].description || ""))) packs.splice(i, 1);
}
console.log("Excluded restricted-topic entries:", unsafeAtStart - packs.length);
function category(title) {
  const t = title.toLowerCase();
  if (/shader|visual|pbr/.test(t)) return "シェーダー";
  if (/ui|gui|hud|menu|crosshair|inventory/.test(t)) return "UI・テーマ";
  if (/sound|music|audio/.test(t)) return "サウンド";
  if (/font|language/.test(t)) return "言語・フォント";
  if (/animation|animated/.test(t)) return "アニメーション";
  if (/tree|plant|leaves|flower|nature|grass/.test(t)) return "自然・植物";
  if (/block|ore|glass|item|texture/.test(t)) return "ブロック・建築";
  if (/fps|performance|optimization|lag/.test(t)) return "軽量化";
  return "その他";
}
async function getPage(page) {
  const url = page === 1
    ? "https://mcpedl.com/category/texture-packs/"
    : "https://mcpedl.com/category/texture-packs/page/" + page + "/";
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error("MCPEDL listing page " + page + " HTTP " + response.status);
  return await response.text();
}
function cardDate(html, index) {
  const before = html.slice(Math.max(0, index - 1800), index);
  const after = html.slice(index, Math.min(html.length, index + 1800));
  const datesBefore = [...before.matchAll(/\b(\d{1,2}\s+[A-Za-z]{3},\s+\d{4})\b/g)];
  const raw = datesBefore.length ? datesBefore[datesBefore.length - 1][1] : after.match(/\b(\d{1,2}\s+[A-Za-z]{3},\s+\d{4})\b/)?.[1];
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
(async () => {
  let added = 0, updated = 0, removed = 0, scanned = 0, reachedOld = false, stalePages = 0;
  for (let page = 1; page <= 1000 && added < 3000 && !reachedOld; page++) {
    const html = await getPage(page);
    let pageItems = 0, pageChanges = 0;
    for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      let url;
      try { url = new URL(m[1].replace(/&amp;/g, "&"), "https://mcpedl.com"); } catch { continue; }
      const parts = url.pathname.split("/").filter(Boolean);
      if (url.hostname !== "mcpedl.com" || parts.length !== 1 || /^(category|tag|author|page|wp-json|login|register|search)$/i.test(parts[0])) continue;
      const key = url.origin + url.pathname.replace(/\/+$/, "");
      const title = clean(m[2]);
      if (!title || title.length < 4 || title.length > 160 || /^\d+(?:\.\d+)?$/.test(title) || /^image$/i.test(title)) continue;
      if (restricted.test(title + " " + key)) continue;
      const modified = cardDate(html, m.index);
      if (modified && modified < cutoff) { reachedOld = true; break; }
      const existing = known.get(key.toLowerCase());
      if (existing) {
        let changed = false;
        if (existing.title !== title) { existing.title = title; existing.category = category(title); changed = true; }
        if (modified) {
          const dateText = modified.toISOString().slice(0, 10);
          if (existing.sourceUpdatedAt !== dateText) { existing.sourceUpdatedAt = dateText; changed = true; }
        }
        if (existing.sourceType === "automatic") {
          existing.description = "Minecraft Bedrock向けリソースパック。詳細・対応バージョンは配布元ページで確認してください。";
          existing.compatibility = "Bedrock向け（配布元でバージョン確認）";
        }
        if (changed) { updated++; pageChanges++; }
        continue;
      }
      if (!modified) continue;
      const slug = parts[0];
      const id = "mcpedl-" + slug.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 56);
      const record = {
        id, title, author: "", category: category(title),
        description: "Minecraft Bedrock向けリソースパック。詳細・対応バージョンは配布元ページで確認してください。",
        sourceUrl: key + "/", compatibility: "Bedrock向け（配布元でバージョン確認）",
        source: "MCPEDL", sourceType: "automatic",
        createdAt: modified.toISOString().slice(0, 10),
        sourceUpdatedAt: modified.toISOString().slice(0, 10),
        thumbnailUrl: "", galleryImages: []
      };
      packs.push(record);
      known.set(key.toLowerCase(), record);
      added++; pageItems++; pageChanges++; scanned++;
      if (added >= 3000) break;
    }
    console.log("MCPEDL page", page, "new", pageItems, "changed", pageChanges, "total new", added);
    stalePages = pageChanges === 0 ? stalePages + 1 : 0;
    if (stalePages >= 12) break;
  }
  const before = packs.length;
  const retained = packs.filter(p => {
    const title = String(p.title || "");
    const sourceUrl = String(p.sourceUrl || "");
    if (restricted.test(title + " " + sourceUrl + " " + String(p.description || ""))) return false;
    if (p.sourceType === "automatic" && (!title || /^\d+(?:\.\d+)?$/.test(title) || /^image$/i.test(title))) return false;
    if (!p.sourceUpdatedAt) return true;
    const d = new Date(p.sourceUpdatedAt + "T00:00:00Z");
    return Number.isNaN(d.getTime()) || d >= cutoff;
  });
  removed = before - retained.length;
  fs.writeFileSync(path, JSON.stringify(retained, null, 2) + "\n");
  console.log(JSON.stringify({ total: retained.length, added, updated, removed, scanned, directDownloadable: retained.filter(p => p.directDownloadAllowed && p.directDownloadUrl).length, cutoff: cutoff.toISOString().slice(0, 10) }, null, 2));
  if (added < 900) console.log("Only " + added + " new unique recent entries were found in the scanned pages.");
})().catch(error => { console.error(error); process.exit(1); });
