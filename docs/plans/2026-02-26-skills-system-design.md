# NexusMind Skills System 設計文件

**日期**: 2026-02-26
**狀態**: 已核准
**架構**: Docker Sandbox

---

## 概述

讓 NexusMind 的 LLM 能載入並執行「技能」。使用者可在設定頁上傳技能包（ZIP），在聊天視窗透過按鈕面板觸發，輸出以附件卡片呈現（可展開預覽 + 下載）。

## 需求決策記錄

| 維度 | 決定 |
|------|------|
| 技能類型 | 特定動作指令（一次性觸發） |
| 觸發方式 | 聊天視窗旁的按鈕面板 |
| 輸入來源 | 依技能定義（自動帶對話上下文 / 需額外輸入 / 兩者皆可） |
| 來源管理 | 系統預設 + 使用者自己上傳 |
| 輸出方式 | 對話流中的附件卡片（可展開預覽 + 下載） |
| 技能格式 | Claude Code 式：SKILL.md + scripts/ |
| 執行方式 | prompt 注入 + server-side Docker 容器腳本執行 |
| 安裝方式 | ZIP 上傳 |

## 技能包格式

```
my-skill.zip
├── SKILL.md            ← LLM 指令（注入 system prompt）
├── scripts/            ← server-side 執行腳本
│   ├── Dockerfile      ← 技能專屬執行環境（可選，有預設映像）
│   ├── entrypoint.sh   ← 統一入口點
│   └── ...             ← 任意腳本/模板
└── skill.json          ← 元資料
```

### skill.json 必要欄位

- name: 技能 ID（唯一）
- displayName: 顯示名稱
- description: 說明文字
- icon: Lucide icon 名稱或 Emoji
- category: 分類（document / data / creative / utility）
- input.type: "context" | "user" | "both"
- input.userInputLabel: 當 type 含 user 時的輸入框提示文字
- output.fileType: 輸出檔案副檔名
- output.mimeType: MIME type
- output.previewFormat: 預覽格式（markdown / plaintext / image）
- runtime.baseImage: Docker base image（預設 node:20-slim）
- runtime.timeout: 超時秒數（預設 60）
- runtime.maxMemory: 記憶體限制（預設 512m）

## UI 設計

### 設定頁 — 技能管理 Tab

- 已安裝技能列表（icon、名稱、版本、啟用/停用開關、刪除按鈕）
- 右上角「上傳技能」按鈕 → 選擇 .zip 檔
- 系統預設技能標記為「系統」，不可刪除但可停用

### 聊天視窗 — 技能按鈕面板

- 輸入框下方顯示已啟用技能的圖標列
- 點擊技能圖標觸發執行
- 依 input.type 決定是否彈出額外輸入對話框

### 附件卡片

- AI 回覆中嵌入附件卡片
- 檔案圖標 + 檔名
- 可展開/收合的內容預覽（Markdown 渲染）
- 下載按鈕

## 執行流程

```
1. 使用者點擊技能按鈕
2. 前端收集輸入（對話上下文 / 使用者輸入 / 兩者）
3. POST /api/skills/execute
4. Server 端：
   a. 讀取 SKILL.md，注入 system prompt
   b. 呼叫 Gemini，取得 LLM 中間輸出
   c. 啟動 Docker 容器，掛載 scripts/ + LLM 輸出
   d. 執行 entrypoint.sh，產生輸出檔案
   e. 容器超時/記憶體超限自動終止
5. 回傳：AI 訊息文字 + 附件檔案 URL
6. 前端渲染附件卡片
```

## 資料庫設計

### skills 表

- id, user_id, name, display_name, description, icon, category, version
- skill_md (TEXT): SKILL.md 內容
- skill_config (JSONB): skill.json 內容
- storage_path (TEXT): scripts/ 在伺服器上的路徑
- is_system, is_enabled, created_at, updated_at
- UNIQUE(user_id, name)

### skill_attachments 表

- id, message_id (FK messages), skill_id (FK skills)
- file_name, file_type, mime_type, file_size
- storage_path, preview_content
- created_at

## Docker 架構

- docker-compose.yml 新增 skill-executor 服務
- 掛載 Docker socket 用於動態建立技能執行容器
- 每次執行建立臨時容器，執行完自動清理
- 安全限制：網路隔離、唯讀 scripts/、僅 /output 可寫、資源限制

## 不做的事

- 社群分享/技能商城
- Slash command 觸發（僅按鈕面板）
- 多步驟工作流（技能是一次性指令）
- 技能間的串接/組合
