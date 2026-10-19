# 晁人文鼎協會 CRM｜網站發布用

這個 repo 只放網頁畫面檔，由 GitHub Pages 發布到 https://crm.sw-ii.com 。

- 不含資料庫設定、會員資料、名冊或任何秘密；`config.js` 只能放可公開的 Supabase URL、publishable key 與 LIFF ID。
- 原始程式與資料庫設定在私人 repo `chao6336/chaoren-crm`。改版流程：先改私人 repo → 複製這 7 個畫面檔過來 → commit → push。
- 目前為展示模式（`demoMode: true`）：資料是假的，只存在使用者自己的瀏覽器。
