# Telegram Bot 整合設計

> **日期**: 2026-02-24
> **狀態**: 已批准
> **方案**: A — Next.js Webhook Route（內建於 NexusMind）

---

## 1. 架構總覽

```
Telegram Cloud
    │
    ▼ (HTTPS POST)
Tailscale Serve (dxp2800.tail8a2d5d.ts.net)
    │
    ▼
NexusMind Docker (:3000)
    │
    ▼
/api/telegram/webhook (POST)
    │
    ├─ 驗證 Telegram 簽名 (X-Telegram-Bot-Api-Secret-Token)
    ├─ 解析 Message
    ├─ 查找/建立 Supabase 對話
    ├─ 呼叫 Gemini + Adaptive RAG（複用現有邏輯）
    └─ sendMessage 回覆 Telegram（完整文字，非串流）
```

## 2. 用戶身份映射

- 用 Telegram `chat.id` 作為唯一標識
- 首次使用自動建立 NexusMind Profile + 預設對話
- 不需要 OAuth 或 NexusMind 帳號登入

| Telegram 欄位 | 對應 | 儲存位置 |
|---|---|---|
| `chat.id` | 用戶識別 | `telegram_users` 表 |
| `chat.first_name` | 顯示名稱 | 同上 |

## 3. 檔案結構

```
src/
├── app/api/telegram/
│   └── webhook/route.ts    ← Webhook 接收端
├── lib/telegram/
│   ├── bot.ts              ← sendMessage、格式轉換
│   ├── types.ts            ← Telegram API 型別
│   └── auth.ts             ← 簽名驗證 + 用戶映射
```

共 4 個新檔案，不動現有代碼。

## 4. 訊息處理流程

1. 收到 Telegram 文字訊息
2. 驗證 secret_token
3. 查找 telegram_users → 取得 user_id + conversation_id
4. 如果是新用戶：建立 Profile + Conversation
5. 存入 messages 表（role: user）
6. 呼叫 generateText（Gemini + RAG context）← 非串流
7. 存入 messages 表（role: assistant）
8. 呼叫 Telegram sendMessage API（支援 Markdown）
9. 回傳 200 OK

關鍵決策：
- 用 `generateText` 而非 `streamText`（Telegram 不支援串流）
- RAG 自動啟用（複用 `executeAdaptiveRAG`）
- 長回覆自動分段（Telegram 限制 4096 字元）

## 5. 安全性

- **Webhook Secret**: BotFather 設定 secret_token，驗證 X-Telegram-Bot-Api-Secret-Token header
- **Rate Limiting**: 每用戶每分鐘 10 則訊息（Supabase 計數）
- **Bot Token**: 存在 `.env.local` 的 `TELEGRAM_BOT_TOKEN`

## 6. 環境變數（新增）

```
TELEGRAM_BOT_TOKEN=<BotFather 給的 token>
TELEGRAM_WEBHOOK_SECRET=<自定義密鑰>
```

## 7. MVP 排除項目

- 圖片/檔案上傳（未來再加）
- Inline keyboard 互動
- 群組聊天支援（只做私聊）
- 深度研究觸發（未來用 `/research` 指令）
- 多模型選擇

## 8. 資料庫變更

新增 `telegram_users` 表：

```sql
CREATE TABLE telegram_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  telegram_first_name TEXT,
  user_id UUID REFERENCES auth.users(id),
  default_conversation_id UUID REFERENCES conversations(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## 9. 未來擴展路線

1. `/research <topic>` 指令 → 觸發深度研究
2. 傳送檔案 → 自動上傳知識庫
3. Inline keyboard → 選擇研究引擎
4. `/newchat` 指令 → 建立新對話
5. 群組支援 → @bot mention 觸發回覆
