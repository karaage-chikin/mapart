(()=>{"use strict";
const API="https://resource-packs-api.karaage-chikin-029.workers.dev";
const TOKEN_KEY="resourcePackAdminToken";
const storedToken=sessionStorage.getItem(TOKEN_KEY)||"";
const token=/^[A-Za-z0-9_.-]{20,2048}$/.test(storedToken)?storedToken:"";
const $=id=>document.getElementById(id);
const PAGE_SIZE=50,MAX_DATE=8640000000000000;
const ESC_MAP={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>ESC_MAP[c]);
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const formatBytes=value=>(number(value)/1048576).toFixed(2)+" MB";
const formatDate=value=>{
 const n=Number(value);
 if(!Number.isFinite(n)||Math.abs(n)>MAX_DATE)return "—";
 const d=new Date(n);
 return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(d);
};
let currentPage="overview",requestSequence=0,logPage=0,accessPage=0;
class ApiError extends Error{constructor(message,status=0){super(message);this.name="ApiError";this.status=status;}}
async function api(path){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(API+path,{method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json"},cache:"no-store",signal:controller.signal});
  let data;try{data=await response.json();}catch{throw new ApiError("サーバーから正しいJSON応答がありません。",response.status);}
  if(!response.ok)throw new ApiError(data?.error||("APIエラー（HTTP "+response.status+"）"),response.status);
  return data;
 }catch(error){
  if(error instanceof ApiError)throw error;
  if(error?.name==="AbortError")throw new ApiError("通信がタイムアウトしました。もう一度お試しください。");
  throw new ApiError("通信に失敗しました。ネットワークを確認してください。");
 }finally{clearTimeout(timer);}
}
function status(message,kind=""){
 const el=$("pageStatus");if(!el)return;
 el.textContent=String(message??"");el.className="status "+kind;
}
function cards(items){return '<div class="grid">'+items.map(x=>'<section class="card"><small>'+esc(x.label)+'</small><div class="value">'+esc(x.value)+'</div></section>').join("")+'</div>';}
function rows(items){return '<div class="rows">'+(items.length?items.map(x=>'<div class="row"><strong>'+esc(x.title)+'</strong><div>'+esc(x.body||"")+'</div><div class="muted">'+esc(x.meta||"")+'</div></div>').join(""):'<div class="empty">記録はまだありません。</div>')+'</div>';}
function activateNav(){document.querySelectorAll("[data-nav]").forEach(a=>{const active=a.dataset.nav===currentPage;a.classList.toggle("active",active);a.setAttribute("aria-current",active?"page":"false");});}
function failurePanel(error){return '<section class="panel"><h2>一部の情報を読み込めませんでした</h2><p class="notice">'+esc(error?.message||"不明なエラー")+'</p><button type="button" data-retry>再読み込み</button></section>';}
function pager(kind,page,total,hasMore){
 const prev=page>0, next=Boolean(hasMore);
 return '<div class="pager"><button type="button" data-page="'+kind+'" data-step="-1" '+(!prev?"disabled":"")+'>前へ</button><span>'+(page+1)+'ページ目 / '+Math.max(1,Math.ceil(number(total)/PAGE_SIZE))+'ページ</span><button type="button" data-page="'+kind+'" data-step="1" '+(!next?"disabled":"")+'>次へ</button></div>';
}
async function loadOverview(seq){
 const specs=[
  ["overview","/api/admin/monitor/overview"],
  ["updates","/api/admin/monitor/logs?type=update&limit=4&offset=0"],
  ["debug","/api/admin/monitor/logs?type=debug&limit=4&offset=0"],
  ["access","/api/admin/monitor/access?limit=4&offset=0"]
 ];
 const results=await Promise.allSettled(specs.map(x=>api(x[1])));
 if(seq!==requestSequence)return;
 const data={};const errors=[];
 results.forEach((r,i)=>{if(r.status==="fulfilled")data[specs[i][0]]=r.value;else errors.push(specs[i][0]+": "+r.reason.message);});
 const d=data.overview||{},p=d.packs||{},c=d.candidates||{},ac=d.access||{};
 let html=cards([{label:"リソースパック（D1登録分）",value:number(p.count)},{label:"未承認候補",value:number(c.count)},{label:"累計アクセス",value:number(ac.count)},{label:"監査ログ",value:number(d.logs?.count)},{label:"パック情報の概算容量",value:formatBytes(p.approx_bytes)}]);
 html+='<div class="overview-grid">';
 html+='<section class="panel overview-panel"><h2>更新履歴</h2>'+(data.updates?rows((data.updates.logs||[]).map(x=>({title:x.action,body:x.detail,meta:formatDate(x.created_at)}))):failurePanel({message:errors.find(x=>x.startsWith("updates"))||"取得失敗"}))+'</section>';
 html+='<section class="panel overview-panel"><h2>Debug・エラー</h2>'+(data.debug?rows((data.debug.logs||[]).map(x=>({title:x.action,body:x.detail,meta:formatDate(x.created_at)}))):failurePanel({message:errors.find(x=>x.startsWith("debug"))||"取得失敗"}))+'</section>';
 html+='<section class="panel overview-panel"><h2>アクセス記録</h2>'+(data.access?((data.access.daily||[]).length?'<table><thead><tr><th>日付</th><th>アクセス数</th></tr></thead><tbody>'+data.access.daily.map(x=>'<tr><td>'+esc(x.day)+'</td><td>'+esc(x.count)+'</td></tr>').join("")+'</tbody></table>':'<div class="empty">アクセス記録はまだありません。</div>'):failurePanel({message:errors.find(x=>x.startsWith("access"))||"取得失敗"}))+'</section>';
 html+='<section class="panel overview-panel"><h2>更新・画像処理の状態</h2>'+rows([{title:d.imageJob?.status||"未実行",body:d.imageJob?.result_json||"処理結果はまだありません。",meta:"開始: "+formatDate(d.imageJob?.started_at)+" / 完了: "+formatDate(d.imageJob?.finished_at)}])+'</section></div>';
 if(errors.length)html+='<p class="notice">一部のAPIに接続できませんでした。各欄の再読み込みを試してください。<br>'+esc(errors.join(" / "))+'</p>';
 $("pageContent").innerHTML=html;
 status("最終確認: "+formatDate(Date.now()),errors.length?"error":"good");
}
async function loadLogs(type,page,seq){
 const offset=page*PAGE_SIZE;
 const d=await api("/api/admin/monitor/logs?type="+encodeURIComponent(type)+"&limit="+PAGE_SIZE+"&offset="+offset);
 if(seq!==requestSequence)return;
 const list=d.logs||[];
 $("pageContent").innerHTML='<section class="panel"><h2>'+(type==="update"?"更新・管理操作":"Debug・エラー記録")+'</h2>'+rows(list.map(x=>({title:x.action,body:x.detail,meta:formatDate(x.created_at)+" / "+x.type})))+pager("logs",page,d.total,d.hasMore)+'</section>';
 status("全"+number(d.total)+"件中 "+(offset+1)+"〜"+(offset+list.length)+"件を表示","good");
}
async function loadStorage(seq){
 const d=await api("/api/admin/monitor/overview");if(seq!==requestSequence)return;
 const bytes=number(d.packs?.approx_bytes);
 $("pageContent").innerHTML=cards([{label:"D1登録パック",value:number(d.packs?.count)},{label:"パック情報の概算サイズ",value:formatBytes(bytes)},{label:"候補データ",value:number(d.candidates?.count)},{label:"監査ログ",value:number(d.logs?.count)}])+'<section class="panel"><h2>容量について</h2><p class="notice">概算サイズはパック情報の文字数から算出しています。D1の物理使用量やGitHubリポジトリ容量とは異なります。画像本体は原則として外部URL参照です。</p></section>';
 status("最終確認: "+formatDate(Date.now()),"good");
}
async function loadAccess(page,seq){
 const offset=page*PAGE_SIZE,d=await api("/api/admin/monitor/access?limit="+PAGE_SIZE+"&offset="+offset);
 if(seq!==requestSequence)return;
 const daily=(d.daily||[]),admins=(d.admin||[]);
 $("pageContent").innerHTML='<section class="panel"><h2>公開ページの日別アクセス（直近90日）</h2>'+(daily.length?'<table><thead><tr><th>日付（日本時間）</th><th>API</th><th>アクセス数</th></tr></thead><tbody>'+daily.map(x=>'<tr><td>'+esc(x.day)+'</td><td>'+esc(x.route)+'</td><td>'+esc(x.count)+'</td></tr>').join("")+'</tbody></table>':'<div class="empty">アクセス記録はまだありません。</div>')+'</section><section class="panel"><h2>管理者アクセス記録</h2>'+rows(admins.map(x=>({title:x.action,body:x.detail,meta:formatDate(x.created_at)+" / IP識別ハッシュ: "+x.ip_hash+" / "+x.user_agent})))+pager("access",page,d.adminTotal,d.hasMore)+'</section><p class="notice">公開アクセスは日別集計のみです。管理者アクセスではIPアドレスそのものではなくハッシュ値を保存します。</p>';
 status("管理者ログ "+number(d.adminTotal)+"件中 "+(offset+1)+"〜"+(offset+admins.length)+"件を表示","good");
}
async function renderPage(){
 const seq=++requestSequence;activateNav();status("読み込み中…");$("pageContent").innerHTML='<div class="panel loading" role="status">データを読み込んでいます…</div>';
 try{
  if(currentPage==="overview")await loadOverview(seq);
  else if(currentPage==="updates")await loadLogs("update",logPage,seq);
  else if(currentPage==="debug")await loadLogs("debug",logPage,seq);
  else if(currentPage==="storage")await loadStorage(seq);
  else if(currentPage==="access")await loadAccess(accessPage,seq);
  else{currentPage="overview";await loadOverview(seq);}
 }catch(error){
  if(seq!==requestSequence)return;
  status(error.message,"error");
  $("pageContent").innerHTML=failurePanel(error);
 }
}
function pageFromHash(){const p=location.hash.replace(/^#/,"");return ["overview","updates","debug","storage","access"].includes(p)?p:"overview";}
async function init(){
 if(!token){location.href="index.html";return;}
 try{await api("/api/admin/session");}
 catch(error){
  if(error.status===401){sessionStorage.removeItem(TOKEN_KEY);location.href="index.html";return;}
  status(error.message,"error");$("pageContent").innerHTML=failurePanel(error);return;
 }
 $("logoutBtn")?.addEventListener("click",()=>{sessionStorage.removeItem(TOKEN_KEY);location.href="index.html";});
 $("refreshBtn")?.addEventListener("click",()=>renderPage());
 document.querySelectorAll("[data-nav]").forEach(a=>a.addEventListener("click",e=>{
  e.preventDefault();const next=a.dataset.nav;
  if(next===currentPage){renderPage();return;}
  if(next==="updates"||next==="debug")logPage=0;
  if(next==="access")accessPage=0;
  location.hash=next;
 }));
 $("pageContent")?.addEventListener("click",e=>{
  if(e.target.closest("[data-retry]")){renderPage();return;}
  const p=e.target.closest("[data-page]");if(!p||p.disabled)return;
  const step=Number(p.dataset.step)||0;
  if(p.dataset.page==="logs")logPage=Math.max(0,logPage+step);
  if(p.dataset.page==="access")accessPage=Math.max(0,accessPage+step);
  renderPage();
 });
 window.addEventListener("hashchange",()=>{currentPage=pageFromHash();renderPage();});
 currentPage=pageFromHash();renderPage();
}
init();
})();