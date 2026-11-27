(() => {
"use strict";
const API = "https://resource-packs-api.karaage-chikin-029.workers.dev";
const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const favKey = "bedrock-resource-pack-favorites-v1";
let packs = [], seedPacks = [], activeCategory = "すべて", favoritesOnly = false, token = sessionStorage.getItem("resourcePackAdminToken") || "", currentModalId = null, currentGalleryImages = [];
const categories = ["すべて", ...new Set(["シェーダー","軽量化","UI・テーマ","UI・操作","UI・メニュー","自然・植物","ブロック・建築","ブロック・アイテム","UI・シンプル","サウンド","空・天候","水・環境","モブ・モデル","アニメーション","言語・フォント","便利・農業","便利・操作","季節・テーマ","テーマ・世界観","その他"])];
function favorites(){try{return new Set(JSON.parse(localStorage.getItem(favKey)||"[]"));}catch{return new Set();}}
function setFavorites(set){localStorage.setItem(favKey,JSON.stringify([...set]));}
function setStatus(message,type=""){const editorVisible=!$("editorArea").classList.contains("hidden");const el=$(editorVisible?"adminStatus":"loginStatus");if(el){el.textContent=message;el.className="status "+type;}}
function categoryNav(){ $("filters").innerHTML=categories.map(c=>'<button class="chip '+(c===activeCategory?"active":"")+'" data-category="'+esc(c)+'">'+esc(c)+'</button>').join(""); }
function filtered(){
 const q=$("search").value.trim().toLowerCase(), fav=favorites();
 let list=packs.filter(p=>(activeCategory==="すべて"||p.category===activeCategory)&&(!favoritesOnly||fav.has(p.id))&&(!q||[p.title,p.author,p.description,p.category].join(" ").toLowerCase().includes(q)));
 const sort=$("sort").value;
 if(sort==="az")list.sort((a,b)=>a.title.localeCompare(b.title,"ja"));
 if(sort==="fav")list.sort((a,b)=>(Number(fav.has(b.id))-Number(fav.has(a.id)))||a.title.localeCompare(b.title,"ja"));
 return list;
}
function imageMarkup(url,alt,cls){
 return '<div class="'+cls+'">'+(url?'<img src="'+esc(url)+'" alt="'+esc(alt)+'" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><div class="image-placeholder" hidden>📦</div>':'<div class="image-placeholder">📦</div>')+'</div>';
}
function render(){
 const list=filtered(),fav=favorites();
 $("countStat").textContent=packs.length+"件掲載";
 $("resultCount").textContent=list.length+"件を表示中";
 $("grid").innerHTML=list.length?list.map(p=>'<article class="pack" data-open="'+esc(p.id)+'">'+imageMarkup(p.thumbnailUrl||(p.galleryImages||[])[0]||"",p.title+"の画像","pack-thumb")+'<div class="pack-top"><span class="category">'+esc(p.category)+'</span><button class="fav '+(fav.has(p.id)?"on":"")+'" data-fav="'+esc(p.id)+'" aria-label="お気に入り">'+(fav.has(p.id)?"★":"☆")+'</button></div><h2>'+esc(p.title)+'</h2><div class="author">作者：'+esc(p.author||"不明")+'</div><p class="desc">'+esc(p.description)+'</p><div class="pack-bottom"><span class="version">'+esc(p.compatibility||"対応情報は配布元で確認")+'</span><button class="details" data-open="'+esc(p.id)+'">詳細を見る →</button></div>'+(p.directDownloadAllowed?'<div class="version">サイト内ダウンロード対応</div>':'')+(token?'<div class="admin-actions"><button class="btn small" data-delete="'+esc(p.id)+'">削除</button></div>':"")+'</article>').join(""):'<div class="empty">該当するパックが見つかりませんでした。検索語やジャンルを変えてみてね。</div>';
}
function renderGallery(index=0){
 const box=$("modalGallery");
 if(!currentGalleryImages.length){box.innerHTML=imageMarkup("","画像なし","modal-gallery-main");return;}
 const safeIndex=Math.max(0,Math.min(index,currentGalleryImages.length-1)),url=currentGalleryImages[safeIndex];
 box.innerHTML=imageMarkup(url,"リソースパック画像 "+(safeIndex+1),"modal-gallery-main")+(currentGalleryImages.length>1?'<div class="gallery-thumbs">'+currentGalleryImages.map((src,i)=>'<button type="button" data-gallery-index="'+i+'" class="'+(i===safeIndex?"active":"")+'" aria-label="画像 '+(i+1)+'"><img src="'+esc(src)+'" alt="" loading="lazy" referrerpolicy="no-referrer"></button>').join("")+'</div>':"");
}
function openDetail(id){
 const p=packs.find(x=>x.id===id);if(!p)return;currentModalId=id;
 $("modalCategory").textContent=p.category;$("modalTitle").textContent=p.title;
 $("modalBody").innerHTML='<p><b>作者：</b>'+esc(p.author||"不明")+'</p><p>'+esc(p.description)+'</p><p><b>対応情報：</b>'+esc(p.compatibility||"配布元で確認")+'</p><p><b>掲載元：</b>'+esc(p.source||"配布元")+'</p>';
 currentGalleryImages=[...new Set([p.thumbnailUrl,...(Array.isArray(p.galleryImages)?p.galleryImages:[])].filter(Boolean))].slice(0,8);
 renderGallery(0);
 $("sourceLink").href=p.sourceUrl;
 $("downloadLink").classList.toggle("hidden",!(p.directDownloadAllowed&&p.directDownloadUrl));
 $("downloadLink").textContent="サイト内からダウンロード ↓";
 const isFav=favorites().has(id);$("modalFav").textContent=isFav?"★ お気に入り済み":"☆ お気に入り";
 const isJapanese=/[ぁ-んァ-ヶ一-龯]/.test(p.description||"");
 $("translateDescription").href="https://translate.google.com/?sl=auto&tl="+(isJapanese?"en":"ja")+"&text="+encodeURIComponent(p.description||"")+"&op=translate";
 $("translateDescription").textContent=isJapanese?"英語に翻訳 ↗":"日本語に翻訳 ↗";
 $("modal").classList.remove("hidden");
}
function toggleFav(id){const f=favorites();f.has(id)?f.delete(id):f.add(id);setFavorites(f);render();if(currentModalId===id)$("modalFav").textContent=f.has(id)?"★ お気に入り済み":"☆ お気に入り";}
function clearEditor(){
 ["editTitle","editAuthor","editVersion","editUrl","editThumbnail","editGallery","editDownloadUrl","editDescription"].forEach(id=>$(id).value="");
 $("editCategory").value="シェーダー";$("editDownloadAllowed").checked=false;
 setStatus("入力をクリアしました。");
}
async function api(path,options={}){
 const headers={"Content-Type":"application/json",...(options.headers||{})}; if(token)headers.Authorization="Bearer "+token;
 const res=await fetch(API+path,{...options,headers});
 let body={};try{body=await res.json();}catch{}
 if(!res.ok)throw new Error(body.error||("APIエラー "+res.status));
 return body;
}
const candidateCategories=["その他","シェーダー","軽量化","UI・テーマ","UI・操作","UI・メニュー","自然・植物","ブロック・建築","ブロック・アイテム","サウンド","空・天候","水・環境","モブ・モデル","アニメーション","言語・フォント","便利・農業","季節・テーマ"];
async function loadCandidates(){
 const box=$("candidateList");if(!box)return;box.innerHTML='<div class="empty">候補を読み込み中…</div>';
 try{const data=await api("/api/admin/candidates"),list=data.candidates||[];
 box.innerHTML=list.length?list.map(c=>'<article class="pack">'+imageMarkup(c.thumbnailUrl||((c.galleryImages||[])[0])||"",c.title,"pack-thumb")+'<h2>'+esc(c.title)+'</h2><div class="author">作者：'+esc(c.author||"不明")+' · '+esc(c.provider)+'</div><p class="desc">'+esc(c.description)+'</p><div class="admin-actions"><a class="btn small" href="'+esc(c.sourceUrl)+'" target="_blank" rel="noopener noreferrer">配布元を確認 ↗</a><select class="field" data-candidate-category="'+esc(c.id)+'">'+candidateCategories.map(x=>'<option>'+esc(x)+'</option>').join("")+'</select><button class="btn primary small" data-approve="'+esc(c.id)+'">確認して公開</button><button class="btn small" data-reject="'+esc(c.id)+'">除外</button></div><div class="version">発見：'+new Date(c.discoveredAt).toLocaleString("ja-JP")+'</div></article>').join(""):'<div class="empty">追加候補はありません。今すぐ候補を探してみてね。</div>';
 $("candidateStatus").textContent=list.length+"件の未確認候補";
 }catch(e){box.innerHTML='<div class="empty">候補を読み込めませんでした：'+esc(e.message)+'</div>';}
}
function pollGalleryImages(attempt=0){
 if(attempt>=36)return;
 setTimeout(async()=>{
  try{
   const live=await api("/api/packs"),next=live.packs||[];
   const merged=mergeLivePacks(next);
   const changed=merged.some((p,i)=>p.thumbnailUrl!==packs[i]?.thumbnailUrl||JSON.stringify(p.galleryImages||[])!==JSON.stringify(packs[i]?.galleryImages||[]));
   if(changed){packs=merged;render();}
   const pending=next.some(p=>!p.thumbnailUrl&&!(p.galleryImages||[]).length);
   if(pending)pollGalleryImages(attempt+1);
  }catch{pollGalleryImages(attempt+1);}
 },10000);
}
function mergeLivePacks(live){
 const byUrl=new Map();
 for(const p of seedPacks)byUrl.set(String(p.sourceUrl||"").replace(/\/+$/,""),p);
 for(const p of (live||[])){
  const key=String(p.sourceUrl||"").replace(/\/+$/,"");
  const seed=byUrl.get(key);
  // MCPEDL entries are governed by the source-updated catalogue. Do not re-add
  // entries removed by the one-year retention rule from the static index.
  if(!seed && /mcpedl/i.test(String(p.source||""))) continue;
  const base=seed||{};
  byUrl.set(key,{...base,...p,thumbnailUrl:p.thumbnailUrl||base.thumbnailUrl||"",galleryImages:(p.galleryImages&&p.galleryImages.length?p.galleryImages:(base.galleryImages||[]))});
 }
 return [...byUrl.values()];
}
async function load(){
 try{
  const response=await fetch("resource-packs.json?v=2.0.0",{cache:"no-store"});
  if(!response.ok)throw new Error("seed");
  seedPacks=await response.json();packs=seedPacks;
 }catch{packs=[];}
 try{const live=await api("/api/packs");if(Array.isArray(live.packs))packs=mergeLivePacks(live.packs);}catch(e){console.info("Cloud catalogue unavailable; using bundled catalogue.",e.message);}
 categoryNav();render();
 if(packs.some(p=>!p.thumbnailUrl&&!(p.galleryImages||[]).length))pollGalleryImages();
 if(token){try{await api("/api/admin/session");showEditor(true);await loadCandidates();}catch{token="";sessionStorage.removeItem("resourcePackAdminToken");showEditor(false);}}
}
function showEditor(loggedIn){
 $("loginArea").classList.toggle("hidden",loggedIn);$("editorArea").classList.toggle("hidden",!loggedIn);
}
$("filters").addEventListener("click",e=>{const b=e.target.closest("[data-category]");if(!b)return;activeCategory=b.dataset.category;categoryNav();render();});
$("grid").addEventListener("click",e=>{
 const fav=e.target.closest("[data-fav]");if(fav){e.stopPropagation();toggleFav(fav.dataset.fav);return;}
 const del=e.target.closest("[data-delete]");if(del){e.stopPropagation();deletePack(del.dataset.delete);return;}
 const open=e.target.closest("[data-open]");if(open)openDetail(open.dataset.open);
});
$("search").addEventListener("input",render);$("sort").addEventListener("change",render);
$("favoritesOnly").addEventListener("click",()=>{favoritesOnly=!favoritesOnly;$("favoritesOnly").classList.toggle("primary",favoritesOnly);render();});
$("adminToggle").addEventListener("click",()=>$("adminPanel").classList.toggle("hidden"));
$("loginBtn").addEventListener("click",async()=>{
 const password=$("adminPassword").value;if(!password){setStatus("パスワードを入力してください。","error");return;}
 try{const result=await fetch(API+"/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});const data=await result.json();if(!result.ok)throw new Error(data.error||"ログインできませんでした。");
 token=data.token;sessionStorage.setItem("resourcePackAdminToken",token);$("adminPassword").value="";showEditor(true);render();await loadCandidates();setStatus("ログインしました。","ok");
 }catch(e){if(e.message.includes("設定されていません"))$("adminSetupHint").classList.remove("hidden");setStatus(e.message,"error");}
});
$("logoutBtn").addEventListener("click",()=>{token="";sessionStorage.removeItem("resourcePackAdminToken");showEditor(false);render();setStatus("ログアウトしました。");});
$("savePack").addEventListener("click",async()=>{
 const payload={title:$("editTitle").value.trim(),author:$("editAuthor").value.trim(),category:$("editCategory").value,compatibility:$("editVersion").value.trim()||"配布元で確認",sourceUrl:$("editUrl").value.trim(),thumbnailUrl:$("editThumbnail").value.trim(),galleryImages:$("editGallery").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),directDownloadUrl:$("editDownloadUrl").value.trim(),directDownloadAllowed:$("editDownloadAllowed").checked,description:$("editDescription").value.trim(),source:"管理者登録"};
 if(!payload.title||!payload.sourceUrl||!payload.description){setStatus("パック名・説明・配布元URLを入力してください。","error");return;}
 try{const data=await api("/api/admin/packs",{method:"POST",body:JSON.stringify(payload)});packs.unshift(data.pack);clearEditor();render();setStatus("登録しました。","ok");}
 catch(e){setStatus(e.message,"error");}
});
$("discoverNow").addEventListener("click",async()=>{const b=$("discoverNow");b.disabled=true;$("candidateStatus").textContent="MCPEDLを検索中…";try{const r=await api("/api/admin/discover",{method:"POST",body:"{}"});$("candidateStatus").textContent="調査："+r.scanned+"件 / 新規候補："+r.added+"件 / 重複等："+r.skipped+"件";await loadCandidates();}catch(e){$("candidateStatus").textContent=e.message;}finally{b.disabled=false;}});
$("refreshCandidates").addEventListener("click",loadCandidates);
$("candidateList").addEventListener("click",async e=>{
 const a=e.target.closest("[data-approve]"),d=e.target.closest("[data-reject]");
 if(a){const id=a.dataset.approve,sel=$("candidateList").querySelector('[data-candidate-category="'+CSS.escape(id)+'"]');if(!confirm("配布元でBedrock対応を確認しましたか？確認済みなら公開します。"))return;try{const r=await api("/api/admin/candidates/"+encodeURIComponent(id)+"/approve",{method:"POST",body:JSON.stringify({category:sel?.value||"その他"})});packs.unshift(r.pack);render();await loadCandidates();$("candidateStatus").textContent="承認して公開しました。";}catch(err){$("candidateStatus").textContent=err.message;}}
 if(d){const id=d.dataset.reject;if(!confirm("この候補を除外しますか？"))return;try{await api("/api/admin/candidates/"+encodeURIComponent(id),{method:"DELETE"});await loadCandidates();}catch(err){$("candidateStatus").textContent=err.message;}}
});
$("cancelEdit").addEventListener("click",clearEditor);
async function deletePack(id){const p=packs.find(x=>x.id===id);if(!p||!confirm("「"+p.title+"」を削除しますか？"))return;try{await api("/api/admin/packs/"+encodeURIComponent(id),{method:"DELETE"});packs=packs.filter(x=>x.id!==id);render();setStatus("削除しました。","ok");}catch(e){setStatus(e.message,"error");}}
$("downloadLink").addEventListener("click",async e=>{
 e.preventDefault();const p=packs.find(x=>x.id===currentModalId);if(!p||!p.directDownloadAllowed)return;
 const button=$("downloadLink"),label=button.textContent;button.textContent="ダウンロード準備中…";button.classList.add("disabled");
 try{
  const res=await fetch(API+"/api/download/"+encodeURIComponent(p.id));
  if(!res.ok){let data={};try{data=await res.json();}catch{}throw new Error(data.error||"ダウンロードできませんでした。");}
  const blob=await res.blob(),cd=res.headers.get("Content-Disposition")||"",m=cd.match(/filename\*=UTF-8''([^;]+)/i);
  let filename=(p.title||"resource-pack")+".mcpack";if(m){try{filename=decodeURIComponent(m[1]);}catch{}}
  const objectUrl=URL.createObjectURL(blob),a=document.createElement("a");a.href=objectUrl;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);
  button.textContent="ダウンロードを開始しました";
 }catch(err){alert(err.message);button.textContent=label;}
 finally{button.classList.remove("disabled");}
});
$("modalGallery").addEventListener("click",e=>{const b=e.target.closest("[data-gallery-index]");if(b)renderGallery(Number(b.dataset.galleryIndex));});

$("modalClose").addEventListener("click",()=>$("modal").classList.add("hidden"));
$("modal").addEventListener("click",e=>{if(e.target===$("modal"))$("modal").classList.add("hidden");});
$("modalFav").addEventListener("click",()=>currentModalId&&toggleFav(currentModalId));
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("modal").classList.add("hidden");});
load();
})();