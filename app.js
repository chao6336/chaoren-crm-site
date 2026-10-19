import { ROLE_LABELS, GENDERS, visibleContact, eventState, campaignEligible, toCsv, dashboardStats, ageFrom, maskNationalId, isValidNationalId, scopeContacts, scopeRegistrations, canManageEvents, canBrowseMembers, rosterFor, checkinWindow, checkinProblem, findLegacyContact, ATTENDANCE_LABELS, IMPORT_FIELDS, guessColumns, prepareImportRow, sponsorshipSummary, toCsv as rowsToCsv } from "./lib.js?v=20261019-1";

const config = window.CRM_CONFIG || {};
const live = !config.demoMode && config.supabaseUrl && config.supabasePublishableKey;
const supabase = live ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { flowType: "implicit", detectSessionInUrl: true } }) : null;
const SITE_BASE = (config.siteUrl || location.origin).replace(/\/$/, "");
const liffReady = live && config.liffId ? window.liff.init({ liffId: config.liffId }) : Promise.resolve();
const $ = selector => document.querySelector(selector);
// 雲端模式但 LIFF 尚未設定時，學員端的 LINE 功能先顯示說明，不要直接出錯。
const LINE_NOT_READY = "LINE 登入尚未開放，請洽協會工作人員。";
const lineReady = () => !live || Boolean(config.liffId);

const SEED_VERSION = 6;
// 展示資料全部是假的；區域名稱等協會提供真實清單後再換。
const seed = {
  version: SEED_VERSION,
  role: "admin", region_id: null, as: "s1",
  // 展示用：學員頁面以哪個 LINE 帳號登入；報到碼只存在總管理可讀的地方
  demoLine: "Udemo01", checkin_codes: {},
  regions: [{id:"north",name:"北區"},{id:"taoyuan",name:"桃區"},{id:"central",name:"中區"},{id:"south",name:"南區"}],
  staff: [{id:"s1",display_name:"louis趙",email:"louis@example.com",role:"admin",region_id:null,active:true},{id:"s2",display_name:"北區負責人",email:"north@example.com",role:"region_lead",region_id:"north",active:true},{id:"s3",display_name:"中區負責人",email:"central@example.com",role:"region_lead",region_id:"central",active:true},{id:"s4",display_name:"活動組 小李",email:"events@example.com",role:"event_staff",region_id:null,active:true}],
  events: [
    { id:"evt-0", title:"今日共修（展示）", theme:"掃碼報到測試用，開始時間＝打開展示版後一小時", starts_at:new Date(Date.now()+3600e3).toISOString(), registration_deadline:new Date(Date.now()+1800e3).toISOString(), location:"晁人文鼎協會", capacity:50, status:"published", registration_count:1, fee_note:"免費" },
    { id:"evt-1", title:"城市留白｜閱讀與默想", theme:"從忙碌中重新聽見自己", starts_at:"2026-11-15T14:00:00+08:00", registration_deadline:"2026-11-13T23:59:00+08:00", location:"晁人文鼎協會", capacity:24, status:"published", registration_count:4, fee_note:"體驗活動 NT$300" },
    { id:"evt-2", title:"24 節氣冥想體驗", theme:"給第一次接觸冥想的你", starts_at:"2026-12-06T10:00:00+08:00", registration_deadline:"2026-12-03T23:59:00+08:00", location:"線上＋實體", capacity:30, status:"draft", registration_count:1, fee_note:"免費" }
  ],
  contacts: [
    { id:"c1", name:"王小美", display_name:"May", phone:"0912345678", email:"may@example.com", gender:"女", birth_date:"1962-03-18", region_id:"north", address:"台北市大安區和平東路一段 1 號", national_id:"A223456781", notes:"清明法會固定志工", line_user_id:"Udemo01", line_status:"active", marketing_consent:true, tags:["閱讀","睡眠"], last_interaction_at:"2026-10-15", created_at:"2026-10-01" },
    { id:"c2", name:"陳志明", display_name:"Jim", phone:"0987654321", email:"jim@example.com", gender:"男", birth_date:"1958-11-02", region_id:"north", address:"新北市板橋區文化路二段 2 號", national_id:"F123456782", notes:"", line_user_id:"Udemo02", line_status:"active", marketing_consent:true, tags:["冥想"], last_interaction_at:"2026-10-12", created_at:"2026-10-05" },
    { id:"c3", name:"林雅婷", display_name:"Ting", phone:"0922111222", email:"ting@example.com", gender:"女", birth_date:"1975-07-21", region_id:"central", address:"台中市西區公益路 3 號", national_id:"B223456783", notes:"行動不便，需安排座位", line_user_id:"Udemo03", line_status:"blocked", marketing_consent:true, tags:["閱讀"], last_interaction_at:"2026-10-08", created_at:"2026-10-08" },
    { id:"c4", name:"周文豪", display_name:"Howard", phone:"0933000111", email:"howard@example.com", gender:"男", birth_date:"1949-01-30", region_id:"south", address:"高雄市苓雅區四維三路 4 號", national_id:"E123456784", notes:"", line_user_id:"Udemo04", line_status:"active", marketing_consent:false, tags:["冥想"], last_interaction_at:"2026-10-10", created_at:"2026-10-10" },
    { id:"c5", name:"黃淑芬", display_name:"Fen", phone:"0955666777", email:"", gender:"女", birth_date:"1968-09-09", region_id:null, address:"", national_id:"", notes:"舊名冊匯入，尚未分區", line_user_id:null, line_status:"unknown", marketing_consent:false, tags:[], last_interaction_at:"2026-09-30", created_at:"2026-09-30" }
  ],
  registrations: [
    { id:"r1", event_id:"evt-1", contact_id:"c1", attendance_status:"attended", payment_status:"paid", registered_at:"2026-10-10", cancelled_at:null },
    { id:"r2", event_id:"evt-1", contact_id:"c2", attendance_status:"registered", payment_status:"pending", registered_at:"2026-10-11", cancelled_at:null },
    { id:"r3", event_id:"evt-1", contact_id:"c3", attendance_status:"registered", payment_status:"paid", registered_at:"2026-10-12", cancelled_at:null },
    { id:"r4", event_id:"evt-2", contact_id:"c4", attendance_status:"registered", payment_status:"free", registered_at:"2026-10-13", cancelled_at:null },
    { id:"r5", event_id:"evt-1", contact_id:"c4", attendance_status:"registered", payment_status:"pending", registered_at:"2026-10-14", cancelled_at:null },
    { id:"r6", event_id:"evt-0", contact_id:"c2", attendance_status:"registered", payment_status:"free", registered_at:"2026-10-18", cancelled_at:null }
  ],
  sponsorships: [
    { id:"sp1", contact_id:"c1", item:"2026 清明", amount:200, paid:true, paid_at:"2026-04-02", note:"" },
    { id:"sp2", contact_id:"c2", item:"2026 清明", amount:200, paid:false, paid_at:null, note:"" },
    { id:"sp3", contact_id:"c4", item:"2025 中元", amount:500, paid:true, paid_at:"2025-08-20", note:"現金" }
  ],
  campaigns: [{ id:"m1", name:"城市留白行前提醒", event_id:"evt-1", body:"提醒您：城市留白活動將於 11/15 下午 2 點開始，期待與您相見。", status:"draft", eligible_count:2, success_count:0, failed_count:0 }],
  audit: [{ at:"2026-10-17 09:20", actor:"louis趙", action:"登入展示系統", target:"CRM" }]
};

// 雲端模式未登入前不能帶著展示資料，否則未登入的人也看得到假會員畫面。
let state = live ? {role:"none",region_id:null,regions:[],staff:[],events:[],contacts:[],registrations:[],campaigns:[],audit:[]} : loadDemo();

function loadDemo(){
  try {
    const saved=JSON.parse(localStorage.getItem("chaoren-crm-demo"));
    return saved?.version===SEED_VERSION ? saved : structuredClone(seed);
  } catch { return structuredClone(seed); }
}
function viewer(){ return {role:state.role,region_id:state.region_id}; }
function isAdmin(){ return state.role==="admin"; }
function regionName(id){ return state.regions?.find(r=>r.id===id)?.name||"未分區"; }
function myContacts(){ return scopeContacts(state.contacts,viewer()); }
function myRegistrations(){ return scopeRegistrations(state.registrations,state.contacts,viewer()); }
function canEvents(){ return canManageEvents(state.role); }
// 報名名單：雲端由 event_roster view 決定範圍；展示版用同一規則（lib.rosterFor）。
function roster(){ return live ? (state.roster||[]).map(r=>({...r,id:r.registration_id})) : rosterFor(state.registrations,state.contacts,viewer(),regionName); }
const ADMIN_ONLY_ROUTES=["messages","governance","users","import","sponsors"];
// 學員看的頁面：不顯示後台選單，資料只走 LINE 身分。
const STUDENT_ROUTES=["me","scan"];
function switchDemoUser(staffId){
  const s=state.staff.find(x=>x.id===staffId); if(!s)return;
  Object.assign(state,{as:s.id,role:s.role,region_id:s.region_id||null});
  persist(); showUser(s.display_name); render();
}
function showUser(name){
  $("#userLabel").textContent=`${name}・${ROLE_LABELS[state.role]||""}${state.role==="region_lead"?`（${regionName(state.region_id)}）`:""}`;
}
function persist(){ if(!live) localStorage.setItem("chaoren-crm-demo", JSON.stringify(state)); }
function toast(message){ const el=$("#toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2200); }
function escapeHtml(value=""){ return String(value).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function fmtDate(value){ return new Intl.DateTimeFormat("zh-TW",{dateStyle:"medium",timeStyle:value?.includes("T")?"short":undefined}).format(new Date(value)); }
function modal(html){ $("#modalBody").innerHTML=html; $("#modal").showModal(); }
function closeModal(){ $("#modal").close(); }
function route(){ return (location.hash.slice(1).split("?")[0] || "dashboard"); }
function query(){ return new URLSearchParams(location.hash.split("?")[1] || ""); }
function pageHead(title,subtitle,actions=""){ return `<section class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="actions">${actions}</div></section>`; }

async function boot(){
  $("#modeBadge").textContent=live?"已連雲端":"展示模式";
  if(live && await handleAuthLink()) { /* 已切到設定密碼頁或顯示錯誤 */ }
  else if(live && route()==="register") await loadPublicEvent();
  else if(live && STUDENT_ROUTES.includes(route())) state.role="public";
  else if(live) await loadLiveData();
  else {
    document.querySelectorAll("[data-demo-only]").forEach(el=>el.hidden=false);
    const picker=$("#demoUser"); picker.hidden=false;
    picker.innerHTML=state.staff.filter(s=>s.active).map(s=>`<option value="${s.id}" ${s.id===state.as?"selected":""}>以「${escapeHtml(s.display_name)}」身分檢視</option>`).join("");
    showUser(state.staff.find(s=>s.id===state.as)?.display_name||"");
  }
  addEventListener("hashchange",render);
  document.addEventListener("click",onClick);
  document.addEventListener("submit",onSubmit);
  render();
}

// 邀請／重設密碼連結：Supabase 會把使用者帶回 ?flow=set-password，並在網址 # 後面附上登入憑證或錯誤。
async function handleAuthLink(){
  const search=new URLSearchParams(location.search); const hash=new URLSearchParams(location.hash.slice(1));
  const linkError=hash.get("error_description")||search.get("error_description");
  if(search.get("flow")!=="set-password"&&!linkError) return false;
  history.replaceState(null,"",location.pathname+"#set-password");
  if(linkError){ state.authNotice="這個連結已失效或已經使用過，請總管理重新產生一次。"; return true; }
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) state.authNotice="這個連結已失效或已經使用過，請總管理重新產生一次。";
  else { state.authEmail=session.user.email; state.role="setting-password"; }
  return true;
}

async function loadPublicEvent(){
  const eventId=query().get("event");
  const {data,error}=await supabase.from("public_events").select("*").eq("id",eventId).single();
  state={role:"public",region_id:null,regions:[],staff:[],events:error?[]:[data],contacts:[],registrations:[],campaigns:[],audit:[]};
}

async function loadLiveData(){
  const { data:{ session } } = await supabase.auth.getSession();
  if(!session){ location.hash="login"; return; }
  // 範圍限制由資料庫負責（contacts_safe 與 RLS），前端的過濾只是第二道保險。
  const [profile,regions,events,contacts,registrations,rosterRows,campaigns,audit] = await Promise.all([
    supabase.from("staff_profiles").select("role,display_name,region_id").eq("user_id",session.user.id).single(),
    supabase.from("regions").select("id,name").order("sort_order"),
    supabase.from("events_with_counts").select("*").order("starts_at"),
    supabase.from("contacts_safe").select("*").order("last_interaction_at",{ascending:false}),
    supabase.from("registrations").select("*").order("registered_at",{ascending:false}),
    supabase.from("event_roster").select("*"),
    supabase.from("message_campaigns").select("*").order("created_at",{ascending:false}),
    supabase.from("audit_log").select("created_at,action,target_type,target_id").order("created_at",{ascending:false}).limit(50)
  ]);
  const staff = profile.data?.role === "admin" ? await supabase.from("staff_profiles").select("user_id,display_name,role,region_id,active") : {data:[]};
  const sponsorships = profile.data?.role === "admin" ? await supabase.from("sponsorships").select("*").order("created_at",{ascending:false}) : {data:[]};
  state={role:profile.data?.role||"none",region_id:profile.data?.region_id||null,regions:regions.data||[],staff:staff.data||[],sponsorships:sponsorships.data||[],events:events.data||[],contacts:contacts.data||[],registrations:registrations.data||[],roster:rosterRows.data||[],campaigns:campaigns.data||[],audit:(audit.data||[]).map(x=>({at:x.created_at,actor:"工作人員",action:x.action,target:`${x.target_type}:${x.target_id||""}`}))};
  showUser(profile.data?.display_name||session.user.email);
  $("#logoutBtn").hidden=state.role==="none";
}

function render(){
  const name=route();
  if(state.role!=="public"&&((ADMIN_ONLY_ROUTES.includes(name)&&!isAdmin())||(name==="contacts"&&!canBrowseMembers(state.role)))){ location.hash="dashboard"; return; }
  // 雲端模式未登入（或帳號未開通）：只能看登入頁與學員頁，後台選單整個藏起來。
  const signedOut=live&&["none","setting-password"].includes(state.role);
  if(signedOut&&!["login","register","set-password",...STUDENT_ROUTES].includes(name)){ location.hash="login"; return; }
  document.body.classList.toggle("signed-out",signedOut);
  document.body.classList.toggle("student-view",STUDENT_ROUTES.includes(name));
  document.querySelectorAll(".sidebar a").forEach(a=>{ a.classList.toggle("active",a.dataset.route===name); if(!a.hasAttribute("data-demo-only"))a.hidden=(ADMIN_ONLY_ROUTES.includes(a.dataset.route)&&!isAdmin())||(a.dataset.route==="contacts"&&!canBrowseMembers(state.role)); });
  const views={dashboard,events,contacts,checkin,messages,governance,users,register,login,me,scan,import:importPage,sponsors,"set-password":setPassword};
  $("#app").innerHTML=(views[name]||dashboard)();
  if(name==="me")loadMe();
  if(name==="users")loadStaffList();
  if(name==="scan")runScan();
  if(name==="register"&&window.qrcode&&$("#qr")){ const code=window.qrcode(0,"M");code.addData(location.href);code.make();$("#qr").innerHTML=code.createSvgTag(4,0); }
  $("#app").focus();
}

function dashboard(){
  const regs=roster();
  const s=dashboardStats(state.events,regs,myContacts());
  const next=state.events.filter(e=>new Date(e.starts_at)>new Date()).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))[0];
  const scopeNote=isAdmin()?"把活動、參加者與後續關懷放在同一個地方。":state.role==="event_staff"?"活動幹部：負責活動建立、報名與報到；報名名單只顯示姓名、區域與手機後三碼。":`以下數字只計算${regionName(state.region_id)}的會員。`;
  const unassigned=isAdmin()?state.contacts.filter(c=>!c.region_id&&!c.anonymized_at).length:0;
  return `${pageHead("營運總覽",scopeNote)}
  <section class="stats">
    <div class="stat"><span>活動數</span><strong>${s.events}</strong></div><div class="stat"><span>有效報名</span><strong>${s.registrations}</strong></div>
    <div class="stat"><span>出席率</span><strong>${s.attendanceRate}%</strong></div><div class="stat"><span>取消率</span><strong>${s.cancellationRate}%</strong></div>${canBrowseMembers(state.role)?`<div class="stat"><span>會員</span><strong>${s.contacts}</strong></div>`:""}
  </section>
  <section class="grid"><article class="card"><h2>下一場活動</h2>${next?`<h3>${escapeHtml(next.title)}</h3><p>${fmtDate(next.starts_at)}・${escapeHtml(next.location)}</p><div class="kpi-line"><span>報名</span><strong>${next.registration_count}/${next.capacity}</strong></div><div class="actions"><a class="button" href="#checkin?event=${next.id}">開啟報到</a><a class="button secondary" href="#register?event=${next.id}">查看報名頁</a></div>`:"<p class='muted'>目前沒有未來活動。</p>"}</article>
  <article class="card"><h2>需要注意</h2><div class="kpi-line"><span>待繳費</span><strong>${regs.filter(r=>r.payment_status==="pending"&&!r.cancelled_at).length}</strong></div>${isAdmin()?`<div class="kpi-line"><span>待確認訊息</span><strong>${state.campaigns.filter(c=>c.status==="draft").length}</strong></div><div class="kpi-line"><span>尚未分區的會員</span><strong>${unassigned}</strong></div>`:""}${canBrowseMembers(state.role)?`<div class="kpi-line"><span>無法 LINE 聯絡</span><strong>${myContacts().filter(c=>!campaignEligible(c)).length}</strong></div>`:""}</article></section>`;
}

function events(){
  const create=canEvents()?`<button data-action="edit-event">＋ 建立活動</button>`:"";
  return `${pageHead("活動管理","建立活動、查看報名進度並取得公開連結。",create)}<div class="table-wrap"><table><thead><tr><th>活動</th><th>日期</th><th>地點</th><th>報名</th><th>狀態</th><th>操作</th></tr></thead><tbody>${state.events.map(e=>`<tr><td><strong>${escapeHtml(e.title)}</strong><br><small>${escapeHtml(e.theme)}</small></td><td>${fmtDate(e.starts_at)}</td><td>${escapeHtml(e.location)}</td><td>${e.registration_count}/${e.capacity}</td><td><span class="pill">${eventState(e)}</span></td><td><a href="#register?event=${e.id}">報名頁</a>　<a href="#checkin?event=${e.id}">報到</a>${canEvents()?`　<a href="#events" data-action="edit-event" data-id="${e.id}">編輯</a>`:""}</td></tr>`).join("")}</tbody></table></div>`;
}

function regionOptions(selected,{withAll=false,withNone=false}={}){
  return `${withAll?`<option value="">全部區域</option>`:""}${withNone?`<option value="">未分區</option>`:""}${(state.regions||[]).map(r=>`<option value="${r.id}" ${r.id===selected?"selected":""}>${escapeHtml(r.name)}</option>`).join("")}`;
}

function contacts(){
  const filter=isAdmin()?query().get("region")||"":state.region_id;
  const base=myContacts().filter(c=>!c.anonymized_at&&(!filter||(filter==="none"?!c.region_id:c.region_id===filter)));
  const rows=base.map(c=>({...visibleContact(c,state.role),age:c.age??ageFrom(c.birth_date)}));
  const actions=isAdmin()?`<button data-action="edit-contact">＋ 新增會員</button><a class="button secondary" href="#import">匯入 Excel</a><button class="secondary" data-action="export-contacts">匯出 CSV</button>`:"";
  const subtitle=isAdmin()?"總管理看得到全部會員；身分證只顯示遮罩，需要時另按「查看」。":`你是${regionName(state.region_id)}負責人，只看得到本區會員；手機、地址與身分證會遮罩。`;
  const regionFilter=isAdmin()?`<select id="regionFilter" aria-label="依區域篩選"><option value="">全部區域</option>${(state.regions||[]).map(r=>`<option value="${r.id}" ${r.id===filter?"selected":""}>${escapeHtml(r.name)}</option>`).join("")}<option value="none" ${filter==="none"?"selected":""}>未分區</option></select>`:"";
  return `${pageHead("會員資料",subtitle,actions)}<div class="toolbar"><input class="search" id="contactSearch" placeholder="搜尋姓名、LINE 名稱或標籤" aria-label="搜尋會員">${regionFilter}</div><p class="muted">共 ${rows.length} 位</p><div class="table-wrap"><table><thead><tr><th>會員</th><th>性別／年齡</th><th>區域</th><th>手機</th><th>標籤</th><th>LINE</th></tr></thead><tbody id="contactRows">${contactRows(rows)||`<tr><td colspan="6" class="empty">沒有符合的會員</td></tr>`}</tbody></table></div>`;
}
// 從舊系統匯入的會員常有幾十個標籤：清單只顯示前 3 個，其餘在詳細頁展開。
function tagPills(tags=[],limit=3){ const shown=tags.slice(0,limit).map(t=>`<span class="pill">${escapeHtml(t)}</span>`).join(" "); return tags.length>limit?`${shown} <span class="pill off">＋${tags.length-limit}</span>`:shown; }
function contactRows(rows){ return rows.map(c=>`<tr class="clickable" data-action="view-contact" data-id="${c.id}" data-search="${escapeHtml([c.name,c.display_name,...(c.tags||[])].join(" ").toLowerCase())}"><td><strong>${escapeHtml(c.name)}</strong><br><small>${escapeHtml(c.display_name)}</small></td><td>${escapeHtml(c.gender||"—")}／${c.age??"—"}</td><td>${escapeHtml(c.region_name||regionName(c.region_id))}</td><td>${escapeHtml(c.phone)}</td><td>${tagPills(c.tags)}</td><td><span class="pill ${c.line_status!=="active"?"off":""}">${({active:"可聯絡",blocked:"已封鎖"})[c.line_status]||"未綁定"}</span></td></tr>`).join(""); }

function viewContact(id){
  const raw=myContacts().find(c=>c.id===id); if(!raw)return toast("找不到這位會員，或你沒有權限查看");
  const c=visibleContact(raw,state.role); const age=raw.age??ageFrom(raw.birth_date);
  const history=myRegistrations().filter(r=>r.contact_id===id).map(r=>({...r,event:state.events.find(e=>e.id===r.event_id)}));
  const line=(label,value)=>`<div class="kpi-line"><span>${label}</span><strong>${escapeHtml(value||"—")}</strong></div>`;
  const nid=c.national_id_masked?`${escapeHtml(c.national_id_masked)}${isAdmin()?` <button class="link" data-action="reveal-nid" data-id="${id}">查看</button>`:""}`:"—";
  modal(`<div class="profile-head"><div class="avatar" aria-hidden="true">${escapeHtml((c.name||"?").slice(0,1))}</div><div><h2>${escapeHtml(c.name)}</h2><p class="muted">${escapeHtml(c.display_name||"尚未綁定 LINE")}</p></div></div>
    ${line("性別",c.gender)}${line("出生年月日",c.birth_date?`${c.birth_date}（${age} 歲）`:"")}${line("區域",c.region_name||regionName(c.region_id))}${line("手機",c.phone)}${line("Email",c.email)}${line("地址",c.address)}
    <div class="kpi-line"><span>身分證</span><strong id="nidValue">${nid}</strong></div>${line("備註",c.notes)}${(raw.tags||[]).length?`<details class="tag-box"><summary>標籤與參加紀錄（${raw.tags.length}）</summary><div>${raw.tags.map(t=>`<span class="pill">${escapeHtml(t)}</span>`).join(" ")}</div></details>`:""}
    <h3>活動與課程</h3>${history.length?`<ul class="plain">${history.map(h=>`<li>${escapeHtml(h.event?.title||"已刪除的活動")}・${({attended:"已參加",registered:"已報名",cancelled:"已取消",absent:"未出席"})[h.attendance_status]||h.attendance_status}</li>`).join("")}</ul>`:`<p class="muted">尚無紀錄</p>`}
    ${isAdmin()?sponsorBlock(id):""}
    ${isAdmin()?`<div class="actions"><button data-action="edit-contact" data-id="${id}">編輯資料</button></div>`:""}`);
}

function contactForm(id){
  if(!isAdmin())return toast("只有總管理可以修改會員資料");
  const c=id?state.contacts.find(x=>x.id===id):{};
  const v=key=>escapeHtml(c?.[key]||"");
  modal(`<h2>${id?"編輯會員":"新增會員"}</h2><form id="contactForm"><input type="hidden" name="contact_id" value="${id||""}"><div class="form-grid">
    <div class="field"><label>姓名 *</label><input name="name" required maxlength="40" value="${v("name")}"></div>
    <div class="field"><label>手機</label><input name="phone" inputmode="tel" pattern="09[0-9]{8}" placeholder="0912345678" value="${v("phone")}"></div>
    <div class="field"><label>性別</label><select name="gender"><option value="">未填</option>${GENDERS.map(g=>`<option ${c?.gender===g?"selected":""}>${g}</option>`).join("")}</select></div>
    <div class="field"><label>出生年月日</label><input name="birth_date" type="date" min="1900-01-01" value="${v("birth_date")}"></div>
    <div class="field"><label>區域</label><select name="region_id">${regionOptions(c?.region_id,{withNone:true})}</select></div>
    <div class="field"><label>Email</label><input name="email" type="email" value="${v("email")}"></div>
    <div class="field full"><label>地址</label><input name="address" maxlength="200" value="${v("address")}"></div>
    <div class="field full"><label>身分證字號</label><input name="national_id" maxlength="10" autocomplete="off" placeholder="${c?.national_id_masked||maskNationalId(c?.national_id)||"A123456789"}"><small class="muted">${id?"留空＝不變更；":""}只有總管理看得到完整號碼，存檔後加密保存。</small></div>
    <div class="field full"><label>備註</label><textarea name="notes" maxlength="2000">${v("notes")}</textarea></div>
    <button class="field full">儲存</button></div></form>`);
}

async function saveContact(data){
  const nid=data.national_id.trim().toUpperCase();
  if(nid&&!isValidNationalId(nid))return toast("身分證格式不正確，例如 A123456789");
  const fields={name:data.name.trim(),phone:data.phone,email:data.email,gender:data.gender,birth_date:data.birth_date,region_id:data.region_id||null,address:data.address,notes:data.notes};
  if(live){
    const {error}=await supabase.rpc("admin_save_contact",{p_contact_id:data.contact_id||null,p_data:fields,p_national_id:nid||null});
    if(error)return toast(error.message.includes("FORBIDDEN")?"沒有權限":"儲存失敗："+error.message);
    await loadLiveData();
  } else if(data.contact_id){
    const c=state.contacts.find(x=>x.id===data.contact_id); Object.assign(c,fields); if(nid)c.national_id=nid;
  } else {
    state.contacts.push({id:crypto.randomUUID(),...fields,national_id:nid,display_name:"",line_user_id:null,line_status:"unknown",marketing_consent:false,tags:[],last_interaction_at:new Date().toISOString(),created_at:new Date().toISOString()});
  }
  audit(data.contact_id?"修改會員資料":"新增會員",fields.name+(nid?"（含身分證）":"")); persist(); closeModal(); render(); toast("會員資料已儲存");
}

async function revealNationalId(id){
  if(!isAdmin())return;
  let value;
  if(live){ const {data,error}=await supabase.rpc("reveal_national_id",{p_contact_id:id}); if(error)return toast("無法查看身分證"); value=data; }
  else value=state.contacts.find(c=>c.id===id)?.national_id;
  audit("查看完整身分證",state.contacts.find(c=>c.id===id)?.name||id); persist();
  $("#nidValue").textContent=value||"—";
}

function checkin(){
  const eventId=query().get("event")||state.events[0]?.id; const event=state.events.find(e=>e.id===eventId);
  const regs=roster().filter(r=>r.event_id===eventId&&!r.cancelled_at);
  const done=regs.filter(r=>r.attendance_status==="attended").length;
  const scope=canEvents()?"全部區域":`只顯示${regionName(state.region_id)}`;
  const pay=r=>r.payment_status==="paid"?"已繳":r.payment_status==="free"?"免費":"待確認款項";
  const qrBtn=canEvents()&&event?`<button data-action="show-qr" data-event="${event.id}">報到 QR Code</button>`:"";
  const picker=`<select id="eventSwitch">${state.events.map(e=>`<option value="${e.id}" ${e.id===eventId?"selected":""}>${escapeHtml(e.title)}</option>`).join("")}</select>`;
  const rows=regs.map(r=>`<div class="checkin-item" data-search="${escapeHtml(`${r.name} ${r.phone_last3}`.toLowerCase())}"><div><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.region_name||"未分區")}・手機末三碼 ${escapeHtml(r.phone_last3||"---")}・${r.source==="walk-in"?"現場報名・":""}${pay(r)}</small></div><button data-action="toggle-checkin" data-id="${r.id}" class="${r.attendance_status==="attended"?"secondary":""}">${r.attendance_status==="attended"?"已報到 ✓":"確認報到"}</button></div>`).join("");
  return `${pageHead("現場報到",event?`${event.title}・${fmtDate(event.starts_at)}`:"請先建立活動",qrBtn+picker)}<p class="muted">${scope}・已報到 ${done}／${regs.length}</p><input class="search" id="checkinSearch" placeholder="搜尋姓名或手機末三碼"><div class="checkin-list" style="margin-top:15px">${rows||"<div class='empty'>目前沒有報名者</div>"}</div>`;
}

function messages(){
  return `${pageHead("LINE 訊息","訊息必須由幹部檢查對象與內容後，才能送出。",!isAdmin()?"":`<button data-action="new-campaign">＋ 新增草稿</button>`)}<div class="notice">系統不會自動發送。按下「檢查並送出」後，還會再次顯示實際對象與訊息全文。</div><div class="grid">${state.campaigns.map(c=>`<article class="card"><span class="pill ${c.status!=="draft"?"off":""}">${({draft:"草稿",partial:"部分失敗",failed:"失敗",sent:"已送出",sending:"發送中"})[c.status]||c.status}</span><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.body)}</p><div class="kpi-line"><span>符合條件</span><strong>${c.eligible_count}</strong></div><div class="kpi-line"><span>成功／失敗</span><strong>${c.success_count}/${c.failed_count}</strong></div>${["draft","partial","failed"].includes(c.status)&&isAdmin()?`<button data-action="review-campaign" data-id="${c.id}">${c.status==="draft"?"檢查並送出":"重送失敗對象"}</button>`:""}</article>`).join("")}</div>`;
}

function governance(){
  const old=state.contacts.filter(c=>!c.anonymized_at&&new Date(c.last_interaction_at)<new Date(Date.now()-730*864e5));
  return `${pageHead("資料治理","備份、操作紀錄與兩年閒置資料匿名化。")}<section class="two-col"><article class="card"><h2>資料保存</h2><p>目前符合「閒置滿兩年」的聯絡人：<strong>${old.length}</strong> 位。</p><button data-action="preview-anonymize" ${!isAdmin()?"disabled":""}>預覽匿名化名單</button><p class="muted">匿名化只保留活動統計，姓名、手機、Email 與 LINE 識別碼將不可還原。</p></article><article class="card"><h2>備份</h2><p>管理者可匯出不含系統秘密的 JSON 備份。</p><button class="secondary" data-action="backup" ${!isAdmin()?"disabled":""}>匯出資料備份</button></article></section><h2>最近操作</h2><div class="table-wrap"><table><thead><tr><th>時間</th><th>人員</th><th>動作</th><th>對象</th></tr></thead><tbody>${state.audit.map(a=>`<tr><td>${escapeHtml(a.at)}</td><td>${escapeHtml(a.actor)}</td><td>${escapeHtml(a.action)}</td><td>${escapeHtml(a.target)}</td></tr>`).join("")}</tbody></table></div>`;
}

function users(){
  if(!isAdmin())return `${pageHead("使用者","只有總管理可以管理帳號。")}<div class="notice">你沒有使用者管理權限。</div>`;
  return `${pageHead("使用者管理","總管理看得到全部資料；活動幹部負責活動、報名與報到（只看報名名單）；區負責人只看得到指定區域的會員與報到。",`<button data-action="invite-user">＋ 邀請工作人員</button>`)}<div id="staffArea"><div class="empty">載入中…</div></div>`;
}

function register(){
  const event=state.events.find(e=>e.id===(query().get("event")||state.events[0]?.id));
  if(!event)return `<div class="empty">找不到這場活動。</div>`;
  return `${pageHead(event.title,event.theme)}<section class="two-col"><article class="card"><h2>活動資訊</h2><div class="kpi-line"><span>時間</span><strong>${fmtDate(event.starts_at)}</strong></div><div class="kpi-line"><span>地點</span><strong>${escapeHtml(event.location)}</strong></div><div class="kpi-line"><span>費用</span><strong>${escapeHtml(event.fee_note)}</strong></div><div class="kpi-line"><span>名額</span><strong>${event.registration_count}/${event.capacity}</strong></div><p class="muted">分享報名 QR Code</p><div id="qr" aria-label="活動報名 QR Code"></div></article><article class="card"><h2>LINE 登入＋簡短報名</h2>${eventState(event)!=="報名中"?`<div class="notice">目前${eventState(event)}，暫停接受報名。</div>`:`<form id="registrationForm"><input type="hidden" name="event_id" value="${event.id}"><div class="form-grid"><div class="field"><label>姓名 *</label><input name="name" required maxlength="40"></div><div class="field"><label>手機 *</label><input name="phone" required inputmode="tel" pattern="09[0-9]{8}" placeholder="0912345678"></div><div class="field full"><label>Email</label><input name="email" type="email"></div><div class="field full"><label>有興趣的主題</label><select name="interest"><option>閱讀</option><option>冥想</option><option>身心放鬆</option><option>節氣生活</option></select></div><label class="field full"><span><input type="checkbox" name="privacy" required> 我已閱讀並同意<a href="privacy.html" target="_blank">個資告知</a>，資料僅用於活動與會員服務。</span></label><label class="field full"><span><input type="checkbox" name="marketing"> 我同意接收後續活動與課程訊息，可隨時撤回。</span></label><button class="field full" type="submit">使用 LINE 身分送出報名</button><button class="field full secondary" type="button" data-action="cancel-registration" data-event="${event.id}">取消我的報名</button></div></form>`}</article></section>`;
}

// ───── 學員頁面 ─────
// 雲端：每次都帶 LINE ID Token 呼叫 member 函式，後端驗證後只回本人的資料。
// 展示：用 state 模擬同一套回應格式，規則與資料庫函式一致（見 lib.js）。
async function memberApi(action,payload={}){
  if(live){
    if(!lineReady()) return {error:LINE_NOT_READY};
    await liffReady;
    if(!window.liff.isLoggedIn()){ window.liff.login({redirectUri:location.href}); return {pending:true}; }
    const res=await fetch(`${config.supabaseUrl}/functions/v1/member`,{method:"POST",headers:{"Content-Type":"application/json",apikey:config.supabasePublishableKey},body:JSON.stringify({...payload,action,idToken:window.liff.getIDToken()})});
    const body=await res.json().catch(()=>({error:"連線失敗，請稍後再試"}));
    return res.ok?body:{error:body.error||"暫時無法完成"};
  }
  return demoMemberApi(action,payload);
}

function demoMemberApi(action,payload){
  const line=state.demoLine; const me=state.contacts.find(c=>c.line_user_id===line&&!c.anonymized_at);
  const notMember={code:"NOT_MEMBER",displayName:"LINE 新朋友",regions:state.regions};
  if(action==="me"){
    if(!me)return notMember;
    const regs=state.registrations.filter(r=>r.contact_id===me.id).map(r=>({...r,events:state.events.find(e=>e.id===r.event_id)}));
    const events=state.events.filter(e=>e.status==="published"&&new Date(e.starts_at)>new Date()).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
    return {ok:true,contact:{...me,region_name:regionName(me.region_id)},registrations:regs,events};
  }
  if(action==="signup"){
    if(me)return {ok:true,contactId:me.id,existing:true};
    const legacy=findLegacyContact(state.contacts,payload);
    const fields={gender:payload.gender||null,birth_date:payload.birth_date||null,region_id:payload.region_id||null,email:payload.email||""};
    let id;
    if(legacy){ id=legacy.id; for(const [k,v] of Object.entries(fields)) if(!legacy[k]&&v)legacy[k]=v; Object.assign(legacy,{line_user_id:line,display_name:"LINE 新朋友",line_status:"active",marketing_consent:Boolean(payload.marketing),last_interaction_at:new Date().toISOString()}); }
    else { id=crypto.randomUUID(); state.contacts.push({id,name:payload.name.trim(),phone:payload.phone,...fields,address:"",national_id:"",notes:"",display_name:"LINE 新朋友",line_user_id:line,line_status:"active",marketing_consent:Boolean(payload.marketing),tags:[],last_interaction_at:new Date().toISOString(),created_at:new Date().toISOString()}); }
    persist(); return {ok:true,contactId:id,linked:Boolean(legacy)};
  }
  if(action==="checkin"){
    const event=state.events.find(e=>e.id===payload.event_id);
    const problem=checkinProblem(event,payload.token,state.checkin_codes?.[payload.event_id]);
    if(problem)return {error:CHECKIN_MESSAGES[problem],code:problem};
    if(!me)return notMember;
    let reg=state.registrations.find(r=>r.event_id===event.id&&r.contact_id===me.id); let already=false;
    if(!reg){ reg={id:crypto.randomUUID(),event_id:event.id,contact_id:me.id,payment_status:"pending",source:"walk-in",registered_at:new Date().toISOString()}; state.registrations.push(reg); event.registration_count=(event.registration_count||0)+1; }
    else if(reg.attendance_status==="attended"&&!reg.cancelled_at) already=true;
    if(!already){ Object.assign(reg,{attendance_status:"attended",cancelled_at:null,checked_in_at:new Date().toISOString()}); me.last_interaction_at=new Date().toISOString(); }
    persist(); return {ok:true,already,checkedInAt:reg.checked_in_at,name:me.name,eventTitle:event.title,region:me.region_id?regionName(me.region_id):null};
  }
}
const CHECKIN_MESSAGES={INVALID_TOKEN:"這個報到 QR Code 已失效，請洽現場工作人員",NOT_OPEN:"報到尚未開放（活動開始前 3 小時開放）",CHECKIN_CLOSED:"這場活動的報到已結束",EVENT_CLOSED:"這場活動目前未開放"};

function demoLinePicker(){
  if(live)return "";
  const options=state.contacts.filter(c=>c.line_user_id&&!c.anonymized_at).map(c=>`<option value="${escapeHtml(c.line_user_id)}" ${c.line_user_id===state.demoLine?"selected":""}>${escapeHtml(c.name)}</option>`).join("");
  const isNew=!state.contacts.some(c=>c.line_user_id===state.demoLine);
  return `<div class="notice demo-line">展示模式：目前用 <select id="demoLine">${options}<option value="new" ${isNew?"selected":""}>第一次來的新朋友</option></select> 的 LINE 登入</div>`;
}

function me(){ return `${demoLinePicker()}<div id="studentArea"><div class="empty">正在用 LINE 確認身分…</div></div>`; }
function scan(){ return `${demoLinePicker()}<div id="studentArea"><div class="empty">正在用 LINE 確認身分並報到…</div></div>`; }

async function loadMe(){
  const data=await memberApi("me"); if(data.pending)return;
  const area=$("#studentArea"); if(!area)return;
  if(data.error){ area.innerHTML=`<div class="notice">${escapeHtml(data.error)}</div>`; return; }
  if(data.code==="NOT_MEMBER"){ area.innerHTML=signupForm(data,"me"); return; }
  const c=data.contact; const now=new Date();
  const regs=(data.registrations||[]).filter(r=>r.events);
  const upcoming=regs.filter(r=>!r.cancelled_at&&r.attendance_status!=="attended"&&new Date(r.events.starts_at)>=now).sort((a,b)=>new Date(a.events.starts_at)-new Date(b.events.starts_at));
  const attended=regs.filter(r=>r.attendance_status==="attended").sort((a,b)=>new Date(b.events.starts_at)-new Date(a.events.starts_at));
  const mine=new Set(regs.filter(r=>!r.cancelled_at).map(r=>r.event_id));
  const item=(title,sub,right="")=>`<li class="student-item"><div><strong>${escapeHtml(title)}</strong><small>${sub}</small></div>${right}</li>`;
  area.innerHTML=`<section class="card profile-head student-card"><div class="avatar" aria-hidden="true">${escapeHtml((c.name||"?").slice(0,1))}</div><div><h1>${escapeHtml(c.name)}</h1><p class="muted">${escapeHtml(c.region_name||"尚未分區")}・LINE：${escapeHtml(c.display_name||"")}</p></div></section>
    <section class="card student-card"><h2>我報名的活動</h2>${upcoming.length?`<ul class="student-list">${upcoming.map(r=>item(r.events.title,`${fmtDate(r.events.starts_at)}・${escapeHtml(r.events.location||"")}`,`<span class="pill">已報名</span>`)).join("")}</ul>`:`<p class="muted">目前沒有報名中的活動。</p>`}</section>
    <section class="card student-card"><h2>參加紀錄</h2>${attended.length?`<ul class="student-list">${attended.map(r=>item(r.events.title,`${fmtDate(r.events.starts_at)}${r.checked_in_at?`・報到 ${fmtDate(r.checked_in_at)}`:""}`,`<span class="pill">${ATTENDANCE_LABELS.attended}</span>`)).join("")}</ul>`:`<p class="muted">還沒有參加紀錄，期待在活動見到你。</p>`}</section>
    <section class="card student-card"><h2>近期活動</h2>${(data.events||[]).length?`<ul class="student-list">${data.events.map(e=>item(e.title,`${fmtDate(e.starts_at)}・${escapeHtml(e.location||"")}・${escapeHtml(e.fee_note||"")}`,mine.has(e.id)?`<span class="pill">已報名</span>`:eventState(e)==="報名中"?`<a class="button" href="#register?event=${e.id}">報名</a>`:`<span class="pill off">${eventState(e)}</span>`)).join("")}</ul>`:`<p class="muted">近期沒有公開活動。</p>`}</section>`;
}

async function runScan(){
  const q=query(); const eventId=q.get("event"); const token=q.get("t");
  const area=$("#studentArea"); if(!area)return;
  if(!eventId||!token){ area.innerHTML=`<div class="notice">QR Code 內容不完整，請重新掃描或洽現場工作人員。</div>`; return; }
  const data=await memberApi("checkin",{event_id:eventId,token}); if(data.pending)return;
  if(!$("#studentArea"))return;
  if(data.code==="NOT_MEMBER"){ $("#studentArea").innerHTML=`<div class="notice">第一次參加嗎？填好基本資料，就會自動完成報到。</div>${signupForm(data,"scan")}`; return; }
  if(data.error){ $("#studentArea").innerHTML=`<article class="card result-card fail"><div class="result-icon" aria-hidden="true">!</div><h1>無法報到</h1><p>${escapeHtml(data.error)}</p></article>`; return; }
  $("#studentArea").innerHTML=`<article class="card result-card ok"><div class="result-icon" aria-hidden="true">✓</div><h1>${data.already?"你已經報到過了":"報到成功"}</h1><p class="result-name">${escapeHtml(data.name)}${data.region?`・${escapeHtml(data.region)}`:""}</p><p>${escapeHtml(data.eventTitle)}</p><p class="muted">報到時間 ${fmtDate(data.checkedInAt)}</p><a class="button" href="#me">看我的活動紀錄</a></article>`;
}

function signupForm(data,next){
  return `<article class="card student-card"><h1>第一次見面，請填基本資料</h1><p class="muted">以前填過紙本或報名表的朋友，手機和姓名都對得上時，系統會自動接上你的舊紀錄。</p>
  <form id="signupForm"><input type="hidden" name="next" value="${next}"><div class="form-grid">
    <div class="field"><label>姓名 *</label><input name="name" required maxlength="40" autocomplete="name"></div>
    <div class="field"><label>手機 *</label><input name="phone" required inputmode="tel" pattern="09[0-9]{8}" placeholder="0912345678" autocomplete="tel"></div>
    <div class="field"><label>性別</label><select name="gender"><option value="">不填</option>${GENDERS.map(g=>`<option>${g}</option>`).join("")}</select></div>
    <div class="field"><label>出生年月日</label><input name="birth_date" type="date" min="1900-01-01"></div>
    <div class="field"><label>所屬區域</label><select name="region_id"><option value="">不確定</option>${(data.regions||[]).map(r=>`<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("")}</select></div>
    <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email"></div>
    <label class="field full"><span><input type="checkbox" name="privacy" required> 我已閱讀並同意<a href="privacy.html" target="_blank">個資告知</a>。</span></label>
    <label class="field full"><span><input type="checkbox" name="marketing"> 我同意接收活動與課程訊息，可隨時撤回。</span></label>
    <button class="field full big">${next==="scan"?"送出並完成報到":"送出"}</button></div></form></article>`;
}

async function submitSignup(data){
  const btn=$("#signupForm button"); if(btn)btn.disabled=true;
  const result=await memberApi("signup",{...data,privacy:data.privacy==="on",marketing:data.marketing==="on"}); if(result.pending)return;
  if(result.error){ if(btn)btn.disabled=false; return toast(result.error); }
  toast(result.linked?"已接上你以前的紀錄":"註冊完成");
  if(data.next==="scan")runScan(); else loadMe();
}

// ───── 總管理：產生報到 QR Code ─────
function checkinUrl(eventId,token){
  const base=live&&config.siteUrl?config.siteUrl.replace(/\/$/,"")+"/":location.origin+location.pathname;
  return `${base}#scan?event=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`;
}
async function showCheckinQr(eventId,{renew=false}={}){
  if(!canEvents())return toast("只有總管理與活動幹部可以產生報到 QR Code");
  const event=state.events.find(e=>e.id===eventId); if(!event)return;
  let token;
  if(live){
    if(!renew){ const {data}=await supabase.from("event_checkin_codes").select("token").eq("event_id",eventId).maybeSingle(); token=data?.token; }
    if(!token){ const {data,error}=await supabase.rpc("admin_issue_checkin_token",{p_event_id:eventId}); if(error)return toast("無法產生 QR Code："+error.message); token=data.token; }
  } else {
    state.checkin_codes=state.checkin_codes||{};
    if(renew||!state.checkin_codes[eventId]) state.checkin_codes[eventId]=Array.from(crypto.getRandomValues(new Uint8Array(18)),b=>b.toString(16).padStart(2,"0")).join("");
    token=state.checkin_codes[eventId];
  }
  if(renew)audit("重新產生報到 QR Code",event.title); else audit("開啟報到 QR Code",event.title); persist();
  const url=checkinUrl(eventId,token); const {opensAt,closesAt}=checkinWindow(event);
  const code=window.qrcode(0,"M"); code.addData(url); code.make();
  modal(`<h2>報到 QR Code</h2><p><strong>${escapeHtml(event.title)}</strong><br><span class="muted">${fmtDate(event.starts_at)}・${escapeHtml(event.location)}</span></p>
    <div class="qr-big">${code.createSvgTag(6,0)}</div>
    <div class="notice">可報到時間：${fmtDate(opensAt.toISOString())} ～ ${fmtDate(closesAt.toISOString())}。請把這張 QR Code 傳給各區負責人，或印出來貼在報到桌；學員掃碼後會自動歸到自己的區域。</div>
    <div class="actions"><button class="secondary" data-action="download-qr" data-event="${eventId}">下載圖檔</button><button class="danger" data-action="renew-qr" data-event="${eventId}">重新產生（舊的立即失效）</button></div>
    ${live?"":`<p class="muted">展示用：<a href="${escapeHtml(url)}" data-action="close-modal">直接開啟掃碼後的頁面</a></p>`}`);
}

// ───── 設定／重設密碼（邀請連結、重設連結共用）─────
function setPassword(){
  if(state.authNotice) return `<article class="card result-card fail" style="max-width:520px;margin:30px auto"><div class="result-icon" aria-hidden="true">!</div><h1>無法設定密碼</h1><p>${escapeHtml(state.authNotice)}</p><a class="button" href="#login">回到登入頁</a></article>`;
  if(!live||state.role!=="setting-password") return `<article class="card" style="max-width:520px;margin:30px auto"><p>請從總管理傳給你的邀請或重設連結進入此頁。</p><a class="button" href="#login">回到登入頁</a></article>`;
  return `${pageHead("設定登入密碼",`帳號：${escapeHtml(state.authEmail||"")}`)}<article class="card" style="max-width:460px;margin:auto"><form id="setPasswordForm">
    <div class="field"><label>新密碼（至少 8 個字）</label><input type="password" name="password" minlength="8" required autocomplete="new-password"></div>
    <div class="field" style="margin-top:12px"><label>再輸入一次</label><input type="password" name="confirm" minlength="8" required autocomplete="new-password"></div>
    <button style="margin-top:16px;width:100%">儲存並登入</button></form></article>`;
}
async function savePassword(data){
  if(data.password!==data.confirm) return toast("兩次輸入的密碼不一樣");
  if(data.password.length<8) return toast("密碼至少 8 個字");
  const {error}=await supabase.auth.updateUser({password:data.password});
  if(error) return toast(/same|different/i.test(error.message)?"新密碼不能和舊密碼相同":"設定失敗："+error.message);
  state.role="none"; await loadLiveData();
  if(state.role==="none"){ await supabase.auth.signOut(); location.hash="login"; return toast("密碼已設定，但帳號尚未開通，請洽總管理"); }
  location.hash="dashboard"; toast("密碼已設定，歡迎使用");
}
function forgotPassword(){
  modal(`<h2>忘記密碼</h2><p class="muted">輸入登入用的 Email。若系統寄得到你的信箱，會收到重設密碼信；<strong>沒收到的話，請總管理在「使用者」頁幫你產生重設連結</strong>。</p><form id="forgotForm"><div class="field"><label>Email</label><input type="email" name="email" required></div><button style="margin-top:12px">寄出重設信</button></form>`);
}
async function sendResetEmail(data){
  if(!live){ closeModal(); return toast("展示模式不會寄信"); }
  await supabase.auth.resetPasswordForEmail(data.email.trim(),{redirectTo:`${SITE_BASE}/?flow=set-password`});
  closeModal(); toast("如果這個 Email 有帳號，重設信已寄出；沒收到請找總管理");
}

// ───── 工作人員管理（只有總管理）：邀請與重設都產生連結，由總管理用 LINE 傳給對方 ─────
async function callStaff(action,payload={}){
  if(!live) return demoStaff(action,payload);
  const {data,error}=await supabase.functions.invoke("manage-staff",{body:{action,...payload}});
  if(error){ let message="暫時無法完成"; try{ message=(await error.context.json()).error||message; }catch{} return {error:message}; }
  return data;
}
function demoStaff(action,payload){
  const fakeLink=`${SITE_BASE}/?flow=set-password#展示用連結`;
  if(action==="list") return {staff:state.staff.map(s=>({...s,user_id:s.id,invited_pending:false}))};
  if(action==="invite"){ if(payload.role==="region_lead"&&!payload.region_id) return {error:"區負責人必須指定區域"}; const id=crypto.randomUUID(); state.staff.push({id,display_name:payload.display_name,email:payload.email,role:payload.role,region_id:payload.role==="region_lead"?payload.region_id:null,active:true}); persist(); return {ok:true,link:fakeLink,email:payload.email}; }
  if(action==="reset") return {ok:true,link:fakeLink,email:state.staff.find(s=>s.id===payload.user_id)?.email};
  if(action==="update"){ const s=state.staff.find(x=>x.id===payload.user_id); if(s.id===state.as&&(payload.active===false||(payload.role&&payload.role!=="admin"))) return {error:"不能停用或降級自己的帳號，避免沒有總管理"}; Object.assign(s,{...(payload.role?{role:payload.role,region_id:payload.role==="region_lead"?payload.region_id:null}:{}),...(typeof payload.active==="boolean"?{active:payload.active}:{})}); persist(); return {ok:true}; }
}
async function loadStaffList(){
  if(!isAdmin()) return;
  const area=$("#staffArea"); if(!area) return;
  const res=await callStaff("list"); if(!$("#staffArea")) return;
  if(res.error){ $("#staffArea").innerHTML=`<div class="notice">${escapeHtml(res.error)}</div>`; return; }
  state.staffList=res.staff;
  const status=s=>!s.active?"<span class='pill off'>已停用</span>":s.invited_pending?"<span class='pill warn'>等待設定密碼</span>":"<span class='pill'>使用中</span>";
  $("#staffArea").innerHTML=`<div class="table-wrap"><table><thead><tr><th>姓名</th><th>Email</th><th>權限</th><th>負責區域</th><th>狀態</th><th></th></tr></thead><tbody>${res.staff.map(s=>`<tr><td>${escapeHtml(s.display_name)}</td><td>${escapeHtml(s.email||"")}</td><td>${ROLE_LABELS[s.role]||s.role}</td><td>${s.role==="region_lead"?escapeHtml(regionName(s.region_id)):s.role==="event_staff"?"全部（報名名單）":"全部"}</td><td>${status(s)}</td><td class="row-actions"><button class="secondary" data-action="staff-edit" data-id="${s.user_id}">修改</button><button class="secondary" data-action="staff-reset" data-id="${s.user_id}">${s.invited_pending?"重新產生邀請":"重設密碼連結"}</button></td></tr>`).join("")}</tbody></table></div>`;
}
function showLinkModal(title,email,link){
  modal(`<h2>${title}</h2><p>請把下面這條連結<strong>用 LINE 私訊傳給 ${escapeHtml(email||"對方")}</strong>。對方點開後自己設定密碼就能登入。</p>
    <div class="link-box"><input id="linkText" readonly value="${escapeHtml(link)}"><button data-action="copy-link">複製</button></div>
    <div class="notice">這條連結等同一次性的登入鑰匙：只傳給本人、不要貼在群組；用過一次或超過約 24 小時就會失效，失效後再產生一次即可。</div>`);
}
async function staffEditForm(userId){
  const s=(state.staffList||[]).find(x=>x.user_id===userId); if(!s) return;
  modal(`<h2>修改：${escapeHtml(s.display_name)}</h2><form id="staffEditForm"><input type="hidden" name="user_id" value="${s.user_id}"><div class="form-grid">
    <div class="field"><label>權限</label><select name="role">${Object.entries(ROLE_LABELS).map(([k,v])=>`<option value="${k}" ${s.role===k?"selected":""}>${v}</option>`).join("")}</select></div>
    <div class="field"><label>負責區域（區負責人必填）</label><select name="region_id">${regionOptions(s.region_id)}</select></div>
    <label class="field full"><span><input type="checkbox" name="active" ${s.active?"checked":""}> 帳號啟用中（取消勾選＝停用，對方將無法登入後台）</span></label>
    <button class="field full">儲存</button></div></form>`);
}

// ───── 活動建立與編輯（總管理、活動幹部）─────
const EVENT_STATUS_LABELS={draft:"草稿（不公開）",published:"公開報名",completed:"已結束",cancelled:"已取消"};
function toLocalInput(value){ if(!value)return ""; const d=new Date(value); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); }
function eventForm(id){
  if(!canEvents())return toast("只有總管理與活動幹部可以編輯活動");
  const e=id?state.events.find(x=>x.id===id):{capacity:24,fee_note:"免費",status:"published"}; if(!e)return;
  const v=key=>escapeHtml(e[key]??"");
  modal(`<h2>${id?"編輯活動":"建立活動"}</h2><form id="eventForm"><input type="hidden" name="event_id" value="${id||""}"><div class="form-grid">
    <div class="field full"><label>活動名稱 *</label><input name="title" required maxlength="120" value="${v("title")}"></div>
    <div class="field full"><label>活動說明</label><textarea name="theme" maxlength="1000">${v("theme")}</textarea></div>
    <div class="field"><label>開始時間 *</label><input name="starts_at" type="datetime-local" required value="${toLocalInput(e.starts_at)}"></div>
    <div class="field"><label>結束時間</label><input name="ends_at" type="datetime-local" value="${toLocalInput(e.ends_at)}"></div>
    <div class="field"><label>報名截止 *</label><input name="registration_deadline" type="datetime-local" required value="${toLocalInput(e.registration_deadline)}"></div>
    <div class="field"><label>名額 *</label><input name="capacity" type="number" min="1" max="500" required value="${v("capacity")}"></div>
    <div class="field"><label>地點 *</label><input name="location" required value="${v("location")}"></div>
    <div class="field"><label>費用說明</label><input name="fee_note" value="${v("fee_note")}"></div>
    <div class="field full"><label>狀態</label><select name="status">${Object.entries(EVENT_STATUS_LABELS).map(([k,label])=>`<option value="${k}" ${e.status===k?"selected":""}>${label}</option>`).join("")}</select></div>
    <button class="field full">儲存活動</button></div></form>`);
}
async function saveEvent(data){
  if(!canEvents())return toast("沒有權限");
  const iso=value=>value?new Date(value).toISOString():null;
  const fields={title:data.title.trim(),theme:data.theme||"",starts_at:iso(data.starts_at),ends_at:iso(data.ends_at),registration_deadline:iso(data.registration_deadline),location:data.location,capacity:Number(data.capacity),fee_note:data.fee_note||"免費",status:data.status};
  if(new Date(fields.registration_deadline)>new Date(fields.starts_at))return toast("報名截止不能晚於開始時間");
  if(fields.ends_at&&new Date(fields.ends_at)<=new Date(fields.starts_at))return toast("結束時間要晚於開始時間");
  if(live){
    const {error}=data.event_id?await supabase.from("events").update(fields).eq("id",data.event_id):await supabase.from("events").insert(fields);
    if(error)return toast("儲存失敗："+error.message); await loadLiveData();
  } else if(data.event_id) Object.assign(state.events.find(e=>e.id===data.event_id),fields);
  else state.events.push({id:crypto.randomUUID(),...fields,registration_count:0});
  audit(data.event_id?"編輯活動":"建立活動",fields.title); persist(); closeModal(); render(); toast(data.event_id?"活動已更新":"活動已建立");
}

// ───── Excel／CSV 匯入（總管理）─────
let importState=null;
const XLSX_URL="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
function loadScript(src){ return new Promise((ok,fail)=>{ if(window.XLSX)return ok(); const el=document.createElement("script"); el.src=src; el.onload=ok; el.onerror=()=>fail(new Error("無法載入 Excel 讀取元件，請改存成 CSV 再匯入")); document.head.appendChild(el); }); }
function parseCsv(text){
  const rows=[]; let row=[], cell="", quoted=false;
  for(let i=0;i<text.length;i++){ const ch=text[i];
    if(quoted){ if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;} else if(ch==='"')quoted=false; else cell+=ch; }
    else if(ch==='"')quoted=true; else if(ch===","){row.push(cell);cell="";} else if(ch==="\n"){row.push(cell);rows.push(row);row=[];cell="";} else if(ch!=="\r")cell+=ch; }
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows.filter(r=>r.some(c=>String(c).trim()!==""));
}
async function readImportFile(file){
  if(!file)return;
  try{
    let rows;
    if(/\.csv$/i.test(file.name)) rows=parseCsv((await file.text()).replace(/^\ufeff/,""));
    else { await loadScript(XLSX_URL); const book=window.XLSX.read(await file.arrayBuffer(),{type:"array"}); rows=window.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,raw:true,defval:""}).filter(r=>r.some(c=>String(c).trim()!=="")); }
    if(rows.length<2)return toast("檔案裡沒有資料列（第一列要是欄位名稱）");
    if(rows.length>1001)return toast("一次最多匯入 1000 筆，請分檔");
    const headers=rows[0].map(h=>String(h).trim());
    importState={fileName:file.name,headers,rows:rows.slice(1),map:guessColumns(headers,rows.slice(1)),result:null};
    render();
  }catch(error){ toast(error.message); }
}
function preparedRows(){
  const seen=new Set();
  return importState.rows.map((raw,i)=>({line:i+2,...prepareImportRow(raw,importState.map,{regions:state.regions,existing:state.contacts,seen})}));
}
function importPage(){
  if(!isAdmin())return `${pageHead("匯入名冊","只有總管理可以匯入。")}`;
  const head=pageHead("匯入會員名冊","從 Excel 或 CSV 一次建立舊會員；姓名＋手機與現有會員相同的會自動略過。",`<button class="secondary" data-action="import-template">下載範本</button>`);
  if(!importState) return `${head}<article class="card"><h2>1. 選擇檔案</h2><p class="muted">第一列要是欄位名稱，例如：姓名、手機、性別、出生年月日、區域、地址、Email、身分證、備註。欄位順序不拘，系統會自動辨認。</p><input type="file" id="importFile" accept=".xlsx,.xls,.csv"><p class="muted">資料只在你的瀏覽器裡整理，按下「確認匯入」之前不會寫入系統。</p></article>`;
  if(importState.result){ const r=importState.result; return `${head}<article class="card result-card ok"><div class="result-icon" aria-hidden="true">✓</div><h1>匯入完成</h1><p>新增 <strong>${r.created}</strong> 位・略過 <strong>${r.skipped}</strong> 位（已存在或重複）・失敗 <strong>${r.errors.length}</strong> 列</p><div class="actions" style="justify-content:center">${r.errors.length?`<button class="secondary" data-action="import-errors">下載失敗清單</button>`:""}<a class="button" href="#contacts">看會員資料</a><button class="secondary" data-action="import-reset">再匯入一個檔案</button></div></article>`; }
  const prepared=preparedRows(); const count=k=>prepared.filter(p=>p.status===k).length;
  const opts=sel=>`<option value="">（不匯入）</option>${importState.headers.map((h,i)=>`<option value="${i}" ${sel===i?"selected":""}>${escapeHtml(h||`第 ${i+1} 欄`)}</option>`).join("")}`;
  const mapping=IMPORT_FIELDS.map(([key,label])=>`<div class="field"><label>${label}${key==="name"?" *":""}</label><select data-map-field="${key}">${opts(importState.map[key])}</select></div>`).join("");
  const badge={new:"<span class='pill'>新增</span>",duplicate:"<span class='pill off'>略過</span>",error:"<span class='pill warn'>錯誤</span>"};
  const preview=prepared.slice(0,100).map(p=>`<tr><td>${p.line}</td><td>${badge[p.status]}</td><td>${escapeHtml(p.row.name)}</td><td>${escapeHtml(p.row.phone||"")}</td><td>${escapeHtml(p.row.gender||"")}</td><td>${escapeHtml(p.row.birth_date||"")}</td><td>${escapeHtml(p.row.region_id?regionName(p.row.region_id):"未分區")}</td><td>${p.row.national_id?"有":""}</td><td>${p.row.line_user_id?"已綁":""}</td><td>${p.row.tags.length||""}</td><td class="muted">${escapeHtml([...p.errors,...p.warnings].join("；"))}</td></tr>`).join("");
  return `${head}<article class="card"><h2>2. 確認欄位對應</h2><p class="muted">檔案：${escapeHtml(importState.fileName)}・共 ${prepared.length} 列</p><div class="form-grid map-grid">${mapping}</div></article>
    <article class="card" style="margin-top:16px"><h2>3. 預覽</h2><div class="kpi-line"><span>會新增</span><strong>${count("new")}</strong></div><div class="kpi-line"><span>會略過（已存在／重複）</span><strong>${count("duplicate")}</strong></div><div class="kpi-line"><span>有錯誤、不會匯入</span><strong>${count("error")}</strong></div>
    ${importState.map.name===undefined?`<div class="notice">請先指定哪一欄是「姓名」。</div>`:""}
    <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>列</th><th>結果</th><th>姓名</th><th>手機</th><th>性別</th><th>生日</th><th>區域</th><th>身分證</th><th>LINE</th><th>標籤</th><th>說明</th></tr></thead><tbody>${preview}</tbody></table></div>${prepared.length>100?`<p class="muted">只顯示前 100 列，匯入時會處理全部。</p>`:""}
    <div class="actions" style="margin-top:14px"><button data-action="import-run" ${!count("new")||importState.map.name===undefined?"disabled":""}>確認匯入 ${count("new")} 位</button><button class="secondary" data-action="import-reset">換一個檔案</button></div></article>`;
}
async function runImport(){
  if(!isAdmin()||!importState)return;
  const prepared=preparedRows(); const todo=prepared.filter(p=>p.status==="new");
  const btn=$("[data-action='import-run']"); if(btn){btn.disabled=true;btn.textContent="匯入中…";}
  const result={created:0,skipped:prepared.filter(p=>p.status==="duplicate").length,errors:prepared.filter(p=>p.status==="error").map(p=>({row:p.line,error:p.errors.join("；"),name:p.row.name}))};
  if(live){
    for(let i=0;i<todo.length;i+=200){
      const chunk=todo.slice(i,i+200).map(p=>({...p.row,_row:p.line}));
      const {data,error}=await supabase.rpc("admin_import_contacts",{p_rows:chunk});
      if(error){ result.errors.push(...chunk.map(c=>({row:c._row,error:"上傳失敗："+error.message,name:c.name}))); continue; }
      result.created+=data.created; result.skipped+=data.skipped; result.errors.push(...data.errors);
    }
    await loadLiveData();
  } else {
    for(const p of todo){ state.contacts.push({id:crypto.randomUUID(),display_name:"",...p.row,line_status:p.row.line_user_id?"active":"unknown",marketing_consent:false,last_interaction_at:new Date().toISOString(),created_at:new Date().toISOString()}); result.created++; }
  }
  importState.result=result; audit("匯入會員名冊",`${importState.fileName}：新增 ${result.created}、略過 ${result.skipped}、失敗 ${result.errors.length}`); persist(); render();
}
function downloadImportErrors(){
  const errors=importState?.result?.errors||[];
  download("匯入失敗清單.csv",rowsToCsv(errors,[["檔案列號","row"],["姓名","name"],["原因","error"]]),"text/csv;charset=utf-8");
}

// ───── 贊助紀錄（只有總管理）─────
function contactLabel(id){ const c=state.contacts.find(x=>x.id===id); return c?`${c.name}（${regionName(c.region_id)}）`:"已移除的會員"; }
function sponsorBlock(contactId){
  const list=(state.sponsorships||[]).filter(s=>s.contact_id===contactId);
  return `<h3>贊助紀錄 <small class="muted">（只有總管理看得到）</small></h3>${list.length?`<ul class="plain">${list.map(s=>`<li>${escapeHtml(s.item)}・NT$${Number(s.amount).toLocaleString()}・${s.paid?`已收${s.paid_at?`（${s.paid_at}）`:""}`:"未收"}</li>`).join("")}</ul>`:`<p class="muted">尚無紀錄</p>`}<button class="secondary" data-action="new-sponsor" data-contact="${contactId}">＋ 新增贊助</button>`;
}
function sponsors(){
  if(!isAdmin())return pageHead("贊助紀錄","只有總管理可以查看。");
  const q=query(); const item=q.get("item")||""; const paid=q.get("paid")||"";
  const all=state.sponsorships||[]; const items=[...new Set(all.map(s=>s.item))].sort((a,b)=>b.localeCompare(a,"zh-Hant"));
  const list=all.filter(s=>(!item||s.item===item)&&(!paid||String(s.paid)===paid));
  const summary=sponsorshipSummary(all).map(s=>`<tr><td>${escapeHtml(s.item)}</td><td>${s.count}</td><td>NT$${s.total.toLocaleString()}</td><td>NT$${s.paid.toLocaleString()}（${s.paidCount} 筆）</td><td>NT$${(s.total-s.paid).toLocaleString()}</td></tr>`).join("");
  return `${pageHead("贊助紀錄","與金錢有關的資料只有總管理看得到；活動幹部、區負責人與學員都看不到。",`<button data-action="new-sponsor">＋ 新增一筆</button><button class="secondary" data-action="batch-sponsor">批次建立</button><button class="secondary" data-action="export-sponsors">匯出 CSV</button>`)}
    <h2>各項目統計</h2><div class="table-wrap"><table><thead><tr><th>項目</th><th>筆數</th><th>應收</th><th>已收</th><th>未收</th></tr></thead><tbody>${summary||`<tr><td colspan="5" class="empty">尚無資料</td></tr>`}</tbody></table></div>
    <h2 style="margin-top:22px">明細</h2><div class="toolbar"><select id="sponsorItemFilter"><option value="">全部項目</option>${items.map(i=>`<option ${i===item?"selected":""}>${escapeHtml(i)}</option>`).join("")}</select><select id="sponsorPaidFilter"><option value="">已收＋未收</option><option value="true" ${paid==="true"?"selected":""}>已收</option><option value="false" ${paid==="false"?"selected":""}>未收</option></select></div>
    <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>會員</th><th>項目</th><th>金額</th><th>狀態</th><th>備註</th><th></th></tr></thead><tbody>${list.map(s=>`<tr><td>${escapeHtml(contactLabel(s.contact_id))}</td><td>${escapeHtml(s.item)}</td><td>NT$${Number(s.amount).toLocaleString()}</td><td>${s.paid?`<span class="pill">已收</span> <small>${escapeHtml(s.paid_at||"")}</small>`:`<span class="pill warn">未收</span>`}</td><td>${escapeHtml(s.note||"")}</td><td><button class="secondary" data-action="toggle-paid" data-id="${s.id}">${s.paid?"改為未收":"標記已收"}</button></td></tr>`).join("")||`<tr><td colspan="6" class="empty">沒有符合的紀錄</td></tr>`}</tbody></table></div>`;
}
function memberOptions(selected){ return state.contacts.filter(c=>!c.anonymized_at).sort((a,b)=>a.name.localeCompare(b.name,"zh-Hant")).map(c=>`<option value="${c.id}" ${c.id===selected?"selected":""}>${escapeHtml(c.name)}・${escapeHtml(regionName(c.region_id))}・${escapeHtml(String(c.phone||"").slice(-3))}</option>`).join(""); }
function itemDatalist(){ return `<datalist id="sponsorItems">${[...new Set((state.sponsorships||[]).map(s=>s.item))].map(i=>`<option value="${escapeHtml(i)}">`).join("")}</datalist>`; }
function sponsorForm(contactId){
  if(!isAdmin())return;
  modal(`<h2>新增贊助紀錄</h2><form id="sponsorForm"><div class="form-grid">
    <div class="field full"><label>會員 *</label><select name="contact_id" required>${memberOptions(contactId)}</select></div>
    <div class="field"><label>項目 *</label><input name="item" required maxlength="60" list="sponsorItems" placeholder="例如：2026 清明">${itemDatalist()}</div>
    <div class="field"><label>金額（元）*</label><input name="amount" type="number" min="0" max="10000000" required value="200"></div>
    <label class="field"><span><input type="checkbox" name="paid"> 已收款</span></label>
    <div class="field"><label>收款日期</label><input name="paid_at" type="date"></div>
    <div class="field full"><label>備註</label><input name="note" maxlength="500"></div>
    <button class="field full">儲存</button></div></form>`);
}
function batchSponsorForm(){
  if(!isAdmin())return;
  modal(`<h2>批次建立贊助紀錄</h2><p class="muted">例如每年清明，替指定區域的每位會員各建一筆「未收」，收到款後再逐筆標記已收。已經有同一項目的會員會略過。</p><form id="batchSponsorForm"><div class="form-grid">
    <div class="field"><label>項目 *</label><input name="item" required maxlength="60" list="sponsorItems" placeholder="例如：2026 清明">${itemDatalist()}</div>
    <div class="field"><label>每人金額（元）*</label><input name="amount" type="number" min="0" max="10000000" required value="200"></div>
    <div class="field full"><label>對象</label><select name="region_id"><option value="">全部會員</option>${regionOptions(null)}</select></div>
    <button class="field full">建立</button></div></form>`);
}
async function insertSponsorships(rows){
  if(live){ const {error}=await supabase.from("sponsorships").insert(rows); if(error){ toast("儲存失敗："+error.message); return false; } const {data}=await supabase.from("sponsorships").select("*").order("created_at",{ascending:false}); state.sponsorships=data||[]; }
  else { state.sponsorships=state.sponsorships||[]; state.sponsorships.push(...rows.map(r=>({id:crypto.randomUUID(),...r}))); }
  return true;
}
async function saveSponsor(data){
  const row={contact_id:data.contact_id,item:data.item.trim(),amount:Number(data.amount),paid:data.paid==="on",paid_at:data.paid==="on"?(data.paid_at||new Date().toISOString().slice(0,10)):null,note:data.note||""};
  if(!(await insertSponsorships([row])))return;
  audit("新增贊助紀錄",`${contactLabel(row.contact_id)} ${row.item}`); persist(); closeModal(); render(); toast("已新增贊助紀錄");
}
async function saveBatchSponsor(data){
  const item=data.item.trim(); const has=new Set((state.sponsorships||[]).filter(s=>s.item===item).map(s=>s.contact_id));
  const targets=state.contacts.filter(c=>!c.anonymized_at&&(!data.region_id||c.region_id===data.region_id)&&!has.has(c.id));
  if(!targets.length)return toast("沒有需要建立的對象");
  if(!confirm(`將替 ${targets.length} 位會員建立「${item}」NT$${Number(data.amount)} 的未收紀錄，確定嗎？`))return;
  if(!(await insertSponsorships(targets.map(c=>({contact_id:c.id,item,amount:Number(data.amount),paid:false,paid_at:null,note:""})))))return;
  audit("批次建立贊助紀錄",`${item} × ${targets.length}`); persist(); closeModal(); location.hash=`sponsors?item=${encodeURIComponent(item)}`; render(); toast(`已建立 ${targets.length} 筆`);
}
async function togglePaid(id){
  const s=(state.sponsorships||[]).find(x=>x.id===id); if(!s||!isAdmin())return;
  const next={paid:!s.paid,paid_at:!s.paid?new Date().toISOString().slice(0,10):null};
  if(live){ const {error}=await supabase.from("sponsorships").update(next).eq("id",id); if(error)return toast("更新失敗："+error.message); }
  Object.assign(s,next); audit(next.paid?"贊助標記已收":"贊助改為未收",`${contactLabel(s.contact_id)} ${s.item}`); persist(); render();
}
function exportSponsors(){
  const rows=(state.sponsorships||[]).map(s=>({...s,member:contactLabel(s.contact_id),status:s.paid?"已收":"未收"}));
  download("贊助紀錄.csv",rowsToCsv(rows,[["會員","member"],["項目","item"],["金額","amount"],["狀態","status"],["收款日期","paid_at"],["備註","note"]]),"text/csv;charset=utf-8");
}

function login(){ return `${pageHead("工作人員登入","只有經總管理開通的帳號能查看 CRM。")}
  <article class="card" style="max-width:460px;margin:auto"><form id="loginForm"><div class="field"><label>Email</label><input type="email" name="email" required autocomplete="username"></div><div class="field" style="margin-top:12px"><label>密碼</label><input type="password" name="password" required autocomplete="current-password"></div><button style="margin-top:16px;width:100%">登入</button></form>
  <p style="text-align:center;margin:14px 0 0"><button class="link" data-action="forgot-password">忘記密碼？</button></p></article>`; }

async function onClick(event){
  const btn=event.target.closest("[data-action]");
  if(!btn){ if(event.target.id==="contactSearch"||event.target.id==="checkinSearch")return; return; }
  const action=btn.dataset.action;
  if(action==="close-modal") return closeModal();
  if(action==="logout"){ await supabase?.auth.signOut(); location.hash="login"; return location.reload(); }
  if(action==="edit-event"){ event.preventDefault(); return eventForm(btn.dataset.id); }
  if(action==="forgot-password") return forgotPassword();
  if(action==="copy-link"){ const el=$("#linkText"); el.select(); try{ await navigator.clipboard.writeText(el.value); toast("已複製"); }catch{ document.execCommand("copy"); toast("已複製"); } return; }
  if(action==="staff-edit") return staffEditForm(btn.dataset.id);
  if(action==="staff-reset"){ const s=(state.staffList||[]).find(x=>x.user_id===btn.dataset.id); const res=s?.invited_pending?await callStaff("invite",{email:s.email,display_name:s.display_name,role:s.role,region_id:s.region_id}):await callStaff("reset",{user_id:btn.dataset.id}); if(res.error&&s?.invited_pending){ const again=await callStaff("reset",{user_id:btn.dataset.id}); if(again.error) return toast(again.error); return showLinkModal("邀請連結（重新產生）",again.email,again.link); } if(res.error) return toast(res.error); return showLinkModal(s?.invited_pending?"邀請連結（重新產生）":"重設密碼連結",res.email,res.link); }
  if(action==="invite-user") return modal(`<h2>邀請工作人員</h2><p class="muted">建立後會產生一條邀請連結，請用 LINE 傳給對方；對方點開自己設定密碼。</p><form id="inviteForm"><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field"><label>顯示名稱</label><input name="display_name" required></div><div class="field"><label>權限</label><select name="role"><option value="region_lead">區負責人</option><option value="event_staff">活動幹部</option><option value="admin">總管理</option></select></div><div class="field"><label>負責區域（區負責人必填）</label><select name="region_id">${regionOptions(null)}</select></div><button style="margin-top:12px">建立並產生邀請連結</button></form>`);
  if(action==="view-contact") return viewContact(btn.dataset.id);
  if(action==="import-template") return download("會員名冊範本.csv",IMPORT_FIELDS.map(([,label])=>label).join(",")+"\r\n王小美,0912345678,女,51/03/18,北區,台北市大安區和平東路一段 1 號,may@example.com,,清明法會志工","text/csv;charset=utf-8");
  if(action==="import-run") return runImport();
  if(action==="import-reset"){ importState=null; return render(); }
  if(action==="import-errors") return downloadImportErrors();
  if(action==="new-sponsor") return sponsorForm(btn.dataset.contact);
  if(action==="batch-sponsor") return batchSponsorForm();
  if(action==="toggle-paid") return togglePaid(btn.dataset.id);
  if(action==="export-sponsors") return exportSponsors();
  if(action==="show-qr") return showCheckinQr(btn.dataset.event);
  if(action==="renew-qr"){ if(!confirm("重新產生後，已經發出去的舊 QR Code 會立刻不能用。確定嗎？"))return; return showCheckinQr(btn.dataset.event,{renew:true}); }
  if(action==="download-qr") return download("報到QRCode.svg",$(".qr-big").innerHTML,"image/svg+xml");
  if(action==="edit-contact") return contactForm(btn.dataset.id);
  if(action==="reveal-nid") return revealNationalId(btn.dataset.id);
  if(action==="toggle-checkin") return toggleCheckin(btn.dataset.id);
  // 匯出檔不含身分證：檔案一旦被轉寄就無法收回。
  if(action==="export-contacts") return download("會員資料.csv",toCsv(myContacts().map(c=>({...c,region_name:c.region_name||regionName(c.region_id),age:c.age??ageFrom(c.birth_date)})),[["姓名","name"],["LINE 名稱","display_name"],["性別","gender"],["出生年月日","birth_date"],["年齡","age"],["區域","region_name"],["手機","phone"],["Email","email"],["地址","address"],["備註","notes"],["最後互動","last_interaction_at"]]),"text/csv;charset=utf-8");
  if(action==="backup"){
    if(live){const {data,error}=await supabase.functions.invoke("export-backup",{body:{}});if(error)return toast(error.message);return download(`crm-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2),"application/json");}
    return download(`crm-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(state,null,2),"application/json");
  }
  if(action==="preview-anonymize") return previewAnonymize();
  if(action==="new-campaign") return modal(`<h2>新增 LINE 訊息草稿</h2><form id="campaignForm"><div class="field"><label>草稿名稱</label><input name="name" required></div><div class="field"><label>關聯活動</label><select name="event_id">${state.events.map(e=>`<option value="${e.id}">${escapeHtml(e.title)}</option>`).join("")}</select></div><div class="field"><label>訊息內容</label><textarea name="body" required maxlength="500"></textarea></div><button>儲存草稿</button></form>`);
  if(action==="review-campaign") return reviewCampaign(btn.dataset.id);
  if(action==="cancel-registration") return cancelRegistration(btn.dataset.event);
}

document.addEventListener("input",event=>{
  if(event.target.id==="contactSearch"||event.target.id==="checkinSearch"){
    const value=event.target.value.toLowerCase().trim();
    document.querySelectorAll("[data-search]").forEach(row=>row.hidden=!row.dataset.search.includes(value));
  }
});
document.addEventListener("change",event=>{
  if(event.target.id==="eventSwitch")location.hash=`checkin?event=${event.target.value}`;
  if(event.target.id==="regionFilter")location.hash=event.target.value?`contacts?region=${event.target.value}`:"contacts";
  if(event.target.id==="demoUser")switchDemoUser(event.target.value);
  if(event.target.id==="importFile")readImportFile(event.target.files[0]);
  if(event.target.dataset.mapField){ importState.map[event.target.dataset.mapField]=event.target.value===""?undefined:Number(event.target.value); render(); }
  if(event.target.id==="sponsorItemFilter"||event.target.id==="sponsorPaidFilter"){ const p=new URLSearchParams(); const i=$("#sponsorItemFilter").value, pd=$("#sponsorPaidFilter").value; if(i)p.set("item",i); if(pd)p.set("paid",pd); location.hash="sponsors"+(p.toString()?"?"+p:""); }
  if(event.target.id==="demoLine"){ state.demoLine=event.target.value==="new"?`Unew${Date.now()}`:event.target.value; persist(); render(); }
});

async function onSubmit(event){
  if(!["eventForm","campaignForm","registrationForm","loginForm","anonymizeForm","inviteForm","contactForm","signupForm","sponsorForm","batchSponsorForm","setPasswordForm","forgotForm","staffEditForm"].includes(event.target.id))return;
  event.preventDefault(); const data=Object.fromEntries(new FormData(event.target));
  if(event.target.id==="contactForm") return saveContact(data);
  if(event.target.id==="signupForm") return submitSignup(data);
  if(event.target.id==="sponsorForm") return saveSponsor(data);
  if(event.target.id==="batchSponsorForm") return saveBatchSponsor(data);
  if(event.target.id==="eventForm") return saveEvent(data);
  if(event.target.id==="campaignForm"){
    const count=eligibleForEvent(data.event_id).length;
    if(live){ const {error}=await supabase.from("message_campaigns").insert({...data,status:"draft",eligible_count:count}); if(error)return toast(error.message); await loadLiveData(); }
    else state.campaigns.push({id:crypto.randomUUID(),...data,status:"draft",eligible_count:count,success_count:0,failed_count:0});
    audit("建立訊息草稿",data.name);persist();closeModal();render();toast("草稿已儲存，尚未發送");
  }
  if(event.target.id==="registrationForm") return submitRegistration(data);
  if(event.target.id==="loginForm"){
    const {error}=await supabase.auth.signInWithPassword(data); if(error)return toast("登入失敗，請確認帳號與密碼"); await loadLiveData();
    if(state.role==="none"){ await supabase.auth.signOut(); return toast("這個帳號尚未開通工作人員權限，請洽總管理"); }
    location.hash="dashboard";
  }
  if(event.target.id==="anonymizeForm") return executeAnonymize(data.confirmText);
  if(event.target.id==="setPasswordForm") return savePassword(data);
  if(event.target.id==="forgotForm") return sendResetEmail(data);
  if(event.target.id==="staffEditForm"){ const res=await callStaff("update",{user_id:data.user_id,role:data.role,region_id:data.region_id||null,active:data.active==="on"}); if(res.error) return toast(res.error); closeModal(); audit("修改工作人員",data.user_id); persist(); render(); return toast("已更新"); }
  if(event.target.id==="inviteForm"){
    if(data.role==="region_lead"&&!data.region_id) return toast("區負責人必須指定區域");
    const res=await callStaff("invite",{...data,region_id:data.role==="region_lead"?data.region_id:null});
    if(res.error) return toast(res.error);
    audit("邀請工作人員",data.email); persist(); render(); showLinkModal("邀請連結",res.email,res.link);
  }
}

async function submitRegistration(data){
  if(live){
    if(!lineReady()) return toast(LINE_NOT_READY);
    try{ await liffReady; if(!window.liff.isLoggedIn())return window.liff.login(); const idToken=window.liff.getIDToken(); const res=await fetch(`${config.supabaseUrl}/functions/v1/line-auth`,{method:"POST",headers:{"Content-Type":"application/json","apikey":config.supabasePublishableKey},body:JSON.stringify({...data,idToken,marketing:data.marketing==="on"})}); const body=await res.json(); if(!res.ok)throw new Error(body.error||"報名失敗"); }
    catch(error){return toast(error.message);}
  } else {
    // 展示：以目前選定的學員 LINE 身分報名，和雲端一樣「同一個 LINE＝同一位會員」
    let contact=state.contacts.find(c=>c.line_user_id===state.demoLine);
    if(contact) Object.assign(contact,{name:data.name,phone:data.phone,email:data.email||contact.email,marketing_consent:data.marketing==="on",last_interaction_at:new Date().toISOString()});
    else { contact={id:crypto.randomUUID(),name:data.name,display_name:"LINE 新朋友",phone:data.phone,email:data.email,gender:null,birth_date:null,region_id:null,address:"",national_id:"",notes:"",line_user_id:state.demoLine,line_status:"active",marketing_consent:data.marketing==="on",tags:[data.interest],last_interaction_at:new Date().toISOString(),created_at:new Date().toISOString()}; state.contacts.push(contact); }
    const existing=state.registrations.find(r=>r.event_id===data.event_id&&r.contact_id===contact.id); const e=state.events.find(x=>x.id===data.event_id);
    if(existing&&!existing.cancelled_at) return toast("你已經報名過這場活動");
    if(existing) Object.assign(existing,{attendance_status:"registered",cancelled_at:null,registered_at:new Date().toISOString()});
    else state.registrations.push({id:crypto.randomUUID(),event_id:data.event_id,contact_id:contact.id,attendance_status:"registered",payment_status:"pending",registered_at:new Date().toISOString(),cancelled_at:null});
    e.registration_count++;
  }
  persist(); $("#app").innerHTML=`<article class="card" style="max-width:560px;margin:40px auto;text-align:center"><h1>報名完成</h1><p>我們已收到你的資料，活動前會透過 LINE 提醒你。</p><div class="actions" style="justify-content:center"><a class="button" href="#me">看我的活動</a><a class="button secondary" href="#register?event=${data.event_id}">回到活動頁</a></div></article>`;
}

async function cancelRegistration(eventId){
  if(!live){
    const contact=state.contacts.find(c=>c.line_user_id===state.demoLine);
    const reg=contact&&state.registrations.find(r=>r.event_id===eventId&&r.contact_id===contact.id&&!r.cancelled_at);
    if(!reg)return toast("找不到可取消的報名");
    reg.cancelled_at=new Date().toISOString();reg.attendance_status="cancelled";
    const e=state.events.find(x=>x.id===eventId); if(e&&e.registration_count>0)e.registration_count--;persist();toast("已取消報名");render();return;
  }
  try{
    if(!lineReady()) return toast(LINE_NOT_READY);
    await liffReady;if(!window.liff.isLoggedIn())return window.liff.login();
    const res=await fetch(`${config.supabaseUrl}/functions/v1/line-auth`,{method:"POST",headers:{"Content-Type":"application/json",apikey:config.supabasePublishableKey},body:JSON.stringify({action:"cancel",event_id:eventId,idToken:window.liff.getIDToken()})});
    const body=await res.json();if(!res.ok)throw new Error(body.error||"取消失敗");toast("已取消報名");
  }catch(error){toast(error.message);}
}

async function previewAnonymize(){
  let count=0;
  if(live){const {data,error}=await supabase.functions.invoke("anonymize-contacts",{body:{mode:"preview"}});if(error)return toast(error.message);count=data.count;}
  else count=state.contacts.filter(c=>!c.anonymized_at&&new Date(c.last_interaction_at)<new Date(Date.now()-730*864e5)).length;
  modal(`<h2>匿名化預覽</h2><p>符合條件：${count} 位。</p>${count?`<form id="anonymizeForm"><div class="field"><label>輸入「匿名化且無法還原」</label><input name="confirmText" required></div><button class="danger">執行匿名化</button></form>`:`<button value="cancel">關閉</button>`}`);
}

async function executeAnonymize(confirmText){
  if(confirmText!=="匿名化且無法還原")return toast("確認文字不符");
  if(live){const {data,error}=await supabase.functions.invoke("anonymize-contacts",{body:{mode:"execute",confirmText}});if(error)return toast(error.message);closeModal();await loadLiveData();render();return toast(`已匿名化 ${data.count} 位`);}
  const old=state.contacts.filter(c=>!c.anonymized_at&&new Date(c.last_interaction_at)<new Date(Date.now()-730*864e5));
  old.forEach(c=>Object.assign(c,{line_user_id:null,display_name:"",name:"匿名會員",phone:null,email:null,marketing_consent:false,line_status:"unknown",anonymized_at:new Date().toISOString()}));
  persist();closeModal();render();toast(`已匿名化 ${old.length} 位`);
}

async function toggleCheckin(id){
  const reg=roster().find(r=>r.id===id); if(!reg)return toast("你沒有權限處理這位會員的報到");
  const next=reg.attendance_status==="attended"?"registered":"attended";
  if(live){ const {error}=await supabase.rpc("set_attendance",{p_registration_id:id,p_attended:next==="attended"}); if(error)return toast(error.message.includes("FORBIDDEN")?"你沒有權限處理這位會員的報到":error.message); await loadLiveData(); }
  else Object.assign(state.registrations.find(r=>r.id===id),{attendance_status:next,checked_in_at:next==="attended"?new Date().toISOString():null});
  audit(next==="attended"?"完成報到":"取消報到",reg.name);persist();render();toast(next==="attended"?"已完成報到":"已取消報到");
}
function eligibleForEvent(eventId){ const ids=new Set(state.registrations.filter(r=>r.event_id===eventId&&!r.cancelled_at).map(r=>r.contact_id)); return state.contacts.filter(c=>ids.has(c.id)&&campaignEligible(c)); }
function reviewCampaign(id){ const c=state.campaigns.find(x=>x.id===id); const people=eligibleForEvent(c.event_id); modal(`<h2>最後確認</h2><div class="notice">即將發送給 <strong>${people.length}</strong> 位已同意且可聯絡的 LINE 好友。</div><p><strong>${escapeHtml(c.name)}</strong></p><p>${escapeHtml(c.body)}</p><form id="sendCampaignForm"><button type="button" data-send-id="${c.id}" id="confirmSend">確認送出</button> <button class="secondary" value="cancel">返回修改</button></form>`); $("#confirmSend").onclick=()=>sendCampaign(c,people); }
async function sendCampaign(c,people){
  $("#confirmSend").disabled=true;
  if(live){ const {data,error}=await supabase.functions.invoke("send-campaign",{body:{campaignId:c.id}}); if(error){$("#confirmSend").disabled=false;return toast(error.message);} c.success_count=data.success;c.failed_count=data.failed; }
  else { c.success_count=people.length;c.failed_count=0;c.status="sent"; }
  audit("確認並發送 LINE 訊息",c.name);persist();closeModal();render();toast(`已完成：成功 ${c.success_count}、失敗 ${c.failed_count}`);
}
function audit(action,target){ state.audit.unshift({at:new Date().toLocaleString("zh-TW"),actor:state.staff?.find(s=>s.id===state.as)?.display_name||"工作人員",action,target}); }
function download(name,content,type){ const blob=new Blob([type.startsWith("text/csv")?"\ufeff"+content:content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);audit("匯出資料",name);persist();toast(`已下載 ${name}`); }

boot();
