import fs from "node:fs";
import { load } from "cheerio";
const path="resource-packs.json",packs=JSON.parse(fs.readFileSync(path,"utf8"));
const headers={"User-Agent":"Mozilla/5.0 (compatible; ResourcePackGalleryIndexer/1.1)","Accept":"text/html,application/xhtml+xml"};
const PROMO=/advert|advertisement|sponsor|promot|banner|revenue|sale|newsletter|subscribe|affiliate|tracking|pixel|doubleclick|googlesyndication|adservice|adsystem|avatar|gravatar|profile|author-photo|user-photo|site-logo|brand-logo|social-icon|share-button|become-an-author|explore-modding/i;
function canonicalImage(raw,base){
 try{
  const u=new URL(raw,base);
  if(u.protocol!=="https:"||!u.hostname.includes(".")||/\.svg(?:$|\?)/i.test(u.pathname)||PROMO.test(u.hostname+u.pathname))return "";
  u.hash="";
  for(const key of [...u.searchParams.keys()])if(/^(utm_.+|fbclid|gclid)$/i.test(key))u.searchParams.delete(key);
  return u.href;
 }catch{return "";}
}
function extractImages(html,base){
 const $=load(html),found=[];
 $('meta[property="og:image"],meta[name="twitter:image"],meta[name="twitter:image:src"]').each((_,el)=>{
  const value=$(el).attr("content"),safe=canonicalImage(value,base);
  if(safe)found.push(safe);
 });
 $("img").each((_,el)=>{
  const img=$(el),src=img.attr("data-src")||img.attr("data-lazy-src")||img.attr("data-original")||img.attr("src")||(img.attr("srcset")||"").split(",")[0].trim().split(/\s+/)[0];
  const parent=img.closest("article,figure,li,[class*='gallery'],[class*='image'],[class*='media']").first();
  const clues=[img.attr("class"),img.attr("alt"),img.attr("title"),parent.attr("class"),parent.attr("id"),parent.text().slice(0,160)].join(" ");
  if(!src||PROMO.test(clues))return;
  const safe=canonicalImage(src,base);if(safe)found.push(safe);
 });
 return [...new Set(found)].slice(0,20);
}
async function fetchOne(pack){
 if(!/^https:\/\/(?:mcpedl\.com|www\.curseforge\.com|www\.planetminecraft\.com)\//i.test(pack.sourceUrl||""))return {pack,images:[]};
 try{
  const response=await fetch(pack.sourceUrl,{headers,signal:AbortSignal.timeout(15000)});
  if(response.status===429)throw new Error("HTTP 429 (rate limited)");
  if(!response.ok)throw new Error("HTTP "+response.status);
  const html=(await response.text()).slice(0,5000000);
  return {pack,images:extractImages(html,pack.sourceUrl)};
 }catch(error){console.log("No image:",pack.title,error.message);return {pack,images:[]};}
}
(async()=>{
 let updated=0,totalImages=0,failed=0;
 const targets=packs.filter(p=>/^https:\/\/(?:mcpedl\.com|www\.curseforge\.com|www\.planetminecraft\.com)\//i.test(p.sourceUrl||""));
 console.log("Eligible packs for image enrichment:",targets.length,"of",packs.length);
 for(let i=0;i<targets.length;i+=10){
  const batch=await Promise.all(targets.slice(i,i+10).map(fetchOne));
  for(const item of batch){
   if(!item.images.length){failed++;continue;}
   item.pack.thumbnailUrl=item.images[0];
   item.pack.galleryImages=item.images;
   item.pack.imagesFetchedAt=new Date().toISOString().slice(0,10);
   updated++;totalImages+=item.images.length;
  }
  console.log("Image enrichment",Math.min(i+10,targets.length),"/",targets.length,"updated",updated,"without images",failed);
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 fs.writeFileSync(path,JSON.stringify(packs,null,2)+"\n");
 console.log(JSON.stringify({scanned:targets.length,updated,totalImages,withoutImages:failed},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
