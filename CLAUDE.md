# NexusMind - 專案開發指南

## 技術棧
- Next.js 16 + TypeScript + Tailwind CSS
- Supabase (self-hosted on Synology NAS)
- Telegram Bot 整合（帳號綁定 + AI 對話）
- LightRAG 知識庫
- Gemini AI (gemini-3-pro-preview for Phase 0, gemini-2.5-flash for Phase 1/2)
- Adaptive RAG（Vector + BM25 + LightRAG graph，整合到 Skills Pipeline Phase 1）
- LLM Skills 系統（Gemini + Docker executor + skill_attachments）

## Vercel AI SDK 注意事項
- **`generateText` 輸出長度限制**：用 `maxOutputTokens`（非 `maxTokens`），後者會導致 TypeScript 編譯錯誤
- **AI 模型對映**：`getProvider("gemini-flash")` → `gemini-3-flash-preview`，`getProvider("gemini-pro")` → `gemini-3.1-pro-preview`（定義在 `src/lib/ai/providers.ts`）

## Skills 系統注意事項
- **雙重 Message ID 問題**：`execute-handler.ts` 建立 placeholder message（ID=A），Crayon 框架建立 visible message（ID=B）。`skill_attachments` FK 指向 A，但前端只看到 B。查詢附件必須用 `conversationId` 模式（by-messages API），不能直接用 visible message ID
- **IME 防護**：所有 textarea 輸入元件都必須綁定 `onCompositionStart/End` + keyDown 檢查 `isComposing/keyCode===229/compositionJustEndedRef`。注意 `skill-input-dialog.tsx` 和 `nexusmind-chat.tsx` 是獨立元件，各自需要完整的 IME 防護
- **檔案下載**：使用 `fetch` + `Blob` + `createObjectURL` 而非 `<a href download>`，後者在某些環境會觸發瀏覽器導航錯誤
- **skill_attachments 表無 FK 到 messages 表**：無法用 JOIN，必須兩步查詢（先查 message IDs，再查 attachments）
- **Skills Pipeline 三階段架構**：Phase 0 (gemini-3-pro-preview 意圖判斷) → Phase 1 (Google Search 研究 + RAG 知識庫) → Phase 2 (程式碼生成) → Docker executor。Phase 0 未通過直接回傳釐清訊息，不進後續階段
- **Gemini thinking tokens 共享 maxOutputTokens**：`gemini-3-pro-preview` 等 thinking model 的思考 tokens 會佔用 `maxOutputTokens` 預算。如果設 2048，thinking 用掉 1500+ 就只剩 ~500 給輸出。所有用 thinking model 的 `generateText` 呼叫至少設 `maxOutputTokens: 16384`
- **技能名稱前綴防重複**：`nexusmind-chat.tsx` 有 3 處加 `[${skill.display_name}]` 前綴（handleSuggestionClick、handleSubmit、onQuickPrompt），修改時必須保持 `text.startsWith(prefix)` 防禦性檢查
- **RAG 整合 graceful degradation**：`executor.ts` 的 RAG 查詢用 try-catch 包裹，失敗時 `knowledgeContext` 保持 undefined，退化為純 Google Search
- **by-messages API 必須用 adminClient**：`/api/skills/attachments/by-messages/route.ts` 查詢 skill_attachments 必須用 service_role client 繞過 RLS，否則使用者看不到附件
- **Code Leak 防護**：`executor.ts` 當 Docker executor 未產出檔案（`files.length === 0`）且 `isCodeGenerating` 為 true 時，會用 regex 清除 LLM 輸出中的 code blocks，避免原始 JS 程式碼顯示在聊天 UI 中
- **docx v9 API 常見 LLM 錯誤**：Gemini 常生成 `sections: { children: [...] }`（物件），正確寫法是 `sections: [{ children: [...] }]`（陣列）。`JS_RUNTIME_PREAMBLE` 已內嵌 docx v9.6.0 API 範例來降低此錯誤率
- **Polling 回退機制**：前端 `use-skills.ts` 對 `/api/skills/execute` 設 60 秒 AbortController timeout。超時後自動切換到輪詢 `/api/skills/execute/status?messageId=xxx`（每 5 秒，最多 5 分鐘）。後端無論前端是否斷線都會繼續執行並寫入 DB

## YouTube 監控注意事項
- **Channel ID 解析陷阱**：YouTube HTML 中 `"channelId"` 欄位可能指向關聯/子頻道而非頁面本身。`youtube-utils.ts` 的 `resolveChannelId()` 必須優先匹配 `"externalId"` > `"browseId"` > `"channelId"`
- **RSS 限制**：YouTube channel RSS 最多回傳最近 15 部影片，無法指定日期範圍
- **Channel ID 快取**：存在 `knowledge_sources.metadata.channel_id`（JSONB）。reset endpoint 強制重新解析；自動檢查器用 fresh-first + cache-fallback 策略
- **RSS 間歇性 404**：YouTube RSS endpoint 全球性不穩定（2025-2026 持續回報），已加入 3 次指數退避重試。若重試仍失敗，屬 YouTube 端問題非 bug
- **AI 模型配置**：L2 語音轉錄用 `gemini-3.1-pro-preview`/`gemini-3-flash-preview`（Google SDK 直呼叫），AI 知識報告用 `getProvider("gemini-pro")`（Vercel AI SDK，對應 `gemini-3.1-pro-preview`）
- **前端匯入限制**：影片匯入是前端逐一循環呼叫 API，使用者離開頁面會中斷未完成的匯入

## Google Drive 整合注意事項
- **OAuth `prompt: 'consent'`**：`auth.ts` 的 `generateAuthUrl()` 必須設 `prompt: 'consent'`，否則 Google 不會重新簽發 refresh_token
- **OAuth2Client 包裝**：`google.drive({ auth })` 必須傳 OAuth2Client 物件（`createAuthClient()`），傳 raw token string 會被當成 API key
- **Export format 對齊**：Google Docs→docx, Sheets→xlsx, Slides→pptx。格式不匹配會觸發 BadZipFile 錯誤
- **PDF 降級機制**：部分共享檔案有 export 限制（403 cannotExportFile），自動降級為 PDF export
- **反向代理 redirect**：callback route 用 `x-forwarded-host`/`x-forwarded-proto` 取得正確 baseUrl，避免 redirect 到容器內部位址 `0.0.0.0:3000`
- **Token 加密**：`K_MASTER_KEY` env var（AES-256-GCM），與 `BOT_TOKEN_ENCRYPTION_KEY` 共用同一把金鑰
- **gdrive_user_tokens 表**：新 NAS 部署需手動建表 + GRANT + RLS + `NOTIFY pgrst, 'reload schema'`

## NAS 部署流程（必讀）

### Docker Build & Deploy
```
# Build（NEXT_PUBLIC_* 在 build time 寫死，用公網 Cloudflare Tunnel URL）
docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://supabase.showmico888.net \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$(grep '^ANON_KEY=' /volume1/docker/nexusmind/supabase/.env | cut -d= -f2) \
  -t nexusmind-app:latest .

# 匯出 & 傳送到 NAS
docker save nexusmind-app:latest | gzip > /tmp/nexusmind-app.tar.gz
sshpass -p "$NAS_SSH_PASSWORD" scp -O /tmp/nexusmind-app.tar.gz skykyo520@192.168.0.7:/tmp/

# NAS 端部署（用 docker compose）
sshpass -p "$NAS_SSH_PASSWORD" ssh -o PubkeyAuthentication=no skykyo520@192.168.0.7
cd /volume1/docker/nexusmind
sudo docker load -i /tmp/nexusmind-app.tar.gz
sudo docker compose stop app && sudo docker compose rm -f app && sudo docker compose up -d app
```
### 本地 Docker Build & Deploy（Mac 交叉編譯，首選方式）
```bash
# Build args 快取在 /tmp/nas-build-args.env
export $(grep -v '^#' /tmp/nas-build-args.env | xargs)
docker buildx build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  --build-arg NEXT_PUBLIC_TELEGRAM_BOT_USERNAME="$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME" \
  --build-arg NEXT_PUBLIC_APP_URL="$NEXT_PUBLIC_APP_URL" \
  -t nexusmind-app:latest --load .
docker save nexusmind-app:latest | gzip > /tmp/nexusmind-app.tar.gz
# Pipe 傳送（scp 到 /tmp/ 會 permission denied）
cat /tmp/nexusmind-app.tar.gz | sshpass -p 'xxx' ssh user@nas "cat > /volume1/docker/nexusmind/nexusmind-app.tar.gz"
sshpass -p 'xxx' ssh user@nas "docker load < /volume1/docker/nexusmind/nexusmind-app.tar.gz && docker stop nexusmind-app; docker rm nexusmind-app; cd /volume1/docker/nexusmind && docker compose up -d app"
```

### NAS 直接 Build（替代方案）
```
# SSH 進 NAS，在 app 目錄直接 build（避免 cross-platform 問題）
cd /volume1/docker/nexusmind/app && git stash && git pull origin main
source /volume1/docker/nexusmind/.env.production
docker build --no-cache \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://supabase.showmico888.net \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$(grep '^ANON_KEY=' /volume1/docker/nexusmind/supabase/.env | cut -d= -f2) \
  --build-arg NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME \
  -t nexusmind-app:latest .
cd /volume1/docker/nexusmind && docker compose stop app && docker compose rm -f app && docker compose up -d app
```
- **必須用 `--no-cache`**：NAS Docker 有快取問題，即使原始碼變更仍可能使用舊的 build 層
- **`maxDuration` 無效**：Next.js 的 `export const maxDuration` 只在 Vercel 生效，standalone 模式使用 Node.js HTTP server 預設 timeout
- **長時間 API 呼叫**：技能執行（3-5 分鐘）會因 TCP idle timeout 斷線，已實作 polling 回退機制（`/api/skills/execute/status` 端點）

- **Tailscale DNS 劫持**：NAS 啟用 Tailscale 後，容器 DNS 可能被劫持（`ExtServers: [100.100.100.100]`），導致 `EAI_AGAIN generativelanguage.googleapis.com`。症狀：IP 可 ping 但域名解析 SERVFAIL。修復：在 `docker-compose.yml` app service 加 `dns: [8.8.8.8, 1.1.1.1]`
- SCP 需要 `-O` flag（NAS 不支援 SFTP subsystem），若 scp 失敗改用 pipe：`cat file | ssh user@host "cat > /path/file"`
- `docker compose restart` **不會重新載入 env vars**，必須 `stop + rm + up -d`
- `NEXT_PUBLIC_*` 變數在 build time 寫死，runtime 無法覆蓋
- Anon Key 來源：`/volume1/docker/nexusmind/supabase/.env` 的 `ANON_KEY`（`iss: supabase`，非 demo key）

### DB Migration（每次建新表必做）
1. 在 nexusmind-db 容器執行 SQL
2. `GRANT ALL ON <table> TO service_role; GRANT SELECT ON <table> TO authenticated;`
3. `NOTIFY pgrst, 'reload schema';` — 不做這步 REST API 會靜默失敗

## Telegram Bot 架構
- `telegram_bot_config` 表：系統級 Bot Token（AES-256-GCM 加密）
- `telegram_users` 表：使用者層級帳號綁定
- Webhook URL: `https://nexusmind.showmico888.net/api/telegram/webhook`
- Webhook 註冊必須帶 `secret_token`（env: `TELEGRAM_WEBHOOK_SECRET`）
- 更換域名後需重新註冊 webhook：`curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<NEW_URL>&secret_token=<SECRET>"`
- `getOrCreateTelegramUser` 用 `user_id` 判斷綁定（非 `user_id && default_conversation_id`）

## 存取路徑
- 公網（Cloudflare Tunnel）: `https://nexusmind.showmico888.net`
- 區域網: `http://192.168.0.7:3001`
- Supabase 公網: `https://supabase.showmico888.net`
- Supabase 內網: `http://192.168.0.7:54321`

## Cloudflare Tunnel 設定
- Tunnel ID: `(see NAS config)`
- cloudflared 容器用 `network_mode: host`
- 子域名對映：`nexusmind.showmico888.net → localhost:3001`、`supabase.showmico888.net → localhost:54321`

## NAS SSH 連線
- Tailscale IP: `100.90.158.61`（已啟用 Tailscale SSH，免密碼直連）
- 內網 IP: `192.168.0.7`（僅限同區域網路）
- 使用者: `skykyo520`
- SSH 指令: `ssh skykyo520@100.90.158.61`（透過 Tailscale SSH，首次連線需瀏覽器認證）
- Docker Compose 服務名稱是 `app`（不是 `nexusmind-app`），指令用 `docker compose stop app`
- NAS Git remote token 會過期，需用 `gh auth token` 取新 token 更新: `git remote set-url origin https://<TOKEN>@github.com/Showchen168/nexusmind.git`
- **NEXT_PUBLIC_SUPABASE_URL 必須用 HTTPS**（`https://supabase.showmico888.net`），用 HTTP 內網位址會導致 Mixed Content
- **sshpass 穩定用法**：背景任務用 `sshpass -p "password" ssh ...`（`-e` 模式在背景任務中環境變數可能遺失）

### NAS 快速部署流程（實際使用）

> ⛔ **絕對禁止用 `docker run`**：app 需同時連接 `nexusmind-app-net` 和 `nexusmind-supabase-net` 兩個網路（才能用 `nexusmind-kong:8000`），只有 `docker compose` 才能自動處理兩個網路。用 `docker run --network nexusmind-app-net` 只連一個網路，會導致 `EAI_AGAIN nexusmind-kong` 錯誤（401 Unauthorized）。

```bash
# 1. 本地 commit + push
git push origin main

# 2. SSH 進 NAS（Tailscale）
ssh skykyo520@100.90.158.61

# 3. NAS 端拉取 + 重建
cd /volume1/docker/nexusmind/app && git pull origin main
docker build --no-cache \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://supabase.showmico888.net \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$(grep '^ANON_KEY=' /volume1/docker/nexusmind/supabase/.env | cut -d= -f2) \
  --build-arg NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME \
  -t nexusmind-app:latest .

# 4. 重啟容器（必須用 docker compose，自動連接兩個網路）
cd /volume1/docker/nexusmind
docker compose stop app && docker compose rm -f app && docker compose up -d app
```

## NAS 環境變數分佈
| 檔案 | 用途 |
|------|------|
| `/volume1/docker/nexusmind/.env.production` | App 的 runtime env（SUPABASE_SERVER_URL、Telegram、加密金鑰等） |
| `/volume1/docker/nexusmind/supabase/.env` | Supabase 服務 env（GoTrue、PostgREST、DB 等） |

### GoTrue 關鍵變數（更換域名時必須同步）
- `API_EXTERNAL_URL` → Supabase 公網 URL
- `GOTRUE_SITE_URL` → App 公網 URL
- `GOTRUE_URI_ALLOW_LIST` → 所有允許的 redirect URL
- 修改後必須 `docker compose up -d auth`（不是 restart）

### Server-side 雙 URL 策略
- `SUPABASE_SERVER_URL`（runtime）：server-side 用 Docker 內部 hostname `http://nexusmind-kong:8000`（需要 app 在 `nexusmind-supabase-net` 網路上，`docker compose up` 會自動處理）
- ⛔ **不可用 `http://192.168.0.7:54321`**：Kong port 54321 只綁定到 `127.0.0.1`，容器內無法用 NAS IP 訪問
- `NEXT_PUBLIC_SUPABASE_URL`（build-time）：client-side 用公網 `https://supabase.showmico888.net`
- Cookie name 由 client URL 的 hostname 推算（`sb-supabase-auth-token`），server.ts 會自動處理
