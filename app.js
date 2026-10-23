import { ROLE_LABELS, GENDERS, CITIES, visibleContact, eventState, eventSessions, seriesOf, eventLabel, campaignEligible, toCsv, dashboardStats, ageFrom, maskNationalId, isValidNationalId, scopeContacts, scopeRegistrations, canManageEvents, canBrowseMembers, rosterFor, checkinWindow, checkinProblem, findLegacyContact, ATTENDANCE_LABELS, IMPORT_FIELDS, guessColumns, prepareImportRow, sponsorshipSummary, toCsv as rowsToCsv, COUNTRY_CODES, normalizePhone, displayPhone, splitPhone, outdoorLeadTags, snsAttribution, eventTagsAfterCheckin, checkProfile, historyStatus, studentAuthEmail, checkNewPassword } from "./lib.js?v=20261023-13";

const config = window.CRM_CONFIG || {};
const live = !config.demoMode && config.supabaseUrl && config.supabasePublishableKey;
const supabase = live ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { flowType: "implicit", detectSessionInUrl: true } }) : null;
const SITE_BASE = (config.siteUrl || location.origin).replace(/\/$/, "");
// 網址分流：/admin/ 是工作人員後台；根目錄是學員前台（活動清單、報名、我的活動、報到）
const IS_ADMIN = /\/admin(\/|\/index\.html)?$/.test(location.pathname);
const STUDENT_HOME = new URL(IS_ADMIN ? "../" : "./", location.origin + location.pathname).href;
const ADMIN_HOME = STUDENT_HOME + "admin/";
const liffReady = live && config.liffId ? window.liff.init({ liffId: config.liffId }) : Promise.resolve();
const $ = selector => document.querySelector(selector);
// 雲端模式但 LIFF 尚未設定時，學員端的 LINE 功能先顯示說明，不要直接出錯。
const LINE_NOT_READY = "LINE 登入尚未開放，請洽協會工作人員。";
const lineReady = () => !live || Boolean(config.liffId);
// LINE 登入會離開本站：回來的網址指定為目前這頁，並記下 # 後面的頁面以防被丟掉。
// 報名表的資料也先存在這個分頁，登入回來後回到同一個報名頁並自動送出。
const REG_DRAFT_KEY = "chaoren-reg-draft";
function lineLogin(draft){
  try{ sessionStorage.setItem(REG_DRAFT_KEY,JSON.stringify({...draft,hash:location.hash,at:Date.now()})); }catch{}
  if(window.liff.isInClient()) return location.reload(); // LINE App 內重新開啟就會拿到新的 ID Token
  if(window.liff.isLoggedIn()) window.liff.logout(); // ID Token 過期時要先登出，login 才會真的重新登入
  window.liff.login({redirectUri:location.href});
}
// 一般瀏覽器會記住 LINE 登入，但 ID Token 約一小時過期且不會自動換新，後端會回「LINE 身分驗證失敗」。
// 過期（或一分鐘內要過期）就當作沒登入，重新登入拿新的。
function lineSignedIn(){
  if(!window.liff.isLoggedIn()) return false;
  const token=window.liff.getDecodedIDToken();
  return Boolean(token&&token.exp*1000>Date.now()+60e3);
}
function readRegDraft(){
  try{ const d=JSON.parse(sessionStorage.getItem(REG_DRAFT_KEY)||"null"); return d&&Date.now()-d.at<30*60e3?d:null; }catch{ return null; }
}
function clearRegDraft(){ try{ sessionStorage.removeItem(REG_DRAFT_KEY); }catch{} }

const SEED_VERSION = 9;
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
    { id:"c1", member_no:"T0001", name:"王小美", display_name:"May", phone:"+886912345678", email:"may@example.com", gender:"女", birth_date:"1962-03-18", region_id:"north", residence_city:"臺北市", address:"台北市大安區和平東路一段 1 號", national_id:"A223456781", notes:"清明法會固定志工", line_user_id:"Udemo01", line_status:"active", marketing_consent:true, tags:["閱讀","睡眠"], last_interaction_at:"2026-10-15", created_at:"2026-10-01" },
    { id:"c2", member_no:"T0002", name:"陳志明", display_name:"Jim", phone:"+886987654321", email:"jim@example.com", gender:"男", birth_date:"1958-11-02", region_id:"north", residence_city:"新北市", address:"新北市板橋區文化路二段 2 號", national_id:"F123456782", notes:"", line_user_id:"Udemo02", line_status:"active", marketing_consent:true, tags:["冥想"], last_interaction_at:"2026-10-12", created_at:"2026-10-05" },
    { id:"c3", member_no:"T0003", name:"林雅婷", display_name:"Ting", phone:"+886922111222", email:"ting@example.com", gender:"女", birth_date:"1975-07-21", region_id:"central", residence_city:"臺中市", address:"台中市西區公益路 3 號", national_id:"B223456783", notes:"行動不便，需安排座位", line_user_id:"Udemo03", line_status:"blocked", marketing_consent:true, tags:["閱讀"], last_interaction_at:"2026-10-08", created_at:"2026-10-08" },
    { id:"c4", member_no:"T0004", name:"周文豪", display_name:"Howard", phone:"+886933000111", email:"howard@example.com", gender:"男", birth_date:"1949-01-30", region_id:"south", residence_city:"高雄市", address:"高雄市苓雅區四維三路 4 號", national_id:"E123456784", notes:"", line_user_id:"Udemo04", line_status:"active", marketing_consent:false, tags:["冥想"], last_interaction_at:"2026-10-10", created_at:"2026-10-10" },
    { id:"c5", member_no:"T0005", name:"黃淑芬", display_name:"Fen", phone:"+886955666777", email:"", gender:"女", birth_date:"1968-09-09", region_id:null, address:"", national_id:"", notes:"舊名冊匯入，尚未分區", line_user_id:null, line_status:"unknown", marketing_consent:false, tags:[], last_interaction_at:"2026-09-30", created_at:"2026-09-30" }
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
// 展示模式配發下一個會員編號（雲端由資料庫自動配發）
function nextMemberNo(){ const max=Math.max(0,...state.contacts.map(c=>Number(String(c.member_no||"").replace(/\D/g,""))||0)); const n=max+1; return "T"+String(n).padStart(4,"0"); }
function viewer(){ return {role:state.role,region_id:state.region_id}; }
function isAdmin(){ return state.role==="admin"; }
function regionName(id){ return state.regions?.find(r=>r.id===id)?.name||"未分區"; }
function myContacts(){ return scopeContacts(state.contacts,viewer()); }
function myRegistrations(){ return scopeRegistrations(state.registrations,state.contacts,viewer()); }
function canEvents(){ return canManageEvents(state.role); }
// 報名名單：雲端由 event_roster view 決定範圍；展示版用同一規則（lib.rosterFor）。
function roster(){ return live ? (state.roster||[]).map(r=>({...r,id:r.registration_id})) : rosterFor(state.registrations,state.contacts,viewer(),regionName); }
const ADMIN_ONLY_ROUTES=["messages","governance","users","import","sponsors","applications"];
// 學員看的頁面：不顯示後台選單，資料只走 LINE 身分。
const STUDENT_ROUTES=["me","scan","signin","activate","apply"];
// 學員前台只開放這些頁面，其他頁面一律轉到 /admin/
const PUBLIC_ROUTES=["register",...STUDENT_ROUTES];
// 對外分享的報名網址一律指向學員前台，工作人員在後台打開報名頁也一樣
const publicUrl=(hash=location.hash)=>STUDENT_HOME+hash;
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
function modal(html){ $("#modalBody").innerHTML=html; $("#modalBody").scrollTop=0; $("#modal").showModal(); }
// 點視窗外的暗色區域也能關閉（點擊目標是 dialog 本身時，代表點在 backdrop 上）
document.getElementById("modal").addEventListener("click",event=>{ if(event.target.id==="modal") closeModal(); });
function closeModal(){ $("#modal").close(); }
function route(){ return (location.hash.slice(1).split("?")[0] || (IS_ADMIN?"dashboard":"register")); }
function query(){ return new URLSearchParams(location.hash.split("?")[1] || ""); }
// 手機欄位：國碼下拉＋號碼。存檔時用 readPhone 組成國際格式（+886912345678）。
function phoneField(label,value="",{required=false,autocomplete=""}={}){
  const {code,local}=splitPhone(value||"");
  const options=COUNTRY_CODES.map(([c,text])=>`<option value="${c}" ${c===code?"selected":""}>${text}</option>`).join("")+`<option value="other" ${code==="other"?"selected":""}>其他（號碼請以 + 開頭）</option>`;
  return `<div class="field"><label>${label}${required?" *":""}</label><div class="phone-input"><select name="phone_code" aria-label="國碼">${options}</select><input name="phone" inputmode="tel" ${required?"required":""} ${autocomplete?`autocomplete="${autocomplete}"`:""} placeholder="912345678" value="${escapeHtml(local)}"></div></div>`;
}
function readPhone(data){
  if(!String(data.phone||"").trim()) return {phone:null};
  const code=data.phone_code==="other"?"":data.phone_code||"886";
  const raw=String(data.phone).trim();
  if(!code&&!raw.startsWith("+")) return {error:"選「其他」時，請輸入 + 開頭的完整號碼，例如 +639171234567"};
  const phone=normalizePhone(raw,code||"886");
  return phone?{phone}:{error:code==="886"?"台灣手機請輸入 09 開頭的 10 碼":"手機號碼格式不正確，請確認國碼與號碼"};
}
const showPhone=v=>!v?"":String(v).includes("*")?v:displayPhone(v);

function pageHead(title,subtitle,actions=""){ return `<section class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="actions">${actions}</div></section>`; }

async function boot(){
  $("#modeBadge").textContent=live?"已連雲端":"展示模式"; $("#modeBadge").hidden=live&&!IS_ADMIN;
  // LINE 登入回來時網址的 # 可能被丟掉，用存下來的報名頁補回來
  const draft=live&&readRegDraft();
  if(draft&&!location.hash) history.replaceState(null,"",location.pathname+location.search+draft.hash);
  if(draft&&!draft.data) clearRegDraft();
  // 從 liff.line.me/… 進來時，真正的頁面（例如 #me、#scan）放在 liff.state，要等 LIFF 初始化把網址還原後再判斷路由
  if(live && new URLSearchParams(location.search).has("liff.state")) { try { await liffReady; } catch {} }
  // 走錯邊就換邊：舊書籤（#dashboard 等）到後台；學員的「我的活動」「報到」回前台
  if(!IS_ADMIN&&!PUBLIC_ROUTES.includes(route())) return location.replace(ADMIN_HOME+location.search+location.hash);
  if(IS_ADMIN&&STUDENT_ROUTES.includes(route())) return location.replace(publicUrl());
  if(live && !IS_ADMIN){ if(route()==="register") await loadPublicEvent(); else state.role="public"; }
  else if(live && await handleAuthLink()) { /* 已切到設定密碼頁或顯示錯誤 */ }
  else if(live){
    // 後台的報名頁只給工作人員看；學員拿到這種網址，送回前台的同一個報名頁
    const hash=location.hash; await loadLiveData();
    if(hash.startsWith("#register")&&!STAFF_ROLES.includes(state.role)) return location.replace(publicUrl(hash));
  }
  else {
    if(IS_ADMIN) document.querySelectorAll("[data-demo-only]").forEach(el=>el.hidden=false);
    const picker=$("#demoUser"); picker.hidden=!IS_ADMIN;
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
  // 總管理產生的連結只帶 token_hash：要等本人按下按鈕才兌換，避免 LINE 預覽機器人先把一次性連結用掉。
  if(search.get("th")&&["invite","recovery"].includes(search.get("type"))){ state.pendingLink={token_hash:search.get("th"),type:search.get("type")}; state.role="link-pending"; return true; }
  if(linkError){ state.authNotice="這個連結已失效或已經使用過，請總管理重新產生一次。"; return true; }
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) state.authNotice="這個連結已失效或已經使用過，請總管理重新產生一次。";
  else { state.authEmail=session.user.email; state.role="setting-password"; }
  return true;
}

async function loadPublicEvent(){
  // 載入所有公開活動：連結裡的活動找不到時，至少能列出目前可報名的活動，不讓學員卡在死路
  const {data}=await supabase.from("public_events").select("*").order("starts_at");
  state={role:"public",eventsLoaded:true,region_id:null,regions:[],staff:[],events:data||[],contacts:[],registrations:[],campaigns:[],audit:[]};
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
  const applications = profile.data?.role === "admin" ? await supabase.from("student_applications").select("*").eq("status","pending").order("created_at") : {data:[]};
  state={role:profile.data?.role||"none",eventsLoaded:true,region_id:profile.data?.region_id||null,regions:regions.data||[],staff:staff.data||[],sponsorships:sponsorships.data||[],applications:applications.data||[],events:events.data||[],contacts:contacts.data||[],registrations:registrations.data||[],roster:rosterRows.data||[],campaigns:campaigns.data||[],audit:(audit.data||[]).map(x=>({at:x.created_at,actor:"工作人員",action:x.action,target:`${x.target_type}:${x.target_id||""}`}))};
  showUser(profile.data?.display_name||session.user.email);
  $("#logoutBtn").hidden=state.role==="none";
}

function render(){
  const name=route();
  if(!IS_ADMIN&&!PUBLIC_ROUTES.includes(name)){ location.replace(ADMIN_HOME+location.hash); return; }
  if(IS_ADMIN&&(STUDENT_ROUTES.includes(name)||live&&name==="register"&&!STAFF_ROLES.includes(state.role))){ location.replace(publicUrl()); return; }
  if(state.role!=="public"&&((ADMIN_ONLY_ROUTES.includes(name)&&!isAdmin())||(name==="contacts"&&!canBrowseMembers(state.role)))){ location.hash="dashboard"; return; }
  // 雲端模式未登入（或帳號未開通）：只能看登入頁與學員頁，後台選單整個藏起來。
  // 未登入、設定密碼中、或是學員（public）：都不顯示工作人員選單；學員前台永遠不顯示
  const signedOut=!IS_ADMIN||live&&["none","setting-password","link-pending","public"].includes(state.role);
  if(signedOut&&!["login","register","set-password",...STUDENT_ROUTES].includes(name)){ location.hash="login"; return; }
  document.body.classList.toggle("signed-out",signedOut);
  document.body.classList.toggle("student-view",STUDENT_ROUTES.includes(name));
  const appLink=document.querySelector('.sidebar a[data-route="applications"]'); if(appLink) appLink.textContent=`待開通${(state.applications||[]).length?`（${state.applications.length}）`:""}`;
  document.querySelectorAll(".sidebar a").forEach(a=>{ a.classList.toggle("active",a.dataset.route===name); if(!a.hasAttribute("data-demo-only"))a.hidden=(ADMIN_ONLY_ROUTES.includes(a.dataset.route)&&!isAdmin())||(a.dataset.route==="contacts"&&!canBrowseMembers(state.role)); });
  // 學員從個人頁點「報名」進來時，報名頁還沒載入過活動資料：先去雲端抓再畫
  // 左上角：學員前台回活動清單，後台回總覽
  $(".brand").setAttribute("href",IS_ADMIN?"#dashboard":"#register");
  // 學員前台右上角的「回首頁」：已經在活動清單就不顯示
  if($("#homeBtn")) $("#homeBtn").hidden=name==="register"&&!query().get("event");
  // 工作人員已有完整活動資料，不能被公開活動資料蓋掉
  if(live&&name==="register"&&!state.eventsLoaded&&!STAFF_ROLES.includes(state.role)){ $("#app").innerHTML="<div class='empty'>載入活動中…</div>"; loadPublicEvent().then(render); return; }
  const views={dashboard,events,contacts,checkin,messages,governance,users,register,login,me,scan,import:importPage,sponsors,"set-password":setPassword,signin,activate,apply,applications};
  $("#app").innerHTML=(views[name]||dashboard)();
  if(name==="me")loadMe();
  if(name==="users")loadStaffList();
  if(name==="scan")runScan();
  if(name==="activate")loadActivate();
  if(name==="register"){ const id=query().get("event")||(live||!IS_ADMIN?"":state.events[0]?.id); if(id&&$("#regAction")&&regMember?.eventId!==id) checkRegisterMember(id); }
  if(name==="register"&&window.qrcode&&$("#qr")){ const code=window.qrcode(0,"M");code.addData(publicUrl());code.make();$("#qr").innerHTML=code.createSvgTag(4,0); }
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
  <section class="grid"><article class="card"><h2>下一場活動</h2>${next?`<h3>${escapeHtml(eventLabel(next))}</h3><p>${fmtDate(next.starts_at)}・${escapeHtml(next.location)}</p><div class="kpi-line"><span>報名</span><strong>${next.registration_count}/${next.capacity}</strong></div><div class="actions"><a class="button" href="#checkin?event=${next.id}">開啟報到</a><a class="button secondary" href="#register?event=${next.id}">查看報名頁</a></div>`:"<p class='muted'>目前沒有未來活動。</p>"}</article>
  <article class="card"><h2>需要注意</h2><div class="kpi-line"><span>待繳費</span><strong>${regs.filter(r=>r.payment_status==="pending"&&!r.cancelled_at).length}</strong></div>${isAdmin()?`<div class="kpi-line"><span><a href="#applications">待開通學員</a></span><strong>${(state.applications||[]).length}</strong></div><div class="kpi-line"><span>待確認訊息</span><strong>${state.campaigns.filter(c=>c.status==="draft").length}</strong></div><div class="kpi-line"><span>尚未分區的會員</span><strong>${unassigned}</strong></div>`:""}${canBrowseMembers(state.role)?`<div class="kpi-line"><span>無法 LINE 聯絡</span><strong>${myContacts().filter(c=>!campaignEligible(c)).length}</strong></div>`:""}</article></section>`;
}

function events(){
  const create=canEvents()?`<button data-action="edit-event">＋ 建立活動</button>`:"";
  return `${pageHead("活動管理","建立活動、查看報名進度並取得公開連結。",create)}<div class="table-wrap"><table><thead><tr><th>活動</th><th>日期</th><th>地點</th><th>報名</th><th>狀態</th><th>操作</th></tr></thead><tbody>${state.events.map(e=>`<tr><td><strong>${escapeHtml(eventLabel(e))}</strong><br><small>${escapeHtml(e.theme)}</small></td><td>${fmtDate(e.starts_at)}</td><td>${escapeHtml(e.location)}</td><td>${e.registration_count}/${e.capacity}</td><td><span class="pill">${eventState(e)}</span></td><td><a href="#events" data-action="event-roster" data-id="${e.id}">名單</a>　<a href="#register?event=${e.id}">報名頁</a>　<a href="#checkin?event=${e.id}">報到</a>${canEvents()?`　<a href="#events" data-action="edit-event" data-id="${e.id}">編輯</a>　<a href="#events" class="danger-link" data-action="delete-event" data-id="${e.id}">刪除</a>`:""}</td></tr>`).join("")}</tbody></table></div>`;
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
  return `${pageHead("會員資料",subtitle,actions)}<div class="toolbar"><input class="search" id="contactSearch" placeholder="搜尋會員編號、姓名、LINE 名稱或標籤" aria-label="搜尋會員">${regionFilter}</div><p class="muted">共 ${rows.length} 位</p><div class="table-wrap"><table><thead><tr><th>編號</th><th>會員</th><th>性別／年齡</th><th>區域</th><th>手機</th><th>標籤</th><th>LINE</th></tr></thead><tbody id="contactRows">${contactRows(rows)||`<tr><td colspan="7" class="empty">沒有符合的會員</td></tr>`}</tbody></table></div>`;
}
// 從舊系統匯入的會員常有幾十個標籤：清單只顯示前 3 個，其餘在詳細頁展開。
function tagPills(tags=[],limit=3){ const shown=tags.slice(0,limit).map(t=>`<span class="pill">${escapeHtml(t)}</span>`).join(" "); return tags.length>limit?`${shown} <span class="pill off">＋${tags.length-limit}</span>`:shown; }
// 活動名單：分「已報到」「已報名、未報到」「已取消」三區；範圍和報到頁一樣（區負責人只看自己區域）
function eventRoster(id){
  const e=state.events.find(x=>x.id===id); if(!e)return;
  const regs=roster().filter(r=>r.event_id===id);
  const attended=regs.filter(r=>!r.cancelled_at&&r.attendance_status==="attended");
  const waiting=regs.filter(r=>!r.cancelled_at&&r.attendance_status!=="attended");
  const cancelled=regs.filter(r=>r.cancelled_at);
  const item=(r,when)=>`<li class="student-item"><div><strong>${escapeHtml(r.name)}</strong> <span class="muted">${escapeHtml(r.member_no||"")}</span><small>${escapeHtml(r.region_name||"未分區")}・手機末三碼 ${escapeHtml(r.phone_last3||"---")}${r.source==="walk-in"?"・現場報名":""}${when?`・${when}`:""}</small></div></li>`;
  const list=(title,rows,when)=>`<h3>${title}（${rows.length}）</h3>${rows.length?`<ul class="student-list">${rows.map(r=>item(r,when(r))).join("")}</ul>`:`<p class="muted">沒有</p>`}`;
  const scope=canEvents()?"":`<p class="muted">只顯示${escapeHtml(regionName(state.region_id))}的會員</p>`;
  modal(`<h2>${escapeHtml(eventLabel(e))}</h2><p class="muted">${fmtDate(e.starts_at)}・${escapeHtml(e.location||"")}・報名 ${attended.length+waiting.length}／${e.capacity}</p>${scope}
    ${list("已報到",attended,r=>r.checked_in_at?`報到 ${fmtDate(r.checked_in_at)}`:"")}
    ${list("已報名、未報到",waiting,r=>r.registered_at?`報名 ${fmtDate(r.registered_at)}`:"")}
    ${cancelled.length?list("已取消",cancelled,r=>r.cancelled_at?`取消 ${fmtDate(r.cancelled_at)}`:""):""}
    <div class="actions" style="margin-top:14px"><a class="button" href="#checkin?event=${e.id}" data-action="close-modal">到報到頁</a><button type="button" class="secondary" data-action="close-modal">關閉</button></div>`);
}
function contactRows(rows){ return rows.map(c=>`<tr class="clickable" data-action="view-contact" data-id="${c.id}" data-search="${escapeHtml([c.member_no,c.name,c.display_name,...(c.tags||[])].join(" ").toLowerCase())}"><td class="member-no">${escapeHtml(c.member_no||"")}</td><td><strong>${escapeHtml(c.name)}</strong><br><small>${escapeHtml(c.display_name)}</small></td><td>${escapeHtml(c.gender||"—")}／${c.age??"—"}</td><td>${escapeHtml(c.region_name||regionName(c.region_id))}</td><td>${escapeHtml(showPhone(c.phone))}</td><td>${tagPills(c.tags)}</td><td><span class="pill ${c.line_status!=="active"?"off":""}">${({active:"可聯絡",blocked:"已封鎖"})[c.line_status]||"未綁定"}</span></td></tr>`).join(""); }

function viewContact(id){
  const raw=myContacts().find(c=>c.id===id); if(!raw)return toast("找不到這位會員，或你沒有權限查看");
  const c=visibleContact(raw,state.role); const age=raw.age??ageFrom(raw.birth_date);
  const history=myRegistrations().filter(r=>r.contact_id===id).map(r=>({...r,event:state.events.find(e=>e.id===r.event_id)}));
  const line=(label,value)=>`<div class="kpi-line"><span>${label}</span><strong>${escapeHtml(value||"—")}</strong></div>`;
  const nid=c.national_id_masked?`${escapeHtml(c.national_id_masked)}${isAdmin()?` <button class="link" data-action="reveal-nid" data-id="${id}">查看</button>`:""}`:"—";
  modal(`<div class="profile-head"><div class="avatar" aria-hidden="true">${escapeHtml((c.name||"?").slice(0,1))}</div><div><h2>${escapeHtml(c.name)}</h2><p class="muted">${raw.line_user_id||raw.line_status==="active"?`已綁定 LINE${c.display_name?`（${escapeHtml(c.display_name)}）`:""}`:"尚未綁定 LINE"}</p></div></div>
    ${line("會員編號",c.member_no)}${line("性別",c.gender)}${line("出生年月日",c.birth_date?`${c.birth_date}（${age} 歲）`:"")}${line("區域",c.region_name||regionName(c.region_id))}${line("居住縣市",c.residence_city)}${line("手機",showPhone(c.phone))}${line("Email",c.email)}${line("地址",c.address)}
    <div class="kpi-line"><span>身分證</span><strong id="nidValue">${nid}</strong></div>${isAdmin()?line("LINE UID",raw.line_user_id||"未綁定"):""}${line("備註",c.notes)}${(raw.tags||[]).length?`<details class="tag-box"><summary>標籤與參加紀錄（${raw.tags.length}）</summary><div>${raw.tags.map(t=>`<span class="pill">${escapeHtml(t)}</span>`).join(" ")}</div></details>`:""}
    <h3>活動與課程</h3>${history.length?`<ul class="plain">${history.map(h=>`<li>${escapeHtml(h.event?.title||"已刪除的活動")}・${({attended:"已參加",registered:"已報名",cancelled:"已取消",absent:"未出席"})[h.attendance_status]||h.attendance_status}</li>`).join("")}</ul>`:`<p class="muted">尚無紀錄</p>`}
    ${isAdmin()?sponsorBlock(id):""}
    ${isAdmin()?`<div class="actions"><button data-action="edit-contact" data-id="${id}">編輯資料</button><button class="secondary" data-action="student-link" data-id="${id}">學員登入連結</button><button class="danger" data-action="delete-contact" data-id="${id}">刪除會員</button></div>`:""}`);
}

// 性別必填（員工表單、學員首次填資料、新人報名表共用）；LINE 一鍵報到與匯入舊名冊不擋，之後再補。
function genderField(selected){ return `<div class="field"><label>性別 *</label><select name="gender" required><option value="">請選擇</option>${GENDERS.map(g=>`<option ${selected===g?"selected":""}>${g}</option>`).join("")}</select></div>`; }
function cityField(selected){ return `<div class="field"><label>居住縣市</label><select name="residence_city"><option value="">未填</option>${CITIES.map(c=>`<option ${selected===c?"selected":""}>${c}</option>`).join("")}</select></div>`; }

function contactForm(id){
  if(!isAdmin())return toast("只有總管理可以修改會員資料");
  const c=id?state.contacts.find(x=>x.id===id):{};
  const v=key=>escapeHtml(c?.[key]||"");
  modal(`<h2>${id?"編輯會員":"新增會員"}</h2><form id="contactForm"><input type="hidden" name="contact_id" value="${id||""}"><div class="form-grid">
    <div class="field"><label>姓名 *</label><input name="name" required maxlength="40" value="${v("name")}"></div>
    ${phoneField("手機",c?.phone||"")}
    ${genderField(c?.gender)}
    <div class="field"><label>出生年月日</label><input name="birth_date" type="date" min="1900-01-01" value="${v("birth_date")}"></div>
    <div class="field"><label>區域</label><select name="region_id">${regionOptions(c?.region_id,{withNone:true})}</select></div>
    ${cityField(c?.residence_city)}
    <div class="field"><label>Email</label><input name="email" type="email" value="${v("email")}"></div>
    <div class="field full"><label>地址</label><input name="address" maxlength="200" value="${v("address")}"></div>
    <div class="field full"><label>身分證字號</label><input name="national_id" maxlength="10" autocomplete="off" placeholder="${c?.national_id_masked||maskNationalId(c?.national_id)||"A123456789"}"><small class="muted">${id?"留空＝不變更；":""}只有總管理看得到完整號碼，存檔後加密保存。</small></div>
    <div class="field full"><label>備註</label><textarea name="notes" maxlength="2000">${v("notes")}</textarea></div>
    <button class="field full">儲存</button></div></form>`);
}

async function saveContact(data){
  if(!GENDERS.includes(data.gender))return toast("請選擇性別");
  const ph=readPhone(data); if(ph.error) return toast(ph.error); data.phone=ph.phone||"";
  const nid=data.national_id.trim().toUpperCase();
  if(nid&&!isValidNationalId(nid))return toast("身分證格式不正確，例如 A123456789");
  const fields={name:data.name.trim(),phone:data.phone,email:data.email,gender:data.gender,birth_date:data.birth_date,region_id:data.region_id||null,residence_city:data.residence_city||null,address:data.address,notes:data.notes};
  if(live){
    const {error}=await supabase.rpc("admin_save_contact",{p_contact_id:data.contact_id||null,p_data:fields,p_national_id:nid||null});
    if(error)return toast(error.message.includes("FORBIDDEN")?"沒有權限":"儲存失敗："+error.message);
    await loadLiveData();
  } else if(data.contact_id){
    const c=state.contacts.find(x=>x.id===data.contact_id); Object.assign(c,fields); if(nid)c.national_id=nid;
    const em=String(c.email||"").toLowerCase(); if(em) state.staff.filter(x=>String(x.email||"").toLowerCase()===em).forEach(x=>x.display_name=c.name);
  } else {
    state.contacts.push({id:crypto.randomUUID(),member_no:nextMemberNo(),...fields,national_id:nid,display_name:"",line_user_id:null,line_status:"unknown",marketing_consent:false,tags:[],last_interaction_at:new Date().toISOString(),created_at:new Date().toISOString()});
  }
  audit(data.contact_id?"修改會員資料":"新增會員",fields.name+(nid?"（含身分證）":"")); persist(); closeModal(); render(); toast("會員資料已儲存");
}

// 刪除會員（只限總管理）：連同報名紀錄、標籤、同意紀錄一起移除，無法復原。
// 有贊助紀錄的會員不能直接刪，避免金錢帳目跟著消失。
function deleteContactForm(id){
  if(!isAdmin()) return toast("只有總管理可以刪除會員");
  const c=state.contacts.find(x=>x.id===id); if(!c) return;
  const regs=state.registrations.filter(r=>r.contact_id===id).length;
  const sps=(state.sponsorships||[]).filter(s=>s.contact_id===id).length;
  if(sps) return modal(`<h2>無法刪除</h2><p><strong>${escapeHtml(c.name)}</strong> 有 ${sps} 筆贊助紀錄。為了保留金錢帳目，請先到「贊助紀錄」確認是否要處理，再刪除會員。</p><button value="cancel" data-action="close-modal">知道了</button>`);
  modal(`<h2>刪除會員</h2><div class="notice">刪除後<strong>無法復原</strong>：會員資料、${regs} 筆報名／出席紀錄、標籤都會一起移除。</div>
    <form id="deleteContactForm"><input type="hidden" name="contact_id" value="${id}"><div class="field"><label>請輸入會員姓名「${escapeHtml(c.name)}」確認</label><input name="confirm_name" required autocomplete="off"></div>
    <div class="actions" style="margin-top:14px"><button class="danger">確認刪除</button><button type="button" class="secondary" data-action="close-modal">取消</button></div></form>`);
}
async function deleteContact(data){
  const c=state.contacts.find(x=>x.id===data.contact_id); if(!c) return;
  if(data.confirm_name.trim()!==c.name) return toast("姓名不符，未刪除");
  if(live){
    const {error}=await supabase.rpc("admin_delete_contact",{p_contact_id:c.id,p_confirm_name:data.confirm_name.trim()});
    if(error) return toast(error.message.includes("HAS_SPONSORSHIPS")?"有贊助紀錄，不能刪除":error.message.includes("FORBIDDEN")?"沒有權限":"刪除失敗："+error.message);
    await loadLiveData();
  } else {
    state.registrations.filter(r=>r.contact_id===c.id).forEach(r=>{ const e=state.events.find(x=>x.id===r.event_id); if(e&&!r.cancelled_at&&e.registration_count>0) e.registration_count--; });
    state.registrations=state.registrations.filter(r=>r.contact_id!==c.id);
    state.contacts=state.contacts.filter(x=>x.id!==c.id);
  }
  audit("刪除會員","（已刪除）"); persist(); closeModal(); render(); toast("已刪除會員");
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
  const picker=`<select id="eventSwitch">${state.events.map(e=>`<option value="${e.id}" ${e.id===eventId?"selected":""}>${escapeHtml(eventLabel(e))}</option>`).join("")}</select>`;
  const rows=regs.map(r=>`<div class="checkin-item" data-search="${escapeHtml(`${r.member_no||""} ${r.name} ${r.phone_last3}`.toLowerCase())}"><div><strong>${escapeHtml(r.name)}</strong> <span class="muted">${escapeHtml(r.member_no||"")}</span><small>${escapeHtml(r.region_name||"未分區")}・手機末三碼 ${escapeHtml(r.phone_last3||"---")}・${r.source==="walk-in"?"現場報名・":""}${pay(r)}</small></div><button data-action="toggle-checkin" data-id="${r.id}" class="${r.attendance_status==="attended"?"secondary":""}">${r.attendance_status==="attended"?"已報到 ✓":"確認報到"}</button></div>`).join("");
  return `${pageHead("現場報到",event?`${eventLabel(event)}・${fmtDate(event.starts_at)}`:"請先建立活動",qrBtn+picker)}<p class="muted">${scope}・已報到 ${done}／${regs.length}</p><input class="search" id="checkinSearch" placeholder="搜尋姓名或手機末三碼"><div class="checkin-list" style="margin-top:15px">${rows||"<div class='empty'>目前沒有報名者</div>"}</div>`;
}

function messages(){
  return `${pageHead("LINE 訊息","訊息必須由幹部檢查對象與內容後，才能送出。",!isAdmin()?"":`<button data-action="new-campaign">＋ 新增專案</button>`)}<div class="notice">系統不會自動發送。按下「檢查並送出」後，還會再次顯示實際對象與訊息全文。</div><div class="grid">${state.campaigns.map(c=>`<article class="card"><span class="pill ${c.status!=="draft"?"off":""}">${({draft:"草稿",partial:"部分失敗",failed:"失敗",sent:"已送出",sending:"發送中"})[c.status]||c.status}</span><h3>${escapeHtml(c.name)}</h3><p class="muted">發送對象：${escapeHtml(audienceLabel(c))}</p><p>${escapeHtml(c.body)}</p><div class="kpi-line"><span>符合條件</span><strong>${c.eligible_count}</strong></div><div class="kpi-line"><span>成功／失敗</span><strong>${c.success_count}/${c.failed_count}</strong></div><div class="actions" style="margin-top:10px">${["draft","partial","failed"].includes(c.status)&&isAdmin()?`<button data-action="review-campaign" data-id="${c.id}">${c.status==="draft"?"檢查並送出":"重送失敗對象"}</button>`:""}${c.status==="draft"&&isAdmin()?`<button class="secondary" data-action="edit-campaign" data-id="${c.id}">修改</button><button class="danger" data-action="delete-campaign" data-id="${c.id}">刪除</button>`:""}</div></article>`).join("")}</div>`;
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
  const wanted=query().get("event");
  const q=query(); const outdoor=q.get("campaign")==="outdoor";
  const leadCity=q.get("city")||""; const contactMode=q.get("mode")||"現場圍觀者"; const sourceTheme=q.get("theme")||"";
  const event=state.events.find(e=>e.id===(wanted||(live||!IS_ADMIN?"":state.events[0]?.id)));
  if(!event){
    // 同名活動只列一次（報名頁裡再選場次）
    const open=state.events.filter(e=>eventState(e)==="報名中").filter((e,i,all)=>all.findIndex(x=>(x.series_id||x.title.trim())===(e.series_id||e.title.trim()))===i);
    return `<article class="card student-card" style="max-width:640px;margin:20px auto"><h1>${wanted?"找不到這場活動":"選擇要報名的活動"}</h1>${IS_ADMIN?"":`<p><a href="#me">已報名過？看我的活動 →</a></p>`}${wanted?`<p class="muted">連結可能已過期，或活動已下架。以下是目前開放報名的活動：</p>`:""}${open.length?`<ul class="student-list">${open.map(e=>{const n=eventSessions(state.events,e).length;return `<li class="student-item"><div><strong>${escapeHtml(e.title)}</strong><small>${n>1?`共 ${n} 場・從 ${fmtDate(e.starts_at)} 起`:`${fmtDate(e.starts_at)}・${escapeHtml(e.location||"")}`}・${escapeHtml(e.fee_note||"")}</small></div><a class="button" href="#register?event=${e.id}">報名</a></li>`}).join("")}</ul>`:`<p class="muted">目前沒有開放報名的活動。</p>`}</article>`;
  }
  const sessions=eventSessions(state.events,event), multi=sessions.length>1;
  const info=multi
    ?`<h2>場次</h2>${sessions.map(s=>`<div class="kpi-line"><span>${s.session_name?`<strong>${escapeHtml(s.session_name)}</strong><br>`:""}${fmtDate(s.starts_at)}<br><small class="muted">${escapeHtml(s.location||"")}</small></span><strong>${eventState(s)==="報名中"?`${s.registration_count}/${s.capacity}`:eventState(s)}</strong></div>`).join("")}<div class="kpi-line"><span>費用</span><strong>${escapeHtml(event.fee_note)}</strong></div>`
    :`<h2>活動資訊</h2><div class="kpi-line"><span>時間</span><strong>${fmtDate(event.starts_at)}</strong></div><div class="kpi-line"><span>地點</span><strong>${escapeHtml(event.location)}</strong></div><div class="kpi-line"><span>費用</span><strong>${escapeHtml(event.fee_note)}</strong></div><div class="kpi-line"><span>名額</span><strong>${event.registration_count}/${event.capacity}</strong></div>`;
  const tracking=["utm_source","utm_medium","utm_campaign","utm_content"].map(k=>`<input type="hidden" name="${k}" value="${escapeHtml(q.get(k)||"")}">`).join("");
  const outdoorFields=outdoor?`<input type="hidden" name="campaign_type" value="outdoor"><input type="hidden" name="lead_city" value="${escapeHtml(leadCity)}"><input type="hidden" name="source_theme" value="${escapeHtml(sourceTheme)}"><div class="field full"><label>你是從哪裡認識我們？</label><select name="contact_mode"><option ${contactMode==="正式參加者"?"selected":""}>正式參加者</option><option ${contactMode==="現場圍觀者"?"selected":""}>現場圍觀者</option><option ${contactMode==="親友介紹"?"selected":""}>親友介紹</option></select></div><div class="field full"><h3>30 秒自我狀態了解</h3><p class="muted">這不是醫療診斷，只協助你了解最近的狀態。</p></div><div class="field full"><label>最近是否難入睡、睡不飽或醒來仍疲累？</label><select name="sleep_issue" required><option value="">請選擇</option><option>經常</option><option>偶爾</option><option>很少</option></select></div><div class="field full"><label>最近是否容易緊繃、煩躁或腦袋停不下來？</label><select name="stress_issue" required><option value="">請選擇</option><option>經常</option><option>偶爾</option><option>很少</option></select></div><label class="field full"><span><input type="checkbox" name="weekly_practice_interest"> 我願意每週留一小段時間練習放鬆。</span></label><label class="field full"><span><input type="checkbox" name="online_trial_interest" checked> 我想預約免費、限額的新手線上體驗課。</span></label>`:"";
  return `${demoLinePicker()}${pageHead(multi?event.title:eventLabel(event),event.theme)}<section class="two-col"><article class="card">${info}<p class="muted">分享報名 QR Code${multi?"（所有場次共用這一張）":""}</p><div id="qr" aria-label="活動報名 QR Code"></div><div class="link-box"><input id="linkText" readonly aria-label="報名網址" value="${escapeHtml(publicUrl())}"><button type="button" class="secondary small" data-action="copy-link">複製</button></div></article><article class="card" id="regAction">${registerAction(event,sessions,`<form id="registrationForm">${multi?"":`<input type="hidden" name="event_id" value="${event.id}">`}${tracking}<div class="form-grid">${multi?sessionPicker(sessions):""}<div class="field"><label>姓名 *</label><input name="name" required maxlength="40"></div>${phoneField("手機","",{required:true,autocomplete:"tel"})}${genderField()}${cityField()}<div class="field full"><label>Email</label><input name="email" type="email"></div><div class="field full"><label>有興趣的主題</label><select name="interest"><option>閱讀</option><option>冥想</option><option>身心放鬆</option><option>節氣生活</option></select></div>${outdoorFields}<label class="field full"><span><input type="checkbox" name="privacy" required> 我已閱讀並同意<a href="${STUDENT_HOME}privacy.html" target="_blank">個資告知</a>，資料僅用於活動與會員服務。</span></label><label class="field full"><span><input type="checkbox" name="marketing"> 我同意接收後續活動與課程訊息，可隨時撤回。</span></label><button class="field full" type="submit">使用 LINE 身分送出報名</button></div></form>`)}</article></section>`;
}

// 報名頁右側：先用 LINE 確認身分。會員一鍵報名（不用再填資料）、已報名顯示狀態與取消；不是會員才顯示報名表。
let regMember=null; // {eventId, status:"checking"|"member"|"guest", name, registered, regIds, loggedOut}
const STAFF_ROLES=["admin","event_staff","region_lead"];
// 同名多場次的勾選清單：已報名、截止或額滿的場次不能勾
function sessionPicker(sessions,mine=new Set()){
  return `<div class="field full"><label>選擇場次 *（可複選）</label>${sessions.map(s=>{const st=eventState(s),done=mine.has(s.id);return `<label class="session-option"><input type="checkbox" name="session" value="${s.id}" ${st!=="報名中"||done?"disabled":""}><span>${s.session_name?`<strong>${escapeHtml(s.session_name)}</strong><br>`:""}${fmtDate(s.starts_at)}・${escapeHtml(s.location||"")}</span><small class="muted">${done?"已報名":st==="報名中"?`名額 ${s.registration_count}/${s.capacity}`:st}</small></label>`}).join("")}</div>`;
}
function registerAction(event,sessions,formHtml){
  const m=regMember?.eventId===event.id?regMember:{status:"checking"};
  if(m.status==="pending") return `<h2>報名</h2><div class="notice">你的帳號還在等待工作人員開通，開通後就能報名。</div>`;
  if(m.status==="checking") return `<h2>報名</h2><div class="empty">正在用 LINE 確認你的會員身分…</div>`;
  if(sessions.length>1&&m.status==="member"){
    const mine=m.regIds||new Set(), regd=sessions.filter(s=>mine.has(s.id)), canPick=sessions.some(s=>!mine.has(s.id)&&eventState(s)==="報名中");
    return `<h2>會員報名</h2><p>${escapeHtml(m.name)}，你已經是會員，不用再填資料。</p>${regd.length?`<div class="notice">✓ 你已報名：<ul class="plain">${regd.map(s=>`<li>${s.session_name?`${escapeHtml(s.session_name)}・`:""}${fmtDate(s.starts_at)}・${escapeHtml(s.location||"")}　<button class="secondary small" data-action="cancel-registration" data-event="${s.id}">取消這場</button></li>`).join("")}</ul></div>`:""}${canPick?`<form id="quickRegisterForm" style="margin-top:14px"><div class="form-grid">${sessionPicker(sessions,mine)}<button class="big field full" type="submit">報名勾選的場次</button></div></form><p class="muted" style="margin-top:10px">報名後，${remindText()}。</p>`:`<div class="actions" style="margin-top:14px"><a class="button" href="#me">看我的活動</a></div>`}`;
  }
  if(sessions.length>1) return `<h2>LINE 登入＋簡短報名</h2>${live&&m.loggedOut?`<div class="notice">已經是會員？<button type="button" class="secondary small" data-action="line-login-register">用 LINE 登入一鍵報名</button> 或 <a href="#signin">帳號密碼登入</a></div>`:""}${formHtml}`;
  if(m.status==="member"&&m.registered) return `<h2>會員報名</h2><div class="notice">✓ ${escapeHtml(m.name)}，你已報名這場活動，${remindText()}。</div><div class="actions" style="margin-top:14px"><a class="button" href="#me">看我的活動</a><button class="secondary" data-action="cancel-registration" data-event="${event.id}">取消報名</button></div>`;
  if(eventState(event)!=="報名中") return `<h2>報名</h2><div class="notice">目前${eventState(event)}，暫停接受報名。</div>`;
  if(m.status==="member") return `<h2>會員報名</h2><p>${escapeHtml(m.name)}，你已經是會員，不用再填資料。</p><button class="big" style="width:100%" data-action="quick-register" data-event="${event.id}">一鍵報名</button><p class="muted" style="margin-top:10px">報名後，${remindText()}。</p>`;
  return `<h2>LINE 登入＋簡短報名</h2>${live&&m.loggedOut?`<div class="notice">已經是會員？<button type="button" class="secondary small" data-action="line-login-register">用 LINE 登入一鍵報名</button> 或 <a href="#signin">帳號密碼登入</a></div>`:""}${formHtml}`;
}
async function checkRegisterMember(eventId){
  regMember={eventId,status:"checking"};
  if(live&&!studentMode()){
    let loggedIn=false;
    if(lineReady()){ try{ await liffReady; loggedIn=lineSignedIn(); }catch{} }
    if(!loggedIn){ regMember={eventId,status:"guest",loggedOut:true}; return route()==="register"&&render(); }
  }
  const data=await memberApi("me"); if(data.pending)return;
  const regIds=new Set((data.registrations||[]).filter(r=>!r.cancelled_at).map(r=>r.event_id));
  if(data.code==="PENDING"){ regMember={eventId,status:"pending"}; return route()==="register"&&render(); }
  regMember=data.ok&&data.contact?{eventId,status:"member",name:data.contact.name,registered:regIds.has(eventId),regIds}:{eventId,status:"guest"};
  const draft=live&&readRegDraft();
  if(draft?.data&&route()==="register"){ clearRegDraft(); $("#app").innerHTML="<div class='empty'>已用 LINE 登入，正在送出報名…</div>"; return submitRegistration(draft.data,draft.ids); }
  if(route()==="register") render();
}
// 報名或取消後重新抓名額，避免畫面上的人數停在舊的
async function refreshEventCounts(){
  if(!live) return;
  if(STAFF_ROLES.includes(state.role)) return loadLiveData();
  const {data}=await supabase.from("public_events").select("*").order("starts_at"); if(data) state.events=data;
}
async function quickRegister(btn){
  const eventId=btn.dataset.event; btn.disabled=true; btn.textContent="報名中…";
  const data=await memberApi("register",{event_id:eventId}); if(data.pending)return;
  if(data.error){ btn.disabled=false; btn.textContent="一鍵報名"; return toast(data.error); }
  if(data.code==="NOT_MEMBER"){ regMember={eventId,status:"guest"}; return render(); }
  await refreshEventCounts(); regMember={...regMember,registered:true};
  registeredView(eventId,data.already?"你已經報名過了":"報名完成");
}
// 會員一次報名多個場次：逐場送出，某場額滿或截止不影響其他場
async function quickRegisterMany(form,ids){
  if(!ids.length) return toast("請至少勾選一個場次");
  const btn=form.querySelector("button[type=submit]"); btn.disabled=true; btn.textContent="報名中…";
  const results=[];
  for(const id of ids){
    const data=await memberApi("register",{event_id:id}); if(data.pending)return;
    if(data.code==="NOT_MEMBER"){ regMember={eventId:regMember?.eventId,status:"guest"}; return render(); }
    results.push({id,error:data.error||null});
  }
  await refreshEventCounts(); results.filter(r=>!r.error).forEach(r=>regMember?.regIds?.add(r.id));
  sessionsDoneView(results,regMember?.eventId||ids[0]);
}
function sessionsDoneView(results,backId){
  const ok=results.filter(r=>!r.error), bad=results.filter(r=>r.error);
  const line=r=>{const e=state.events.find(x=>x.id===r.id);return `<li>${e?`${e.session_name?`${escapeHtml(e.session_name)}・`:""}${fmtDate(e.starts_at)}・${escapeHtml(e.location||"")}`:"場次"}${r.error?`：${escapeHtml(r.error)}`:""}</li>`;};
  $("#app").innerHTML=`<article class="card" style="max-width:560px;margin:40px auto;text-align:center"><h1>${ok.length?"報名完成":"報名沒有成功"}</h1>${ok.length?`<p>已報名以下場次，${remindText()}：</p><ul class="plain">${ok.map(line).join("")}</ul>`:""}${bad.length?`<div class="notice">以下場次沒有報名成功：<ul class="plain">${bad.map(line).join("")}</ul></div>`:""}<div class="actions" style="justify-content:center"><a class="button" href="#me">看我的活動</a><a class="button secondary" href="#register?event=${backId}" data-action="back-to-event">回到活動頁</a><a class="button secondary" href="#register">回首頁</a></div></article>`;
}
function forgetRegistration(eventId){
  if(!regMember) return; regMember.regIds?.delete(eventId); if(regMember.eventId===eventId) regMember.registered=false;
}
function registeredView(eventId,title){
  $("#app").innerHTML=`<article class="card" style="max-width:560px;margin:40px auto;text-align:center"><h1>${title}</h1><p>${remindText()}。</p><div class="actions" style="justify-content:center"><a class="button" href="#me">看我的活動</a><a class="button secondary" href="#register?event=${eventId}" data-action="back-to-event">回到活動頁</a><a class="button secondary" href="#register">回首頁</a></div></article>`;
}

// ───── 學員頁面 ─────
// 雲端：每次都帶 LINE ID Token 呼叫 member 函式，後端驗證後只回本人的資料。
// 展示：用 state 模擬同一套回應格式，規則與資料庫函式一致（見 lib.js）。
async function memberApi(action,payload={}){
  if(live){
    if(studentMode()){
      const {data:{session}}=await supabase.auth.getSession();
      if(!session){ setStudentMode(false); location.hash="#signin"; return {pending:true}; }
      const {res,body}=await memberCall({...payload,action,accessToken:session.access_token});
      if(res.status===401||body.code==="NOT_STUDENT"){ await studentSignOut(); location.hash="#signin"; toast(body.error||"請重新登入"); return {pending:true}; }
      return res.ok?body:{error:body.error||"暫時無法完成"};
    }
    if(!lineReady()) return {error:LINE_NOT_READY};
    await liffReady;
    if(!lineSignedIn()){ lineLogin(); return {pending:true}; }
    const {res,body}=await memberCall({...payload,action,idToken:window.liff.getIDToken()});
    return res.ok?body:{error:body.error||"暫時無法完成"};
  }
  return demoMemberApi(action,payload);
}
async function memberCall(payload){
  const res=await fetch(`${config.supabaseUrl}/functions/v1/member`,{method:"POST",headers:{"Content-Type":"application/json",apikey:config.supabasePublishableKey},body:JSON.stringify(payload)});
  return {res,body:await res.json().catch(()=>({error:"連線失敗，請稍後再試"}))};
}

// ───── 沒有 LINE 的學員：帳號密碼登入 ─────
// 登入成功時記下「帳密學員」，之後學員頁改用 Supabase 登入憑證（同網域的工作人員登入不會被當成學員）。
const STUDENT_FLAG="chaoren-student-login";
// 帳密學員沒有綁 LINE，收不到 LINE 提醒
const remindText=()=>studentMode()?"活動前請留意工作人員的通知":"活動前會透過 LINE 提醒你";
function studentMode(){ if(!live) return Boolean(state.demoStudent||state.demoApplicant); try{ return localStorage.getItem(STUDENT_FLAG)==="1"; }catch{ return false; } }
function setStudentMode(on){ try{ on?localStorage.setItem(STUDENT_FLAG,"1"):localStorage.removeItem(STUDENT_FLAG); }catch{} }
async function studentSignOut(){
  if(live){ setStudentMode(false); await supabase.auth.signOut(); } else { state.demoStudent=null; state.demoApplicant=null; persist(); }
}
function signin(){
  return `<article class="card student-card" style="max-width:480px;margin:20px auto"><h1>帳號密碼登入</h1><p class="muted">給沒有 LINE 的學員。帳號是工作人員幫你開通時用的 Email 或手機。</p>
    <form id="signinForm"><div class="form-grid">
      <div class="field full"><label>帳號</label><div class="actions"><label><input type="radio" name="login_type" value="email" checked> Email</label><label><input type="radio" name="login_type" value="phone"> 手機</label></div></div>
      <div class="field full" data-login="email"><label>Email</label><input name="email" type="email" autocomplete="username"></div>
      <div class="full" data-login="phone" hidden>${phoneField("手機")}</div>
      <div class="field full"><label>密碼</label><input name="password" type="password" required autocomplete="current-password"></div>
      <button class="field full" type="submit">登入</button></div></form>
    <p style="margin-top:12px">第一次使用？<a href="#apply">申請帳號</a></p><p class="muted">忘記密碼？請洽工作人員重新產生連結。</p><p><a href="#me">改用 LINE 登入</a></p></article>`;
}
async function submitSignin(data){
  const type=data.login_type==="phone"?"phone":"email";
  let value=data.email;
  if(type==="phone"){ const ph=readPhone(data); if(ph.error||!ph.phone) return toast(ph.error||"請輸入手機"); value=ph.phone; }
  const email=studentAuthEmail(type,value); if(!email) return toast(type==="phone"?"請輸入正確的手機":"請輸入正確的 Email");
  if(live){
    const {error}=await supabase.auth.signInWithPassword({email,password:data.password});
    if(error) return toast("帳號或密碼不正確");
    setStudentMode(true);
  } else {
    const a=Object.entries(state.student_accounts||{}).find(([,x])=>studentAuthEmail(x.login_type,x.login)===email&&x.password&&x.password===data.password);
    if(!a){ const p=(state.student_applications||[]).find(x=>x.status==="pending"&&studentAuthEmail(x.login_type,x.login)===email&&x.password===data.password); if(!p) return toast("帳號或密碼不正確"); state.demoApplicant=p.id; state.demoStudent=null; persist(); location.hash="#me"; return toast("登入成功"); }
    state.demoStudent=a[0]; state.demoApplicant=null; persist();
  }
  location.hash="#me"; toast("登入成功");
}
// 沒有 LINE 的學員自己申請帳號密碼；總管理在後台「待開通」開通後才能看資料、報名
function apply(){
  return `<article class="card student-card" style="max-width:560px;margin:20px auto"><h1>申請帳號</h1><p class="muted">給沒有 LINE 的學員（例如海外）。送出後請等工作人員開通，開通後就能用帳號密碼登入、報名活動。有 LINE 的朋友請直接用 LINE 登入。</p>
    <form id="applyForm"><div class="form-grid">
      <div class="field full"><label>登入帳號用</label><div class="actions"><label><input type="radio" name="login_type" value="phone" checked> 手機</label><label><input type="radio" name="login_type" value="email"> Email</label></div></div>
      <div class="field"><label>姓名 *</label><input name="name" required maxlength="40" autocomplete="name"></div>
      ${phoneField("手機",'',{required:true,autocomplete:"tel"})}
      <div class="field"><label id="applyEmailLabel">Email</label><input name="email" type="email" maxlength="120" autocomplete="email"></div>
      ${genderField()}
      <div class="field"><label>生日</label><input name="birth_date" type="date" min="1900-01-01"></div>
      ${cityField()}
      <div class="field"><label>密碼 *（至少 8 個字）</label><input name="password" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></div>
      <div class="field"><label>再輸入一次密碼 *</label><input name="again" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></div>
      <label class="field full"><span><input type="checkbox" name="privacy" required> 我已閱讀並同意<a href="${STUDENT_HOME}privacy.html" target="_blank">個資告知</a>，資料僅用於活動與會員服務。</span></label>
      <label class="field full"><span><input type="checkbox" name="marketing"> 我同意接收後續活動與課程訊息，可隨時撤回。</span></label>
      <button class="field full" type="submit">送出申請</button></div></form>
    <p style="margin-top:12px">已經申請過？<a href="#signin">帳號密碼登入</a></p></article>`;
}
async function submitApply(form,data){
  const ph=readPhone(data); if(ph.error||!ph.phone) return toast(ph.error||"請填寫手機");
  const checked=checkProfile({...data,phone:ph.phone}); if(checked.error) return toast(checked.error);
  const type=data.login_type==="email"?"email":"phone";
  if(type==="email"&&!checked.value.email) return toast("用 Email 當帳號時，請填寫 Email");
  const problem=checkNewPassword(data.password,data.again); if(problem) return toast(problem);
  if(!data.privacy) return toast("請先同意個資告知");
  const btn=form.querySelector("button[type=submit]"); btn.disabled=true; btn.textContent="送出中…";
  const payload={...checked.value,login_type:type,password:data.password,privacy:true,marketing:data.marketing==="on"};
  const res=live?(await memberCall({action:"apply",...payload})).body:demoApply(payload);
  if(!res.ok){ btn.disabled=false; btn.textContent="送出申請"; return toast(res.error||"暫時無法完成"); }
  if(live){ const {error}=await supabase.auth.signInWithPassword({email:res.email,password:data.password}); if(!error) setStudentMode(true); }
  location.hash="#me"; toast("申請已送出");
}
const pendingCard=name=>`<article class="card result-card"><div class="result-icon" aria-hidden="true">…</div><h1>申請已送出</h1><p>${escapeHtml(name||"")}，謝謝你！工作人員開通後，你就能在這裡看到自己的資料並報名活動。</p><p class="muted">開通後不會另外通知，請過一段時間再回來看看；急的話可以洽工作人員。</p><button class="secondary" data-action="student-logout">登出</button></article>`;
// 展示版：申請存在 state.student_applications；用申請的帳號密碼登入時，先記成「申請中」
function demoApply(p){
  const email=studentAuthEmail(p.login_type,p.login_type==="email"?p.email:p.phone);
  const taken=Object.values(state.student_accounts||{}).some(a=>studentAuthEmail(a.login_type,a.login)===email)||(state.student_applications||[]).some(a=>a.status==="pending"&&studentAuthEmail(a.login_type,a.login)===email);
  if(taken) return {error:"這個帳號已經申請過或已有人使用；忘記密碼請洽工作人員"};
  const app={id:crypto.randomUUID(),...p,login:p.login_type==="email"?p.email:p.phone,status:"pending",created_at:new Date().toISOString()};
  state.student_applications=[...(state.student_applications||[]),app]; state.applications=state.student_applications.filter(a=>a.status==="pending");
  state.demoApplicant=app.id; state.demoStudent=null; persist(); return {ok:true};
}

// ───── 總管理：待開通的學員申請 ─────
function applications(){
  const list=state.applications||[];
  const row=a=>`<article class="card" style="margin-bottom:12px"><div class="card-title"><h2>${escapeHtml(a.name)}</h2><span class="muted">${fmtDate(a.created_at)} 申請</span></div>
    <div class="kpi-line"><span>登入帳號</span><strong>${a.login_type==="phone"?"手機":"Email"} ${escapeHtml(a.login_type==="phone"?displayPhone(a.login):a.login)}</strong></div>
    <div class="kpi-line"><span>手機</span><strong>${escapeHtml(displayPhone(a.phone))}</strong></div><div class="kpi-line"><span>Email</span><strong>${escapeHtml(a.email||"—")}</strong></div>
    <div class="kpi-line"><span>性別／生日</span><strong>${escapeHtml(a.gender)}・${escapeHtml(a.birth_date||"—")}</strong></div><div class="kpi-line"><span>居住縣市</span><strong>${escapeHtml(a.residence_city||"—")}</strong></div>
    <div class="actions" style="margin-top:12px"><button data-action="approve-application" data-id="${a.id}">開通（建立新會員）</button><button class="danger" data-action="reject-application" data-id="${a.id}">拒絕</button></div></article>`;
  return `${pageHead("待開通的學員","沒有 LINE 的學員自己申請帳號密碼。確認是本人後按開通，系統會建立一位新會員；拒絕會刪掉他的登入帳號，對方可以重新申請。")}${list.length?list.map(row).join(""):`<div class="empty">目前沒有待開通的申請。</div>`}`;
}
async function reviewApplication(id,approve){
  const a=(state.applications||[]).find(x=>x.id===id); if(!a||!isAdmin()) return;
  if(!confirm(approve?`開通「${a.name}」並建立新會員？`:`拒絕「${a.name}」的申請？他的登入帳號會被刪除。`)) return;
  if(live){
    if(approve){ const {error}=await supabase.rpc("admin_approve_student_application",{p_id:id}); if(error) return toast(error.message.includes("NOT_PENDING")?"這筆申請已經處理過了":"開通失敗："+error.message); }
    else { const res=await callStaff("reject_application",{id}); if(res.error) return toast(res.error); }
    await loadLiveData();
  } else {
    const app=state.student_applications.find(x=>x.id===id); app.status=approve?"approved":"rejected";
    if(approve){
      const c={id:crypto.randomUUID(),member_no:nextMemberNo(),name:app.name,display_name:"",phone:app.phone,email:app.email||"",gender:app.gender,birth_date:app.birth_date,region_id:null,residence_city:app.residence_city,address:"",national_id:"",notes:"自行申請帳號密碼登入（沒有 LINE）",line_user_id:null,line_status:"unknown",marketing_consent:app.marketing,tags:[],last_interaction_at:new Date().toISOString(),created_at:new Date().toISOString()};
      state.contacts.push(c); state.student_accounts={...(state.student_accounts||{}),[c.id]:{login_type:app.login_type,login:app.login,password:app.password,used:true}};
      if(state.demoApplicant===id){ state.demoApplicant=null; state.demoStudent=c.id; }
    }
    state.applications=state.student_applications.filter(x=>x.status==="pending");
  }
  audit(approve?"開通學員申請":"拒絕學員申請",a.name); persist(); render(); toast(approve?`已開通，已建立會員「${a.name}」`:"已拒絕");
}

// 一次性連結：打開頁面只查詢不兌換（聊天軟體的預覽機器人不會用掉連結），按下「設定密碼」才兌換
function activate(){ return `<div id="studentArea"><div class="empty">正在確認連結…</div></div>`; }
async function loadActivate(){
  const token=query().get("t")||"";
  const info=live?(await memberCall({action:"link_info",token})).body:demoStudentLink("link_info",{token});
  const area=$("#studentArea"); if(!area) return;
  if(!info.ok){ area.innerHTML=`<article class="card result-card fail"><div class="result-icon" aria-hidden="true">!</div><h1>無法開通</h1><p>${escapeHtml(info.error||"這個連結已失效，請洽工作人員重新產生")}</p></article>`; return; }
  const login=info.login_type==="phone"?displayPhone(info.login):info.login;
  area.innerHTML=`<article class="card student-card" style="max-width:480px;margin:20px auto"><h1>設定登入密碼</h1><p>${escapeHtml(info.name||"")}，你的登入帳號是<strong>${info.login_type==="phone"?"手機":" Email"} ${escapeHtml(login)}</strong>。設定密碼後，之後就用這個帳號加密碼登入。</p>
    <form id="activateForm"><input type="hidden" name="token" value="${escapeHtml(token)}"><div class="form-grid">
      <div class="field full"><label>新密碼（至少 8 個字）</label><input name="password" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></div>
      <div class="field full"><label>再輸入一次</label><input name="again" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></div>
      <button class="field full" type="submit">設定密碼並登入</button></div></form></article>`;
}
async function submitActivate(form,data){
  const problem=checkNewPassword(data.password,data.again); if(problem) return toast(problem);
  const btn=form.querySelector("button[type=submit]"); btn.disabled=true; btn.textContent="設定中…";
  const res=live?(await memberCall({action:"activate",token:data.token,password:data.password})).body:demoStudentLink("activate",data);
  if(!res.ok){ btn.disabled=false; btn.textContent="設定密碼並登入"; return toast(res.error||"暫時無法完成"); }
  if(live){
    const {error}=await supabase.auth.signInWithPassword({email:res.email,password:data.password});
    if(error){ location.hash="#signin"; return toast("密碼已設定，請用帳號密碼登入"); }
    setStudentMode(true);
  }
  history.replaceState(null,"",location.pathname+"#me"); render(); toast("密碼已設定，歡迎！");
}

function demoMemberApi(action,payload){
  if(state.demoApplicant){ const app=(state.student_applications||[]).find(x=>x.id===state.demoApplicant); if(app?.status==="pending") return {code:"PENDING",name:app.name}; state.demoApplicant=null; persist(); return {error:"登入已過期，請重新登入"}; }
  const line=state.demoLine; let me=state.demoStudent?state.contacts.find(c=>c.id===state.demoStudent&&!c.anonymized_at):state.contacts.find(c=>c.line_user_id===line&&!c.anonymized_at);
  const notMember={code:"NOT_MEMBER",displayName:"LINE 新朋友",regions:state.regions};
  if(action==="me"){
    if(!me)return notMember;
    const regs=state.registrations.filter(r=>r.contact_id===me.id).map(r=>({...r,events:state.events.find(e=>e.id===r.event_id)}));
    const events=state.events.filter(e=>e.status==="published"&&new Date(e.starts_at)>new Date()).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
    return {ok:true,contact:{...me,region_name:regionName(me.region_id)},registrations:regs,events};
  }
  if(action==="update_profile"){
    if(!me)return notMember;
    const checked=checkProfile(payload); if(checked.error)return {error:checked.error};
    Object.assign(me,checked.value,{last_interaction_at:new Date().toISOString()}); audit("學員自行修改資料",me.name); persist();
    return {ok:true};
  }
  if(action==="signup"){
    if(me)return {ok:true,contactId:me.id,existing:true};
    const legacy=findLegacyContact(state.contacts,payload);
    const fields={gender:payload.gender||null,birth_date:payload.birth_date||null,region_id:payload.region_id||null,residence_city:payload.residence_city||null,email:payload.email||""};
    let id;
    if(legacy){ id=legacy.id; for(const [k,v] of Object.entries(fields)) if(!legacy[k]&&v)legacy[k]=v; Object.assign(legacy,{line_user_id:line,display_name:"LINE 新朋友",line_status:"active",marketing_consent:Boolean(payload.marketing),last_interaction_at:new Date().toISOString()}); }
    else { id=crypto.randomUUID(); state.contacts.push({id,member_no:nextMemberNo(),name:payload.name.trim(),phone:payload.phone,...fields,address:"",national_id:"",notes:"",display_name:"LINE 新朋友",line_user_id:line,line_status:"active",marketing_consent:Boolean(payload.marketing),tags:[],last_interaction_at:new Date().toISOString(),created_at:new Date().toISOString()}); }
    persist(); return {ok:true,contactId:id,linked:Boolean(legacy)};
  }
  if(action==="register"){
    if(!me)return notMember;
    const event=state.events.find(e=>e.id===payload.event_id);
    let reg=state.registrations.find(r=>r.event_id===event.id&&r.contact_id===me.id);
    if(reg&&!reg.cancelled_at)return {ok:true,already:true,name:me.name,eventTitle:event.title};
    if(event.registration_count>=event.capacity)return {error:"活動已額滿"};
    if(reg) Object.assign(reg,{attendance_status:"registered",cancelled_at:null,registered_at:new Date().toISOString()});
    else state.registrations.push({id:crypto.randomUUID(),event_id:event.id,contact_id:me.id,attendance_status:"registered",payment_status:"pending",source:"line",registered_at:new Date().toISOString(),cancelled_at:null});
    event.registration_count=(event.registration_count||0)+1; persist();
    return {ok:true,already:false,name:me.name,eventTitle:event.title};
  }
  if(action==="checkin"){
    const event=state.events.find(e=>e.id===payload.event_id);
    const problem=checkinProblem(event,payload.token,state.checkin_codes?.[payload.event_id]);
    if(problem)return {error:CHECKIN_MESSAGES[problem],code:problem};
    let joined=false;
    if(!me&&payload.quickJoin){ me={id:crypto.randomUUID(),member_no:nextMemberNo(),name:"LINE 新朋友",phone:"",email:"",gender:null,birth_date:null,region_id:null,address:"",national_id:"",notes:"LINE 掃碼快速報到建立，尚未填電話等資料",display_name:"LINE 新朋友",line_user_id:line,line_status:"active",marketing_consent:false,tags:[],last_interaction_at:new Date().toISOString(),created_at:new Date().toISOString()}; state.contacts.push(me); joined=true; }
    if(!me)return notMember;
    let reg=state.registrations.find(r=>r.event_id===event.id&&r.contact_id===me.id); let already=false;
    if(!reg){ reg={id:crypto.randomUUID(),event_id:event.id,contact_id:me.id,payment_status:"pending",source:"walk-in",registered_at:new Date().toISOString()}; state.registrations.push(reg); event.registration_count=(event.registration_count||0)+1; }
    else if(reg.attendance_status==="attended"&&!reg.cancelled_at) already=true;
    if(!already){ Object.assign(reg,{attendance_status:"attended",cancelled_at:null,checked_in_at:new Date().toISOString()}); me.last_interaction_at=new Date().toISOString(); me.tags=eventTagsAfterCheckin(me.tags||[],event.title,true); }
    persist(); return {ok:true,already,joined,checkedInAt:reg.checked_in_at,name:me.name,eventTitle:event.title,region:me.region_id?regionName(me.region_id):null};
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

// 「我的資料」：修改表單用上一次載入的本人資料預先填好
let myProfile=null;
function profileForm(){
  const c=myProfile||{};
  modal(`<h2>修改我的資料</h2><form id="profileForm"><div class="form-grid">
    <div class="field"><label>姓名 *</label><input name="name" required maxlength="40" autocomplete="name" value="${escapeHtml(c.name||"")}"></div>
    ${phoneField("手機",c.phone||"",{required:true,autocomplete:"tel"})}
    <div class="field"><label>Email</label><input name="email" type="email" maxlength="120" autocomplete="email" value="${escapeHtml(c.email||"")}"></div>
    ${genderField(c.gender)}
    <div class="field"><label>生日</label><input name="birth_date" type="date" min="1900-01-01" value="${escapeHtml(c.birth_date||"")}"></div>
    ${cityField(c.residence_city)}
    <div class="field full"><label>地址</label><input name="address" maxlength="200" autocomplete="street-address" value="${escapeHtml(c.address||"")}"></div>
    <button class="field full" type="submit">儲存</button></div></form>`);
}
async function saveProfile(form,data){
  const ph=readPhone(data); if(ph.error) return toast(ph.error);
  const checked=checkProfile({...data,phone:ph.phone}); if(checked.error) return toast(checked.error);
  const btn=form.querySelector("button[type=submit]"); btn.disabled=true; btn.textContent="儲存中…";
  const res=await memberApi("update_profile",checked.value); if(res.pending) return;
  btn.disabled=false; btn.textContent="儲存";
  if(res.error) return toast(res.error);
  closeModal(); toast("資料已更新"); loadMe();
}

async function loadMe(){
  // 一般瀏覽器、還沒登入 LINE：先讓學員選登入方式（沒有 LINE 的海外學員用帳號密碼），不要直接跳去 LINE
  if(live&&!studentMode()&&lineReady()){
    let ready=false; try{ await liffReady; ready=window.liff.isInClient()||lineSignedIn(); }catch{}
    if(!ready){ const area=$("#studentArea"); if(area) area.innerHTML=`<article class="card student-card" style="max-width:480px;margin:20px auto;text-align:center"><h1>我的活動</h1><p>請選擇登入方式</p><div class="actions" style="justify-content:center"><button data-action="line-login-me">用 LINE 登入</button><a class="button secondary" href="#signin">用帳號密碼登入</a></div><p class="muted" style="margin-top:12px">沒有 LINE 的學員（例如海外）第一次使用，請先<a href="#apply">申請帳號</a>。</p></article>`; return; }
  }
  const data=await memberApi("me"); if(data.pending)return;
  const area=$("#studentArea"); if(!area)return;
  if(data.error){ area.innerHTML=`<div class="notice">${escapeHtml(data.error)}</div>`; return; }
  if(data.code==="PENDING"){ area.innerHTML=pendingCard(data.name); return; }
  if(data.code==="NOT_MEMBER"){ area.innerHTML=signupForm(data,"me"); return; }
  const c=data.contact; const now=new Date(); myProfile=c;
  const regs=(data.registrations||[]).filter(r=>r.events);
  const upcoming=regs.filter(r=>historyStatus(r,now)==="registered").sort((a,b)=>new Date(a.events.starts_at)-new Date(b.events.starts_at));
  const history=[...regs].sort((a,b)=>new Date(b.events.starts_at)-new Date(a.events.starts_at));
  const mine=new Set(regs.filter(r=>!r.cancelled_at).map(r=>r.event_id));
  const item=(title,sub,right="")=>`<li class="student-item"><div><strong>${escapeHtml(title)}</strong><small>${sub}</small></div>${right}</li>`;
  const row=(label,value)=>`<div class="kpi-line"><span>${label}</span><strong>${value?escapeHtml(value):`<span class="muted">未填</span>`}</strong></div>`;
  const pillClass={attended:"",registered:"",cancelled:" off",absent:" warn"};
  area.innerHTML=`<section class="card profile-head student-card"><div class="avatar" aria-hidden="true">${escapeHtml((c.name||"?").slice(0,1))}</div><div><h1>${escapeHtml(c.name)}</h1><p class="muted">會員編號 ${escapeHtml(c.member_no||"")}・${escapeHtml(c.region_name||"尚未分區")}${c.display_name&&!studentMode()?`・LINE：${escapeHtml(c.display_name)}`:""}</p>${studentMode()?`<button class="secondary small" data-action="student-logout">登出</button>`:""}</div></section>
    <section class="card student-card"><div class="card-title"><h2>我的資料</h2><button class="secondary small" data-action="edit-profile">修改資料</button></div>${row("姓名",c.name)}${row("手機",showPhone(c.phone))}${row("Email",c.email)}${row("性別",c.gender)}${row("生日",c.birth_date)}${row("居住縣市",c.residence_city)}${row("地址",c.address)}<p class="muted" style="margin-top:10px">會員編號、所屬區域需要更改時，請洽工作人員。</p></section>
    <section class="card student-card"><h2>我報名的活動</h2>${upcoming.length?`<ul class="student-list">${upcoming.map(r=>item(eventLabel(r.events),`${fmtDate(r.events.starts_at)}・${escapeHtml(r.events.location||"")}`,`<span class="pill">已報名</span>`)).join("")}</ul>`:`<p class="muted">目前沒有報名中的活動。</p>`}</section>
    <section class="card student-card"><h2>活動紀錄</h2>${history.length?`<ul class="student-list">${history.map(r=>{const st=historyStatus(r,now);return item(eventLabel(r.events),`${fmtDate(r.events.starts_at)}・${escapeHtml(r.events.location||"")}${st==="attended"&&r.checked_in_at?`・報到 ${fmtDate(r.checked_in_at)}`:""}`,`<span class="pill${pillClass[st]}">${ATTENDANCE_LABELS[st]}</span>`)}).join("")}</ul>`:`<p class="muted">還沒有活動紀錄，期待在活動見到你。</p>`}</section>
    <section class="card student-card"><h2>近期活動</h2>${(data.events||[]).length?`<ul class="student-list">${data.events.map(e=>item(eventLabel(e),`${fmtDate(e.starts_at)}・${escapeHtml(e.location||"")}・${escapeHtml(e.fee_note||"")}`,mine.has(e.id)?`<span class="pill">已報名</span>`:eventState(e)==="報名中"?`<a class="button" href="#register?event=${e.id}">報名</a>`:`<span class="pill off">${eventState(e)}</span>`)).join("")}</ul>`:`<p class="muted">近期沒有公開活動。</p>`}</section>`;
}

async function runScan({quickJoin=false}={}){
  const q=query(); const eventId=q.get("event"); const token=q.get("t");
  const area=$("#studentArea"); if(!area)return;
  if(!eventId||!token){ area.innerHTML=`<div class="notice">QR Code 內容不完整，請重新掃描或洽現場工作人員。</div>`; return; }
  const data=await memberApi("checkin",{event_id:eventId,token,quickJoin}); if(data.pending)return;
  if(!$("#studentArea"))return;
  // 第一次來：不用填資料，按一下同意個資告知就完成報到（電話等資料之後再補）
  if(data.code==="NOT_MEMBER"){ $("#studentArea").innerHTML=`<article class="card result-card"><h1>歡迎第一次來！</h1><p>${data.displayName?`${escapeHtml(data.displayName)}，`:""}按下按鈕就完成報到，不用填資料。</p><button class="big" style="width:100%" data-action="quick-join">同意並完成報到</button><p class="muted" style="margin-top:12px">按下即表示同意<a href="${STUDENT_HOME}privacy.html" target="_blank">個資告知</a>：協會會記錄你的 LINE 名稱與參加紀錄，僅用於活動與會員服務。</p></article>`; return; }
  if(data.error){ $("#studentArea").innerHTML=`<article class="card result-card fail"><div class="result-icon" aria-hidden="true">!</div><h1>無法報到</h1><p>${escapeHtml(data.error)}</p></article>`; return; }
  $("#studentArea").innerHTML=`<article class="card result-card ok"><div class="result-icon" aria-hidden="true">✓</div><h1>${data.already?"你已經報到過了":data.joined?"報到成功，歡迎加入！":"報到成功"}</h1><p class="result-name">${escapeHtml(data.name)}${data.region?`・${escapeHtml(data.region)}`:""}</p><p>${escapeHtml(data.eventTitle)}</p><p class="muted">報到時間 ${fmtDate(data.checkedInAt)}</p><a class="button" href="#me">看我的活動紀錄</a></article>`;
}

function signupForm(data,next){
  return `<article class="card student-card"><h1>第一次見面，請填基本資料</h1><p class="muted">以前填過紙本或報名表的朋友，手機和姓名都對得上時，系統會自動接上你的舊紀錄。</p>
  <form id="signupForm"><input type="hidden" name="next" value="${next}"><div class="form-grid">
    <div class="field"><label>姓名 *</label><input name="name" required maxlength="40" autocomplete="name"></div>
    ${phoneField("手機","",{required:true,autocomplete:"tel"})}
    ${genderField()}
    <div class="field"><label>出生年月日</label><input name="birth_date" type="date" min="1900-01-01"></div>
    <div class="field"><label>所屬區域</label><select name="region_id"><option value="">不確定</option>${(data.regions||[]).map(r=>`<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("")}</select></div>
    ${cityField()}
    <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email"></div>
    <label class="field full"><span><input type="checkbox" name="privacy" required> 我已閱讀並同意<a href="${STUDENT_HOME}privacy.html" target="_blank">個資告知</a>。</span></label>
    <label class="field full"><span><input type="checkbox" name="marketing"> 我同意接收活動與課程訊息，可隨時撤回。</span></label>
    <button class="field full big">${next==="scan"?"送出並完成報到":"送出"}</button></div></form></article>`;
}

async function submitSignup(data){
  if(!GENDERS.includes(data.gender))return toast("請選擇性別");
  const ph=readPhone(data); if(ph.error) return toast(ph.error); data.phone=ph.phone;
  const btn=$("#signupForm button"); if(btn)btn.disabled=true;
  const result=await memberApi("signup",{...data,privacy:data.privacy==="on",marketing:data.marketing==="on"}); if(result.pending)return;
  if(result.error){ if(btn)btn.disabled=false; return toast(result.error); }
  toast(result.linked?"已接上你以前的紀錄":"註冊完成");
  if(data.next==="scan")runScan(); else loadMe();
}

// ───── 總管理：產生報到 QR Code ─────
// 雲端用 liff.line.me 網址：手機相機或 LINE 掃描後直接在 LINE 裡開啟、自動登入，不必另外按 LINE 登入
function checkinUrl(eventId,token){
  if(live&&config.liffId) return `https://liff.line.me/${config.liffId}/#scan?event=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`;
  const base=live&&config.siteUrl?config.siteUrl.replace(/\/$/,"")+"/":STUDENT_HOME;
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
  modal(`<h2>報到 QR Code</h2><p><strong>${escapeHtml(eventLabel(event))}</strong><br><span class="muted">${fmtDate(event.starts_at)}・${escapeHtml(event.location)}</span></p>
    <div class="qr-big">${code.createSvgTag(6,0)}</div>
    <div class="notice">可報到時間：${fmtDate(opensAt.toISOString())} ～ ${fmtDate(closesAt.toISOString())}。請把這張 QR Code 傳給各區負責人，或印出來貼在報到桌；學員掃碼後會自動歸到自己的區域。</div>
    <div class="actions"><button class="secondary" data-action="download-qr" data-event="${eventId}">下載圖檔</button><button class="danger" data-action="renew-qr" data-event="${eventId}">重新產生（舊的立即失效）</button></div>
    ${live?"":`<p class="muted">展示用：<a href="${escapeHtml(url)}" data-action="close-modal">直接開啟掃碼後的頁面</a></p>`}`);
}

// ───── 設定／重設密碼（邀請連結、重設連結共用）─────
function setPassword(){
  if(state.authNotice) return `<article class="card result-card fail" style="max-width:520px;margin:30px auto"><div class="result-icon" aria-hidden="true">!</div><h1>無法設定密碼</h1><p>${escapeHtml(state.authNotice)}</p><a class="button" href="#login">回到登入頁</a></article>`;
  if(live&&state.role==="link-pending") return `${pageHead(state.pendingLink.type==="invite"?"歡迎加入晁人活動 CRM":"重設登入密碼","按下按鈕後，就可以設定你自己的登入密碼。")}<article class="card" style="max-width:460px;margin:auto;text-align:center"><p>這條連結只能使用一次。</p><button class="big" style="width:100%" data-action="redeem-link">開始設定密碼</button></article>`;
  if(!live||state.role!=="setting-password") return `<article class="card" style="max-width:520px;margin:30px auto"><p>請從總管理傳給你的邀請或重設連結進入此頁。</p><a class="button" href="#login">回到登入頁</a></article>`;
  return `${pageHead("設定登入密碼",`帳號：${escapeHtml(state.authEmail||"")}`)}<article class="card" style="max-width:460px;margin:auto"><form id="setPasswordForm">
    <div class="field"><label>新密碼（至少 8 個字）</label><input type="password" name="password" minlength="8" required autocomplete="new-password"></div>
    <div class="field" style="margin-top:12px"><label>再輸入一次</label><input type="password" name="confirm" minlength="8" required autocomplete="new-password"></div>
    <button style="margin-top:16px;width:100%">儲存並登入</button></form></article>`;
}
async function redeemLink(btn){
  btn.disabled=true; btn.textContent="確認中…";
  const {data,error}=await supabase.auth.verifyOtp({token_hash:state.pendingLink.token_hash,type:state.pendingLink.type});
  state.pendingLink=null;
  if(error||!data?.session){ state.role="none"; state.authNotice="這個連結已失效或已經使用過，請總管理重新產生一次。"; return render(); }
  state.authEmail=data.session.user.email; state.role="setting-password"; render();
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
  if(action==="student_status"){ const a=(state.student_accounts||{})[payload.contact_id]; return {ok:true,account:a?{login_type:a.login_type,login:a.login,last_sign_in_at:null}:null}; }
  if(action==="student_link"){
    const c=state.contacts.find(x=>x.id===payload.contact_id); const type=payload.login_type==="phone"?"phone":"email";
    const login=type==="email"?String(c?.email||"").trim().toLowerCase():c?.phone||"";
    if(!c||!studentAuthEmail(type,login)) return {error:"這位會員沒有正確的"+(type==="email"?" Email":"手機")};
    state.student_accounts={...(state.student_accounts||{}),[c.id]:{...(state.student_accounts||{})[c.id],login_type:type,login,used:false}};
    return {ok:true,link:`${STUDENT_HOME}#activate?t=demo-${c.id}`,login,login_type:type,name:c.name};
  }
  if(action==="update"){ const s=state.staff.find(x=>x.id===payload.user_id); if(s.id===state.as&&(payload.active===false||(payload.role&&payload.role!=="admin"))) return {error:"不能停用或降級自己的帳號，避免沒有總管理"}; Object.assign(s,{...(payload.role?{role:payload.role,region_id:payload.role==="region_lead"?payload.region_id:null}:{}),...(typeof payload.active==="boolean"?{active:payload.active}:{})}); persist(); return {ok:true}; }
}
async function loadStaffList(){
  if(!isAdmin()) return;
  const area=$("#staffArea"); if(!area) return;
  const res=await callStaff("list"); if(!$("#staffArea")) return;
  if(res.error){ $("#staffArea").innerHTML=`<div class="notice">${escapeHtml(res.error)}</div>`; return; }
  state.staffList=res.staff;
  const status=s=>!s.active?"<span class='pill off'>已停用</span>":s.invited_pending?"<span class='pill warn'>等待設定密碼</span>":"<span class='pill'>使用中</span>";
  $("#staffArea").innerHTML=`<div class="table-wrap"><table><thead><tr><th>姓名</th><th>Email</th><th>權限</th><th>負責區域</th><th>狀態</th><th></th></tr></thead><tbody>${res.staff.map(s=>{ const m=memberByEmail(s.email); return `<tr><td>${escapeHtml(s.display_name)}${m?`<br><small class="muted">會員 ${escapeHtml(m.member_no||"")}・姓名已同步</small>`:""}</td><td>${escapeHtml(s.email||"")}</td><td>${ROLE_LABELS[s.role]||s.role}</td><td>${s.role==="region_lead"?escapeHtml(regionName(s.region_id)):s.role==="event_staff"?"全部（報名名單）":"全部"}</td><td>${status(s)}</td><td class="row-actions"><button class="secondary" data-action="staff-edit" data-id="${s.user_id}">修改</button><button class="secondary" data-action="staff-reset" data-id="${s.user_id}">${s.invited_pending?"重新產生邀請":"重設密碼連結"}</button></td></tr>`+""; }).join("")}</tbody></table></div>`;
}
// 工作人員與會員以 Email 對應（不分大小寫）；資料庫會自動把工作人員名稱同步成會員姓名
function memberByEmail(email){ const e=String(email||"").trim().toLowerCase(); return e?state.contacts.find(c=>String(c.email||"").trim().toLowerCase()===e&&!c.anonymized_at):null; }
function showLinkModal(title,email,link){
  modal(`<h2>${title}</h2><p>請把下面這條連結<strong>用 LINE 私訊傳給 ${escapeHtml(email||"對方")}</strong>。對方點開後自己設定密碼就能登入。</p>
    <div class="link-box"><input id="linkText" readonly value="${escapeHtml(link)}"><button data-action="copy-link">複製</button></div>
    <div class="notice">這條連結等同一次性的登入鑰匙：只傳給本人、不要貼在群組；用過一次或超過約 24 小時就會失效，失效後再產生一次即可。</div>`);
}
// 沒有 LINE 的學員（例如海外）：總管理選 Email 或手機當帳號，產生一次性設定密碼連結傳給本人
async function studentLinkModal(id){
  const c=state.contacts.find(x=>x.id===id); if(!c||!isAdmin()) return;
  modal(`<h2>學員登入連結</h2><div class="empty">讀取中…</div>`);
  const st=await callStaff("student_status",{contact_id:id});
  if(st.error) return modal(`<h2>學員登入連結</h2><div class="notice">${escapeHtml(st.error)}</div>`);
  const a=st.account, hasEmail=Boolean(studentAuthEmail("email",c.email||"")), hasPhone=Boolean(studentAuthEmail("phone",c.phone||""));
  const pick=a?.login_type||(hasEmail?"email":"phone");
  modal(`<h2>學員登入連結</h2><p>給沒有 LINE 的學員（例如海外）用帳號密碼登入。連結傳給 <strong>${escapeHtml(c.name)}</strong> 本人，對方點開後自己設定密碼。</p>
    ${a?`<div class="notice">目前帳號：${a.login_type==="phone"?"手機":"Email"} ${escapeHtml(a.login_type==="phone"?displayPhone(a.login):a.login)}（${a.last_sign_in_at?`最後登入 ${fmtDate(a.last_sign_in_at)}`:"還沒登入過"}）</div>`:""}
    ${hasEmail||hasPhone?`<form id="studentLinkForm"><input type="hidden" name="contact_id" value="${id}"><div class="field"><label>登入帳號用</label>
      <label><input type="radio" name="login_type" value="email" ${hasEmail?"":"disabled"} ${pick==="email"&&hasEmail?"checked":""}> Email：${escapeHtml(c.email||"（沒有填）")}</label>
      <label><input type="radio" name="login_type" value="phone" ${hasPhone?"":"disabled"} ${pick==="phone"&&hasPhone?"checked":""}> 手機：${escapeHtml(showPhone(c.phone)||"（沒有填）")}</label></div>
      <button type="submit">${a?"重新產生連結":"產生連結"}</button></form>`:`<div class="notice">這位會員沒有 Email 或手機，請先按「編輯資料」補上。</div>`}
    <p class="muted" style="margin-top:12px">連結 7 天內有效、只能用一次；重新產生會讓舊連結失效。學員忘記密碼時，也是重新產生一次。</p>`);
}
async function createStudentLink(data){
  if(!data.login_type) return toast("請選擇登入帳號用 Email 或手機");
  const res=await callStaff("student_link",data); if(res.error) return toast(res.error);
  audit("產生學員登入連結",res.name||""); persist();
  const label=res.login_type==="phone"?`手機 ${displayPhone(res.login)}`:`Email ${res.login}`;
  modal(`<h2>學員登入連結</h2><p>請把連結傳給 <strong>${escapeHtml(res.name||"學員")}</strong> 本人（Email、WhatsApp、LINE 都可以）。對方點開後設定密碼，之後用 <strong>${escapeHtml(label)}</strong> 加密碼登入。</p>
    <div class="link-box"><input id="linkText" readonly value="${escapeHtml(res.link)}"><button data-action="copy-link">複製</button></div>
    <div class="notice">這條連結等同開通鑰匙：只傳給本人、不要貼在群組。7 天內有效、只能用一次。</div>`);
}
// 展示版：學員帳號存在 state.student_accounts（以會員 id 為鍵），連結的 t 就是 demo-會員 id
function demoStudentLink(action,payload){
  const id=String(payload.token||"").replace(/^demo-/,""), a=(state.student_accounts||{})[id], c=state.contacts.find(x=>x.id===id);
  if(!a||!c||a.used) return {error:"這個連結已失效或已經用過，請洽工作人員重新產生"};
  if(action==="link_info") return {ok:true,login_type:a.login_type,login:a.login,name:c.name};
  Object.assign(a,{password:payload.password,used:true}); state.demoStudent=id; persist(); return {ok:true};
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
  const v=key=>escapeHtml(e[key]??""), rows=id?seriesOf(state.events,e):[e];
  modal(`<h2>${id?"編輯活動":"建立活動"}</h2><form id="eventForm"><input type="hidden" name="event_id" value="${id||""}"><input type="hidden" name="removed_sessions" value=""><div class="form-grid">
    <div class="field full"><label>活動名稱 *</label><input name="title" required maxlength="120" value="${v("title")}"></div>
    <div class="field full"><label>活動說明</label><textarea name="theme" maxlength="1000">${v("theme")}</textarea></div>
    <div class="field full"><label>場次</label><div id="sessionRows">${rows.map(sessionRow).join("")}</div><div class="actions"><button type="button" class="secondary" data-action="add-session">＋ 新增場次</button></div><small class="muted">只有一場就不用填場次名稱。兩場以上會共用一張報名 QR，學員報名時勾選要參加哪幾場；每場各自計算名額、各自報到。</small></div>
    <div class="field"><label>報名截止 *</label><input name="registration_deadline" type="datetime-local" required value="${toLocalInput(e.registration_deadline)}"></div>
    <div class="field"><label>地點 *</label><input name="location" required value="${v("location")}"></div>
    <div class="field"><label>費用說明</label><input name="fee_note" value="${v("fee_note")}"></div>
    <div class="field"><label>狀態</label><select name="status">${Object.entries(EVENT_STATUS_LABELS).map(([k,label])=>`<option value="${k}" ${e.status===k?"selected":""}>${label}</option>`).join("")}</select></div>
    <button class="field full">儲存活動</button>${id&&rows.length===1?`<button type="button" class="field full danger" data-action="delete-event" data-id="${id}">刪除活動</button>`:""}</div></form>`);
}
// 編輯活動裡的一個場次：已存在的場次帶 data-id，新增的沒有
function sessionRow(s={}){
  return `<div class="session-row" data-id="${s.id||""}" data-regs="${s.registration_count||0}"><div class="field"><label>場次名稱</label><input name="s_name" maxlength="60" placeholder="例如：放鬆實驗室" value="${escapeHtml(s.session_name||"")}"></div><div class="field"><label>開始時間 *</label><input name="s_start" type="datetime-local" required value="${toLocalInput(s.starts_at)}"></div><div class="field"><label>結束時間</label><input name="s_end" type="datetime-local" value="${toLocalInput(s.ends_at)}"></div><div class="field"><label>名額 *</label><input name="s_capacity" type="number" min="1" max="500" required value="${s.capacity??24}"></div><button type="button" class="secondary small" data-action="remove-session">移除</button></div>`;
}
function addSessionRow(){
  const box=$("#sessionRows"), last=[...box.children].at(-1), get=n=>last?.querySelector(`[name=${n}]`).value||"";
  box.insertAdjacentHTML("beforeend",sessionRow({capacity:get("s_capacity")||24}));
  // 新場次預設接在上一場之後：開始＝上一場結束（沒填結束就同一時間），方便只改時間
  const row=box.lastElementChild; row.querySelector("[name=s_start]").value=get("s_end")||get("s_start");
  row.querySelector("[name=s_name]").focus();
}
function removeSessionRow(btn){
  const row=btn.closest(".session-row"), box=$("#sessionRows");
  if(box.children.length===1) return toast("至少要有一個場次");
  const regs=Number(row.dataset.regs||0);
  if(regs) return toast(`這個場次已有 ${regs} 人報名，不能在這裡移除。可以改時間，或從活動列表刪除這個場次`);
  if(row.dataset.id){ const f=$("#eventForm").elements.removed_sessions; f.value=[f.value,row.dataset.id].filter(Boolean).join(","); }
  row.remove();
}
// 刪除活動：沒有報名紀錄的，總管理與活動幹部都可刪；有報名／報到紀錄的只限總管理，且要輸入活動名稱確認（資料庫也會再檢查一次）
function deleteEventForm(id){
  if(!canEvents())return toast("沒有權限");
  const e=state.events.find(x=>x.id===id); if(!e)return;
  const regs=Math.max(state.registrations.filter(r=>r.event_id===id).length,e.registration_count||0);
  if(regs&&!isAdmin()) return modal(`<h2>無法刪除</h2><p><strong>${escapeHtml(e.title)}</strong> 已有 ${regs} 筆報名／報到紀錄，只有總管理可以刪除。<br>如果只是活動不辦了，可以在「編輯」把狀態改成「已取消」，紀錄會保留。</p><button value="cancel" data-action="close-modal">知道了</button>`);
  modal(`<h2>刪除活動</h2><p><strong>${escapeHtml(eventLabel(e))}</strong><br><span class="muted">${fmtDate(e.starts_at)}・${escapeHtml(e.location||"")}</span></p>
    <div class="notice">刪除後<strong>無法復原</strong>${regs?`：這場活動的 ${regs} 筆報名／報到紀錄會一起移除。如果只是活動不辦了，建議改用「編輯」把狀態改成「已取消」，紀錄會保留`:"。這場活動還沒有人報名"}。</div>
    <form id="deleteEventForm"><input type="hidden" name="event_id" value="${id}">${regs?`<div class="field"><label>請輸入活動名稱「${escapeHtml(e.title)}」確認</label><input name="confirm_title" required autocomplete="off"></div>`:""}
    <div class="actions" style="margin-top:14px"><button class="danger">確認刪除</button><button type="button" class="secondary" data-action="close-modal">取消</button></div></form>`);
}
async function deleteEvent(data){
  const e=state.events.find(x=>x.id===data.event_id); if(!e)return;
  if(data.confirm_title!==undefined&&data.confirm_title.trim()!==e.title.trim()) return toast("活動名稱不符，未刪除");
  if(live){
    const {error}=await supabase.rpc("admin_delete_event",{p_event_id:e.id,p_confirm_title:data.confirm_title?.trim()||null});
    if(error) return toast(error.message.includes("HAS_REGISTRATIONS")?"已有報名紀錄，只有總管理可以刪除":error.message.includes("TITLE_MISMATCH")?"活動名稱不符，未刪除":error.message.includes("FORBIDDEN")?"沒有權限":"刪除失敗："+error.message);
    await loadLiveData();
  } else {
    state.registrations=state.registrations.filter(r=>r.event_id!==e.id);
    if(state.checkin_codes) delete state.checkin_codes[e.id];
    state.events=state.events.filter(x=>x.id!==e.id);
  }
  audit("刪除活動",e.title); persist(); closeModal(); location.hash="#events"; render(); toast("已刪除活動");
}
async function saveEvent(data){
  if(!canEvents())return toast("沒有權限");
  const iso=value=>value?new Date(value).toISOString():null;
  const shared={title:data.title.trim(),theme:data.theme||"",registration_deadline:iso(data.registration_deadline),location:data.location,fee_note:data.fee_note||"免費",status:data.status};
  const rows=[...document.querySelectorAll("#sessionRows .session-row")].map(r=>{const val=n=>r.querySelector(`[name=${n}]`).value;return {id:r.dataset.id||null,session_name:val("s_name").trim(),starts_at:iso(val("s_start")),ends_at:iso(val("s_end")),capacity:Number(val("s_capacity"))};});
  for(const [i,r] of rows.entries()){
    const which=rows.length>1?`第 ${i+1} 場（${r.session_name||fmtDate(r.starts_at)}）`:"";
    if(new Date(shared.registration_deadline)>new Date(r.starts_at))return toast(`報名截止不能晚於${which||""}開始時間`);
    if(r.ends_at&&new Date(r.ends_at)<=new Date(r.starts_at))return toast(`${which}結束時間要晚於開始時間`);
  }
  // 兩場以上用同一個 series_id 綁成一個活動；剩一場就解除綁定，和一般活動一樣
  const current=state.events.find(e=>e.id===data.event_id);
  const series_id=rows.length>1?(seriesOf(state.events,current||{}).find(e=>e.series_id)?.series_id||crypto.randomUUID()):null;
  const removed=(data.removed_sessions||"").split(",").filter(Boolean);
  if(live){
    for(const id of removed){ const {error}=await supabase.rpc("admin_delete_event",{p_event_id:id,p_confirm_title:null}); if(error)return toast("移除場次失敗："+error.message); }
    for(const r of rows){
      const fields={...shared,session_name:r.session_name,starts_at:r.starts_at,ends_at:r.ends_at,capacity:r.capacity,series_id};
      const {error}=r.id?await supabase.from("events").update(fields).eq("id",r.id):await supabase.from("events").insert(fields);
      if(error){ await loadLiveData(); return toast("儲存失敗："+error.message); }
    }
    await loadLiveData();
  } else {
    state.events=state.events.filter(e=>!removed.includes(e.id));
    for(const r of rows){
      const fields={...shared,session_name:r.session_name,starts_at:r.starts_at,ends_at:r.ends_at,capacity:r.capacity,series_id};
      if(r.id) Object.assign(state.events.find(e=>e.id===r.id),fields); else state.events.push({id:crypto.randomUUID(),...fields,registration_count:0});
    }
  }
  audit(data.event_id?"編輯活動":"建立活動",shared.title+(rows.length>1?`（${rows.length} 場）`:"")); persist(); closeModal(); render(); toast(data.event_id?"活動已更新":"活動已建立");
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
  if(importState.result){ const r=importState.result; return `${head}<article class="card result-card ok"><div class="result-icon" aria-hidden="true">✓</div><h1>匯入完成</h1><p>新增 <strong>${r.created}</strong> 位・補資料 <strong>${r.updated||0}</strong> 位・略過 <strong>${r.skipped}</strong> 位（已存在或重複）・失敗 <strong>${r.errors.length}</strong> 列</p><div class="actions" style="justify-content:center">${r.errors.length?`<button class="secondary" data-action="import-errors">下載失敗清單</button>`:""}<a class="button" href="#contacts">看會員資料</a><button class="secondary" data-action="import-reset">再匯入一個檔案</button></div></article>`; }
  const prepared=preparedRows(); const count=k=>prepared.filter(p=>p.status===k).length;
  const opts=sel=>`<option value="">（不匯入）</option>${importState.headers.map((h,i)=>`<option value="${i}" ${sel===i?"selected":""}>${escapeHtml(h||`第 ${i+1} 欄`)}</option>`).join("")}`;
  const mapping=IMPORT_FIELDS.map(([key,label])=>`<div class="field"><label>${label}${key==="name"?" *":""}</label><select data-map-field="${key}">${opts(importState.map[key])}</select></div>`).join("");
  const badge={new:"<span class='pill'>新增</span>",update:"<span class='pill'>補資料</span>",duplicate:"<span class='pill off'>略過</span>",error:"<span class='pill warn'>錯誤</span>"};
  const preview=prepared.slice(0,100).map(p=>`<tr><td>${p.line}</td><td>${badge[p.status]}</td><td>${escapeHtml(p.row.name)}</td><td>${escapeHtml(p.row.phone||"")}</td><td>${escapeHtml(p.row.gender||"")}</td><td>${escapeHtml(p.row.birth_date||"")}</td><td>${escapeHtml(p.row.region_id?regionName(p.row.region_id):"未分區")}</td><td>${p.row.national_id?"有":""}</td><td>${p.row.line_user_id?"已綁":""}</td><td>${p.row.tags.length||""}</td><td class="muted">${escapeHtml([...p.errors,...p.warnings].join("；"))}</td></tr>`).join("");
  return `${head}<article class="card"><h2>2. 確認欄位對應</h2><p class="muted">檔案：${escapeHtml(importState.fileName)}・共 ${prepared.length} 列</p><div class="form-grid map-grid">${mapping}</div></article>
    <article class="card" style="margin-top:16px"><h2>3. 預覽</h2><div class="kpi-line"><span>會新增</span><strong>${count("new")}</strong></div><div class="kpi-line"><span>已存在、補上空白欄位與新標籤（不覆蓋）</span><strong>${count("update")}</strong></div><div class="kpi-line"><span>會略過（已存在且不需補／檔案內重複）</span><strong>${count("duplicate")}</strong></div><div class="kpi-line"><span>有錯誤、不會匯入</span><strong>${count("error")}</strong></div>
    ${importState.map.name===undefined?`<div class="notice">請先指定哪一欄是「姓名」。</div>`:""}
    <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>列</th><th>結果</th><th>姓名</th><th>手機</th><th>性別</th><th>生日</th><th>區域</th><th>身分證</th><th>LINE</th><th>標籤</th><th>說明</th></tr></thead><tbody>${preview}</tbody></table></div>${prepared.length>100?`<p class="muted">只顯示前 100 列，匯入時會處理全部。</p>`:""}
    <div class="actions" style="margin-top:14px"><button data-action="import-run" ${!(count("new")+count("update"))||importState.map.name===undefined?"disabled":""}>確認匯入（新增 ${count("new")}、補資料 ${count("update")}）</button><button class="secondary" data-action="import-reset">換一個檔案</button></div></article>`;
}
async function runImport(){
  if(!isAdmin()||!importState)return;
  const prepared=preparedRows(); const todo=prepared.filter(p=>p.status==="new"||p.status==="update");
  const btn=$("[data-action='import-run']"); if(btn){btn.disabled=true;btn.textContent="匯入中…";}
  const result={created:0,updated:0,skipped:prepared.filter(p=>p.status==="duplicate").length,errors:prepared.filter(p=>p.status==="error").map(p=>({row:p.line,error:p.errors.join("；"),name:p.row.name}))};
  if(live){
    for(let i=0;i<todo.length;i+=200){
      const chunk=todo.slice(i,i+200).map(p=>({...p.row,_row:p.line}));
      const {data,error}=await supabase.rpc("admin_import_contacts",{p_rows:chunk});
      if(error){ result.errors.push(...chunk.map(c=>({row:c._row,error:"上傳失敗："+error.message,name:c.name}))); continue; }
      result.created+=data.created; result.updated+=data.updated||0; result.skipped+=data.skipped; result.errors.push(...data.errors);
    }
    await loadLiveData();
  } else {
    for(const p of todo){
      const ex=p.status==="update"&&state.contacts.find(c=>c.id===p.row.existing_id);
      if(ex){ for(const k of ["phone","gender","birth_date","region_id","residence_city","address","email","national_id","line_user_id"]) if(!ex[k]&&p.row[k]) ex[k]=p.row[k]; ex.tags=[...new Set([...(ex.tags||[]),...p.row.tags])]; if(ex.line_user_id&&ex.line_status==="unknown") ex.line_status="active"; result.updated++; continue; }
      const {existing_id,...row}=p.row; state.contacts.push({id:crypto.randomUUID(),member_no:nextMemberNo(),display_name:"",...row,line_status:row.line_user_id?"active":"unknown",marketing_consent:false,last_interaction_at:new Date().toISOString(),created_at:new Date().toISOString()}); result.created++;
    }
  }
  importState.result=result; audit("匯入會員名冊",`${importState.fileName}：新增 ${result.created}、補資料 ${result.updated}、略過 ${result.skipped}、失敗 ${result.errors.length}`); persist(); render();
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
function memberOptions(selected){ return state.contacts.filter(c=>!c.anonymized_at).sort((a,b)=>a.name.localeCompare(b.name,"zh-Hant")).map(c=>`<option value="${c.id}" ${c.id===selected?"selected":""}>${escapeHtml(c.member_no||"")} ${escapeHtml(c.name)}・${escapeHtml(regionName(c.region_id))}・${escapeHtml(String(c.phone||"").slice(-3))}</option>`).join(""); }
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
  if(action==="edit-profile") return profileForm();
  if(action==="student-logout"){ await studentSignOut(); location.hash="#register"; return toast("已登出"); }
  if(action==="line-login-me"){ if(!lineReady()) return toast(LINE_NOT_READY); await liffReady; return lineLogin(); }
  if(action==="student-link") return studentLinkModal(btn.dataset.id);
  if(action==="approve-application") return reviewApplication(btn.dataset.id,true);
  if(action==="reject-application") return reviewApplication(btn.dataset.id,false);
  if(action==="logout"){ await supabase?.auth.signOut(); location.hash="login"; return location.reload(); }
  if(action==="edit-event"){ event.preventDefault(); return eventForm(btn.dataset.id); }
  if(action==="add-session") return addSessionRow();
  if(action==="remove-session") return removeSessionRow(btn);
  if(action==="forgot-password") return forgotPassword();
  if(action==="redeem-link") return redeemLink(btn);
  if(action==="copy-link"){ const el=$("#linkText"); el.select(); try{ await navigator.clipboard.writeText(el.value); toast("已複製"); }catch{ document.execCommand("copy"); toast("已複製"); } return; }
  if(action==="staff-edit") return staffEditForm(btn.dataset.id);
  if(action==="staff-reset"){ const s=(state.staffList||[]).find(x=>x.user_id===btn.dataset.id); const res=s?.invited_pending?await callStaff("invite",{email:s.email,display_name:s.display_name,role:s.role,region_id:s.region_id}):await callStaff("reset",{user_id:btn.dataset.id}); if(res.error&&s?.invited_pending){ const again=await callStaff("reset",{user_id:btn.dataset.id}); if(again.error) return toast(again.error); return showLinkModal("邀請連結（重新產生）",again.email,again.link); } if(res.error) return toast(res.error); return showLinkModal(s?.invited_pending?"邀請連結（重新產生）":"重設密碼連結",res.email,res.link); }
  if(action==="invite-user") return modal(`<h2>邀請工作人員</h2><p class="muted">建立後會產生一條邀請連結，請用 LINE 傳給對方；對方點開自己設定密碼。</p><form id="inviteForm"><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field"><label>顯示名稱</label><input name="display_name" required></div><div class="field"><label>權限</label><select name="role"><option value="region_lead">區負責人</option><option value="event_staff">活動幹部</option><option value="admin">總管理</option></select></div><div class="field"><label>負責區域（區負責人必填）</label><select name="region_id">${regionOptions(null)}</select></div><button style="margin-top:12px">建立並產生邀請連結</button></form>`);
  if(action==="view-contact") return viewContact(btn.dataset.id);
  if(action==="delete-contact") return deleteContactForm(btn.dataset.id);
  if(action==="delete-event"){ event.preventDefault(); return deleteEventForm(btn.dataset.id); }
  if(action==="event-roster"){ event.preventDefault(); return eventRoster(btn.dataset.id); }
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
  if(action==="export-contacts") return download("會員資料.csv",toCsv(myContacts().map(c=>({...c,region_name:c.region_name||regionName(c.region_id),age:c.age??ageFrom(c.birth_date),line_bound:c.line_status==="active"||c.line_user_id?"是":"否",tag_list:(c.tags||[]).join("、"),created_date:String(c.created_at||"").slice(0,10)})),[["會員編號","member_no"],["姓名","name"],["LINE 名稱","display_name"],["性別","gender"],["出生年月日","birth_date"],["年齡","age"],["區域","region_name"],["手機","phone"],["Email","email"],["地址","address"],["LINE 綁定","line_bound"],["LINE UID","line_user_id"],["標籤","tag_list"],["備註","notes"],["建立日期","created_date"],["最後互動","last_interaction_at"]]),"text/csv;charset=utf-8");
  if(action==="backup"){
    if(live){const {data,error}=await supabase.functions.invoke("export-backup",{body:{}});if(error)return toast(error.message);return download(`crm-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2),"application/json");}
    return download(`crm-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(state,null,2),"application/json");
  }
  if(action==="preview-anonymize") return previewAnonymize();
  if(action==="new-campaign") return campaignDraftForm();
  if(action==="edit-campaign") return campaignDraftForm(btn.dataset.id);
  if(action==="delete-campaign") return deleteCampaign(btn.dataset.id);
  if(action==="pick-all"){ pickCandidates().forEach(c=>campaignPick.add(c.id)); return renderPickList(); }
  if(action==="pick-none"){ pickCandidates().forEach(c=>campaignPick.delete(c.id)); return renderPickList(); }
  if(action==="review-campaign") return reviewCampaign(btn.dataset.id);
  if(action==="cancel-registration") return cancelRegistration(btn.dataset.event);
  if(action==="quick-register") return quickRegister(btn);
  if(action==="back-to-event"){ event.preventDefault(); if(location.hash===btn.getAttribute("href")) return render(); location.hash=btn.getAttribute("href"); return; }
  if(action==="line-login-register"){ if(!lineReady()) return toast(LINE_NOT_READY); await liffReady; return lineLogin(); }
  if(action==="quick-join"){ btn.disabled=true; btn.textContent="報到中…"; return runScan({quickJoin:true}); }
}

document.addEventListener("input",event=>{
  if(event.target.id==="pickSearch") return renderPickList();
  if(event.target.id==="contactSearch"||event.target.id==="checkinSearch"){
    const value=event.target.value.toLowerCase().trim();
    document.querySelectorAll("[data-search]").forEach(row=>row.hidden=!row.dataset.search.includes(value));
  }
});
document.addEventListener("change",event=>{
  if(event.target.dataset.pick){ event.target.checked?campaignPick.add(event.target.dataset.pick):campaignPick.delete(event.target.dataset.pick); return updateAudienceCount(); }
  if(event.target.id==="pickTag"||event.target.id==="pickRegion") return renderPickList();
  if(event.target.name==="audience"&&event.target.closest("#campaignForm")){ document.querySelectorAll("#campaignForm [data-audience]").forEach(el=>el.hidden=el.dataset.audience!==event.target.value); return updateAudienceCount(); }
  if(event.target.name==="event_id"&&event.target.closest("#campaignForm")) return updateAudienceCount();
  if(event.target.name==="login_type"&&event.target.closest("#signinForm")) document.querySelectorAll("#signinForm [data-login]").forEach(el=>el.hidden=el.dataset.login!==event.target.value);
  if(event.target.name==="login_type"&&event.target.closest("#applyForm")) $("#applyEmailLabel").textContent=event.target.value==="email"?"Email *（登入帳號）":"Email";
  if(event.target.id==="eventSwitch")location.hash=`checkin?event=${event.target.value}`;
  if(event.target.id==="regionFilter")location.hash=event.target.value?`contacts?region=${event.target.value}`:"contacts";
  if(event.target.id==="demoUser")switchDemoUser(event.target.value);
  if(event.target.id==="importFile")readImportFile(event.target.files[0]);
  if(event.target.dataset.mapField){ importState.map[event.target.dataset.mapField]=event.target.value===""?undefined:Number(event.target.value); render(); }
  if(event.target.id==="sponsorItemFilter"||event.target.id==="sponsorPaidFilter"){ const p=new URLSearchParams(); const i=$("#sponsorItemFilter").value, pd=$("#sponsorPaidFilter").value; if(i)p.set("item",i); if(pd)p.set("paid",pd); location.hash="sponsors"+(p.toString()?"?"+p:""); }
  if(event.target.id==="demoLine"){ regMember=null; state.demoLine=event.target.value==="new"?`Unew${Date.now()}`:event.target.value; persist(); render(); }
});

async function onSubmit(event){
  if(!["eventForm","campaignForm","registrationForm","quickRegisterForm","loginForm","anonymizeForm","inviteForm","contactForm","signupForm","sponsorForm","batchSponsorForm","setPasswordForm","forgotForm","staffEditForm","deleteContactForm","deleteEventForm","profileForm","signinForm","activateForm","studentLinkForm","applyForm"].includes(event.target.id))return;
  event.preventDefault(); const data=Object.fromEntries(new FormData(event.target));
  if(event.target.id==="contactForm") return saveContact(data);
  if(event.target.id==="profileForm") return saveProfile(event.target,data);
  if(event.target.id==="signinForm") return submitSignin(data);
  if(event.target.id==="activateForm") return submitActivate(event.target,data);
  if(event.target.id==="studentLinkForm") return createStudentLink(data);
  if(event.target.id==="applyForm") return submitApply(event.target,data);
  if(event.target.id==="signupForm") return submitSignup(data);
  if(event.target.id==="sponsorForm") return saveSponsor(data);
  if(event.target.id==="batchSponsorForm") return saveBatchSponsor(data);
  if(event.target.id==="eventForm") return saveEvent(data);
  if(event.target.id==="campaignForm"){
    const audience=["all","selected"].includes(data.audience)?data.audience:"event";
    if(audience==="selected"&&!campaignPick.size) return toast("請至少勾選一位學員");
    if(audience==="event"&&!data.event_id) return toast("請選擇活動");
    const draft={name:data.name,body:data.body,audience,event_id:audience==="event"?data.event_id:null,contact_ids:audience==="selected"?[...campaignPick]:null};
    const count=campaignRecipients(draft).length;
    if(live){
      const q=data.campaign_id?supabase.from("message_campaigns").update({...draft,eligible_count:count}).eq("id",data.campaign_id).eq("status","draft").select("id"):supabase.from("message_campaigns").insert({...draft,status:"draft",eligible_count:count}).select("id");
      const {data:saved,error}=await q; if(error)return toast(error.message); if(!saved?.length) return toast("這份草稿已經送出，不能再修改");
      await loadLiveData();
    } else if(data.campaign_id){ const c=state.campaigns.find(x=>x.id===data.campaign_id&&x.status==="draft"); if(!c) return toast("這份草稿已經送出，不能再修改"); Object.assign(c,draft,{eligible_count:count}); }
    else state.campaigns.push({id:crypto.randomUUID(),...draft,status:"draft",eligible_count:count,success_count:0,failed_count:0});
    audit(data.campaign_id?"修改訊息草稿":"建立訊息草稿",data.name);persist();closeModal();render();toast("已儲存，尚未發送");
  }
  if(event.target.id==="registrationForm") return submitRegistration(data,sessionIds(event.target));
  if(event.target.id==="quickRegisterForm") return quickRegisterMany(event.target,sessionIds(event.target));
  if(event.target.id==="loginForm"){
    const {error}=await supabase.auth.signInWithPassword(data); if(error)return toast("登入失敗，請確認帳號與密碼"); setStudentMode(false); await loadLiveData();
    if(state.role==="none"){ await supabase.auth.signOut(); return toast("這個帳號尚未開通工作人員權限，請洽總管理"); }
    location.hash="dashboard";
  }
  if(event.target.id==="anonymizeForm") return executeAnonymize(data.confirmText);
  if(event.target.id==="setPasswordForm") return savePassword(data);
  if(event.target.id==="deleteContactForm") return deleteContact(data);
  if(event.target.id==="deleteEventForm") return deleteEvent(data);
  if(event.target.id==="forgotForm") return sendResetEmail(data);
  if(event.target.id==="staffEditForm"){ const res=await callStaff("update",{user_id:data.user_id,role:data.role,region_id:data.region_id||null,active:data.active==="on"}); if(res.error) return toast(res.error); closeModal(); audit("修改工作人員",data.user_id); persist(); render(); return toast("已更新"); }
  if(event.target.id==="inviteForm"){
    if(data.role==="region_lead"&&!data.region_id) return toast("區負責人必須指定區域");
    const res=await callStaff("invite",{...data,region_id:data.role==="region_lead"?data.region_id:null});
    if(res.error) return toast(res.error);
    audit("邀請工作人員",data.email); persist(); render(); showLinkModal("邀請連結",res.email,res.link);
  }
}

// 報名表要報的場次：多場次的勾選框，或單場活動的隱藏欄位
function sessionIds(form){
  const boxes=[...form.querySelectorAll("[name=session]")];
  return boxes.length?boxes.filter(b=>b.checked).map(b=>b.value):[form.elements.event_id?.value].filter(Boolean);
}

async function submitRegistration(data,ids){
  if(!ids.length) return toast("請至少勾選一個場次");
  if(!GENDERS.includes(data.gender))return toast("請選擇性別");
  if(live&&lineReady()){ try{ await liffReady; if(!lineSignedIn()) return lineLogin({data:{...data},ids}); }catch(error){ return toast(error.message); } }
  const ph=readPhone(data); if(ph.error) return toast(ph.error); data.phone=ph.phone;
  delete data.session;
  if(ids.length>1) return submitSessions(data,ids);
  data.event_id=ids[0];
  if(live){
    if(!lineReady()) return toast(LINE_NOT_READY);
    try{ await liffReady; const idToken=window.liff.getIDToken(); const res=await fetch(`${config.supabaseUrl}/functions/v1/line-auth`,{method:"POST",headers:{"Content-Type":"application/json","apikey":config.supabasePublishableKey},body:JSON.stringify({...data,idToken,marketing:data.marketing==="on"})}); const body=await res.json(); if(!res.ok)throw new Error(body.error||"報名失敗"); }
    catch(error){return toast(error.message);}
    await refreshEventCounts(); regMember=null;
  } else { const error=demoRegister(data); if(error) return toast(error); }
  regMember=null; persist(); $("#app").innerHTML=`<article class="card" style="max-width:560px;margin:40px auto;text-align:center"><h1>報名完成</h1><p>我們已收到你的資料，${remindText()}。</p><div class="actions" style="justify-content:center"><a class="button" href="#me">看我的活動</a><a class="button secondary" href="#register?event=${data.event_id}" data-action="back-to-event">回到活動頁</a><a class="button secondary" href="#register">回首頁</a></div></article>`;
}

// 新朋友一次報名多個場次：同一份資料逐場送出（後端只補空白欄位，重複送不會覆蓋），每場各自記錄來源
async function submitSessions(data,ids){
  const backId=query().get("event")||ids[0], results=[];
  if(live){
    if(!lineReady()) return toast(LINE_NOT_READY);
    let idToken;
    try{ await liffReady; idToken=window.liff.getIDToken(); }catch(error){ return toast(error.message); }
    for(const id of ids){
      try{ const res=await fetch(`${config.supabaseUrl}/functions/v1/line-auth`,{method:"POST",headers:{"Content-Type":"application/json","apikey":config.supabasePublishableKey},body:JSON.stringify({...data,event_id:id,idToken,marketing:data.marketing==="on"})}); const body=await res.json().catch(()=>({})); results.push({id,error:res.ok?null:(body.error||"報名失敗")}); }
      catch(error){ results.push({id,error:error.message}); }
    }
    await refreshEventCounts();
  } else for(const id of ids) results.push({id,error:demoRegister({...data,event_id:id})});
  regMember=null; persist(); sessionsDoneView(results,backId);
}

// 展示：以目前選定的學員 LINE 身分報名，和雲端一樣「同一個 LINE＝同一位會員」；有問題回傳錯誤訊息
function demoRegister(data){
    let contact=state.contacts.find(c=>c.line_user_id===state.demoLine);
    const leadTags=data.campaign_type==="outdoor"?outdoorLeadTags({...data,theme:data.source_theme,online_trial_interest:data.online_trial_interest==="on"}):[];
    if(contact) Object.assign(contact,{gender:contact.gender||data.gender,residence_city:contact.residence_city||data.residence_city||null,name:data.name,phone:data.phone,email:data.email||contact.email,marketing_consent:data.marketing==="on",tags:[...new Set([...(contact.tags||[]),data.interest,...leadTags])],last_interaction_at:new Date().toISOString()});
    else { contact={id:crypto.randomUUID(),member_no:nextMemberNo(),name:data.name,display_name:"LINE 新朋友",phone:data.phone,email:data.email,gender:data.gender,birth_date:null,region_id:null,residence_city:data.residence_city||null,address:"",national_id:"",notes:"",line_user_id:state.demoLine,line_status:"active",marketing_consent:data.marketing==="on",tags:[data.interest,...leadTags],last_interaction_at:new Date().toISOString(),created_at:new Date().toISOString()}; state.contacts.push(contact); }
    const existing=state.registrations.find(r=>r.event_id===data.event_id&&r.contact_id===contact.id); const e=state.events.find(x=>x.id===data.event_id);
    if(existing&&!existing.cancelled_at) return "你已經報名過這場活動";
    if(eventState(e)!=="報名中") return `目前${eventState(e)}`;
    if(existing) Object.assign(existing,{attendance_status:"registered",cancelled_at:null,registered_at:new Date().toISOString()});
    else state.registrations.push({id:crypto.randomUUID(),event_id:data.event_id,contact_id:contact.id,attendance_status:"registered",payment_status:"pending",registered_at:new Date().toISOString(),cancelled_at:null,lead_city:data.lead_city||null,contact_mode:data.contact_mode||null,sleep_issue:data.sleep_issue||null,stress_issue:data.stress_issue||null,weekly_practice_interest:data.weekly_practice_interest==="on",online_trial_interest:data.online_trial_interest==="on",...snsAttribution(data)});
    e.registration_count++;
    return null;
}

async function cancelRegistration(eventId){
  if(!live){
    const contact=state.demoStudent?state.contacts.find(c=>c.id===state.demoStudent):state.contacts.find(c=>c.line_user_id===state.demoLine);
    const reg=contact&&state.registrations.find(r=>r.event_id===eventId&&r.contact_id===contact.id&&!r.cancelled_at);
    if(!reg)return toast("找不到可取消的報名");
    reg.cancelled_at=new Date().toISOString();reg.attendance_status="cancelled";
    const e=state.events.find(x=>x.id===eventId); if(e&&e.registration_count>0)e.registration_count--;persist();toast("已取消報名");
    forgetRegistration(eventId); render();return;
  }
  if(studentMode()){ const res=await memberApi("cancel",{event_id:eventId}); if(res.pending)return; if(res.error)return toast(res.error); toast("已取消報名"); await refreshEventCounts(); forgetRegistration(eventId); return render(); }
  try{
    if(!lineReady()) return toast(LINE_NOT_READY);
    await liffReady;if(!lineSignedIn())return lineLogin();
    const res=await fetch(`${config.supabaseUrl}/functions/v1/line-auth`,{method:"POST",headers:{"Content-Type":"application/json",apikey:config.supabasePublishableKey},body:JSON.stringify({action:"cancel",event_id:eventId,idToken:window.liff.getIDToken()})});
    const body=await res.json();if(!res.ok)throw new Error(body.error||"取消失敗");toast("已取消報名");
    await refreshEventCounts(); forgetRegistration(eventId); render();
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
  else {
    const r=state.registrations.find(x=>x.id===id), c=state.contacts.find(x=>x.id===r.contact_id), e=state.events.find(x=>x.id===r.event_id);
    Object.assign(r,{attendance_status:next,checked_in_at:next==="attended"?new Date().toISOString():null});
    const others=state.registrations.filter(x=>x.contact_id===r.contact_id&&x.id!==r.id&&x.attendance_status==="attended"&&!x.cancelled_at).map(x=>state.events.find(ev=>ev.id===x.event_id)?.title||"");
    if(c&&e) c.tags=eventTagsAfterCheckin(c.tags||[],e.title,next==="attended",others);
  }
  audit(next==="attended"?"完成報到":"取消報到",reg.name);persist();render();toast(next==="attended"?"已完成報到":"已取消報到");
}
// LINE 訊息的發送對象：某場活動的報名者／全員／指定學員；都只算同意接收、LINE 可聯絡的人
let campaignPick=new Set();
function campaignRecipients(c){
  if(c.audience==="all") return state.contacts.filter(campaignEligible);
  if(c.audience==="selected"){ const ids=new Set(c.contact_ids||[]); return state.contacts.filter(x=>ids.has(x.id)&&campaignEligible(x)); }
  return eligibleForEvent(c.event_id);
}
function audienceLabel(c){
  if(c.audience==="all") return "全員";
  if(c.audience==="selected") return `指定 ${(c.contact_ids||[]).length} 位學員`;
  const e=state.events.find(x=>x.id===c.event_id); return `活動報名者：${e?eventLabel(e):"（活動已刪除）"}`;
}
function campaignDraftForm(id){
  const c=id?state.campaigns.find(x=>x.id===id&&x.status==="draft"):null; if(id&&!c) return toast("只有還沒送出的草稿可以修改");
  campaignPick=new Set(c?.audience==="selected"?c.contact_ids||[]:[]);
  const aud=c?.audience||"event";
  const tags=[...new Set(state.contacts.flatMap(c=>c.tags||[]))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  modal(`<h2>${c?"修改":"新增"} LINE 推播專案</h2><form id="campaignForm">${c?`<input type="hidden" name="campaign_id" value="${c.id}">`:""}<div class="field"><label>主旨</label><input name="name" required maxlength="80" autocomplete="off" value="${escapeHtml(c?.name||"")}"></div>
    <div class="field"><label>發送對象</label><div class="actions"><label><input type="radio" name="audience" value="event" ${aud==="event"?"checked":""}> 某場活動的報名者</label><label><input type="radio" name="audience" value="all" ${aud==="all"?"checked":""}> 全員</label><label><input type="radio" name="audience" value="selected" ${aud==="selected"?"checked":""}> 指定學員</label></div></div>
    <div class="field" data-audience="event" ${aud==="event"?"":"hidden"}><label>活動</label><select name="event_id">${state.events.map(e=>`<option value="${e.id}" ${c?.event_id===e.id?"selected":""}>${escapeHtml(eventLabel(e))}・${fmtDate(e.starts_at)}</option>`).join("")}</select></div>
    <div data-audience="selected" ${aud==="selected"?"":"hidden"}>
      <div class="form-grid"><div class="field"><label>標籤</label><select id="pickTag"><option value="">全部標籤</option>${tags.map(t=>`<option>${escapeHtml(t)}</option>`).join("")}</select></div>
        <div class="field"><label>區域</label><select id="pickRegion"><option value="">全部區域</option>${state.regions.map(r=>`<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("")}<option value="none">尚未分區</option></select></div>
        <div class="field full"><label>搜尋姓名或會員編號</label><input id="pickSearch" autocomplete="off"></div></div>
      <div class="actions" style="margin:8px 0"><button type="button" class="secondary small" data-action="pick-all">勾選目前清單全部</button><button type="button" class="secondary small" data-action="pick-none">取消勾選目前清單</button></div>
      <div id="pickList" class="pick-list"></div></div>
    <div class="notice" style="margin-top:10px">預計發送 <strong id="audienceCount">0</strong> 位。沒綁 LINE、沒同意接收活動訊息或已封鎖的人不會收到，也不會出現在清單。</div>
    <div class="field"><label>訊息內容（500 字以內）</label><textarea name="body" required maxlength="500">${escapeHtml(c?.body||"")}</textarea></div><button>儲存檔案</button></form>`);
  renderPickList();
}
async function deleteCampaign(id){
  const c=state.campaigns.find(x=>x.id===id); if(!c||c.status!=="draft"||!isAdmin()) return toast("只有還沒送出的草稿可以刪除");
  if(!confirm(`刪除草稿「${c.name}」？刪除後無法復原。`)) return;
  if(live){ const {data,error}=await supabase.from("message_campaigns").delete().eq("id",id).eq("status","draft").select("id"); if(error) return toast(error.message); if(!data?.length) return toast("這份草稿已經送出，不能刪除"); await loadLiveData(); }
  else state.campaigns=state.campaigns.filter(x=>x.id!==id);
  audit("刪除訊息草稿",c.name); persist(); render(); toast("已刪除草稿");
}
function pickCandidates(){
  const tag=$("#pickTag")?.value||"", region=$("#pickRegion")?.value||"", q=($("#pickSearch")?.value||"").trim().toLowerCase();
  return state.contacts.filter(campaignEligible).filter(c=>(!tag||(c.tags||[]).includes(tag))&&(!region||(region==="none"?!c.region_id:c.region_id===region))&&(!q||`${c.name} ${c.member_no||""}`.toLowerCase().includes(q)));
}
function renderPickList(){
  const box=$("#pickList"); if(!box) return;
  const list=pickCandidates();
  box.innerHTML=list.length?list.map(c=>`<label class="pick-row"><input type="checkbox" data-pick="${c.id}" ${campaignPick.has(c.id)?"checked":""}><span>${escapeHtml(c.name)}</span><small class="muted">${escapeHtml(c.member_no||"")}・${escapeHtml(regionName(c.region_id))}</small></label>`).join(""):`<p class="muted">沒有符合條件、可以收 LINE 訊息的學員。</p>`;
  updateAudienceCount();
}
function updateAudienceCount(){
  const f=$("#campaignForm"), el=$("#audienceCount"); if(!f||!el) return;
  const audience=f.querySelector("[name=audience]:checked")?.value||"event";
  el.textContent=audience==="selected"?campaignPick.size:campaignRecipients({audience,event_id:f.elements.event_id?.value}).length;
}
function eligibleForEvent(eventId){ const ids=new Set(state.registrations.filter(r=>r.event_id===eventId&&!r.cancelled_at).map(r=>r.contact_id)); return state.contacts.filter(c=>ids.has(c.id)&&campaignEligible(c)); }
function reviewCampaign(id){ const c=state.campaigns.find(x=>x.id===id); const people=campaignRecipients(c); modal(`<h2>最後確認</h2><div class="notice">即將發送給 <strong>${people.length}</strong> 位已同意且可聯絡的 LINE 好友（${escapeHtml(audienceLabel(c))}）。</div><details class="tag-box"><summary>收件人名單（${people.length}）</summary><p>${people.map(x=>escapeHtml(x.name)).join("、")||"（沒有人）"}</p></details><p><strong>${escapeHtml(c.name)}</strong></p><p>${escapeHtml(c.body)}</p><form id="sendCampaignForm"><button type="button" data-send-id="${c.id}" id="confirmSend">確認送出</button> <button class="secondary" value="cancel">返回修改</button></form>`); $("#confirmSend").onclick=()=>sendCampaign(c,people); }
async function sendCampaign(c,people){
  $("#confirmSend").disabled=true;
  if(live){ const {data,error}=await supabase.functions.invoke("send-campaign",{body:{campaignId:c.id}}); if(error){$("#confirmSend").disabled=false;return toast(error.message);} c.success_count=data.success;c.failed_count=data.failed; }
  else { c.success_count=people.length;c.failed_count=0;c.status="sent"; }
  audit("確認並發送 LINE 訊息",c.name);persist();closeModal();render();toast(`已完成：成功 ${c.success_count}、失敗 ${c.failed_count}`);
}
function audit(action,target){ state.audit.unshift({at:new Date().toLocaleString("zh-TW"),actor:state.staff?.find(s=>s.id===state.as)?.display_name||"工作人員",action,target}); }
function download(name,content,type){ const blob=new Blob([type.startsWith("text/csv")?"\ufeff"+content:content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);audit("匯出資料",name);persist();toast(`已下載 ${name}`); }

boot();
