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

export function maskPhone(value = "") {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return value ? "***" : "";
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
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
  return { ...safe, phone: maskPhone(contact.phone), email: maskEmail(contact.email), address: maskAddress(contact.address) };
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
    return { ...r, name: c.name || "未知", region_id: c.region_id || null, region_name: c.region_id ? regionName(c.region_id) : "未分區", phone_last3: String(c.phone || "").slice(-3) };
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

export function campaignEligible(contact) {
  return Boolean(contact.line_user_id && contact.marketing_consent && contact.line_status === "active" && !contact.anonymized_at);
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
export function normalizePhone(value) {
  let digits = String(value ?? "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+886")) digits = "0" + digits.slice(4);
  else if (digits.startsWith("886") && digits.length === 12) digits = "0" + digits.slice(3);
  digits = digits.replace(/\D/g, "");
  if (/^9\d{8}$/.test(digits)) digits = "0" + digits; // Excel 把開頭的 0 吃掉
  return /^09\d{8}$/.test(digits) ? digits : null;
}

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

// 把一列原始資料整理成會員欄位，並標出狀態：new／duplicate／error。
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
  const nid = cell("national_id").toUpperCase();
  const national_id = nid && isValidNationalId(nid) ? nid : "";
  if (nid && !national_id) warnings.push("身分證格式不正確，未匯入");
  const lineText = cell("line_user_id");
  const line_user_id = /^U[0-9a-f]{32}$/.test(lineText) ? lineText : null;
  if (lineText && !line_user_id) warnings.push("LINE ID 格式不正確，未匯入");
  const row = { name, phone, gender: normalizeGender(cell("gender")), birth_date, region_id: region?.id || null, address: cell("address"), email: cell("email"), national_id, line_user_id, tags: splitTags(cell("tags")), notes: cell("notes") };
  let status = errors.length ? "error" : "new";
  if (status === "new") {
    const key = `${name}|${phone || ""}`;
    if (seen.has(key) || (line_user_id && seen.has(line_user_id))) { status = "duplicate"; warnings.push("檔案內重複"); }
    else if (line_user_id && existing.some(c => c.line_user_id === line_user_id)) { status = "duplicate"; warnings.push("系統已有此 LINE 帳號"); }
    else if (existing.some(c => c.name?.replace(/\s/g, "") === name && (c.phone || null) === phone)) { status = "duplicate"; warnings.push("系統已有此人（姓名＋手機相同）"); }
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
