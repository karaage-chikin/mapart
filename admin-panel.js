(()=>{"use strict";
const API="https://resource-packs-api.karaage-chikin-029.workers.dev",token=sessionStorage.getItem("resourcePackAdminToken"),$=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=v=>v?new Date(Number(v)).toLocaleString("ja-JP"):"—";
let currentPage="overview",busy=false;
async function api(path){const r=await fetch(API+path,{headers:{Authorization:"Bearer "+token}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"読み込みに失敗しました");return d}
function status(s,cls=""){$("pageStatus").textContent=s;$("pageStatus").className="status "+cls}
function cards(items){return '<div class="grid">'+items.map(x=>'<section class="card"><small>'+esc(x.label)+'</small><div class="value">'+esc(x.value)+'</div></section>').join("")+'</div>'}
function rows(items){return '<div class="rows">'+(items.length?items.map(x=>'<div class="row"><strong>'+esc(x.title)+'</strong><div>'+esc(x.body||"")+'</div><div class="muted">'+esc(x.meta||"")+'</div></div>').join(""):'<div class="empty">記録はまだありません。</div>')+'</div>'}
function activateNav(){document.querySelectorAll("[data-nav]").forEach(a=>{const active=a.dataset.nav===currentPage;a.classList.toggle("active",active);a.setAttribute("aria-current",active?"page":"false")})}
async function renderPage(){
 if(busy)return;busy=true;activateNav();status("読み込み中…");
 const content=$("pageContent");content.innerHTML="";
 try{
  if(currentPage==="overview"){
   const [d,u,g,a]=await Promise.all([api("/api/admin/monitor/overview"),api("/api/admin/monitor/logs?type=update"),api("/api/admin/monitor/logs?type=debug"),api("/api/admin/monitor/access")]);
   const p=d.packs||{},c=d.candidates||{},ac=d.access||{},bytes=Number(p.approx_bytes||0);
   const mini=items=>rows(items.slice(0,4).map(x=>({title:x.action,body:x.detail,meta:date(x.created_at)})));
   const recent=(a.daily||[]).slice(0,5);
   content.innerHTML=cards([{label:"リソースパック（D1登録分）",value:p.count??0},{label:"未承認候補",value:c.count??0},{label:"累計アクセス",value:ac.count??0},{label:"監査ログ",value:d.logs?.count??0},{label:"パック情報の概算容量",value:(bytes/1048576).toFixed(2)+" MB"}])+
   '<div class="overview-grid"><section class="panel overview-panel"><h2>更新履歴</h2>'+mini(u.logs||[])+'</section><section class="panel overview-panel"><h2>Debug・エラー</h2>'+mini(g.logs||[])+'</section><section class="panel overview-panel"><h2>アクセス記録</h2>'+(recent.length?'<table><thead><tr><th>日付</th><th>アクセス数</th></tr></thead><tbody>'+recent.map(x=>'<tr><td>'+esc(x.day)+'</td><td>'+esc(x.count)+'</td></tr>').join("")+'</tbody></table>':'<div class="empty">アクセス記録はまだありません。</div>')+'</section><section class="panel overview-panel"><h2>更新・画像処理の状態</h2>'+rows([{title:d.imageJob?.status||"未実行",body:d.imageJob?.result_json||"処理結果はまだありません。",meta:"開始: "+date(d.imageJob?.started_at)+" / 完了: "+date(d.imageJob?.finished_at)}])+'</section></div>';
  }else if(currentPage==="updates"){
   const d=await api("/api/admin/monitor/logs?type=update");
   content.innerHTML='<section class="panel"><h2>更新・管理操作</h2>'+rows((d.logs||[]).map(x=>({title:x.action,body:x.detail,meta:date(x.created_at)})))+'</section>';
  }else if(currentPage==="debug"){
   const [d,o]=await Promise.all([api("/api/admin/monitor/logs?type=debug"),api("/api/admin/monitor/overview")]);
   content.innerHTML=cards([{label:"画像ジョブ状態",value:o.imageJob?.status||"未実行"},{label:"記録されたDebugログ",value:(d.logs||[]).length}])+'<section class="panel"><h2>Debug・エラー記録</h2>'+rows((d.logs||[]).map(x=>({title:x.action,body:x.detail,meta:date(x.created_at)})))+'</section><p class="notice">Cloudflareの内部リアルタイム実行ログそのものではなく、このサイトが記録したエラー・処理結果を表示しています。</p>';
  }else if(currentPage==="storage"){
   const d=await api("/api/admin/monitor/overview"),bytes=Number(d.packs?.approx_bytes||0);
   content.innerHTML=cards([{label:"D1登録パック",value:d.packs?.count??0},{label:"パック情報の概算サイズ",value:(bytes/1048576).toFixed(2)+" MB"},{label:"候補データ",value:d.candidates?.count??0},{label:"監査ログ",value:d.logs?.count??0}])+'<section class="panel"><h2>容量について</h2><p class="notice">概算サイズはパック名・作者・説明・配布元URL・画像URLなど、パック行の文字数から算出しています。D1データベース全体の物理使用量やGitHubリポジトリ容量とは異なります。画像本体は原則として外部URL参照です。</p></section>';
  }else if(currentPage==="access"){
   const d=await api("/api/admin/monitor/access");
   content.innerHTML='<section class="panel"><h2>公開ページの日別アクセス</h2><table><thead><tr><th>日付（日本時間）</th><th>API</th><th>アクセス数</th></tr></thead><tbody>'+((d.daily||[]).map(x=>'<tr><td>'+esc(x.day)+'</td><td>'+esc(x.route)+'</td><td>'+esc(x.count)+'</td></tr>').join("")||'<tr><td colspan="3">記録はまだありません。</td></tr>')+'</tbody></table></section><section class="panel"><h2>管理者ログイン記録</h2>'+rows((d.admin||[]).map(x=>({title:x.action,body:x.detail,meta:date(x.created_at)+" / IP識別ハッシュ: "+x.ip_hash+" / "+x.user_agent})))+'</section><p class="notice">公開アクセスは日別集計のみです。管理者アクセスではIPアドレスそのものではなくハッシュ値を保存します。</p>';
  }
  status("最終確認: "+new Date().toLocaleString("ja-JP"),"good");
 }catch(e){status(e.message,"error")}finally{busy=false}
}
function pageFromHash(){const p=location.hash.replace(/^#/,"");return ["overview","updates","debug","storage","access"].includes(p)?p:"overview"}
async function init(){
 if(!token){location.href="index.html";return}
 try{await api("/api/admin/session")}catch{sessionStorage.removeItem("resourcePackAdminToken");location.href="index.html";return}
 $("logoutBtn").addEventListener("click",()=>{sessionStorage.removeItem("resourcePackAdminToken");location.href="index.html"});
 document.querySelectorAll("[data-nav]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();if(location.hash!==a.getAttribute("href"))location.hash=a.dataset.nav;else{currentPage=a.dataset.nav;renderPage()}}));
 window.addEventListener("hashchange",()=>{currentPage=pageFromHash();renderPage()});
 currentPage=pageFromHash();renderPage();
}
init();
})();