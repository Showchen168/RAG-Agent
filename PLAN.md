# NexusMind — AI 智慧知識助手

> **全新學習專案**：資料持久化 + Auth + AI/LLM 應用開發
> **開發方式**：自然語言驅動（Claude Code 開發 + 應用內自然語言功能）

---

## 專案概述

**NexusMind** 是一個 AI 驅動的知識管理助手，使用者可以：
1. **自然語言對話**查詢、整理、分析自己的知識庫
2. **上傳文件/筆記**，AI 自動摘要和分類
3. **跨文件 AI 問答**（RAG 架構）— 對自己的資料提問

透過這個專案，你將學會：
- ✅ Supabase Auth（註冊/登入/Session）
- ✅ PostgreSQL 資料持久化（Supabase Database + RLS）
- ✅ API Gateway 模式（Next.js API Routes 統一入口）
- ✅ Anthropic Claude API + OpenAI API 串接
- ✅ RAG（Retrieval-Augmented Generation）實作
- ✅ Vercel AI SDK 串流對話

---

## 技術棧

| 層級 | 技術 | 說明 |
|------|------|------|
| **前端** | Next.js 16 + React 19 + Tailwind v4 | 延續你現有技術棧 |
| **Auth** | Supabase Auth + Middleware Gateway | 統一 Token 驗證 |
| **資料庫** | Supabase PostgreSQL + pgvector | 結構化資料 + 向量搜尋 |
| **AI** | Anthropic Claude API + OpenAI API | 雙 LLM 支援 |
| **AI SDK** | Vercel AI SDK (@ai-sdk/anthropic, @ai-sdk/openai) | 串流對話、工具呼叫 |
| **向量化** | OpenAI Embeddings + pgvector | RAG 文件檢索 |
| **部署** | Vercel（前端）+ Supabase Cloud（後端） | 免維護部署 |

---

## 架構圖

```
┌─────────────────────────────────────────────────┐
│                   前端（Next.js）                 │
│                                                   │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Auth UI │  │ Chat UI  │  │ Knowledge Base   │ │
│  │ 登入/註冊│  │ AI 對話  │  │ 文件管理/搜尋    │ │
│  └────┬────┘  └────┬─────┘  └───────┬──────────┘ │
│       │            │                │             │
└───────┼────────────┼────────────────┼─────────────┘
        │            │                │
        ▼            ▼                ▼
┌─────────────────────────────────────────────────┐
│          API Gateway（Next.js API Routes）        │
│                                                   │
│  middleware.ts ── 統一 Auth Token 驗證             │
│                                                   │
│  /api/auth/*    → Supabase Auth                   │
│  /api/chat/*    → Anthropic / OpenAI SDK          │
│  /api/knowledge/* → Supabase DB + pgvector        │
│  /api/embed/*   → OpenAI Embeddings               │
└──────┬──────────────┬─────────────────┬───────────┘
       │              │                 │
       ▼              ▼                 ▼
  ┌─────────┐  ┌────────────┐  ┌──────────────┐
  │Supabase │  │ Anthropic  │  │   OpenAI     │
  │Auth + DB│  │ Claude API │  │ Chat + Embed │
  │+ pgvector│  └────────────┘  └──────────────┘
  └─────────┘
```

---

## 開發階段

### Phase 1：基礎建設（Auth + Database + 本地 Supabase）
**學習重點**：Supabase Auth、PostgreSQL Schema、RLS 政策

| 步驟 | 任務 | 驗收條件 |
|:---:|------|---------|
| 1.1 | Next.js 專案初始化 + Supabase 本地開發環境 | `supabase start` + `npm run dev` 正常運行 |
| 1.2 | 設計 Database Schema（users, documents, conversations, messages） | Migration 檔案建立，表結構正確 |
| 1.3 | 實作 Supabase Auth（註冊/登入/登出/Session） | 使用者可註冊、登入、登出，Session 持久化 |
| 1.4 | RLS（Row Level Security）政策設定 | 使用者只能存取自己的資料 |
| 1.5 | API Gateway 中間件（Middleware） | 未認證請求回傳 401 |

**Database Schema**：
```sql
-- users（Supabase Auth 自動管理）
-- profiles（使用者擴展資訊）
create table profiles (
  id uuid references auth.users primary key,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- documents（知識庫文件）
create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  content text not null,
  summary text,
  tags text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- document_embeddings（向量搜尋用）
create table document_embeddings (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents on delete cascade,
  chunk_text text not null,
  embedding vector(1536),
  chunk_index int not null
);

-- conversations（對話紀錄）
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text default '新對話',
  model text default 'claude',
  created_at timestamptz default now()
);

-- messages（訊息紀錄）
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz default now()
);
```

---

### Phase 2：AI 對話功能（Vercel AI SDK + 串流）
**學習重點**：LLM API 串接、串流回應、多模型切換

| 步驟 | 任務 | 驗收條件 |
|:---:|------|---------|
| 2.1 | 安裝 Vercel AI SDK + Anthropic/OpenAI Provider | SDK 初始化成功 |
| 2.2 | 實作 /api/chat API Route（Gateway 模式） | Auth 驗證 → 呼叫 LLM → 串流回應 |
| 2.3 | 前端 Chat UI（useChat hook） | 使用者可輸入自然語言，即時看到 AI 回應 |
| 2.4 | 對話紀錄持久化（存入 Supabase） | 重新登入後可看到歷史對話 |
| 2.5 | 多模型切換（Claude ↔ GPT） | 使用者可選擇 AI 模型 |

**API Gateway 模式範例**：
```typescript
// app/api/chat/route.ts
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { createServerClient } from '@supabase/ssr'

export async function POST(req: Request) {
  // 1. Gateway: Auth 驗證
  const supabase = createServerClient(...)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. 解析請求
  const { messages, model } = await req.json()

  // 3. 選擇 LLM Provider
  const provider = model === 'gpt' ? openai('gpt-4o') : anthropic('claude-sonnet-4-5-20250929')

  // 4. 串流回應
  const result = streamText({ model: provider, messages })
  return result.toDataStreamResponse()
}
```

---

### Phase 3：RAG 知識庫（向量搜尋 + 自然語言查詢）
**學習重點**：Embeddings、pgvector、RAG Pipeline

| 步驟 | 任務 | 驗收條件 |
|:---:|------|---------|
| 3.1 | 文件上傳 + 內容擷取 | 使用者可上傳文字/Markdown 檔案 |
| 3.2 | 文件分段（Chunking）+ Embedding 生成 | 文件自動切割並生成向量存入 pgvector |
| 3.3 | 語意搜尋 API（/api/knowledge/search） | 自然語言查詢返回相關文件片段 |
| 3.4 | RAG 對話整合 | AI 對話時自動檢索相關知識，回答更精準 |
| 3.5 | AI 自動摘要 + 標籤 | 上傳文件時自動生成摘要和分類標籤 |

**RAG Pipeline**：
```
使用者提問 → Embedding 化 → pgvector 語意搜尋
    → 取回 Top-K 相關片段 → 注入 System Prompt
    → LLM 生成回答（帶引用來源）
```

---

### Phase 4：UI/UX + 測試 + 部署
**學習重點**：完整產品體驗、測試覆蓋、部署流程

| 步驟 | 任務 | 驗收條件 |
|:---:|------|---------|
| 4.1 | 響應式 UI（Desktop + Mobile） | Lighthouse Performance > 90 |
| 4.2 | Dark Mode + i18n（中/英） | 主題和語言切換正常 |
| 4.3 | Unit + Integration 測試 | 覆蓋率 > 80% |
| 4.4 | E2E 測試（Playwright） | 登入 → 對話 → 知識庫 完整流程 |
| 4.5 | Vercel 部署 + Supabase Cloud 設定 | 線上可存取 |

---

## 目錄結構

```
NexusMind/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # Landing Page
│   │   ├── globals.css
│   │   ├── providers.tsx               # Auth + Theme + i18n
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (protected)/                # 需要登入的頁面
│   │   │   ├── layout.tsx              # Auth Guard
│   │   │   ├── chat/
│   │   │   │   ├── page.tsx            # AI 對話主頁
│   │   │   │   └── [id]/page.tsx       # 特定對話
│   │   │   ├── knowledge/
│   │   │   │   ├── page.tsx            # 知識庫列表
│   │   │   │   └── [id]/page.tsx       # 文件詳情
│   │   │   └── settings/page.tsx       # 使用者設定
│   │   └── api/                        # ← API Gateway
│   │       ├── auth/
│   │       │   └── callback/route.ts   # Supabase Auth callback
│   │       ├── chat/
│   │       │   └── route.ts            # AI 對話（串流）
│   │       ├── knowledge/
│   │       │   ├── route.ts            # CRUD 文件
│   │       │   ├── search/route.ts     # 語意搜尋
│   │       │   └── embed/route.ts      # 生成 Embedding
│   │       └── conversations/
│   │           └── route.ts            # 對話管理
│   ├── components/
│   │   ├── auth/                       # Auth 相關元件
│   │   ├── chat/                       # 對話 UI 元件
│   │   ├── knowledge/                  # 知識庫元件
│   │   └── ui/                         # 共用 UI 元件
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts              # Browser Client
│   │   │   ├── server.ts              # Server Client
│   │   │   └── middleware.ts           # Auth Middleware
│   │   ├── ai/
│   │   │   ├── providers.ts           # LLM Provider 設定
│   │   │   ├── rag.ts                 # RAG Pipeline
│   │   │   └── embeddings.ts          # Embedding 工具
│   │   └── i18n.ts
│   └── types/
│       └── index.ts                    # TypeScript 型別
├── supabase/
│   ├── config.toml                     # Supabase 本地設定
│   ├── migrations/                     # Database Migrations
│   └── seed.sql                        # 測試資料
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.local                          # API Keys（不進版控）
├── middleware.ts                        # Next.js Middleware（Auth Gateway）
└── package.json
```

---

## 環境變數

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI API Keys（只在伺服器端使用，不暴露給前端）
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
```

---

## 風險與緩解

| 風險 | 緩解措施 |
|------|---------|
| Supabase 本地環境設定複雜 | 提供完整 Docker + config.toml 設定 |
| pgvector 安裝問題 | Supabase 本地版已內建 pgvector |
| API Key 外洩 | Gateway 模式確保 Key 只在伺服器端 |
| LLM API 費用控制 | 加入 Rate Limiting + Token 計數 |
| 向量搜尋效能 | 使用 HNSW 索引 + 合理 Chunk Size |

---

## 預計學習成果

完成此專案後，你將掌握：

1. **Supabase 全套**：Auth、PostgreSQL、RLS、Migrations、Edge Functions
2. **API Gateway 模式**：中間件驗證、統一錯誤處理、API Key 保護
3. **LLM 應用開發**：Vercel AI SDK、串流回應、多模型切換
4. **RAG 架構**：文件分段、Embedding、向量搜尋、上下文注入
5. **全棧部署**：Vercel + Supabase Cloud 完整上線流程
