import fs from "node:fs";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import { category, isRestricted, normalizeSourceUrl, subtractCalendarYear, titleKey } from "./resource-pack-utils.mjs";
const file="resource-packs.json",packs=JSON.parse(fs.readFileSync(file,"utf8"));
const cutoff=subtractCalendarYear();
const urls=new Set(packs.map(p=>normalizeSourceUrl(p.sourceUrl)).filter(Boolean));
const titles=new Set(packs.map(p=>titleKey(p.title)));
const ids=new Set(packs.map(p=>p.id));
const headers={"User-Agent":"Mozilla/5.0 (compatible; KaraageChikinBedrockPackDirectory/3.1)","Accept":"text/html,application/xhtml+xml"};
const maxNew=Math.max(1,Math.min(20000,Number(process.env.MAX_NEW_PACKS)||3000));
const maxPages=Math.max(1,Math.min(1000,Number(process.env.MAX_ADDITIONAL_PAGES)||80));
const clean=s=>String(s||"").replace(/\s+/g," ").trim();
function cardDate($,card){
 const dates=[];
 card.find("time[datetime], [data-date], [data-published], meta[itemprop='datePublished']").each((_,el)=>{
  const x=$(el),raw=x.attr("datetime")||x.attr("data-date")||x.attr("data-published")||x.attr("content");
  if(raw){const d=new Date(raw);if(!Number.isNaN(d.getTime())&&d<=new Date(Date.now()+86400000))dates.push(d);}
 });
 if(dates.length)return dates.sort((a,b)=>b-a)[0];
 const text=String(card.text?.()??"");
 const patterns=[/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i,/\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+\d{4}\b/i,/\b\d{4}-\d{2}-\d{2}\b/];
 for(const re of patterns){const raw=text.match(re)?.[0];if(raw){const d=new Date(raw);if(!Number.isNaN(d.getTime())&&d<=new Date(Date.now()+86400000))return d;}}
 return null;
}
function imageFrom($,card,base){
 for(const el of card.find("img").toArray()){
  const img=$(el),raw=img.attr("data-src")||img.attr("data-lazy-src")||img.attr("src")||(img.attr("srcset")||"").split(",")[0].trim().split(/\s+/)[0];
  const clues=(img.attr("class")||"")+" "+(img.attr("alt")||"")+" "+(img.parent().attr("class")||"");
  if(!raw||/advert|sponsor|banner|avatar|profile|logo|share/i.test(clues))continue;
  try{const u=new URL(raw,base);if(u.protocol==="https:"&&!/\.svg(?:$|\?)/i.test(u.pathname))return u.href;}catch{}
 }
 return "";
}
function descriptionFrom($,card,title){
 for(const el of card.find("p,[class*='description'],[class*='summary']").toArray()){
  const text=clean($(el).text());if(text.length>35&&text.toLowerCase()!==title.toLowerCase())return text.slice(0,800);
 }
 return clean(card.text()).replace(title,"").slice(0,800)||"Bedrock Edition向けのリソースパックです。取得できた説明・対応情報を掲載しています。";
}
function authorFrom($,card){
 const text=clean(card.text());
 const patterns=[/(?:\bBy|Uploaded by|Created by)\s+([^\n|·]{2,80}?)(?=\s+(?:Updated|Last updated|Downloads|Views|on\b)|$)/i,/(?:作者|作成者|投稿者)\s*[:：]?\s*([^\n|·]{2,80})/i];
 for(const re of patterns){const m=text.match(re);if(m)return m[1].trim().slice(0,120);}
 return "";
}
function add(provider,href,title,$,card,base){
 title=clean(title).slice(0,160);if(!title||title.length<4)return false;
 let u;try{u=new URL(href,base);}catch{return false;}if(u.protocol!=="https:")return false;
 const canonical=normalizeSourceUrl(u.href);if(!canonical||urls.has(canonical))return false;
 const description=descriptionFrom($,card,title);
 if(isRestricted(title,canonical,description))return false;
 const tk=titleKey(title);if(!tk||titles.has(tk))return false;
 const updated=cardDate($,card);if(!updated||updated<cutoff)return false;
 const date=updated.toISOString().slice(0,10),image=imageFrom($,card,base),slug=new URL(canonical).pathname.split("/").filter(Boolean).at(-1)||"pack";
 const hash=createHash("sha256").update(canonical).digest("hex").slice(0,12);
 const id=provider.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+slug.replace(/[^a-z0-9_-]/gi,"-").slice(0,38)+"-"+hash;
 if(ids.has(id))return false;
 packs.push({id,title,author:authorFrom($,card),category:category(title),description,sourceUrl:canonical+"/",compatibility:"Bedrock向け（配布元でバージョン確認）",source:provider,sourceType:"automatic",createdAt:date,sourceUpdatedAt:date,thumbnailUrl:image,galleryImages:image?[image]:[]});
 urls.add(canonical);titles.add(tk);ids.add(id);return true;
}
async function page(url){
 let lastError;
 for(let attempt=0;attempt<4;attempt++){
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(25000)});
  if(response.ok)return await response.text();
  lastError=new Error("HTTP "+response.status);
  if(response.status!==429&&response.status<500)break;
  const retry=Number(response.headers.get("Retry-After"))||Math.min(8,2**attempt);
  await new Promise(resolve=>setTimeout(resolve,retry*1000));
 }
 throw lastError||new Error("Request failed");
}

async function scanModBay(){
 let added=0,stale=0;
 for(let pageNo=1;pageNo<=maxPages&&added<maxNew;pageNo++){
  const url=pageNo===1?"https://modbay.org/textures/":"https://modbay.org/textures/page/"+pageNo+"/";
  const html=await page(url),$=load(html),links=$('a[href*="/textures/"]').toArray();
  let valid=0,addedThisPage=0;
  for(const el of links){
   const a=$(el);let u;try{u=new URL(a.attr("href"),"https://modbay.org");}catch{continue;}
   const parts=u.pathname.split("/").filter(Boolean);
   if(u.hostname!=="modbay.org"||parts.length<2||parts[0]!=="textures"||parts[1]==="page"||/^(tag|author|category)$/i.test(parts[1]))continue;
   valid++;
   const card=a.closest("article,li,.post,.entry,.card,[class*='post-item'],[class*='texture']").first();
   const container=card.length?card:a.parent().parent().parent();
   const title=clean(a.text()||a.attr("title")||a.find("img").attr("alt"));
   if(title.length<4)continue;
   if(add("ModBay",u.href,title,$,container,"https://modbay.org")){added++;addedThisPage++;}
   if(added>=maxNew)break;
  }
  console.log("ModBay page",pageNo,"valid links",valid,"added",addedThisPage);
  if(valid===0){console.warn("ModBay parser found no entries; stopping.");break;}
  stale=addedThisPage===0?stale+1:0;if(stale>=8)break;
  await new Promise(resolve=>setTimeout(resolve,450));
 }
 return added;
}
async function scanPlanetMinecraft(){
 let added=0,stale=0;
 for(let pageNo=1;pageNo<=maxPages&&added<maxNew;pageNo++){
  const url="https://www.planetminecraft.com/texture-packs/?platform=2&p="+(pageNo-1);
  const html=await page(url),$=load(html),links=$('a[href*="/texture-pack/"]').toArray();
  let valid=0,addedThisPage=0;
  for(const el of links){
   const a=$(el);let u;try{u=new URL(a.attr("href"),"https://www.planetminecraft.com");}catch{continue;}
   const parts=u.pathname.split("/").filter(Boolean);
   if(u.hostname!=="www.planetminecraft.com"||parts.length<2||parts[0]!=="texture-pack")continue;
   valid++;
   const card=a.closest("article,li,.resource,.r,.project,.tile,[class*='resource'],[class*='project']").first();
   const container=card.length?card:a.parent().parent().parent();
   const title=clean(a.text()||a.attr("title")||a.find("img").attr("alt"));
   if(title.length<4)continue;
   if(add("Planet Minecraft",u.href,title,$,container,"https://www.planetminecraft.com")){added++;addedThisPage++;}
   if(added>=maxNew)break;
  }
  console.log("Planet Minecraft page",pageNo,"valid links",valid,"added",addedThisPage);
  if(valid===0){console.warn("Planet Minecraft parser found no entries; stopping.");break;}
  stale=addedThisPage===0?stale+1:0;if(stale>=8)break;
  await new Promise(resolve=>setTimeout(resolve,450));
 }
 return added;
}

async function scanCurseForge(){
 let added=0,stale=0;
 for(let pageNo=1;pageNo<=maxPages&&added<maxNew;pageNo++){
  const html=await page("https://www.curseforge.com/minecraft-bedrock/search?class=texture-packs&page="+pageNo+"&pageSize=50&sortBy=latest+update&version=26.0");
  const $=load(html),links=$('a[href*="/minecraft-bedrock/texture-packs/"]').toArray();
  let valid=0,addedThisPage=0;
  for(const el of links){
   const a=$(el);let url;try{url=new URL(a.attr("href"),"https://www.curseforge.com");}catch{continue;}
   if(url.hostname!=="www.curseforge.com"||url.pathname.split("/").filter(Boolean).length<3)continue;
   valid++;
   const card=a.closest("article,li,[data-testid*='project'],[class*='project-card'],[class*='projectCard'],[class*='result']").first();
   const container=card.length?card:a.parent().parent();
   const title=clean(a.text()||a.attr("title")||a.find("img").attr("alt"));
   if(!title)continue;
   if(add("CurseForge",url.href,title,$,container,"https://www.curseforge.com")){added++;addedThisPage++;}
   if(added>=maxNew)break;
  }
  console.log("CurseForge page",pageNo,"valid links",valid,"added",addedThisPage);
  if(valid===0){console.warn("No valid listing links found; stopping rather than assuming an empty page.");break;}
  stale=addedThisPage===0?stale+1:0;
  if(stale>=8){console.log("Stopping after 8 valid but unchanged pages.");break;}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 return added;
}
(async()=>{
 const addedCurseForge=await scanCurseForge();
 const addedModBay=await scanModBay();
 const addedPlanetMinecraft=await scanPlanetMinecraft();
 const added=addedCurseForge+addedModBay+addedPlanetMinecraft;
 fs.writeFileSync(file,JSON.stringify(packs,null,2)+"\n");
 console.log(JSON.stringify({addedFromAdditionalSource:added,addedCurseForge,addedModBay,addedPlanetMinecraft,total:packs.length,cutoff:cutoff.toISOString().slice(0,10),maxPages,maxNew},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
