(() => {
"use strict";
const API = "https://resource-packs-api.karaage-chikin-029.workers.dev";
const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const favKey = "bedrock-resource-pack-favorites-v1";
let packs = [], activeCategory = "すべて", favoritesOnly = false, token = sessionStorage.getItem("resourcePackAdminToken") || "", editingId = null, currentModalId = null;
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
function render(){
 const list=filtered(), fav=favorites();
 $("countStat").textContent=packs.length+"件掲載";
 $("resultCount").textContent=list.length+"件を表示中";
 $("grid").innerHTML=list.length?list.map(p=>'<article class="pack" data-open="'+esc(p.id)+'"><div class="pack-top"><span class="category">'+esc(p.category)+'</span><button class="fav '+(fav.has(p.id)?"on":"")+'" data-fav="'+esc(p.id)+'" aria-label="お気に入り">'+(fav.has(p.id)?"★":"☆")+'</button></div><h2>'+esc(p.title)+'</h2><div class="author">作者：'+esc(p.author||"不明")+'</div><p class="desc">'+esc(p.description)+'</p><div class="pack-bottom"><span class="version">'+esc(p.compatibility||"対応情報は配布元で確認")+'</span><button class="details" data-open="'+esc(p.id)+'">詳細を見る →</button></div>'+(token?'<div class="admin-actions"><button class="btn small" data-edit="'+esc(p.id)+'">編集</button><button class="btn small" data-delete="'+esc(p.id)+'">削除</button></div>':"")+'</article>').join(""):'<div class="empty">該当するパックが見つかりませんでした。検索語やジャンルを変えてみてね。</div>';
}
function openDetail(id){
 const p=packs.find(x=>x.id===id); if(!p)return; currentModalId=id;
 $("modalCategory").textContent=p.category; $("modalTitle").textContent=p.title;
 $("modalBody").innerHTML='<p><b>作者：</b>'+esc(p.author||"不明")+'</p><p>'+esc(p.description)+'</p><p><b>対応情報：</b>'+esc(p.compatibility||"配布元で確認")+'</p><p><b>掲載元：</b>'+esc(p.source||"配布元")+'</p>';
 $("sourceLink").href=p.sourceUrl;
 const isFav=favorites().has(id); $("modalFav").textContent=isFav?"★ お気に入り済み":"☆ お気に入り";
 $("modalEdit").classList.toggle("hidden",!token);
 $("modal").classList.remove("hidden");
}
function toggleFav(id){const f=favorites();f.has(id)?f.delete(id):f.add(id);setFavorites(f);render();if(currentModalId===id)$("modalFav").textContent=f.has(id)?"★ お気に入り済み":"☆ お気に入り";}
function fillEditor(p){
 editingId=p?.id||null;
 $("editTitle").value=p?.title||"";$("editAuthor").value=p?.author||"";$("editCategory").value=p?.category||"その他";$("editVersion").value=p?.compatibility||"";$("editUrl").value=p?.sourceUrl||"";$("editDescription").value=p?.description||"";
 $("savePack").textContent=editingId?"変更を保存":"登録する";
 $("adminPanel").scrollIntoView({behavior:"smooth",block:"start"});
}
function clearEditor(){fillEditor(null);setStatus("入力をクリアしました。");}
async function api(path,options={}){
 const headers={"Content-Type":"application/json",...(options.headers||{})}; if(token)headers.Authorization="Bearer "+token;
 const res=await fetch(API+path,{...options,headers});
 let body={};try{body=await res.json();}catch{}
 if(!res.ok)throw new Error(body.error||("APIエラー "+res.status));
 return body;
}
async function load(){
 try{
  const response=await fetch("resource-packs.json?v=1.0.0",{cache:"no-store"});
  if(!response.ok)throw new Error("seed");
  packs=await response.json();
 }catch{packs=[];}
 try{const live=await api("/api/packs");if(Array.isArray(live.packs))packs=live.packs;}catch(e){console.info("Cloud catalogue unavailable; using bundled catalogue.",e.message);}
 categoryNav();render();
 if(token){try{await api("/api/admin/session");showEditor(true);}catch{token="";sessionStorage.removeItem("resourcePackAdminToken");showEditor(false);}}
}
function showEditor(loggedIn){
 $("loginArea").classList.toggle("hidden",loggedIn);$("editorArea").classList.toggle("hidden",!loggedIn);
}
$("filters").addEventListener("click",e=>{const b=e.target.closest("[data-category]");if(!b)return;activeCategory=b.dataset.category;categoryNav();render();});
$("grid").addEventListener("click",e=>{
 const fav=e.target.closest("[data-fav]");if(fav){e.stopPropagation();toggleFav(fav.dataset.fav);return;}
 const edit=e.target.closest("[data-edit]");if(edit){e.stopPropagation();fillEditor(packs.find(p=>p.id===edit.dataset.edit));return;}
 const del=e.target.closest("[data-delete]");if(del){e.stopPropagation();deletePack(del.dataset.delete);return;}
 const open=e.target.closest("[data-open]");if(open)openDetail(open.dataset.open);
});
$("search").addEventListener("input",render);$("sort").addEventListener("change",render);
$("favoritesOnly").addEventListener("click",()=>{favoritesOnly=!favoritesOnly;$("favoritesOnly").classList.toggle("primary",favoritesOnly);render();});
$("adminToggle").addEventListener("click",()=>$("adminPanel").classList.toggle("hidden"));
$("loginBtn").addEventListener("click",async()=>{
 const password=$("adminPassword").value;if(!password){setStatus("パスワードを入力してください。","error");return;}
 try{const result=await fetch(API+"/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});const data=await result.json();if(!result.ok)throw new Error(data.error||"ログインできませんでした。");
 token=data.token;sessionStorage.setItem("resourcePackAdminToken",token);$("adminPassword").value="";showEditor(true);render();setStatus("ログインしました。","ok");
 }catch(e){if(e.message.includes("設定されていません"))$("adminSetupHint").classList.remove("hidden");setStatus(e.message,"error");}
});
$("logoutBtn").addEventListener("click",()=>{token="";sessionStorage.removeItem("resourcePackAdminToken");showEditor(false);render();setStatus("ログアウトしました。");});
$("savePack").addEventListener("click",async()=>{
 const payload={title:$("editTitle").value.trim(),author:$("editAuthor").value.trim(),category:$("editCategory").value,compatibility:$("editVersion").value.trim()||"配布元で確認",sourceUrl:$("editUrl").value.trim(),description:$("editDescription").value.trim(),source:"管理者登録"};
 if(!payload.title||!payload.sourceUrl||!payload.description){setStatus("パック名・説明・配布元URLを入力してください。","error");return;}
 try{const path=editingId?"/api/admin/packs/"+encodeURIComponent(editingId):"/api/admin/packs";const data=await api(path,{method:editingId?"PUT":"POST",body:JSON.stringify(payload)});if(editingId){packs=packs.map(p=>p.id===editingId?data.pack:p);}else{packs.unshift(data.pack);}clearEditor();render();setStatus("登録内容を保存しました。","ok");}
 catch(e){setStatus(e.message,"error");}
});
$("cancelEdit").addEventListener("click",clearEditor);
async function deletePack(id){const p=packs.find(x=>x.id===id);if(!p||!confirm("「"+p.title+"」を削除しますか？"))return;try{await api("/api/admin/packs/"+encodeURIComponent(id),{method:"DELETE"});packs=packs.filter(x=>x.id!==id);render();setStatus("削除しました。","ok");}catch(e){setStatus(e.message,"error");}}
$("modalClose").addEventListener("click",()=>$("modal").classList.add("hidden"));
$("modal").addEventListener("click",e=>{if(e.target===$("modal"))$("modal").classList.add("hidden");});
$("modalFav").addEventListener("click",()=>currentModalId&&toggleFav(currentModalId));
$("modalEdit").addEventListener("click",()=>{const p=packs.find(x=>x.id===currentModalId);if(p){$("modal").classList.add("hidden");fillEditor(p);}});
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("modal").classList.add("hidden");});
load();
})();