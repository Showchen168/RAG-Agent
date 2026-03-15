# 監控源自動排程 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 實作 cron API endpoint，讓 NAS Task Scheduler 每小時觸發，自動檢查到期的知識庫監控源。

**Architecture:** 新增 GET /api/cron/check-sources endpoint，用 CRON_SECRET 驗證，用 supabaseAdmin 查詢到期源，序列呼叫現有 check 邏輯。從現有 check route 抽取核心函式到 source-checker.ts 共用。

**Tech Stack:** Next.js 16 App Router, Supabase (self-hosted), NAS Task Scheduler (cron)

---

### Task 1: 抽取 source-checker 核心邏輯

**Files:**
- Create: `src/lib/knowledge/source-checker.ts`
- Modify: `src/app/api/knowledge/sources/[id]/check/route.ts`

**Step 1: 建立 source-checker.ts**

從 check/route.ts 抽取核心檢查邏輯到純函式：
- `checkSource(supabase, source)` → 回傳 `CheckResult`
- `checkYouTubeSource(supabase, source)` → YouTube 專用
- `checkUrlOrRssSource(supabase, source)` → URL/RSS 通用
- `triggerEmbedding(documentId)` → 用 service_role header 呼叫 embed API

關鍵差異：不接收 req 參數，不回傳 NextResponse，embedding 觸發改用 service_role auth header。

**Step 2: 修改 check/route.ts 呼叫 source-checker**

POST handler 保持不變（認證 + 讀取 source），但核心邏輯委派給 `checkSource()`。

**Step 3: 驗證 build 通過**

Run: `npx next build` (dry run check types)

**Step 4: Commit**

```bash
git add src/lib/knowledge/source-checker.ts src/app/api/knowledge/sources/[id]/check/route.ts
git commit -m "refactor: extract source-checker core logic for cron reuse"
```

---

### Task 2: 修改 embed API 支援 service_role 認證

**Files:**
- Modify: `src/app/api/knowledge/embed/route.ts`

**Step 1: 新增 service_role fallback 認證**

在現有 cookie auth 失敗後，檢查 `X-Service-Role-Key` header。
service_role 模式下不過濾 user_id（因為 cron 代表所有用戶操作）。

**Step 2: 驗證 build 通過**

**Step 3: Commit**

```bash
git add src/app/api/knowledge/embed/route.ts
git commit -m "feat: support service_role auth in embed API for cron"
```

---

### Task 3: 建立 cron endpoint

**Files:**
- Create: `src/app/api/cron/check-sources/route.ts`

**Step 1: 建立 GET handler**

- 驗證 `Authorization: Bearer $CRON_SECRET`
- 用 `createAdminClient()` 查詢到期源 (is_active=true AND last_checked_at 超過 24h 或 null)
- 序列 for-loop 呼叫 `checkSource()`
- try-catch 隔離每個源
- 回傳 JSON 統計

**Step 2: 設定 maxDuration = 300**

5 分鐘 timeout（多個源序列處理需要時間）

**Step 3: 驗證 build 通過**

**Step 4: Commit**

```bash
git add src/app/api/cron/check-sources/route.ts
git commit -m "feat: add cron endpoint for automatic source monitoring"
```

---

### Task 4: 環境變數與本地測試

**Files:**
- Modify: `.env.local`

**Step 1: 新增 CRON_SECRET 到 .env.local**

**Step 2: 啟動 dev server 測試**

```bash
# 無 token → 401
curl -s http://localhost:3000/api/cron/check-sources

# 有 token → 200 + 結果
curl -s -H "Authorization: Bearer dev-cron-secret" http://localhost:3000/api/cron/check-sources
```

**Step 3: 確認前端「最後檢查」已更新**

打開 http://localhost:3000/knowledge → 監控源 tab → 時間已更新

**Step 4: Commit**

---

### Task 5: NAS 部署（手動）

**Step 1:** SSH 到 NAS，在 .env.production 新增 CRON_SECRET
**Step 2:** 重新 build + deploy Docker image
**Step 3:** 在 DSM Task Scheduler 新增每小時 curl 指令
**Step 4:** 建立 /volume1/docker/nexusmind/logs/ 目錄
