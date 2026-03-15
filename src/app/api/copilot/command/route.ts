import { createClient } from '@/lib/supabase/server'
import { streamText } from 'ai'
import { getProvider } from '@/lib/ai/providers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface CommandRequest {
  command: string
  text: string
  /** 完整文件內容（當操作來自選取文字時，提供全文作為上下文） */
  fullDocument?: string
}

const COMMAND_PROMPTS: Record<string, string> = {
  expand: `你是一位專業寫作助手。請深度擴展以下內容，使其更完整、更有說服力。

擴展要求：
- 增加具體的例子、數據、研究結果或案例來支撐論點
- 補充「為什麼」的分析，解釋背後的原因和機制
- 加入對比或比較，幫助讀者更好理解
- 保持原意和語氣，但讓內容更豐富、更有深度
- 擴展為原文 2-3 倍的長度
- **嚴格保留原文的語言格式**：若原文是中英雙語對照，擴展後也必須維持中英雙語對照；若原文只有中文，則只輸出中文
- 保留原文的 Markdown 格式（標題層級、列表、粗體等）
- 只輸出擴展後的版本，不加額外說明

原始內容：
{text}

擴展版本：`,

  shorten: `你是一位專業編輯。請精簡以下內容，提煉核心觀點。

精簡要求：
- 保留最關鍵的觀點和數據
- 移除重複、冗餘和修飾性內容
- 確保精簡後的內容仍然完整、有邏輯
- 壓縮為原文 1/3 到 1/2 的長度
- **嚴格保留原文的語言格式**：若原文是中英雙語對照，精簡後也必須維持中英雙語對照；若原文只有中文，則只輸出中文
- 保留原文的 Markdown 格式（標題層級、列表、粗體等）
- 只輸出精簡後的版本

原始內容：
{text}

精簡版本：`,

  tone_professional: `你是一位商業寫作專家。請將以下內容改寫為專業正式的語氣。

改寫要求：
- 使用正式、精確的用語，避免口語化表達
- 加入適當的專業術語和量化描述
- 結構化呈現，使用條理清晰的邏輯
- 保持原意，但提升文字的專業感和說服力
- **嚴格保留原文的語言格式**：若原文是中英雙語對照，改寫後也必須維持中英雙語對照（中文和英文都改寫為專業語氣）；若原文只有中文，則只輸出中文
- 保留原文的 Markdown 格式（標題層級、列表、粗體等）
- 只輸出改寫後的版本

原始內容：
{text}

專業版本：`,

  tone_casual: `你是一位內容創作者。請將以下內容改寫為輕鬆友善、易於理解的語氣。

改寫要求：
- 使用簡潔、親切的日常用語
- 適當加入比喻、類比讓內容更生動
- 保持原意，但讓讀者覺得輕鬆易讀
- 可以用「你」來拉近與讀者的距離
- **嚴格保留原文的語言格式**：若原文是中英雙語對照，改寫後也必須維持中英雙語對照（中文和英文都改寫為輕鬆語氣）；若原文只有中文，則只輸出中文
- 保留原文的 Markdown 格式（標題層級、列表、粗體等）
- 只輸出改寫後的版本

原始內容：
{text}

輕鬆版本：`,

  translate_en: `You are a professional translator. Translate the following content into fluent, natural English.

Requirements:
- Maintain the original structure, headings, and formatting (Markdown)
- Use appropriate English terminology for the domain
- Keep proper nouns and technical terms accurate
- Output only the translated version, no additional explanation

Original content:
{text}

English version:`,

  bilingual: `你是一位專業翻譯專家。請將以下內容製作成中英雙語對照版本。

格式要求：
- 每個段落先顯示中文版本，緊接著顯示對應的英文版本
- 中文段落與英文段落之間不需要分隔線，直接換行即可
- 標題也需要中英對照（中文標題後接英文標題）
- 保持原始的 Markdown 格式（標題層級、列表、粗體等）
- 英文翻譯要自然流暢，使用該領域的專業術語
- 只輸出雙語版本，不加額外說明

原始內容：
{text}

中英雙語版本：`,

  canvas_ask: `你是一位智慧寫作助手。使用者正在 Canvas 編輯器中編輯文件，並向你提出了問題。
請根據提供的文件內容回答問題，提供清楚、實用的回覆。

回覆要求：
- 直接回答問題，不要重複原文
- 使用繁體中文回覆
- 如果問題涉及改寫或修改，必須基於文件的**完整當前內容**進行修改，直接提供修改後的完整版本
- **嚴格保留原文的語言格式**：若原文是中英雙語對照，修改後也必須維持中英雙語對照；若原文只有中文，則只輸出中文
- 保留原文的 Markdown 格式（標題層級、列表、粗體等）
- 回覆內容可以使用 Markdown 格式

{text}`,

  visualize: `你是一位數據視覺化專家。根據以下內容，提取或推斷數據並生成圖表的 JSON 格式。

嚴格要求：
- 只輸出一個有效的 JSON 物件，不加任何其他文字或 code block 標記
- JSON 格式：{"chartType": "bar"|"line"|"pie", "title": "圖表標題", "data": [{"label": "類別", "value": 數值}], "xAxisLabel": "X軸", "yAxisLabel": "Y軸"}
- chartType 只能是 bar、line、pie 其中之一
- data 陣列至少要有 2 個項目，每個項目必須有 label (字串) 和 value (數字)
- 如果原文有明確數據，直接使用；如果沒有，根據上下文合理推斷數值
- title 用繁體中文

分析內容：
{text}`,

  summarize_to_draft: `你是一位專業的商業報告撰寫專家。以下是一段使用者與 AI 的對話紀錄。
請將對話中討論的核心內容整理成一份結構嚴謹的正式報告。

報告格式要求：
- 使用正式報告體例：以「## 報告標題」開頭，下方包含日期「**日期：{date}**」
- 使用 Markdown 格式撰寫，包括標題層級（##、###、####）
- 報告結構：摘要 → 主要內容分節 → 結論/建議
- 每個章節使用 ### 或 #### 作為子標題

內容要求：
- 提取對話中所有重要的觀點、結論、數據和建議
- 移除寒暄、確認、重複的內容，只保留有價值的資訊
- 語氣正式、精確，使用專業用語
- 用流暢的繁體中文書寫

表格使用（重要）：
- 當內容涉及比較、數據、清單、分類、時程時，必須使用 Markdown 表格呈現
- 表格格式範例：
| 項目 | 說明 | 備註 |
| :--- | :--- | :--- |
| 內容A | 描述A | 備註A |
- 優先以表格整理結構化資訊，讓報告更專業易讀

排版要求：
- 重要結論或關鍵數據使用 **粗體** 標示
- 列表項目使用有序或無序列表
- 只輸出報告內容，不加額外說明或前言

對話紀錄：
{text}

正式報告：`,
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
    const body: CommandRequest = await request.json()
    const { command, text, fullDocument } = body

    // 3. 驗證請求參數
    if (!command || !text) {
      return new Response('Invalid request body', { status: 400 })
    }

    // 4. 取得對應的 prompt 模板
    const promptTemplate = COMMAND_PROMPTS[command]
    if (!promptTemplate) {
      return new Response('Invalid command', { status: 400 })
    }

    // 5. 建立最終 prompt（注入當前日期供報告使用）
    const now = new Date()
    const dateStr = now.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Taipei',
    })

    // 如果提供了完整文件上下文，在 prompt 前面加入全文讓 AI 理解脈絡
    const contextPrefix = fullDocument?.trim()
      ? `[完整文件上下文]\n以下是使用者正在編輯的完整文件。請仔細閱讀全文以理解上下文、語言格式（如中英雙語對照）和整體結構，然後只針對使用者選取的部分進行操作。\n\n${fullDocument}\n\n[選取的部分]\n以下是使用者選取要操作的文字片段：\n\n`
      : ''

    const prompt = contextPrefix + promptTemplate
      .replace('{text}', text)
      .replace('{date}', dateStr)

    // 6. 使用 Gemini Flash 生成回應
    const model = await getProvider('gemini-flash')

    const result = streamText({
      model,
      prompt,
      temperature: 0.7,
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          userId: user.id,
          command,
        },
      },
    })

    // 7. 返回串流響應
    return result.toTextStreamResponse()
  } catch (error) {
    console.error('Command execution error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
