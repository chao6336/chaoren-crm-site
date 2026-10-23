export const ROLE_LABELS = { admin: "總管理", event_staff: "活動幹部", region_lead: "區負責人" };

// 建立／編輯活動、產報到 QR、處理報名與報到。
export function canManageEvents(role) {
  return role === "admin" || role === "event_staff";
}

// 會員資料頁：總管理與區負責人（活動幹部只看報名名單）。
export function canBrowseMembers(role) {
  return role === "admin" || role === "region_lead";
}
export const GENDERS = ["男", "女", "其他"];

// 居住縣市：和「所屬區域」（決定由哪位區負責人管）分開，只記住在哪裡、方便統計。順序同內政部縣市排列。
export const CITIES = ["臺北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "宜蘭縣", "苗栗縣", "臺中市", "彰化縣", "南投縣", "雲林縣",
  "嘉義市", "嘉義縣", "臺南市", "高雄市", "屏東縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣", "海外"];

// 改制前的舊縣名（舊名冊地址常見）
const OLD_COUNTIES = { "臺北縣": "新北市", "桃園縣": "桃園市", "臺中縣": "臺中市", "臺南縣": "臺南市", "高雄縣": "高雄市" };

// 「台北」「台北市大安區…」「100 臺北市…」「臺北縣板橋市…」都對到正式名稱；對不上或分不出（「新竹」「嘉義」）回傳 ""。
export function normalizeCity(value) {
  const text = String(value ?? "").trim().replace(/台/g, "臺").replace(/^\d{3,6}\s*/, "");
  if (!text) return "";
  if (["國外", "海外", "外國"].includes(text)) return "海外";
  const old = Object.keys(OLD_COUNTIES).find(k => text.startsWith(k));
  if (old) return OLD_COUNTIES[old];
  const hit = CITIES.find(c => text.startsWith(c));
  if (hit) return hit;
  const short = CITIES.filter(c => c !== "海外" && c.slice(0, 2) === text);
  return short.length === 1 ? short[0] : "";
}

// ───── 手機：資料庫一律存國際格式（E.164，例如 +886912345678），畫面上一律顯示國碼：+886 912-345-678 ─────
// 下拉選單的國碼；「其他」讓使用者自己輸入 + 開頭的完整號碼。
export const COUNTRY_CODES = [
  ["886", "台灣 +886"], ["852", "香港 +852"], ["853", "澳門 +853"], ["86", "中國 +86"], ["65", "新加坡 +65"],
  ["60", "馬來西亞 +60"], ["81", "日本 +81"], ["1", "美國／加拿大 +1"], ["61", "澳洲 +61"]
];
const KNOWN_CODES = COUNTRY_CODES.map(([code]) => code).sort((a, b) => b.length - a.length);

export function isValidPhone(value) {
  return /^\+[1-9]\d{7,14}$/.test(String(value ?? ""));
}

// 接受：0912-345-678、912345678（Excel 吃掉 0）、+886 912 345 678、886912345678、+60 12-345 6789
// countryCode：表單選的國碼（不含 +）；號碼若已帶 +、00 或 886 開頭則以號碼為準。回傳 E.164 或 null。
export function normalizePhone(value, countryCode = "886") {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith("+") || raw.startsWith("00");
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("00")) digits = digits.slice(2);
  let e164;
  if (hasPlus) e164 = "+" + digits;
  else if (/^886\d{9}$/.test(digits)) e164 = "+" + digits;
  else if (String(countryCode) === "886") {
    if (/^9\d{8}$/.test(digits)) digits = "0" + digits;
    e164 = /^09\d{8}$/.test(digits) ? "+886" + digits.slice(1) : null;
  } else e164 = "+" + countryCode + digits.replace(/^0+/, "");
  if (!e164 || !isValidPhone(e164)) return null;
  if (e164.startsWith("+886") && !/^\+8869\d{8}$/.test(e164)) return null; // 台灣只收手機
  return e164;
}

export function splitPhone(e164 = "") {
  if (!e164 || !e164.startsWith("+")) return { code: "886", local: e164 || "" };
  const code = KNOWN_CODES.find(c => e164.startsWith("+" + c)) || "";
  const rest = e164.slice(1 + code.length);
  return code ? { code, local: rest } : { code: "other", local: e164 };
}

export function displayPhone(e164 = "") {
  if (!e164) return "";
  if (!String(e164).startsWith("+")) return e164; // 尚未轉換的舊格式照原樣顯示
  if (/^\+8869\d{8}$/.test(e164)) { const d = e164.slice(4); return `+886 ${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`; }
  const { code, local } = splitPhone(e164);
  return code && code !== "other" ? `+${code} ${local}` : e164;
}

export function maskPhone(value = "") {
  if (!value) return "";
  if (String(value).includes("*")) return value; // 雲端已遮罩過
  const shown = displayPhone(value);
  const digits = shown.replace(/\D/g, "");
  if (digits.length < 6) return "***";
  if (/^\+8869\d{8}$/.test(value)) return `+886 ${value.slice(4, 7)}***${value.slice(-3)}`;
  const prefix = shown.startsWith("+") ? (shown.includes(" ") ? shown.split(" ")[0] : shown.slice(0, 3)) + " " : digits.slice(0, 4);
  return `${prefix}***${digits.slice(-3)}`;
}

export function maskEmail(value = "") {
  const [name, domain] = value.split("@");
  if (!name || !domain) return value ? "***" : "";
  return `${name.slice(0, 1)}***@${domain}`;
}

export function maskNationalId(value = "") {
  const text = String(value || "").trim().toUpperCase();
  if (!text) return "";
  if (text.length < 7) return "***";
  return `${text.slice(0, 3)}****${text.slice(-3)}`;
}

export function maskAddress(value = "") {
  return value ? `${value.slice(0, 6)}***` : "";
}

export function isValidNationalId(value = "") {
  return /^[A-Z][0-9A-Z][0-9]{8}$/.test(String(value).trim().toUpperCase());
}

export function ageFrom(birthDate, now = new Date()) {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  if (now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate())) age--;
  return age;
}

export function canViewPrivate(role) {
  return role === "admin";
}

// 完整身分證永遠不放在一般畫面資料裡，只留遮罩；總管理要另外按「查看」才取得。
export function visibleContact(contact, role) {
  const { national_id, ...rest } = contact;
  const safe = { ...rest, national_id_masked: contact.national_id_masked || maskNationalId(national_id) };
  if (canViewPrivate(role)) return safe;
  return { ...safe, phone: maskPhone(contact.phone), email: maskEmail(contact.email), address: maskAddress(contact.address), line_uid_hidden: true };
}

// 區負責人只看得到自己區的會員；沒有區域的會員只有總管理看得到。
export function canSeeContact(contact, viewer) {
  if (viewer.role === "admin") return true;
  return viewer.role === "region_lead" && Boolean(contact.region_id) && contact.region_id === viewer.region_id;
}

export function scopeContacts(contacts, viewer) {
  return contacts.filter(contact => canSeeContact(contact, viewer));
}

// 報名名單（報到用）：總管理與活動幹部看全部；區負責人只看自己區。只帶報到需要的最少欄位。
export function rosterFor(registrations, contacts, viewer, regionName = () => "") {
  const byId = new Map(contacts.map(c => [c.id, c]));
  const list = canManageEvents(viewer.role) ? registrations : scopeRegistrations(registrations, contacts, viewer);
  return list.map(r => {
    const c = byId.get(r.contact_id) || {};
    return { ...r, member_no: c.member_no || "", name: c.name || "未知", region_id: c.region_id || null, region_name: c.region_id ? regionName(c.region_id) : "未分區", phone_last3: String(c.phone || "").slice(-3) };
  });
}

export function scopeRegistrations(registrations, contacts, viewer) {
  const visible = new Set(scopeContacts(contacts, viewer).map(contact => contact.id));
  return registrations.filter(item => visible.has(item.contact_id));
}

export function eventState(event, now = new Date()) {
  if (event.status === "cancelled") return "已取消";
  if (event.status === "draft") return "草稿";
  if (event.status === "completed") return "已結束";
  if (new Date(event.registration_deadline) < now) return "已截止";
  if ((event.registration_count || 0) >= event.capacity) return "已額滿";
  return "報名中";
}

// 同一活動的不同場次：一張報名 QR，學員在報名頁勾選要參加的場次。
// 在「編輯活動」加的場次用 series_id 綁在一起；沒有 series_id 的舊活動，同名的也算同一組。
// 只合併目前「報名中」的場次（連結本身那場不論狀態都保留），往年同名活動早已截止，不會被混進來。
const byStart = (a, b) => new Date(a.starts_at) - new Date(b.starts_at);
export function eventSessions(events, event, now = new Date()) {
  const title = (event.title || "").trim();
  const same = event.series_id ? e => e.series_id === event.series_id : e => !e.series_id && (e.title || "").trim() === title;
  return events.filter(e => e.id === event.id || (same(e) && eventState(e, now) === "報名中")).sort(byStart);
}

// 編輯活動時要一起編的場次：同一個 series_id 的全部場次，不論狀態
export function seriesOf(events, event) {
  return event.series_id ? events.filter(e => e.series_id === event.series_id).sort(byStart) : [event];
}

export function eventLabel(event) {
  return event.session_name ? `${event.title}｜${event.session_name}` : event.title;
}

export function campaignEligible(contact) {
  return Boolean(contact.line_user_id && contact.marketing_consent && contact.line_status === "active" && !contact.anonymized_at);
}

export const OUTDOOR_CITIES = ["台中", "大台北", "高雄"];
export const CONTACT_MODES = ["正式參加者", "現場圍觀者", "親友介紹"];
export const SELF_CHECK_VALUES = ["經常", "偶爾", "很少"];

// 戶外招生標籤由後端依白名單欄位產生，避免把任意網址參數直接寫成會員標籤。
export function outdoorLeadTags({ lead_city = "", contact_mode = "", theme = "", online_trial_interest = false } = {}) {
  const tags = ["戶外體驗"];
  if (OUTDOOR_CITIES.includes(lead_city)) tags.push(lead_city);
  if (CONTACT_MODES.includes(contact_mode)) tags.push(contact_mode);
  if (theme) tags.push(theme);
  if (online_trial_interest) tags.push("免費線上課意願");
  return [...new Set(tags)];
}

export function snsAttribution({ utm_source = "", utm_medium = "", utm_campaign = "", utm_content = "" } = {}) {
  const clean = value => String(value || "").trim().slice(0, 80);
  return { utm_source: clean(utm_source), utm_medium: clean(utm_medium), utm_campaign: clean(utm_campaign), utm_content: clean(utm_content) };
}

export function leadFunnelStats(registrations = []) {
  const valid = registrations.filter(r => !r.cancelled_at && r.marketing_consent !== false);
  const online = valid.filter(r => r.online_trial_attended_at).length;
  const paid = valid.filter(r => r.paid_course_purchased_at).length;
  const pct = (n, d) => d ? Math.round(n / d * 100) : 0;
  return { leads: valid.length, onlineAttendees: online, buyers: paid, leadToOnlineRate: pct(online, valid.length), onlineToBuyerRate: pct(paid, online) };
}

export function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows, columns) {
  const head = columns.map(([label]) => csvEscape(label)).join(",");
  const body = rows.map(row => columns.map(([, key]) => csvEscape(row[key])).join(","));
  return [head, ...body].join("\r\n");
}

export function dashboardStats(events, registrations, contacts) {
  const active = registrations.filter(item => !item.cancelled_at);
  const attended = active.filter(item => item.attendance_status === "attended").length;
  const cancelled = registrations.filter(item => item.cancelled_at).length;
  return {
    events: events.length,
    registrations: active.length,
    attendanceRate: active.length ? Math.round((attended / active.length) * 100) : 0,
    cancellationRate: registrations.length ? Math.round((cancelled / registrations.length) * 100) : 0,
    contacts: contacts.filter(item => !item.anonymized_at).length
  };
}

// 報到開放時間：活動開始前 3 小時，到結束後 2 小時（沒填結束時間當作 4 小時）。與資料庫 checkin_window 一致。
export function checkinWindow(event) {
  const start = new Date(event.starts_at).getTime();
  const end = event.ends_at ? new Date(event.ends_at).getTime() : start + 4 * 3600e3;
  return { opensAt: new Date(start - 3 * 3600e3), closesAt: new Date(end + 2 * 3600e3) };
}

export function checkinProblem(event, token, validToken, now = new Date()) {
  if (!event || !["published", "completed"].includes(event.status)) return "EVENT_CLOSED";
  if (!token || token !== validToken) return "INVALID_TOKEN";
  const { opensAt, closesAt } = checkinWindow(event);
  if (now < opensAt) return "NOT_OPEN";
  if (now > closesAt) return "CHECKIN_CLOSED";
  return null;
}

// 首次 LINE 登入時，手機＋姓名都對得上「尚未綁 LINE 的舊名冊」才接上。與資料庫 student_signup 一致。
export function findLegacyContact(contacts, { name, phone }) {
  const clean = value => String(value || "").replace(/\s/g, "");
  return contacts.find(c => !c.line_user_id && !c.anonymized_at && c.phone === phone && clean(c.name) === clean(name)) || null;
}

export const ATTENDANCE_LABELS = { attended: "已參加", registered: "已報名", cancelled: "已取消", absent: "未出席" };

// ───── Excel／CSV 匯入 ─────

// 接受：1962-03-18、1962/3/18、民國 51/03/18、510318、19620318、Excel 日期序號。回傳 YYYY-MM-DD 或 null。
export function parseBirthDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const pad = n => String(n).padStart(2, "0");
  const build = (y, m, d) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    if (y < 1900 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    if (date > new Date()) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  };
  if (typeof value === "number" || /^\d{5}$/.test(String(value).trim())) {
    const serial = Number(value);
    if (serial > 1 && serial < 80000) { const date = new Date(Date.UTC(1899, 11, 30) + serial * 864e5); return build(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()); }
  }
  const text = String(value).trim().replace(/^民國\s*/, "").replace(/[年月.]/g, "/").replace(/日$/, "");
  let m = text.match(/^(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) { let y = Number(m[1]); if (y < 200) y += 1911; return build(y, Number(m[2]), Number(m[3])); }
  m = text.match(/^(\d{8})$/); if (m) return build(Number(text.slice(0, 4)), Number(text.slice(4, 6)), Number(text.slice(6, 8)));
  m = text.match(/^(\d{6,7})$/); if (m) { const y = Number(text.slice(0, -4)) + 1911; return build(y, Number(text.slice(-4, -2)), Number(text.slice(-2))); }
  return null;
}

export function normalizeGender(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (["男", "m", "male", "男性", "先生"].includes(text)) return "男";
  if (["女", "f", "female", "女性", "小姐", "女士"].includes(text)) return "女";
  return "其他";
}

// 第三欄是欄位名稱的別名，依優先順序排列（越前面越優先）。
// 第四欄（選填）用內容辨認：欄名對不上時，若某欄大多數值長得像，就自動對應。
export const IMPORT_FIELDS = [
  ["name", "姓名", ["姓名", "名字", "學員姓名", "會員姓名", "name", "display_name", "顯示名稱"]],
  ["phone", "手機", ["手機", "行動電話", "手機號碼", "電話", "聯絡電話", "mobile", "phone"]],
  ["gender", "性別", ["性別", "gender"]],
  ["birth_date", "出生年月日", ["出生年月日", "生日", "出生日期", "生年月日", "birthday"]],
  // 居住縣市要排在「區域」前面：表頭「居住區域」才不會被「區域」搶走
  ["residence_city", "居住縣市", ["居住縣市", "居住區域", "居住地", "縣市", "city"]],
  ["region", "區域", ["區域", "地區", "分區", "所屬區域", "區別", "region"]],
  ["address", "地址", ["地址", "住址", "通訊地址", "address"]],
  ["email", "Email", ["email", "e-mail", "電子郵件", "信箱"]],
  ["national_id", "身分證", ["身分證", "身分證字號", "身份證", "身份證字號", "身分證號"], v => /^[A-Z][0-9A-Z][0-9]{8}$/i.test(v)],
  ["line_user_id", "LINE ID", ["lineuserid", "line_user_id", "lineid", "external_member_id"], v => /^U[0-9a-f]{32}$/.test(v)],
  ["tags", "標籤／參加紀錄", ["標籤", "tag", "tags"]],
  ["notes", "備註", ["備註", "說明", "notes", "note"]]
];

export function guessColumns(headers, rows = []) {
  const clean = h => String(h ?? "").replace(/\s/g, "").toLowerCase();
  const map = {}; const used = new Set();
  const take = (key, index) => { if (index >= 0 && !used.has(index)) { map[key] = index; used.add(index); return true; } return false; };
  for (const [key, , aliases] of IMPORT_FIELDS) {
    if (aliases.some(alias => take(key, headers.findIndex(h => clean(h) === alias)))) continue;
    take(key, headers.findIndex((h, i) => !used.has(i) && clean(h) && aliases.some(a => a.length > 1 && clean(h).includes(a))));
  }
  const sample = rows.slice(0, 50);
  for (const [key, , , looksLike] of IMPORT_FIELDS) {
    if (!looksLike || map[key] !== undefined || !sample.length) continue;
    const index = headers.findIndex((_, i) => {
      if (used.has(i)) return false;
      const values = sample.map(r => String(r[i] ?? "").trim()).filter(Boolean);
      return values.length >= 1 && values.filter(looksLike).length / values.length >= 0.8;
    });
    take(key, index);
  }
  return map;
}

export function splitTags(value) {
  const tags = String(value ?? "").split(/[,，、;；\n]/).map(t => t.trim().slice(0, 40)).filter(Boolean);
  return [...new Set(tags)].slice(0, 300);
}

// 已存在的會員：只補空白欄位、加新標籤，不覆蓋既有資料。回傳要補的欄位與標籤；都沒有就是 null。
export function fillPlan(existing, row) {
  const fields = ["phone", "gender", "birth_date", "region_id", "residence_city", "address", "email"].filter(k => !existing[k] && row[k]);
  if (row.national_id && !existing.national_id && !existing.national_id_masked) fields.push("national_id");
  if (row.line_user_id && !existing.line_user_id) fields.push("line_user_id");
  const have = new Set(existing.tags || []);
  const tags = (row.tags || []).filter(t => !have.has(t));
  return fields.length || tags.length ? { fields, tags } : null;
}

const FIELD_LABELS = { phone: "手機", gender: "性別", birth_date: "生日", region_id: "區域", residence_city: "居住縣市", address: "地址", email: "Email", national_id: "身分證", line_user_id: "LINE ID" };

// 把一列原始資料整理成會員欄位，並標出狀態：new／update（補資料）／duplicate／error。
export function prepareImportRow(raw, map, { regions = [], existing = [], seen = new Set() } = {}) {
  const cell = key => (map[key] === undefined || map[key] === "" ? "" : String(raw[map[key]] ?? "").trim());
  const errors = [], warnings = [];
  const name = cell("name").replace(/\s+/g, "");
  if (!name) errors.push("缺姓名");
  const rawPhone = cell("phone"); const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) errors.push(`手機格式無法辨識（${rawPhone}）`);
  const rawBirth = map.birth_date === undefined ? "" : raw[map.birth_date];
  const birth_date = parseBirthDate(rawBirth);
  if (rawBirth !== "" && rawBirth !== undefined && rawBirth !== null && !birth_date) warnings.push(`生日看不懂（${rawBirth}），先留空`);
  const regionText = cell("region");
  const region = regionText ? regions.find(r => r.name === regionText || r.name.replace(/區$/, "") === regionText.replace(/區$/, "")) : null;
  if (regionText && !region) warnings.push(`找不到區域「${regionText}」，先列為未分區`);
  // 沒有居住縣市欄位時，從地址開頭推得出來就順便填上
  const cityText = cell("residence_city");
  const residence_city = normalizeCity(cityText) || normalizeCity(cell("address"));
  if (cityText && !normalizeCity(cityText)) warnings.push(`看不懂居住縣市「${cityText}」${residence_city ? `，改用地址的${residence_city}` : "，先留空"}`);
  const nid = cell("national_id").toUpperCase();
  const national_id = nid && isValidNationalId(nid) ? nid : "";
  if (nid && !national_id) warnings.push("身分證格式不正確，未匯入");
  const lineText = cell("line_user_id");
  const line_user_id = /^U[0-9a-f]{32}$/.test(lineText) ? lineText : null;
  if (lineText && !line_user_id) warnings.push("LINE ID 格式不正確，未匯入");
  const row = { name, phone, gender: normalizeGender(cell("gender")), birth_date, region_id: region?.id || null, residence_city: residence_city || null, address: cell("address"), email: cell("email"), national_id, line_user_id, tags: splitTags(cell("tags")), notes: cell("notes") };
  let status = errors.length ? "error" : "new";
  if (status === "new") {
    const key = `${name}|${phone || ""}`;
    if (seen.has(key) || (line_user_id && seen.has(line_user_id))) { status = "duplicate"; warnings.push("檔案內重複"); }
    else {
      const match = (line_user_id && existing.find(c => c.line_user_id === line_user_id)) || existing.find(c => c.name?.replace(/\s/g, "") === name && (c.phone || null) === phone);
      if (match) {
        const plan = fillPlan(match, row);
        if (plan) { status = "update"; row.existing_id = match.id; warnings.push(`系統已有此人，補上：${[...plan.fields.map(f => FIELD_LABELS[f]), ...(plan.tags.length ? [`${plan.tags.length} 個標籤`] : [])].join("、")}`); }
        else { status = "duplicate"; warnings.push("系統已有此人，資料沒有需要補的"); }
      }
    }
    seen.add(key); if (line_user_id) seen.add(line_user_id);
  }
  return { row, status, errors, warnings };
}

// ───── 贊助紀錄 ─────
export function sponsorshipSummary(records) {
  const byItem = new Map();
  for (const r of records) {
    const s = byItem.get(r.item) || { item: r.item, count: 0, total: 0, paid: 0, paidCount: 0 };
    s.count++; s.total += Number(r.amount) || 0;
    if (r.paid) { s.paid += Number(r.amount) || 0; s.paidCount++; }
    byItem.set(r.item, s);
  }
  return [...byItem.values()].sort((a, b) => a.item.localeCompare(b.item, "zh-Hant"));
}

// 完成報到時把活動名稱寫進參加者標籤；取消報到且沒有其他同名活動的報到紀錄時拿掉。
// 規則與資料庫 trigger（2026-10-23_attendee_event_tags.sql）相同，展示版用這支。
export function eventTagsAfterCheckin(tags = [], title = "", attended, otherAttendedTitles = []) {
  const name = String(title).trim().slice(0, 40);
  if (!name) return tags;
  if (attended) return tags.includes(name) ? tags : [...tags, name];
  return otherAttendedTitles.some(t => String(t).trim().slice(0, 40) === name) ? tags : tags.filter(t => t !== name);
}

// 學員在「我的活動」自己修改基本資料：只開放這幾欄，規則與後端 member 函式（update_profile）相同。
// 會員編號、所屬區域、標籤、備註、身分證不開放學員修改。
export function checkProfile(p = {}, today = new Date()) {
  const name = String(p.name || "").trim();
  if (!name || name.length > 40) return { error: "請填寫姓名（40 字以內）" };
  if (!/^\+[1-9]\d{7,14}$/.test(p.phone || "")) return { error: "手機號碼格式不正確" };
  const email = String(p.email || "").trim();
  if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { error: "Email 格式不正確" };
  if (!GENDERS.includes(p.gender)) return { error: "請選擇性別" };
  const birth = p.birth_date || "";
  if (birth && (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || birth < "1900-01-01" || new Date(birth) > today)) return { error: "生日不正確" };
  const city = p.residence_city || "";
  if (city && !CITIES.includes(city)) return { error: "居住縣市不正確" };
  const address = String(p.address || "").trim();
  if (address.length > 200) return { error: "地址請在 200 字以內" };
  return { value: { name, phone: p.phone, email: email || null, gender: p.gender, birth_date: birth || null, residence_city: city || null, address: address || null } };
}

// 學員活動紀錄的狀態：取消 → 已取消；報到過 → 已參加；活動已結束還沒報到 → 未出席；其他 → 已報名
export function historyStatus(reg = {}, now = new Date()) {
  if (reg.cancelled_at) return "cancelled";
  if (reg.attendance_status === "attended") return "attended";
  const end = reg.events?.ends_at || reg.events?.starts_at;
  return end && new Date(end) < now ? "absent" : "registered";
}
