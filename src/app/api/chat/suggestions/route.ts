import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProvider } from '@/lib/ai/providers'

const SuggestionsSchema = z.object({
  suggestions: z.array(z.string()).min(1).max(3)
    .describe('Exactly 3 follow-up questions in Traditional Chinese, each under 20 characters'),
})

/** Suggestions 生成超時（避免拖慢 UX） */
const SUGGESTIONS_TIMEOUT_MS = 8000

/**
 * 從 message content 提取純文字（截取前 400 字元）。
 * 前端已將 parts 合併為純文字 string 傳入。
 */
function extractTextFromContent(content: unknown): string {
  if (typeof content !== 'string') return ''
  return content.slice(0, 400)
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const messages: Array<{ role: string; content: unknown }> = body.messages || []

    // 取最後一對 user+assistant 訊息作為 context
    // 確保至少有一個 user message 提供主題方向
    const lastUserIdx = messages.findLastIndex((m) => m.role === 'user')
    if (lastUserIdx === -1) {
      return Response.json({ suggestions: [] })
    }

    const contextMessages: Array<{ role: string; text: string }> = []

    // 包含最後一個 user message 之前的 assistant（如果有）作為背景
    if (lastUserIdx > 0) {
      const prevMsg = messages[lastUserIdx - 1]
      const prevText = extractTextFromContent(prevMsg.content)
      if (prevText.trim()) {
        contextMessages.push({ role: prevMsg.role, text: prevText })
      }
    }

    // 最後一個 user message（核心）
    const userText = extractTextFromContent(messages[lastUserIdx].content)
    if (!userText.trim()) {
      return Response.json({ suggestions: [] })
    }
    contextMessages.push({ role: 'user', text: userText })

    const contextStr = contextMessages
      .map((m) => `${m.role === 'user' ? 'Q' : 'A'}: ${m.text}`)
      .join('\n')

    // 使用 generateObject 確保結構化輸出，消除 JSON parse 失敗
    const result = await Promise.race([
      generateObject({
        model: getProvider('gemini-flash'),
        schema: SuggestionsSchema,
        prompt: `對話：\n${contextStr}\n\n產生 3 個繁體中文後續追問，每個 15 字以內。問題應聚焦當前話題的延伸探討。`,
        temperature: 0.7,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SUGGESTIONS_TIMEOUT_MS)),
    ])

    if (!result) {
      console.warn('[Suggestions API] Timeout, returning empty')
      return Response.json({ suggestions: [] })
    }

    const suggestions = result.object.suggestions
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0 && s.length <= 30)
      .slice(0, 3)

    return Response.json({ suggestions })
  } catch (error) {
    console.error('[Suggestions API] Error:', error)
    return Response.json({ suggestions: [] })
  }
}
