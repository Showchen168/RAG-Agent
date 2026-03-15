# YouTube 知識庫整合 — 設計文件

**日期**：2026-02-25
**分支**：knowbase
**狀態**：已核准

---

## 1. 目標

在 NexusMind 知識庫中整合 YouTube 影片內容，支援：
- 單影片 URL 匯入（字幕 → 知識庫文件）
- 播放清單批次匯入
- 頻道監控（自動抓取新影片）
- AI 摘要生成
- 無字幕影片的 Gemini 音訊轉錄 fallback

## 2. 架構決策

### 2.1 混合架構（方案 C）
- **UI**：知識庫頁面新增 YouTube Tab（與上傳/URL/GDrive 並列）
- **後端**：獨立 API 端點 `/api/knowledge/youtube/*`
- **DB**：擴展 `knowledge_sources` 表 + 複用 `documents` 表
- **管道**：匯入後統一走現有 document → embed → RAG 管道

### 2.2 三層 Fallback 鏈
```
Layer 1: youtube-transcript-plus 字幕抓取（免費、最快）
    ↓ 失敗
Layer 2: Gemini API 直接處理 YouTube URL（音訊轉錄）
    ↓ 失敗
Layer 3: 提示用戶「此影片無法處理」
```

### 2.3 否決的方案
- **方案 A（SourceManager 擴展）**：UI 偏向監控管理，缺少單次匯入直覺體驗
- **方案 B（完全獨立模組）**：與現有管道脫節，重複代碼多

## 3. 資料模型

### 3.1 documents 表（現有，不修改結構）
```typescript
{
  title: "【影片標題】- 頻道名稱",
  content: "## 影片資訊\n- URL: ...\n- 時長: ...\n\n## 內容\n### [00:00] 章節一\n...",
  summary: "Gemini 生成的摘要",
  tags: ["YOUTUBE", "VIDEO", "zh-TW"]
  // 無字幕影片: ["YOUTUBE", "GEMINI_TRANSCRIBED", "zh-TW"]
}
```

### 3.2 knowledge_sources 表（頻道監控用）
```sql
ALTER TABLE knowledge_sources
  DROP CONSTRAINT IF EXISTS knowledge_sources_source_type_check,
  ADD CONSTRAINT knowledge_sources_source_type_check
  CHECK (source_type IN ('rss', 'url', 'sitemap', 'youtube'));
```

### 3.3 metadata JSONB
```json
{
  "video_id": "dQw4w9WgXcQ",
  "channel_id": "UCxxxxxx",
  "channel_name": "頻道名稱",
  "playlist_id": "PLxxxxxx",
  "duration_seconds": 3600,
  "transcript_source": "subtitle | gemini_transcription",
  "transcript_language": "zh-TW",
  "thumbnail_url": "https://img.youtube.com/..."
}
```

## 4. API 端點

| 端點 | 方法 | 功能 | 輸入 |
|------|------|------|------|
| `/api/knowledge/youtube` | POST | 單影片匯入 | `{ url, lang? }` |
| `/api/knowledge/youtube/playlist` | POST | 播放清單批次匯入 | `{ url, lang? }` |
| `/api/knowledge/youtube/channel` | POST | 新增頻道監控 | `{ url, checkInterval? }` |

### 4.1 單影片匯入流程
1. 解析 URL → 提取 video ID
2. Layer 1: youtube-transcript-plus 取得字幕
3. 失敗 → Layer 2: Gemini API 直接傳 YouTube URL 音訊轉錄
4. Gemini AI 整理內容（分段 + 結構化 + 摘要）
5. 存入 documents → 觸發 embed

### 4.2 播放清單匯入流程
1. 解析播放清單 URL → 取得影片列表
2. 逐一（並行 max 3）執行單影片流程
3. 批次結果回報

### 4.3 頻道監控流程
1. 建立 knowledge_sources 記錄（source_type: youtube）
2. 定期排程檢查頻道新影片
3. 自動匯入新影片字幕

## 5. 檔案結構

```
src/lib/knowledge/
├── content-fetcher.ts          （現有）
├── youtube-fetcher.ts          （新增）
│   ├── fetchVideoTranscript()
│   ├── transcribeWithGemini()
│   ├── formatTranscript()
│   └── fetchPlaylistVideos()
└── youtube-utils.ts            （新增）
    ├── parseYouTubeUrl()
    ├── isYouTubeUrl()
    └── getVideoMetadata()

src/app/api/knowledge/youtube/
├── route.ts
├── playlist/route.ts
└── channel/route.ts

src/components/knowledge/
└── youtube-import.tsx
```

## 6. UI 設計

入口：知識庫頁面操作列 [📤上傳] [🌐URL] [📁GDrive] [🎬YouTube]

匯入面板：
- URL 輸入框（自動偵測類型）
- 影片預覽（縮圖 + 標題 + 時長）
- 語言選擇（可選）
- 匯入按鈕 + 進度指示

## 7. 技術依賴

新增：youtube-transcript-plus（字幕抓取）
現有複用：Gemini API、Supabase、embed 管道

## 8. 錯誤處理

| 情境 | Layer | 處理 |
|------|-------|------|
| 有字幕 | L1 | 直接使用 |
| 無字幕 | L2 | Gemini 音訊轉錄 |
| 影片不可用 | - | 提示錯誤 |
| 字幕語言不符 | L1 | 列出可用語言 |
| Gemini 失敗 | L2 | 提示無法處理 |
| 播放清單 >50 | - | 分批處理 |

## 9. 安全考量

- YouTube URL 格式驗證（防止 SSRF）
- 只允許 youtube.com 和 youtu.be 網域
- API 端點需要認證（Supabase auth）
- Rate limiting 防止濫用
