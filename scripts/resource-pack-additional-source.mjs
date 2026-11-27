import fs from "node:fs";
const file = "resource-packs.json";
const packs = JSON.parse(fs.readFileSync(file, "utf8"));
const cutoff = new Date(Date.now() - 365 * 86400000);
const urls = new Set(packs.map(p => String(p.sourceUrl || "").replace(/\/+$/, "").toLowerCase()));
const titles = new Set(packs.map(p => titleKey(p.title)));
const blocked = /\b(gun|guns|weapon|weapons|knife|knives|sword|swords|rifle|pistol|shotgun|grenade|ammo|ammunition|blade|crossbow|mace|spear)\b/i;
const headers = { "User-Agent": "Mozilla/5.0 (compatible; KaraageChikinBedrockPackDirectory/3.0)", "Accept": "text/html,application/xhtml+xml" };
function clean(s) { return String(s || "").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ").replace(/&amp;|&#038;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&#x27;|&#8217;|&#8216;/gi,"'").replace(/&nbsp;|&#160;/gi," ").replace(/&#8211;/g,"–").replace(/\s+/g," ").trim(); }
function titleKey(s) { return clean(s).toLowerCase().replace(/[^a-z0-9ぁ-んァ-ヶ一-龯]/gi,""); }
function category(t) { t=t.toLowerCase(); if(/shader|visual|pbr/.test(t))return "シェーダー"; if(/ui|gui|hud|menu|inventory/.test(t))return "UI・テーマ"; if(/sound|music|audio/.test(t))return "サウンド"; if(/font|language/.test(t))return "言語・フォント"; if(/animation/.test(t))return "アニメーション"; if(/tree|plant|leaves|flower|nature|grass/.test(t))return "自然・植物"; if(/block|ore|glass|item|texture/.test(t))return "ブロック・建築"; if(/fps|performance|optimization|lag/.test(t))return "軽量化"; return "その他"; }
function attr(tag,n) { const m=tag.match(new RegExp("\\b"+n+"\\s*=\\s*(['\"])(.*?)\\1","i")); return m?m[2].replace(/&amp;/g,"&"):""; }
function dateFrom(raw) { if(!raw)return null; const d=new Date(raw); return Number.isNaN(d.getTime())?null:d; }
function cardDate(html) {
  const ds=[];
  for(const m of html.matchAll(/\b(?:datetime|data-date|data-published)=["']([^"']+)["']/gi)){const d=dateFrom(m[1]);if(d)ds.push(d);}
  for(const m of html.matchAll(/\b(?:[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}|\d{1,2}\s+[A-Za-z]{3},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/g)){const d=dateFrom(m[0]);if(d)ds.push(d);}
  return ds.filter(d=>d<=new Date(Date.now()+86400000)).sort((a,b)=>b-a)[0]||null;
}
function imageFrom(html,base) {
  for(const m of html.matchAll(/<img\b[^>]*>/gi)){const t=m[0],raw=attr(t,"data-src")||attr(t,"data-lazy-src")||attr(t,"src")||attr(t,"srcset").split(",")[0].trim().split(/\s+/)[0];if(!raw)continue;try{const u=new URL(raw,base);if(u.protocol==="https:"&&!/\.svg(?:$|\?)/i.test(u.pathname)&&!/avatar|gravatar|logo|overwolf/i.test(u.hostname+u.pathname))return u.href;}catch{}}
  return "";
}
function descriptionFrom(html,title) { for(const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)){const s=clean(m[1]);if(s.length>35&&s.toLowerCase()!==title.toLowerCase())return s.slice(0,600);}return "Minecraft Bedrock Edition向けのリソースパックです。詳しい機能と対応バージョンは配布元ページで確認してください。"; }
function authorFrom(html) { const s=clean(html),m=s.match(/\bBy\s+([A-Za-z0-9_. -]{2,60}?)(?=\s+(?:Updated|Last updated|Downloads|Views|$))/i);return m?m[1].trim().slice(0,100):""; }
function add(provider,href,title,fragment,base) {
  title=clean(title).slice(0,160); if(!title||title.length<4)return false;
  const description=descriptionFrom(fragment,title);if(blocked.test(title+" "+href+" "+description))return false;
  const tk=titleKey(title);if(!tk||titles.has(tk))return false;
  let u;try{u=new URL(href,base);}catch{return false;}if(u.protocol!=="https:")return false;u.hash="";u.search="";
  const canonical=u.origin+u.pathname.replace(/\/+$/,"");if(urls.has(canonical.toLowerCase()))return false;
  const updated=cardDate(fragment);if(!updated||updated<cutoff)return false;
  const date=updated.toISOString().slice(0,10),image=imageFrom(fragment,base),slug=canonical.split("/").filter(Boolean).at(-1)||"pack";
  packs.push({id:provider.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+slug.replace(/[^a-z0-9_-]/gi,"-").slice(0,56),title,author:authorFrom(fragment),category:category(title),description,sourceUrl:canonical+"/",compatibility:"Bedrock向け（配布元でバージョン確認）",source:provider,sourceType:"automatic",createdAt:date,sourceUpdatedAt:date,thumbnailUrl:image,galleryImages:image?[image]:[]});
  urls.add(canonical.toLowerCase());titles.add(tk);return true;
}
async function page(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error("HTTP "+r.status);return await r.text();}
async function scanCurseForge(){
  let added=0,empty=0;
  for(let n=1;n<=80&&added<3000;n++){
    const html=await page("https://www.curseforge.com/minecraft-bedrock/search?class=texture-packs&page="+n+"&pageSize=50&sortBy=latest+update&version=26.0");let matches=0,now=0;
    const re=/<a\b[^>]*href=["']([^"']*\/minecraft-bedrock\/texture-packs\/[^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for(const m of html.matchAll(re)){let u;try{u=new URL(m[1],"https://www.curseforge.com");}catch{continue;}if(u.hostname!=="www.curseforge.com"||u.pathname.split("/").filter(Boolean).length<3)continue;
      const frag=html.slice(Math.max(0,m.index-1800),Math.min(html.length,m.index+2600)),title=clean(m[2])||attr(m[2],"alt")||attr(m[2],"title");if(!title)continue;matches++;if(add("CurseForge",u.href,title,frag,"https://www.curseforge.com")){added++;now++;}if(added>=3000)break;}
    console.log("CurseForge",n,"matches",matches,"added",now);empty=now?0:empty+1;if(!matches||empty>=8)break;await new Promise(r=>setTimeout(r,180));
  }return added;
}
(async()=>{let added=0;try{added=await scanCurseForge();}catch(e){console.log("Additional source scan stopped:",e.message);}fs.writeFileSync(file,JSON.stringify(packs,null,2)+"\n");console.log(JSON.stringify({addedFromAdditionalSource:added,total:packs.length,cutoff:cutoff.toISOString().slice(0,10)},null,2));})().catch(e=>{console.error(e);process.exit(1);});
