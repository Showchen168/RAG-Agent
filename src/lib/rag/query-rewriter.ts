import { generateObject } from 'ai'
import { z } from 'zod'
import { getProvider } from '@/lib/ai/providers'
import type { ModelMessage } from 'ai'

const QueryRewriteSchema = z.object({
  rewrittenQuery: z.string().describe('優化後的主查詢，更精確、更適合語意搜尋'),
  alternatives: z.array(z.string()).max(2).describe('最多 2 個替代查詢版本'),
  reason: z.string().describe('重寫原因的簡短說明'),
})

export type QueryRewriteResult = z.infer<typeof QueryRewriteSchema>

/**
 * 用 LLM 重寫使用者查詢，提升 RAG 檢索精準度
 *
 * 策略：
 * - 擴展縮寫與模糊用語
 * - 從對話歷史提取脈絡
 * - 生成 1 主查詢 + 最多 2 個變體
 */
export async function rewriteQuery(
  query: string,
  conversationHistory?: ModelMessage[]
): Promise<QueryRewriteResult> {
  const contextHint = conversationHistory?.length
    ? `\n\n對話脈絡（最近 3 輪）:\n${conversationHistory
      .slice(-6)
      .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : '[non-text]'}`)
      .join('\n')}`
    : ''

  const { object } = await generateObject({
    model: getProvider('gemini-flash'),
    schema: QueryRewriteSchema,
    prompt: `你是一個專業的查詢優化器。將使用者的查詢重寫為更適合語意搜尋的版本。

規則：
1. 擴展縮寫（如 "GPU" → "GPU（圖形處理器）"）
2. 補充隱含的關鍵字（如 "規範" → "防護規範標準"）
3. 修正模糊用語為具體術語
4. 如果對話歷史提供了脈絡，利用它來消除歧義
5. 不要改變查詢的核心意圖
6. default to Traditional Chinese, BUT PRESERVE specific English proper nouns, brand names, or project codes (e.g. "Crayon", "NexusMind", "API") if they are likely keywords in the knowledge base. Do not translate them to generic terms (e.g. keep "Crayon", do not change to "蠟筆").
7. rewrittenQuery 和 alternatives 應為繁體中文（除非關鍵詞需保留英文）

原始查詢: "${query}"${contextHint}`,
  })

  return object
}
