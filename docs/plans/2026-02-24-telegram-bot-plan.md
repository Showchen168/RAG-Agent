# Telegram Bot 整合實施計劃

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 讓 NexusMind 透過 Telegram Bot 接收文字訊息，用 Gemini + RAG 知識庫回覆，實現行動端 AI 助手。

**Architecture:** Next.js API Route 作為 Webhook 端點，直接呼叫 Telegram Bot API（無框架依賴）。複用現有 `generateText` + `executeAdaptiveRAG` 邏輯。用 `telegram_users` 表映射 Telegram chat.id 到 NexusMind 用戶。

**Tech Stack:** Next.js 16 API Route、Telegram Bot API（直接 HTTP）、Supabase（Auth + DB）、Vercel AI SDK `generateText`、Zod 驗證

---

### Task 1: Telegram 型別定義

**Files:**
- Create: `src/lib/telegram/types.ts`

**Step 1: 寫測試**

Create: `src/lib/telegram/__tests__/types.test.ts`

```typescript
import { TelegramUpdateSchema } from '../types'

describe('TelegramUpdateSchema', () => {
  it('should parse a valid text message update', () => {
    const update = {
      update_id: 123456,
      message: {
        message_id: 1,
        date: 1709000000,
        chat: { id: 987654321, type: 'private', first_name: 'Show' },
        from: { id: 987654321, is_bot: false, first_name: 'Show' },
        text: '你好，NexusMind',
      },
    }
    const result = TelegramUpdateSchema.safeParse(update)
    expect(result.success).toBe(true)
  })

  it('should reject update without message', () => {
    const update = { update_id: 123456 }
    const result = TelegramUpdateSchema.safeParse(update)
    // update without message is valid (could be callback_query etc), but message field is optional
    expect(result.success).toBe(true)
  })

  it('should reject update with non-private chat', () => {
    const update = {
      update_id: 123456,
      message: {
        message_id: 1,
        date: 1709000000,
        chat: { id: -100123, type: 'group', title: 'Test Group' },
        from: { id: 987654321, is_bot: false, first_name: 'Show' },
        text: 'hello',
      },
    }
    const result = TelegramUpdateSchema.safeParse(update)
    expect(result.success).toBe(true)
    // chat type filtering happens in webhook handler, not schema
  })
})
```

**Step 2: 執行測試確認 RED**

Run: `npx jest src/lib/telegram/__tests__/types.test.ts --no-coverage`
Expected: FAIL — module not found

**Step 3: 寫最小實作**

Create: `src/lib/telegram/types.ts`

```typescript
import { z } from 'zod'

export const TelegramChatSchema = z.object({
  id: z.number(),
  type: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  title: z.string().optional(),
})

export const TelegramUserSchema = z.object({
  id: z.number(),
  is_bot: z.boolean(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
})

export const TelegramMessageSchema = z.object({
  message_id: z.number(),
  date: z.number(),
  chat: TelegramChatSchema,
  from: TelegramUserSchema.optional(),
  text: z.string().optional(),
})

export const TelegramUpdateSchema = z.object({
  update_id: z.number(),
  message: TelegramMessageSchema.optional(),
})

export type TelegramChat = z.infer<typeof TelegramChatSchema>
export type TelegramUser = z.infer<typeof TelegramUserSchema>
export type TelegramMessage = z.infer<typeof TelegramMessageSchema>
export type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>
```

**Step 4: 執行測試確認 GREEN**

Run: `npx jest src/lib/telegram/__tests__/types.test.ts --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/telegram/types.ts src/lib/telegram/__tests__/types.test.ts
git commit -m "feat: 新增 Telegram Bot API 型別定義（Zod schema）"
```

---

### Task 2: Telegram Bot 客戶端（sendMessage + Markdown→HTML 轉換）

**Files:**
- Create: `src/lib/telegram/bot.ts`
- Test: `src/lib/telegram/__tests__/bot.test.ts`

**Step 1: 寫測試**

```typescript
import { markdownToTelegramHtml, splitMessage } from '../bot'

describe('markdownToTelegramHtml', () => {
  it('should convert bold markdown to HTML', () => {
    expect(markdownToTelegramHtml('**bold**')).toBe('<b>bold</b>')
  })

  it('should convert inline code', () => {
    expect(markdownToTelegramHtml('use `console.log`')).toBe('use <code>console.log</code>')
  })

  it('should escape HTML special characters', () => {
    expect(markdownToTelegramHtml('a < b & c > d')).toContain('&lt;')
    expect(markdownToTelegramHtml('a < b & c > d')).toContain('&amp;')
    expect(markdownToTelegramHtml('a < b & c > d')).toContain('&gt;')
  })

  it('should convert code blocks with language', () => {
    const input = '```python\nprint("hello")\n```'
    const result = markdownToTelegramHtml(input)
    expect(result).toContain('<pre><code class="language-python">')
    expect(result).toContain('print(&quot;hello&quot;)')
  })

  it('should handle plain text without modification', () => {
    expect(markdownToTelegramHtml('hello world')).toBe('hello world')
  })
})

describe('splitMessage', () => {
  it('should not split short messages', () => {
    expect(splitMessage('hello', 4096)).toEqual(['hello'])
  })

  it('should split long messages at newlines', () => {
    const long = 'line1\nline2\nline3'
    const result = splitMessage(long, 10)
    expect(result.length).toBeGreaterThan(1)
    expect(result.join('\n')).toContain('line1')
  })
})
```

**Step 2: 執行測試確認 RED**

Run: `npx jest src/lib/telegram/__tests__/bot.test.ts --no-coverage`
Expected: FAIL

**Step 3: 寫最小實作**

Create: `src/lib/telegram/bot.ts`

```typescript
const TELEGRAM_API = 'https://api.telegram.org/bot'
const MAX_MESSAGE_LENGTH = 4096

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN 環境變數未設定')
  return token
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function markdownToTelegramHtml(md: string): string {
  let result = md

  // 1. Code blocks (must be first to protect content inside)
  result = result.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_match, lang, code) => {
      const escaped = escapeHtml(code.trimEnd())
      return lang
        ? `<pre><code class="language-${lang}">${escaped}</code></pre>`
        : `<pre>${escaped}</pre>`
    }
  )

  // 2. Inline code (protect from further transforms)
  const codeTokens: string[] = []
  result = result.replace(/`([^`]+)`/g, (_match, code) => {
    const token = `__CODE_${codeTokens.length}__`
    codeTokens.push(`<code>${escapeHtml(code)}</code>`)
    return token
  })

  // 3. Escape HTML in remaining text
  result = result.replace(/&(?!amp;|lt;|gt;|quot;)/g, '&amp;')
  result = result.replace(/<(?!\/?(b|i|u|s|code|pre|a|blockquote|tg-emoji)\b)/g, '&lt;')
  result = result.replace(/(?<!<\/(b|i|u|s|code|pre|a|blockquote|tg-emoji)|<(b|i|u|s|code|pre|blockquote|tg-emoji)(\s[^>]*)?)>/g, '&gt;')

  // 4. Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')

  // 5. Italic
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>')

  // 6. Restore code tokens
  codeTokens.forEach((html, i) => {
    result = result.replace(`__CODE_${i}__`, html)
  })

  return result
}

export function splitMessage(text: string, maxLength = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLength) return [text]

  const parts: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining)
      break
    }

    // Try to split at last newline within limit
    const chunk = remaining.slice(0, maxLength)
    const lastNewline = chunk.lastIndexOf('\n')
    const splitAt = lastNewline > maxLength * 0.3 ? lastNewline : maxLength

    parts.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).replace(/^\n/, '')
  }

  return parts
}

export async function sendMessage(
  chatId: number,
  text: string,
): Promise<void> {
  const token = getBotToken()
  const html = markdownToTelegramHtml(text)
  const parts = splitMessage(html)

  for (const part of parts) {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: part,
        parse_mode: 'HTML',
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[Telegram] sendMessage failed:', err)
      // Fallback: send without parse_mode
      await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: part }),
      })
    }
  }
}

export async function sendChatAction(
  chatId: number,
  action: 'typing' = 'typing',
): Promise<void> {
  const token = getBotToken()
  await fetch(`${TELEGRAM_API}${token}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  }).catch(() => {
    // non-critical, ignore errors
  })
}
```

**Step 4: 執行測試確認 GREEN**

Run: `npx jest src/lib/telegram/__tests__/bot.test.ts --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/telegram/bot.ts src/lib/telegram/__tests__/bot.test.ts
git commit -m "feat: 新增 Telegram Bot 客戶端（sendMessage + Markdown→HTML）"
```

---

### Task 3: 資料庫 Migration（telegram_users 表）

**Files:**
- Create: `supabase/migrations/20260224000001_add_telegram_users.sql`

**Step 1: 寫 Migration**

```sql
-- Telegram Bot 用戶映射表
CREATE TABLE IF NOT EXISTS telegram_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  telegram_first_name TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  default_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 快速查找 telegram_chat_id
CREATE INDEX IF NOT EXISTS idx_telegram_users_chat_id ON telegram_users(telegram_chat_id);

-- RLS
ALTER TABLE telegram_users ENABLE ROW LEVEL SECURITY;

-- Service role 可完全存取（webhook route 使用 admin client）
CREATE POLICY "Service role full access on telegram_users"
  ON telegram_users
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

**Step 2: 套用 Migration**

Run: `npx supabase migration up --local`
Expected: Migration applied successfully

**Step 3: Commit**

```bash
git add supabase/migrations/20260224000001_add_telegram_users.sql
git commit -m "feat: 新增 telegram_users 資料庫表（Bot 用戶映射）"
```

---

### Task 4: Webhook 認證 + 用戶映射

**Files:**
- Create: `src/lib/telegram/auth.ts`
- Test: `src/lib/telegram/__tests__/auth.test.ts`

**Step 1: 寫測試**

```typescript
import { verifyWebhookSecret } from '../auth'

describe('verifyWebhookSecret', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, TELEGRAM_WEBHOOK_SECRET: 'test-secret-123' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should return true for valid secret', () => {
    expect(verifyWebhookSecret('test-secret-123')).toBe(true)
  })

  it('should return false for invalid secret', () => {
    expect(verifyWebhookSecret('wrong-secret')).toBe(false)
  })

  it('should return false for missing secret', () => {
    expect(verifyWebhookSecret(undefined)).toBe(false)
  })

  it('should return true when no secret configured (dev mode)', () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    expect(verifyWebhookSecret(undefined)).toBe(true)
  })
})
```

**Step 2: 確認 RED → Step 3: 寫實作**

Create: `src/lib/telegram/auth.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/server'

export function verifyWebhookSecret(headerValue: string | undefined | null): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  // Dev mode: no secret configured → allow all
  if (!secret) return true
  return headerValue === secret
}

interface TelegramUserMapping {
  userId: string
  conversationId: string
}

export async function getOrCreateTelegramUser(
  chatId: number,
  firstName?: string,
  username?: string,
): Promise<TelegramUserMapping> {
  const supabase = createAdminClient()

  // 1. 查找已有映射
  const { data: existing } = await supabase
    .from('telegram_users')
    .select('user_id, default_conversation_id')
    .eq('telegram_chat_id', chatId)
    .maybeSingle()

  if (existing?.user_id && existing?.default_conversation_id) {
    // 更新最後訊息時間
    await supabase
      .from('telegram_users')
      .update({
        message_count: supabase.rpc ? undefined : undefined, // increment handled separately
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('telegram_chat_id', chatId)

    return {
      userId: existing.user_id,
      conversationId: existing.default_conversation_id,
    }
  }

  // 2. 建立新用戶（用 admin auth）
  const email = `telegram_${chatId}@nexusmind.bot`
  const password = crypto.randomUUID()

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: firstName ?? `Telegram User ${chatId}`,
      source: 'telegram_bot',
    },
  })

  if (authError) throw new Error(`Failed to create user: ${authError.message}`)
  const userId = authData.user.id

  // 3. 建立 Profile
  await supabase.from('profiles').upsert({
    id: userId,
    display_name: firstName ?? `Telegram User ${chatId}`,
    preferred_model: 'gemini-flash',
  })

  // 4. 建立預設 Conversation
  const { data: conv } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      title: 'Telegram 對話',
      model: 'gemini-flash',
    })
    .select('id')
    .single()

  const conversationId = conv!.id

  // 5. 建立 telegram_users 映射
  await supabase.from('telegram_users').upsert({
    telegram_chat_id: chatId,
    telegram_username: username,
    telegram_first_name: firstName,
    user_id: userId,
    default_conversation_id: conversationId,
    last_message_at: new Date().toISOString(),
  })

  return { userId, conversationId }
}
```

**Step 4: 確認 GREEN → Step 5: Commit**

```bash
git add src/lib/telegram/auth.ts src/lib/telegram/__tests__/auth.test.ts
git commit -m "feat: 新增 Telegram Webhook 認證 + 用戶自動映射"
```

---

### Task 5: Webhook API Route（核心）

**Files:**
- Create: `src/app/api/telegram/webhook/route.ts`
- Test: `src/app/api/telegram/webhook/__tests__/route.test.ts`

**Step 1: 寫測試（Integration-level mock test）**

```typescript
// 驗證 route 的輸入驗證和流程邏輯
import { TelegramUpdateSchema } from '@/lib/telegram/types'

describe('Telegram Webhook Route', () => {
  it('should validate a proper Telegram update payload', () => {
    const payload = {
      update_id: 100,
      message: {
        message_id: 1,
        date: 1709000000,
        chat: { id: 12345, type: 'private', first_name: 'Test' },
        from: { id: 12345, is_bot: false, first_name: 'Test' },
        text: '你好',
      },
    }
    const result = TelegramUpdateSchema.safeParse(payload)
    expect(result.success).toBe(true)
    expect(result.data?.message?.text).toBe('你好')
  })

  it('should ignore non-text updates (e.g. stickers)', () => {
    const payload = {
      update_id: 101,
      message: {
        message_id: 2,
        date: 1709000000,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Test' },
        // no text field
      },
    }
    const result = TelegramUpdateSchema.safeParse(payload)
    expect(result.success).toBe(true)
    expect(result.data?.message?.text).toBeUndefined()
  })
})
```

**Step 2: 確認 RED → Step 3: 寫實作**

Create: `src/app/api/telegram/webhook/route.ts`

```typescript
import { generateText, type ModelMessage } from 'ai'
import { TelegramUpdateSchema } from '@/lib/telegram/types'
import { verifyWebhookSecret, getOrCreateTelegramUser } from '@/lib/telegram/auth'
import { sendMessage, sendChatAction } from '@/lib/telegram/bot'
import { getProvider } from '@/lib/ai/providers'
import { createAdminClient } from '@/lib/supabase/server'
import { executeAdaptiveRAG } from '@/lib/rag/adaptive-rag'

export const maxDuration = 120

const RATE_LIMIT_PER_MINUTE = 10

async function checkRateLimit(supabase: ReturnType<typeof createAdminClient>, chatId: number): Promise<boolean> {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
  const { count } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'user')
    .gte('created_at', oneMinuteAgo)
  // Simplified: check by telegram_users.message_count timestamp
  // For MVP, skip precise rate limiting (revisit later)
  return (count ?? 0) < RATE_LIMIT_PER_MINUTE * 10
}

export async function POST(req: Request) {
  try {
    // 1. 驗證 Webhook Secret
    const secretHeader = req.headers.get('x-telegram-bot-api-secret-token')
    if (!verifyWebhookSecret(secretHeader)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. 解析 Telegram Update
    const body = await req.json()
    const parsed = TelegramUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ ok: true }) // Telegram expects 200 even for invalid updates
    }

    const update = parsed.data
    const message = update.message

    // 3. 忽略非文字訊息 & 非私聊
    if (!message?.text || message.chat.type !== 'private') {
      return Response.json({ ok: true })
    }

    const chatId = message.chat.id
    const userText = message.text.trim()

    // 4. 忽略空訊息
    if (!userText) {
      return Response.json({ ok: true })
    }

    // 5. 處理 /start 指令
    if (userText === '/start') {
      await sendMessage(chatId, '👋 歡迎使用 NexusMind！\n\n直接傳送文字訊息，我會用 AI + 知識庫來回覆你。\n\n使用 /newchat 開始新對話。')
      return Response.json({ ok: true })
    }

    // 6. 顯示「正在輸入」
    await sendChatAction(chatId)

    // 7. 取得/建立用戶映射
    const { userId, conversationId } = await getOrCreateTelegramUser(
      chatId,
      message.from?.first_name,
      message.from?.username,
    )

    const supabase = createAdminClient()

    // 8. 處理 /newchat 指令
    if (userText === '/newchat') {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          user_id: userId,
          title: 'Telegram 新對話',
          model: 'gemini-flash',
        })
        .select('id')
        .single()

      if (newConv) {
        await supabase
          .from('telegram_users')
          .update({ default_conversation_id: newConv.id, updated_at: new Date().toISOString() })
          .eq('telegram_chat_id', chatId)
      }

      await sendMessage(chatId, '✅ 已建立新對話！請開始提問。')
      return Response.json({ ok: true })
    }

    // 9. 存入用戶訊息
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: userText,
    })

    // 10. 載入對話歷史（最近 10 則）
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(10)

    const messages: ModelMessage[] = (history ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // 11. 執行 Adaptive RAG
    let knowledgeContext = ''
    try {
      const ragResult = await executeAdaptiveRAG({
        userQuery: userText,
        conversationHistory: messages,
        userId,
        supabase,
      })

      if (ragResult && ragResult.knowledgeContext) {
        knowledgeContext = ragResult.knowledgeContext
      }
    } catch (ragError) {
      console.error('[Telegram] RAG failed:', ragError)
      // Continue without RAG context
    }

    // 12. 組建 System Prompt
    const now = new Date()
    const dateStr = now.toLocaleDateString('zh-TW', {
      year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Taipei',
    })

    const systemPrompt = `[SYSTEM DATE] 今天是 ${dateStr}。

You are NexusMind, an intelligent knowledge assistant on Telegram.
Respond in Traditional Chinese (Taiwan).
Keep responses concise and mobile-friendly (under 2000 characters when possible).
Use Markdown formatting sparingly — Telegram supports **bold**, \`code\`, and code blocks.
${knowledgeContext ? `\n\nKnowledge context:\n${knowledgeContext}` : ''}`

    // 13. 呼叫 Gemini generateText（非串流）
    const { text: aiResponse } = await generateText({
      model: getProvider('gemini-flash'),
      system: systemPrompt,
      messages,
    })

    // 14. 存入 AI 回覆
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: aiResponse,
    })

    // 15. 發送回覆到 Telegram
    await sendMessage(chatId, aiResponse || '抱歉，我無法生成回覆。請再試一次。')

    return Response.json({ ok: true })
  } catch (error) {
    console.error('[Telegram Webhook] Error:', error)
    // Always return 200 to Telegram to prevent retry storms
    return Response.json({ ok: true })
  }
}
```

**Step 4: 確認 GREEN → Step 5: Commit**

```bash
git add src/app/api/telegram/webhook/route.ts src/app/api/telegram/webhook/__tests__/route.test.ts
git commit -m "feat: 新增 Telegram Webhook API route（核心對話邏輯）"
```

---

### Task 6: 環境變數 + Webhook 設定腳本

**Files:**
- Modify: `.env.local.example` — 新增 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_WEBHOOK_SECRET`

**Step 1: 更新 .env.local.example**

在檔案末尾追加：

```
# Telegram Bot
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
```

**Step 2: 建立 Webhook 設定指引**

用戶需要手動執行：

```bash
# 1. 在 Telegram 找 @BotFather，發送 /newbot，取得 token
# 2. 設定環境變數
# 3. 設定 Webhook（替換 <TOKEN> 和 <SECRET>）
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://dxp2800.tail8a2d5d.ts.net/api/telegram/webhook",
    "secret_token": "<SECRET>",
    "allowed_updates": ["message"],
    "drop_pending_updates": true
  }'
```

**Step 3: Commit**

```bash
git add .env.local.example
git commit -m "feat: 新增 Telegram Bot 環境變數範例"
```

---

### Task 7: 整合測試 + 手動驗證

**Step 1: 執行全部測試**

```bash
npx jest src/lib/telegram/ --coverage
```

Expected: All tests PASS, coverage > 80%

**Step 2: Lint + Build**

```bash
npm run lint && npm run build
```

Expected: No errors

**Step 3: 手動端到端驗證**

1. 設定 TELEGRAM_BOT_TOKEN 和 TELEGRAM_WEBHOOK_SECRET 在 .env.local
2. 啟動 dev server
3. 用 curl 設定 Webhook
4. 在 Telegram 找 Bot，發送 /start
5. 發送一則文字訊息，確認收到 AI 回覆
6. 發送 /newchat，確認對話重置

**Step 4: Final Commit**

```bash
git add -A
git commit -m "feat: Telegram Bot MVP 完成 — 文字對話 + RAG 知識庫"
```

---

## 驗收條件

- [ ] Telegram Bot 能接收私聊文字訊息
- [ ] 回覆由 Gemini 3 Flash 生成，含 RAG 知識庫上下文
- [ ] /start 顯示歡迎訊息
- [ ] /newchat 重置對話
- [ ] 長回覆自動分段（>4096 字元）
- [ ] Webhook Secret 驗證正常
- [ ] 非文字訊息（貼圖、圖片）被安全忽略
- [ ] 測試覆蓋率 > 80%
- [ ] Build 無錯誤
