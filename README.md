# 晁人文鼎協會 CRM｜網站發布用

這個 repo 只放網頁畫面檔，由 GitHub Pages 發布到 https://crm.sw-ii.com 。

- 不含資料庫設定、會員資料、名冊或任何秘密；`config.js` 只能放可公開的 Supabase URL、publishable key 與 LIFF ID。
- 原始程式與資料庫設定在私人 repo `chao6336/chaoren-crm`。改版流程：先改私人 repo → 複製這 7 個畫面檔過來 → commit → push。
- 2026-10-19 起為正式版：連接 Supabase 專案 chaoren-crm（東京）；LINE 登入（LIFF）尚未設定，學員端功能暫時顯示「尚未開放」。
