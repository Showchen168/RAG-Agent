<div align="center">
  <a href="https://showmico888company.vercel.app/">
    <img src="public/logo.png" alt="NexusMind Logo" width="280" />
  </a>

# NexusMind 

**Next-Generation AI Mind Hub**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black.svg)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38B2AC.svg)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E.svg)](https://supabase.com/)
<br/>
[![NexusMind Docs](https://img.shields.io/badge/📖_NexusMind_Docs-Visit_on_Vercel-black?style=for-the-badge&logo=vercel)](https://nexusmind-docs.vercel.app/)

[功能介紹](#核心功能) • [系統架構](#系統架構) • [快速開始](#快速開始) • [線上 API 文件](https://nexusmind-docs.vercel.app/)

</div>

---

NexusMind 是一個基於 Next.js 16 與 Vercel AI SDK 建構的下一代 AI 智能中樞系統。它不僅是一個聊天機器人，更是一個整合了**知識管理 (RAG + Knowledge Graph)**、**長期記憶 (Long-term Memory)**、**技能沙盒執行 (Docker-in-Docker)** 以及**視覺化編輯 (Canvas & Diagram)** 的全方位 AI 協作平台。

## ✨ 核心功能

- **🧠 雙層對話記憶系統 (Memory System)**：自動從對話中提取使用者的偏好與事實，讓 AI 越用越懂你。
- **📚 智慧知識庫 (Knowledge Graph + RAG)**：上傳任何格式（PDF, Word, PPT, TXT），系統將透過 Marker 與 LightRAG 微服務自動解析並抽取實體關聯，提供有根據、可溯源的 AI 回答。
- **🎭 Persona 角色切換**：自訂 AI 角色、設定圖示與 system prompt，快速在不同的對話情境中切換。
- **🛠️ 隔離沙盒技能系統 (Skills System)**：在 Docker-in-Docker 容器內安全執行 Python, Node.js 等程式碼，能自動產出深度報告與 Excel / DOCX 等多種格式檔案。
- **🎨 視覺化編輯器 (Canvas & Diagram)**：TipTap 編輯器實作的 Canvas 畫布，並支援經由 Cytoscape.js 轉譯的互動式流程圖與心智圖，AI 可直接產出並編輯。
- **🤖 Telegram Bot 整合**：無縫串接 Telegram，讓你在手機上也能隨時隨地與專屬 AI 助理互動並存取你的知識庫。

## 🏗️ 系統架構

NexusMind 採用前端 Next.js 主應用，搭配後端多個 Python Docker 微服務的混合架構，兼顧開發效率與繁重資料處理的需求。

```text
┌─────────────────────────────────────────────────────────────┐
│                       Next.js 16 主應用                       │
│  ┌──────────┐ ┌───────────┐ ┌───────────┐ ┌─────────────┐   │
│  │ AI 對話   │ │ 知識庫管理 │ │ 記憶管理   │ │ Telegram Bot│   │
│  └────┬─────┘ └─────┬─────┘ └─────┬─────┘ └──────┬──────┘   │
│       │             │             │              │          │
├───────┼─────────────┼─────────────┼──────────────┼──────────┤
│    Supabase (PostgreSQL + pgvector + RLS 行級安全)           │
├───────┼─────────────┼─────────────┼──────────────┼──────────┤
│       │             │             │              │          │
│  ┌────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐ ┌──────┴──────┐   │
│  │ Marker   │ │ LightRAG  │ │ Skill     │ │  Gemini API │   │
│  │ Document │ │ Graph/RAG │ │ Executor  │ │  OpenAI API │   │
│  └──────────┘ └───────────┘ └───────────┘ └─────────────┘   │
│      Python 微服務               Docker-in-Docker 沙盒       │
└─────────────────────────────────────────────────────────────┘
```

### 資料庫核心表格 (Supabase)

系統運用 Supabase 處理關聯資料、向量檢索與即時訂閱，並使用 RLS 保護使用者隱私。

*   **知識與檔案**：`documents`, `document_embeddings`, `document_relations`, `knowledge_sources`
*   **對話與狀態**：`conversations`, `messages`, `personas`, `assistant_presets`
*   **內容產出**：`canvas_documents`, `reports`, `skills`, `skill_attachments`
*   **使用者特徵**：`user_memories` (長期記憶), `user_skill_preferences` (技能偏好)
*   **外部整合**：`telegram_users`, `telegram_bot_config`, `gdrive_user_tokens`

## 🗂️ 專案目錄結構

```bash
nexusmind/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (auth)/               # 登入與註冊頁面
│   │   ├── (protected)/          # 需要登入的核心功能 (Chat, Knowledge, Canvas, Settings)
│   │   └── api/                  # 後端 API 路由 (AI, 知識庫, 技能, Webhook)
│   ├── components/               # React UI 組件
│   │   ├── chat/                 # 對話視窗、訊息氣泡、輸入框
│   │   ├── canvas/               # TipTap 視覺化文件編輯器
│   │   ├── diagram/              # Cytoscape.js 圖表渲染
│   │   ├── knowledge/            # 檔案上傳、知識圖譜管理
│   │   └── skills/               # 技能執行沙盒 UI
│   └── lib/                      # 核心業務邏輯
│       ├── ai/                   # AI SDK 封裝與 Provider 設定
│       ├── rag/                  # RAG 與向量檢索核心
│       ├── memory/               # 雙層記憶系統萃取邏輯
│       ├── skills/               # 技能定義與 DIND 呼叫邏輯
│       └── supabase/             # 資料庫客戶端
├── supabase/
│   └── migrations/               # PostgreSQL 資料庫結構定義
├── public/                       # 靜態資源
└── components.json               # shadcn/ui 設定檔
```

## 🚀 快速開始

### 1. 系統需求
- Node.js >= 20
- Docker & Docker Compose (微服務必需)
- Supabase Project (雲端 或 本地開源版)
- Google Gemini API Key 或 OpenAI API Key

### 2. 環境變數設定

複製範例設定檔並填入您的金鑰：

```bash
cp .env.local.example .env.local
```

編輯 `.env.local`：
*   設定 `NEXT_PUBLIC_SUPABASE_URL` 與 `NEXT_PUBLIC_SUPABASE_ANON_KEY`
*   設定 `GOOGLE_GENERATIVE_AI_API_KEY`

### 3. 部署資料庫

將 `/supabase/migrations` 下的所有腳本依序執行於您的 Supabase 專案中，以建立表格、函數與 RLS 規則。若使用本地 Supabase CLI：

```bash
supabase db push
```

### 4. 啟動微服務 (Docker)

在包含 `docker-compose.yml` 的基礎設施資料夾中（通常為額外配置），啟動所需的微服務：

```bash
# 啟動 Marker 解析、LightRAG、Skill SandBox
docker-compose up -d
```

### 5. 啟動主應用程式

安裝依賴並啟動 Next.js 開發伺服器：

```bash
npm install
npm run dev
```

開啟 `http://localhost:3000` 即可開始體驗 NexusMind。

## 🔌 API 路由總覽

NexusMind 提供數十個 API 路由，以支援複雜的微服務整合：

*   **對話處理**：`/api/chat`, `/api/conversations/*`
*   **知識庫與解析**：`/api/knowledge/*`, `/api/knowledge/upload`
*   **技能執行沙盒**：`/api/skills/*`, `/api/skills/execute`
*   **內容編輯器**：`/api/canvas/*`, `/api/reports/*`
*   **外部服務**：`/api/telegram/webhook`, `/api/gdrive/*`

*(詳細的 API 文件請參閱 `/docs` 目錄)*

## 📄 授權條款

NexusMind 採取 **MIT 授權條款**. 詳情請見 [LICENSE](LICENSE) 檔案。
