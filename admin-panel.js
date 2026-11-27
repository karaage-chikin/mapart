(()=>{"use strict";
const API="https://resource-packs-api.karaage-chikin-029.workers.dev",token=sessionStorage.getItem("resourcePackAdminToken"),$=id=>document.getElementById(id),page=document.body.dataset.page;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=v=>v?new Date(Number(v)).toLocaleString("ja-JP"):"—";
async function api(path){const r=await fetch(API+path,{headers:{Authorization:"Bearer "+token}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"読み込みに失敗しました");return d}
function status(s,cls=""){$("pageStatus").textContent=s;$("pageStatus").className="status "+cls;}
function cards(items){return '<div class="grid">'+items.map(x=>'<section class="card"><small>'+esc(x.label)+'</small><div class="value">'+esc(x.value)+'</div></section>').join("")+'</div>'}
function rows(items){return '<div class="rows">'+(items.length?items.map(x=>'<div class="row"><strong>'+esc(x.title)+'</strong><div>'+esc(x.body||"")+'</div><div class="muted">'+esc(x.meta||"")+'</div></div>').join(""):'<div class="empty">記録はまだありません。</div>')+'</div>'}
async function init(){
 if(!token){location.href="index.html";return}
 try{await api("/api/admin/session");}catch{sessionStorage.removeItem("resourcePackAdminToken");location.href="index.html";return}
 document.querySelectorAll("[data-nav]").forEach(a=>a.classList.toggle("active",a.dataset.nav===page));
 $("logoutBtn").addEventListener("click",()=>{sessionStorage.removeItem("resourcePackAdminToken");location.href="index.html";});
 try{
  const content=$("pageContent");
  if(page==="overview"){
   const d=await api("/api/admin/monitor/overview"),p=d.packs||{},c=d.candidates||{},a=d.access||{};
   content.innerHTML=cards([{label:"公開リソースパック（D1登録分）",value:p.count??0},{label:"未承認候補",value:c.count??0},{label:"公開ページ累計アクセス",value:a.count??0},{label:"監査ログ件数",value:d.logs?.count??0}])+'<section class="panel"><h2>最新の画像更新処理</h2>'+rows([{title:d.imageJob?.status||"未実行",body:d.imageJob?.result_json||"処理結果はまだありません。",meta:"開始: "+date(d.imageJob?.started_at)+" / 完了: "+date(d.imageJob?.finished_at)}])+'</section><p class="notice">公開ページのアクセス数は日別の合計値です。個人を特定するIPアドレスは保存せず、管理操作の監査記録ではハッシュ化した識別値を使用します。</p>';
  }else if(page==="updates"){
   const d=await api("/api/admin/monitor/logs?type=update");
   content.innerHTML='<section class="panel"><h2>更新・管理操作</h2>'+rows((d.logs||[]).map(x=>({title:x.action,body:x.detail,meta:date(x.created_at)})))+'</section>';
  }else if(page==="debug"){
   const d=await api("/api/admin/monitor/logs?type=debug"),o=await api("/api/admin/monitor/overview");
   content.innerHTML=cards([{label:"画像ジョブ状態",value:o.imageJob?.status||"未実行"},{label:"記録されたDebugログ",value:(d.logs||[]).length}])+'<section class="panel"><h2>Debug・エラー記録</h2>'+rows((d.logs||[]).map(x=>({title:x.action,body:x.detail,meta:date(x.created_at)})))+'</section><p class="notice">Cloudflareの内部リアルタイム実行ログそのものではなく、このサイトが記録したエラー・処理結果を表示しています。</p>';
  }else if(page==="storage"){
   const d=await api("/api/admin/monitor/overview"),bytes=Number(d.packs?.approx_bytes||0),mb=(bytes/1048576).toFixed(2);
   content.innerHTML=cards([{label:"D1登録パック",value:d.packs?.count??0},{label:"パック情報の概算サイズ",value:mb+" MB"},{label:"候補データ",value:d.candidates?.count??0},{label:"監査ログ",value:d.logs?.count??0}])+'<section class="panel"><h2>容量について</h2><p class="notice">概算サイズはパック名・作者・説明・配布元URL・画像URLなど、パック行の文字数から算出しています。D1データベース全体の物理使用量やGitHubリポジトリ容量とは異なります。画像本体は原則として外部URL参照です。</p></section>';
  }else if(page==="access"){
   const d=await api("/api/admin/monitor/access");
   content.innerHTML='<section class="panel"><h2>公開ページの日別アクセス</h2><table><thead><tr><th>日付（日本時間）</th><th>API</th><th>アクセス数</th></tr></thead><tbody>'+((d.daily||[]).map(x=>'<tr><td>'+esc(x.day)+'</td><td>'+esc(x.route)+'</td><td>'+esc(x.count)+'</td></tr>').join("")||'<tr><td colspan="3">記録はまだありません。</td></tr>')+'</tbody></table></section><section class="panel"><h2>管理者ログイン記録</h2>'+rows((d.admin||[]).map(x=>({title:x.action,body:x.detail,meta:date(x.created_at)+" / IP識別ハッシュ: "+x.ip_hash+" / "+x.user_agent})))+'</section><p class="notice">公開アクセスは日別集計のみです。管理者アクセスではIPアドレスそのものではなくハッシュ値を保存します。</p>';
  }
  status("最終確認: "+new Date().toLocaleString("ja-JP"),"good");
 }catch(e){status(e.message,"error")}
}
init();
})();