import fs from "node:fs";
const path = "resource-packs.json";
const packs = JSON.parse(fs.readFileSync(path, "utf8"));
const headers = {
  "User-Agent": "Mozilla/5.0 (compatible; ResourcePackGalleryIndexer/1.0)",
  "Accept": "text/html,application/xhtml+xml"
};
const decode = s => String(s || "").replace(/&amp;/g, "&").replace(/&#038;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/gi, "'");
const attr = (tag, name) => {
  const m = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(['\"])(.*?)\\1", "i"));
  return m ? decode(m[2]) : "";
};
function extractImages(html) {
  const found = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (attr(tag, "property") || attr(tag, "name")).toLowerCase();
    if (["og:image", "twitter:image", "twitter:image:src"].includes(key)) {
      const value = attr(tag, "content");
      if (value) found.push(value);
    }
  }
  for (const m of html.matchAll(/<img\\b[^>]*>/gi)) {
    const tag = m[0];
    const context = html.slice(Math.max(0, m.index - 650), Math.min(html.length, m.index + 650));
    const clues = (tag + " " + context).toLowerCase();
    if (/advert|advertisement|\\bad[sx]?\\b|sponsor|promot|banner|revenue|sale|become an author|explore modding|newsletter|subscribe|affiliate|tracking|pixel/.test(clues)) continue;
    if (/avatar|gravatar|profile|author-photo|user-photo|site-logo|brand-logo|social-icon|share-button/.test(clues)) continue;
    const value = attr(tag, "data-src") || attr(tag, "data-lazy-src") || attr(tag, "src");
    if (value) found.push(value);
    const srcset = attr(tag, "srcset");
    if (srcset) found.push(srcset.split(",")[0].trim().split(/\\s+/)[0]);
  }
  return [...new Set(found.map(raw => {
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:" || !u.hostname.includes(".") || /\\.(svg)(?:$|\\?)/i.test(u.pathname)) return "";
      if (/gravatar|overwolf|avatar|logo|doubleclick|googlesyndication|adservice|adsystem/i.test(u.hostname + u.pathname)) return "";
      return u.href;
    } catch { return ""; }
  }).filter(Boolean))].slice(0, 20);
}
async function fetchOne(pack) {
  if (!/^https:\/\/(?:mcpedl\.com|www\.curseforge\.com|www\.planetminecraft\.com)\//i.test(pack.sourceUrl || "")) return { pack, images: [] };
  
  try {
    const response = await fetch(pack.sourceUrl, { headers, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const html = await response.text();
    return { pack, images: extractImages(html.slice(0, 5000000)) };
  } catch (error) {
    console.log("No image:", pack.title, error.message);
    return { pack, images: [] };
  }
}
(async () => {
  let updated = 0, totalImages = 0, failed = 0;
  const targets = packs.filter(p => /^https:\/\/(?:mcpedl\.com|www\.curseforge\.com|www\.planetminecraft\.com)\//i.test(p.sourceUrl || ""));
console.log("Eligible packs for image enrichment:", targets.length, "of", packs.length);
  for (let i = 0; i < targets.length; i += 15) {
    const batch = await Promise.all(targets.slice(i, i + 15).map(fetchOne));
    for (const item of batch) {
      if (!item.images.length) { failed++; continue; }
      const isPromotionalUrl = value => /advert|banner|sponsor|promo|revenue|sale|newsletter|subscribe|affiliate|doubleclick|googlesyndication|adservice|adsystem|avatar|gravatar|profile|logo|social-icon|share-button/i.test(String(value || ""));
      const combined = [...new Set(item.images.filter(value => !isPromotionalUrl(value)))].slice(0, 20);
      if (!combined.length) { failed++; continue; }
      item.pack.thumbnailUrl = combined[0];
      item.pack.galleryImages = combined;
      item.pack.imagesFetchedAt = new Date().toISOString().slice(0, 10);
      updated++;
      totalImages += combined.length;
    }
  }
  fs.writeFileSync(path, JSON.stringify(packs, null, 2) + "\n");
  console.log(JSON.stringify({ scanned: targets.length, updated, totalImages, withoutImages: failed }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
