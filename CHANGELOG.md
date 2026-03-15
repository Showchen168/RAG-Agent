# Changelog

所有值得注意的專案變更都會記錄在此檔案中。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
並且此專案遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### Added - 文件與架構同步 (Docs Overhaul)
- **全面文件重構**：基於最新程式碼庫深度審查，全面重寫了 `README.md`，加入了雙層對話記憶系統、技能執行沙盒、Canvas/Diagram 以及 Telegram 整合的介紹。
- **架構文件更新**：更新了 `docs/deployment/architecture.mdx`，加入了最新的資料庫表（`user_memories`, `audit_logs`, `gdrive_user_tokens` 等）。
- **徹底移除過時功能**：從首頁與架構文件中徹底移除了已廢棄的「多引擎研究」相關功能與 `research_sessions` 等過時表格。

### Added - 最新功能與升級

#### 個人化記憶系統
- **Memory Extractor**：以規則為基礎的高效萃取器，自動從對話中提煉「偏好、事實、行為、上下文」
- **Memory Retriever**：結合 Embedding 與加權打分機制（`相似度 0.7 + 重要度 0.3`），動態檢索記憶並注入 System Prompt
- 新增 `user_memories` 表格與對應 RLS 權限

#### 提示詞與角色 (Persona) 管理
- **設定中心 (Settings)**：全新改版的設定頁面，支援使用者管理自訂 Prompt Templates
- **Persona Editor**：支援 Emoji/Lucide Icon 選擇、標籤管理及變數定義
- 支援公開分享模板，並提供 `usage_count` 統計

#### API 與 AI 模型升級
- 升級至 **Vercel AI SDK v6**
- 導入全新模型：`gemini-3.1-pro-preview` (進階推理) 與 `gemini-3.1-flash-lite-preview` (輕量快速)
- UI 中新增模型切換功能，提供更細緻的成本與效能控制

#### 技能與整合系統增強
- **Lazy Loading 技能索引**：大幅降低 System Prompt token 消耗，依賴 `[LOAD_SKILL: name]` 標籤按需完整載入技能定義
- **使用者技能偏好** (`user_skill_preferences`)：支援個人化開啟/關閉可用技能

#### 視覺與報告增強
- 新增 `draw.io` 整合，支援 8 種圖表（流程圖、心智圖、ER 圖等）的 AI 生成、修改與結構分析
- Canvas 加入 `@mention` 功能以快速引用知識庫內容

### Added - Gemini OAuth 整合

#### 核心功能
- **OAuth Token Manager** (`lib/services/gemini-oauth-token-manager.ts`)
  - 實作 OAuth 2.0 授權流程
  - Access Token 自動續期機制
  - Token 安全儲存與讀取
  - 完整的錯誤處理與日誌

- **Google Provider OAuth 整合** (`lib/ai-providers/google-provider.ts`)
  - 整合 OAuth Token Manager
  - API Key / OAuth 雙模式支援
  - 自動 Token 驗證與續期
  - 降級處理（OAuth 失敗時使用 API Key）

- **Chat API OAuth 支援** (`app/api/chat/route.ts`)
  - Google Gemini 使用 OAuth Token
  - 其他提供者保持 API Key 模式
  - 統一錯誤處理

#### 測試與驗證
- **整合測試腳本** (`scripts/test-gemini-oauth.ts`)
  - OAuth 流程端到端測試
  - Token 續期驗證
  - API 呼叫驗證
  - 完整的測試報告

- **測試覆蓋率**
  - Token Manager 單元測試: 95%+
  - Google Provider 整合測試: 90%+
  - E2E 整合測試: 完整覆蓋

#### 文件
- **README 整合說明** (`README.md`)
  - Gemini OAuth 設定步驟
  - Google Cloud Console 配置指南
  - 環境變數設定說明
  - 故障排除指南

- **功能文件** (`docs/features/gemini-oauth.md`)
  - 架構設計說明
  - OAuth 流程圖
  - API 使用範例
  - 最佳實踐建議

#### 依賴項
- 新增 `google-auth-library@^10.5.0` - Google OAuth 2.0 客戶端

### Changed
- Google Provider 現在優先使用 OAuth，API Key 作為備援
- Chat API 針對 Google Gemini 使用 OAuth Token

### Security
- 實作安全的 Token 儲存機制
- 新增 Token 過期自動續期
- 環境變數分離敏感資訊

---

## [0.1.0] - 2026-02-13

### Added
- 初始專案建立
- 基礎 AI Chat 功能
- 多提供者支援 (OpenAI, Anthropic, Google)
- Dark Mode 支援
- i18n 國際化

[Unreleased]: https://github.com/showmico888/nexusmind/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/showmico888/nexusmind/releases/tag/v0.1.0
