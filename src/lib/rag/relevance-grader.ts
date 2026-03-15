import { generateObject } from 'ai'
import { z } from 'zod'
import { getProvider } from '@/lib/ai/providers'

const RELEVANCE_HIGH_THRESHOLD = 0.7
const RELEVANCE_LOW_THRESHOLD = 0.4

const GradingSchema = z.object({
  score: z.number().min(0).max(1).describe('檢索結果與查詢的相關性分數（0-1）'),
  reason: z.string().describe('評分理由的簡短說明'),
})

export type RelevanceVerdict = 'sufficient' | 'retry' | 'fallback_web'

export interface GradingResult {
  score: number
  verdict: RelevanceVerdict
  reason: string
}

/**
 * 用 LLM 評估 RAG 檢索結果是否足以回答查詢
 *
 * 決策邏輯：
 * - score ≥ 0.7 → sufficient（直接使用本地知識）
 * - score 0.4-0.7 → retry（重寫查詢再試一次）
 * - score < 0.4 → fallback_web（降級到 Google Search）
 */
export async function gradeRetrievalRelevance(
  query: string,
  retrievedChunks: string[],
  documentTitles: string[]
): Promise<GradingResult> {
  // 若完全無檢索結果，直接判定為 fallback
  if (retrievedChunks.length === 0) {
    return {
      score: 0,
      verdict: 'fallback_web',
      reason: '知識庫中無任何匹配結果',
    }
  }

  // 擷取前 3 個 chunk 的摘要（避免 token 過多）
  const chunkSamples = retrievedChunks
    .slice(0, 3)
    .map((c, i) => `[片段 ${i + 1}] ${c.slice(0, 500)}`)
    .join('\n\n')

  const { object } = await generateObject({
    model: getProvider('gemini-flash'),
    schema: GradingSchema,
    prompt: `你是一個檢索品質評估專家。判斷以下檢索結果是否足以回答使用者的問題。

使用者查詢: "${query}"

匹配的文件標題: ${documentTitles.join('、')}

檢索到的內容片段:
${chunkSamples}

評分標準（0-1）:
- 0.8-1.0：檢索結果直接且完整地回答了查詢
- 0.5-0.8：檢索結果部分相關，但可能需要補充
- 0.2-0.5：檢索結果只有微弱相關性
- 0.0-0.2：檢索結果與查詢幾乎無關

請嚴格評分，不要高估相關性。`,
  })

  const verdict: RelevanceVerdict =
    object.score >= RELEVANCE_HIGH_THRESHOLD
      ? 'sufficient'
      : object.score >= RELEVANCE_LOW_THRESHOLD
        ? 'retry'
        : 'fallback_web'

  return {
    score: object.score,
    verdict,
    reason: object.reason,
  }
}
