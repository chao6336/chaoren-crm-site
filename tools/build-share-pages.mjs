// 產生每場公開活動的分享頁 e/<活動 id>/index.html（給 LINE／FB 連結預覽卡片用）。
// 用法（在網站根目錄）：node tools/build-share-pages.mjs [--out 輸出資料夾]
// 只讀公開資料：用 config.js 裡本來就公開的 publishable key 讀 public_events（已發布的活動）。不需要任何秘密。
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { eventSessions, sharePageHtml, isEventId } from "../lib.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outArg = process.argv.indexOf("--out");
const outRoot = outArg > 0 ? process.argv[outArg + 1] : root;
const outDir = join(outRoot, "e");

// config.js 是給瀏覽器用的（window.CRM_CONFIG = {...}），在沙盒裡執行一次取出設定
const sandbox = { window: {} };
vm.runInNewContext(await readFile(join(root, "config.js"), "utf8"), sandbox);
const cfg = sandbox.window.CRM_CONFIG || {};
if (cfg.demoMode) { console.log("config.js 是展示模式，不產生分享頁。"); process.exit(0); }
if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !cfg.siteUrl) throw new Error("config.js 缺少 supabaseUrl、supabasePublishableKey 或 siteUrl");

const fields = "id,title,theme,starts_at,ends_at,registration_deadline,location,capacity,fee_note,registration_count,session_name,series_id,kind,org_name,image_url";
const res = await fetch(`${cfg.supabaseUrl}/rest/v1/public_events?select=${fields}&order=starts_at`, { headers: { apikey: cfg.supabasePublishableKey } });
if (!res.ok) throw new Error(`讀取 public_events 失敗：HTTP ${res.status} ${await res.text()}`);
const events = await res.json();
if (!Array.isArray(events)) throw new Error("public_events 回傳格式不對");
// public_events 只列已發布的活動；eventState 需要 status，補上
for (const e of events) e.status = "published";

const imageBase = `${cfg.supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/event-images/`;
const keep = new Set();
let changed = 0;
for (const event of events) {
  if (!isEventId(event.id)) continue;
  keep.add(event.id);
  const html = sharePageHtml(event, eventSessions(events, event), { siteUrl: cfg.siteUrl, imageBase });
  const file = join(outDir, event.id, "index.html");
  if (existsSync(file) && await readFile(file, "utf8") === html) continue;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
  changed++;
}

// 下架、刪除的活動：移除它的分享頁（只動 e/ 底下、名稱是活動 id 的資料夾）。
// 若這次一場都沒讀到，可能是暫時異常，先不刪任何東西。
let removed = 0;
if (keep.size && existsSync(outDir)) {
  for (const name of await readdir(outDir)) {
    if (isEventId(name) && !keep.has(name)) { await rm(join(outDir, name), { recursive: true }); removed++; }
  }
}
console.log(`公開活動 ${keep.size} 場：新增／更新 ${changed} 頁，移除 ${removed} 頁。輸出：${outDir}`);
