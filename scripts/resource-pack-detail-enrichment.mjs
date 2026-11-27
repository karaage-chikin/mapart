import fs from "node:fs";
import { load } from "cheerio";
import { isRestricted } from "./resource-pack-utils.mjs";
const file="resource-packs.json",packs=JSON.parse(fs.readFileSync(file,"utf8"));
const headers={"User-Agent":"Mozilla/5.0 (compatible; BedrockPackDirectory/3.1)","Accept":"text/html,application/xhtml+xml"};
const MAX_HTML=5_000_000,MAX_DESCRIPTION=12_000;
const cleanText=value=>String(value||"").replace(/\s+/g," ").trim();
function meta($,key){
 const el=$('meta[name="'+key+'"],meta[property="'+key+'"]').first();
 return cleanText(el.attr("content"));
}
function jsonLd($){
 let best={};
 $('script[type="application/ld+json"]').each((_,el)=>{
  try{
   const parsed=JSON.parse($(el).contents().text()||$(el).html()||"");
   const roots=Array.isArray(parsed)?parsed:[parsed];
   for(const root of roots){
    const nodes=root?.["@graph"]||[root];
    for(const node of nodes){
     if(node&&typeof node==="object"&&(node.description||node.author||node.datePublished||node.dateModified))best={...best,...node};
    }
   }
  }catch{}
 });
 return best;
}
function articleText($){
 const selectors=["article","main",".entry-content",".post-content",".article-content",".project-description",".description",".content-body",".markdown-body"];
 let best="";
 for(const selector of selectors){
  $(selector).each((_,el)=>{
   const node=$(el).clone();
   node.find("script,style,svg,nav,footer,header,aside,form,button,[class*='advert'],[id*='advert'],[class*='promo'],[class*='banner'],[class*='social']").remove();
   const text=cleanText(node.text());
   if(text.length>best.length&&text.length<=MAX_DESCRIPTION*2)best=text;
  });
 }
 if(best.length<120)best=meta($,"og:description")||meta($,"description")||best;
 return best.slice(0,MAX_DESCRIPTION);
}
function authorFrom($,ld){
 const value=typeof ld.author==="string"?ld.author:Array.isArray(ld.author)?ld.author.map(x=>x?.name).filter(Boolean).join(", "):ld.author?.name;
 if(value)return cleanText(value).slice(0,120);
 const text=cleanText($("body").text());
 const m=text.match(/(?:\bBy|作者|作成者|投稿者|Uploaded by|Created by)\s*[:：]?\s*([^\n|·]{2,80}?)(?=\s+(?:Updated|Last updated|Downloads|Views|on\b)|$)/i);
 return m?m[1].trim().slice(0,120):"";
}
function validDate(value){if(!value)return "";const d=new Date(value);return Number.isNaN(d.getTime())?"":d.toISOString().slice(0,10);}
async function one(pack){
 if(!/^https:\/\//i.test(pack.sourceUrl||""))return false;
 if((pack.fullDescription||pack.detailsFiltered)&&pack.detailsFetchedAt>=(pack.sourceUpdatedAt||""))return false;
 try{
  const response=await fetch(pack.sourceUrl,{headers,signal:AbortSignal.timeout(15000)});
  if(response.status===429)throw new Error("HTTP 429 (rate limited)");
  if(!response.ok)throw new Error("HTTP "+response.status);
  const html=(await response.text()).slice(0,MAX_HTML),$=load(html),ld=jsonLd($);
  const desc=articleText($)||cleanText(ld.description)||meta($,"og:description")||meta($,"description");
  if(desc.length>30){
   if(isRestricted(pack.title,pack.sourceUrl,desc)){pack.fullDescription="";pack.detailsFiltered=true;}
   else{pack.fullDescription=desc;pack.detailsFiltered=false;}
  }
  const author=authorFrom($,ld);if(author&&!pack.author)pack.author=author;
  const published=validDate(ld.datePublished||meta($,"article:published_time"));
  const updated=validDate(ld.dateModified||meta($,"article:modified_time"));
  if(published)pack.publishedAt=published;
  if(updated)pack.updatedAt=updated;
  pack.detailsFetchedAt=new Date().toISOString().slice(0,10);
  return true;
 }catch(error){console.log("Details unavailable:",pack.title,error.message);return false;}
}
async function run(){
 let updated=0,failed=0;
 const targets=packs.filter(p=>/^https:\/\//i.test(p.sourceUrl||"")&&(!(p.fullDescription||p.detailsFiltered)||!p.detailsFetchedAt||p.detailsFetchedAt<(p.sourceUpdatedAt||"")));
 console.log("Pages to inspect for details:",targets.length);
 for(let i=0;i<targets.length;i+=8){
  const results=await Promise.all(targets.slice(i,i+8).map(one));
  updated+=results.filter(Boolean).length;failed+=results.filter(x=>!x).length;
  console.log("Detail metadata",Math.min(i+8,targets.length),"/",targets.length,"updated",updated,"failed",failed);
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 fs.writeFileSync(file,JSON.stringify(packs,null,2)+"\n");
 console.log(JSON.stringify({targets:targets.length,updated,failed},null,2));
}
run().catch(error=>{console.error(error);process.exit(1);});
