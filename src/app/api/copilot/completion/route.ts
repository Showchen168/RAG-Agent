import { createClient } from '@/lib/supabase/server'
import { streamText, embed } from 'ai'
import { getProvider, getEmbeddingModel, EMBEDDING_PROVIDER_OPTIONS } from '@/lib/ai/providers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface CompletionRequest {
  current_text: string
  cursor_position: number
  project_id?: string
}

export async function POST(request: Request) {
  try {
    // 1. 驗證使用者身份
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    // 2. 解析請求內容
    const body: CompletionRequest = await request.json()
    const { current_text, cursor_position } = body
    // project_id 將在 Phase 2, Task 3 用於限制 RAG 搜尋範圍

    // 3. 驗證請求參數
    if (
      typeof current_text !== 'string' ||
      typeof cursor_position !== 'number' ||
      cursor_position < 0 ||
      cursor_position > current_text.length
    ) {
      return new Response('Invalid request body', { status: 400 })
    }

    // 4. 提取游標前的內容作為上下文
    const contextBefore = current_text.substring(0, cursor_position)

    // 5. RAG 搜尋相關文件（如果提供 project_id）
    let ragContext = ''

    if (body.project_id) {
      try {
        // 使用最後 200 字元作為搜尋查詢
        const searchQuery = contextBefore.slice(-200)

        // 將查詢轉為向量
        const embedResult = await embed({
          model: getEmbeddingModel(),
          value: searchQuery,
          providerOptions: EMBEDDING_PROVIDER_OPTIONS,
        })

        const { embedding } = embedResult

        // 呼叫 Supabase RPC 進行語意搜尋
        const { data: searchResults, error: searchError } = await supabase.rpc(
          'match_documents',
          {
            query_embedding: JSON.stringify(embedding),
            match_threshold: 0.7,
            match_count: 3,
            p_user_id: user.id,
          }
        )

        if (!searchError && searchResults && searchResults.length > 0) {
          ragContext =
            '\n\n參考資料：\n' +
            searchResults
              .map(
                (doc: { title: string; summary?: string; content?: string }) =>
                  `- ${doc.title}: ${doc.summary || doc.content?.substring(0, 200) || ''}`
              )
              .join('\n')
        }
      } catch (error) {
        console.error('RAG search error:', error)
        // 搜尋失敗不影響續寫功能，繼續執行
      }
    }

    // 6. 建立續寫提示詞
    // 取游標前最後 1000 字作為上下文，提供充足語境
    const recentContext = contextBefore.length > 1000
      ? '...' + contextBefore.slice(-1000)
      : contextBefore

    const prompt = `你是一位專業的寫作續寫助手，具備深厚的專業知識。根據游標前的內容，直接輸出高品質的續寫文字。

核心要求：
- 只輸出續寫的文字，不加任何前綴、引號、標記或說明
- 續寫必須自然銜接上文的語氣、主題和深度層次
- 使用與原文一致的語言（繁體中文/英文）
- 不要重複已有的文字

品質標準（關鍵）：
- 提供具體、有深度的內容，避免空泛或籠統的描述
- 如果上文提到特定概念或主題，續寫要包含具體的細節、數據、例子或分析
- 如果上文是專業內容，續寫要展現專業知識，使用恰當的術語和見解
- 如果上文在描述某個物品/想法，續寫要加入具體的特性、功能、優缺點或使用場景
- 續寫長度：2-4 句話（50-150 字），視上下文需要調整
- 優先提供「為什麼」和「如何」的分析，而非僅描述「是什麼」${ragContext}

游標前的內容：
${recentContext}`

    // 7. 使用 Gemini Flash 2.0 生成續寫
    const model = await getProvider('gemini-flash')

    const result = streamText({
      model,
      prompt,
      temperature: 0.4,
      maxOutputTokens: 300,
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          userId: user.id,
          feature: 'copilot-completion',
        },
      },
    })

    // 8. 返回串流響應
    return result.toTextStreamResponse()
  } catch (error) {
    console.error('Copilot completion error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
