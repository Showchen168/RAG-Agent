# 監控源自動排程設計文件

**日期：** 2026-02-28
**狀態：** 已核准

## 問題

knowledge_sources 表有 `check_interval_hours` 欄位，但系統完全沒有自動排程機制。
所有監控源（YouTube 頻道、RSS、URL）只能手動點擊「立即檢查」，導致用戶設定「每 24 小時」後 2 天仍顯示「從未檢查」。

## 方案

**Next.js API Route + NAS Task Scheduler**

NAS cron 每小時 curl 一個受保護的 API endpoint，API 查詢所有到期的監控源並序列執行檢查。

## 架構

```
NAS Task Scheduler (每小時)
    |
    curl -H "Authorization: Bearer $CRON_SECRET" \
         http://localhost:3001/api/cron/check-sources
    |
    v
GET /api/cron/check-sources
    +-- 驗證 CRON_SECRET
    +-- 用 supabaseAdmin 查詢 knowledge_sources
    |   WHERE is_active = true
    |   AND (last_checked_at IS NULL
    |        OR now() - last_checked_at >= interval '24 hours')
    +-- 序列處理每個到期源（複用現有 check 邏輯）
    +-- 回傳 JSON 統計
```

## 新增/修改檔案

| 檔案 | 變更 |
|------|------|
| `src/app/api/cron/check-sources/route.ts` | **新增** — cron endpoint |
| `src/lib/knowledge/source-checker.ts` | **新增** — 從 check route 抽取核心檢查邏輯（共用） |
| `src/app/api/knowledge/sources/[id]/check/route.ts` | **修改** — 呼叫 source-checker 而非內聯邏輯 |
| `.env.production` | **新增** `CRON_SECRET` 變數 |

## 設計決策

### 安全性
- `CRON_SECRET` 環境變數保護 API，拒絕未授權請求
- 使用 `supabaseAdmin`（service_role）執行，不依賴用戶 cookie/session

### 並發控制
- 序列處理每個監控源（避免同時大量外部 API 呼叫）
- 單個源失敗用 try-catch 隔離，不影響其他源
- 失敗的源不更新 `last_checked_at`，下次 cron 自動重試

### 頻率
- 固定 24 小時
- NAS cron 每小時觸發，但 API 只處理「距上次檢查 >= 24h」的源

### Embedding 觸發
- 現有 check route 用 cookie + localhost 呼叫 `/api/knowledge/embed`
- cron 版本改用 supabaseAdmin 直接操作，或用 service_role auth header 呼叫 embed API

### 前端
- 無需改動（source-manager.tsx 已根據 last_checked_at 顯示時間）

## NAS 部署

```bash
# 在 NAS Task Scheduler 新增排程任務
# 執行時間：每小時（如 *:00）
curl -sf -H "Authorization: Bearer YOUR_CRON_SECRET" \
     http://localhost:3001/api/cron/check-sources \
     >> /volume1/docker/nexusmind/logs/cron-check.log 2>&1
```

## 回應格式

```json
{
  "success": true,
  "stats": {
    "total_sources": 5,
    "due_for_check": 3,
    "checked": 3,
    "skipped": 2,
    "failed": 0
  },
  "results": [
    { "id": "...", "name": "laogao", "type": "youtube", "status": "ok", "new_videos": 2 },
    { "id": "...", "name": "tech-shrimp", "type": "youtube", "status": "ok", "new_videos": 0 },
    { "id": "...", "name": "...", "type": "rss", "status": "error", "error": "timeout" }
  ]
}
```
