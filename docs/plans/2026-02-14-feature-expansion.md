# NexusMind 功能擴展實施計畫

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 實作 10 個新功能，涵蓋方向一全部（#1-#7）與方向二精選（#8, #11, #15）

**Architecture:** 分為 4 個平行工作流（Phase），每個 Phase 由獨立 Teammate 執行。DB migration 先統一完成，再平行開發 UI/API。

**Tech Stack:** Next.js 16 + Supabase + TipTap + React + TypeScript + Gemini API

---

## Phase 分配

| Phase | Teammate | 負責功能 | 預估時間 |
|-------|----------|---------|---------|
| **Phase 0** | leader | DB migration（所有新表/欄位統一建立） | 15 min |
| **Phase A** | agent-chat | #1 對話分支 + #4 Canvas↔Chat + #5 智慧摘要 Timeline | 60 min |
| **Phase B** | agent-knowledge | #2 版本歷史 + #3 RAG 透明度 + #6 圖譜搜尋路徑 + #7 批次匯入 | 60 min |
| **Phase C** | agent-new-features | #8 知識閃卡 + #11 自動更新 + #15 Prompt 模板市集 | 60 min |

---

## Phase 0: 統一 DB Migration

### Task 0.1: 建立新 migration 檔案

**Files:**
- Create: `supabase/migrations/20260214100000_feature_expansion.sql`

**SQL 內容：**

```sql
-- ============================================================
-- Phase 0: NexusMind 功能擴展 — 統一 Migration
-- ============================================================

-- #1 對話分支 (Fork)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS parent_conversation_id uuid REFERENCES conversations(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS fork_from_message_id uuid REFERENCES messages(id);
CREATE INDEX IF NOT EXISTS idx_conversations_parent ON conversations(parent_conversation_id);

-- #2 知識庫版本歷史
CREATE TABLE IF NOT EXISTS document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  content text NOT NULL,
  summary text,
  change_description text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(document_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions(document_id);
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own doc versions" ON document_versions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM documents WHERE documents.id = document_versions.document_id AND documents.user_id = auth.uid())
  );

-- #4 Canvas ↔ Chat 關聯
ALTER TABLE canvas_documents ADD COLUMN IF NOT EXISTS source_conversation_id uuid REFERENCES conversations(id);
ALTER TABLE canvas_documents ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'manual';

-- #5 智慧摘要 Timeline
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  summary_text text NOT NULL,
  message_range_start uuid REFERENCES messages(id),
  message_range_end uuid REFERENCES messages(id),
  message_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conv_summaries ON conversation_summaries(conversation_id);
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own summaries" ON conversation_summaries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM conversations WHERE conversations.id = conversation_summaries.conversation_id AND conversations.user_id = auth.uid())
  );

-- #8 知識閃卡 (Flashcard)
CREATE TABLE IF NOT EXISTS flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  front text NOT NULL,
  back text NOT NULL,
  tags text[] DEFAULT '{}',
  difficulty integer DEFAULT 0,
  next_review_at timestamptz DEFAULT now(),
  interval_days integer DEFAULT 1,
  ease_factor float DEFAULT 2.5,
  review_count integer DEFAULT 0,
  last_reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flashcards_user ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_review ON flashcards(user_id, next_review_at);
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own flashcards" ON flashcards
  FOR ALL USING (user_id = auth.uid());

-- #11 知識庫自動更新 (RSS/URL 監控)
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type text NOT NULL, -- 'rss' | 'url' | 'sitemap'
  url text NOT NULL,
  name text NOT NULL,
  check_interval_hours integer DEFAULT 24,
  last_checked_at timestamptz,
  last_content_hash text,
  is_active boolean DEFAULT true,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_user ON knowledge_sources(user_id);
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sources" ON knowledge_sources
  FOR ALL USING (user_id = auth.uid());

-- #15 Prompt 模板市集
CREATE TABLE IF NOT EXISTS prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text DEFAULT 'Sparkles',
  category text NOT NULL DEFAULT 'custom',
  system_prompt text NOT NULL,
  is_public boolean DEFAULT false,
  is_featured boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  likes_count integer DEFAULT 0,
  tags text[] DEFAULT '{}',
  variables jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_user ON prompt_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_public ON prompt_templates(is_public, likes_count DESC);
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own templates" ON prompt_templates
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Anyone can read public templates" ON prompt_templates
  FOR SELECT USING (is_public = true);

CREATE TABLE IF NOT EXISTS prompt_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, template_id)
);
ALTER TABLE prompt_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own favorites" ON prompt_favorites
  FOR ALL USING (user_id = auth.uid());
```

---

## Phase A: 對話系統增強（agent-chat）

### #1 對話分支 (Fork)

**API:** `POST /api/conversations/[id]/fork`
- Request: `{ messageId: string }`
- 流程: 複製對話到 messageId 為止的所有訊息，建立新 conversation
- Response: `{ conversationId: string }`

**UI:** 每條 AI 訊息右鍵選單新增「🔀 從此分支」

**Files:**
- Create: `src/app/api/conversations/[id]/fork/route.ts`
- Modify: `src/components/crayon/nexusmind-chat.tsx` — 訊息右鍵選單
- Modify: `src/components/chat/sidebar.tsx` — 顯示分支對話縮排

### #4 Canvas ↔ Chat 雙向連結

**A. Chat → Canvas 精確插入:**
- Modify: `src/components/crayon/assistant-message-renderer.tsx` — 每個區塊加「📌 插入 Canvas」按鈕
- Modify: `src/components/canvas/canvas-editor.tsx` — 監聽 `canvas-insert` 事件

**B. Canvas → Chat 內嵌提問:**
- Create: `src/components/canvas/canvas-ai-panel.tsx` — AI 問答側邊面板
- Modify: `src/components/canvas/canvas-editor.tsx` — Cmd+Shift+A 開啟面板

**C. 文件關聯:**
- Modify: `src/app/api/canvas/route.ts` — POST 支援 source_conversation_id
- Modify: `src/app/api/canvas/[id]/route.ts` — 返回關聯資訊

### #5 智慧摘要 Timeline

**API:** `POST /api/conversations/[id]/summarize`
- 觸發條件: 訊息超過 10 則時自動觸發
- 流程: Gemini Flash 摘要最近 10 則訊息
- 存入 conversation_summaries 表

**UI:** 對話中顯示摘要時間軸節點，點擊可跳到對應訊息

**Files:**
- Create: `src/app/api/conversations/[id]/summarize/route.ts`
- Create: `src/components/chat/summary-timeline.tsx`
- Modify: `src/components/crayon/nexusmind-chat.tsx` — 嵌入 timeline

---

## Phase B: 知識系統增強（agent-knowledge）

### #2 知識庫版本歷史

**API:**
- `GET /api/knowledge/[id]/versions` — 列出版本
- `POST /api/knowledge/[id]/versions` — 建立版本快照
- `GET /api/knowledge/[id]/versions/[versionId]` — 取得版本內容

**流程:** 每次更新 document 時自動建立版本快照

**Files:**
- Create: `src/app/api/knowledge/[id]/versions/route.ts`
- Create: `src/components/knowledge/version-history.tsx` — diff 對比面板
- Modify: `src/app/api/knowledge/[id]/route.ts` — PUT 時自動建版本

### #3 RAG 透明度面板

**API:** Chat API 已返回 metadata，只需前端展示

**UI:** 在 AI 回覆下方加可展開的「🔍 檢索資訊」面板
- 顯示: 查詢重寫歷程、搜尋到的文件、相似度分數、評分結果

**Files:**
- Create: `src/components/chat/rag-transparency-panel.tsx`
- Modify: `src/app/api/chat/route.ts` — SSE 附帶 RAG metadata event
- Modify: `src/components/crayon/assistant-message-renderer.tsx` — 嵌入面板

### #6 知識圖譜搜尋路徑

**UI:** 查詢時在圖譜上高亮 RAG 走過的文件節點

**Files:**
- Modify: `src/components/knowledge/knowledge-graph.tsx` — 新增 ragHighlight prop
- Modify: `src/app/(protected)/knowledge/page.tsx` — 傳遞 RAG 結果到圖譜

### #7 批次文件匯入

**UI:** 拖放整個資料夾 + 進度條

**Files:**
- Create: `src/components/knowledge/batch-upload.tsx` — 拖放區域 + 進度
- Modify: `src/app/(protected)/knowledge/page.tsx` — 嵌入批次上傳元件
- Modify: `src/app/api/knowledge/upload/route.ts` — 支援批次（多檔案）

---

## Phase C: 新功能（agent-new-features）

### #8 知識閃卡 (Flashcard)

**API:**
- `GET /api/flashcards` — 列出閃卡（支援 ?due=true 篩選待複習）
- `POST /api/flashcards` — 建立閃卡
- `POST /api/flashcards/generate` — AI 從文件自動生成閃卡
- `PUT /api/flashcards/[id]/review` — 提交複習結果（SM-2 演算法更新）

**SM-2 間隔重複演算法:**
```
if quality >= 3:
  if review_count == 0: interval = 1
  elif review_count == 1: interval = 6
  else: interval = round(interval * ease_factor)
  ease_factor = max(1.3, ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
else:
  interval = 1
  review_count = 0
```

**UI:**
- `/flashcards` 頁面 — 閃卡學習介面（翻牌 + 評分）
- 知識庫文件詳情頁 — 「生成閃卡」按鈕

**Files:**
- Create: `src/app/(protected)/flashcards/page.tsx`
- Create: `src/app/api/flashcards/route.ts`
- Create: `src/app/api/flashcards/generate/route.ts`
- Create: `src/app/api/flashcards/[id]/review/route.ts`
- Create: `src/components/flashcards/flashcard-viewer.tsx`
- Create: `src/components/flashcards/flashcard-stats.tsx`
- Create: `src/lib/flashcards/sm2.ts` — SM-2 演算法
- Modify: `src/components/layout/responsive-layout.tsx` — 側邊欄加閃卡入口

### #11 知識庫自動更新 (RSS/URL 監控)

**API:**
- `GET /api/knowledge/sources` — 列出監控源
- `POST /api/knowledge/sources` — 新增監控源
- `DELETE /api/knowledge/sources/[id]` — 刪除
- `POST /api/knowledge/sources/[id]/check` — 手動觸發檢查

**流程:**
1. 使用者新增 RSS/URL 監控源
2. API 抓取內容 → 計算 hash → 比對 last_content_hash
3. 如有更新 → 建立/更新 document → 自動向量化

**Files:**
- Create: `src/app/api/knowledge/sources/route.ts`
- Create: `src/app/api/knowledge/sources/[id]/route.ts`
- Create: `src/app/api/knowledge/sources/[id]/check/route.ts`
- Create: `src/components/knowledge/source-manager.tsx` — 監控源管理 UI
- Create: `src/lib/knowledge/rss-parser.ts` — RSS 解析
- Create: `src/lib/knowledge/url-monitor.ts` — URL 內容抓取 + hash 比對
- Modify: `src/app/(protected)/knowledge/page.tsx` — 新增「監控源」tab

### #15 Prompt 模板市集

**API:**
- `GET /api/prompts` — 列出模板（?scope=mine|public|featured）
- `POST /api/prompts` — 建立模板
- `PUT /api/prompts/[id]` — 更新
- `DELETE /api/prompts/[id]` — 刪除
- `POST /api/prompts/[id]/favorite` — 收藏/取消收藏
- `POST /api/prompts/[id]/use` — 記錄使用次數

**系統預設遷移:**
- 將 prompts.ts 中的 14 個 Persona 作為 seed 資料寫入（user_id = NULL）

**UI:**
- 升級 PromptLibrary — 分組顯示「我的」「系統預設」「市集精選」
- 設定頁面 — 新增模板管理區
- 模板變數系統 — 解析 `{{var}}` 並彈出填入表單

**Files:**
- Create: `src/app/api/prompts/route.ts`
- Create: `src/app/api/prompts/[id]/route.ts`
- Create: `src/app/api/prompts/[id]/favorite/route.ts`
- Create: `src/app/api/prompts/[id]/use/route.ts`
- Create: `src/components/prompts/prompt-editor.tsx` — 模板編輯器
- Create: `src/components/prompts/prompt-marketplace.tsx` — 市集瀏覽
- Create: `src/components/prompts/variable-form.tsx` — 變數填入表單
- Create: `src/lib/prompts/variable-parser.ts` — {{var}} 解析器
- Modify: `src/components/chat/prompt-library.tsx` — 升級分組顯示
- Modify: `src/app/(protected)/settings/page.tsx` — 新增模板管理
- Modify: `src/components/layout/responsive-layout.tsx` — 側邊欄入口
