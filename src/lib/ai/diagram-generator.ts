import { generateText } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

export type DiagramType = 'flowchart' | 'sequence' | 'mindmap' | 'er' | 'class' | 'state' | 'architecture' | 'general'

interface GenerateDiagramOptions {
  prompt: string
  existingXml?: string
  diagramType?: DiagramType
}

interface GenerateDiagramResult {
  xml: string
}

const DIAGRAM_SYSTEM_PROMPT = `你是一位專業的圖表設計師，專門生成 draw.io 格式的 mxGraphModel XML。

## 輸出規則（嚴格遵守）
1. 只輸出 <mxGraphModel>...</mxGraphModel> XML，不要任何其他文字
2. 確保 XML 格式正確，所有標籤正確閉合
3. 每個圖表必須有 id="0" 的根 mxCell 和 id="1" parent="0" 的第一層容器
4. 使用繁體中文作為節點文字
5. 節點間距至少 60px，避免重疊
6. 使用適當的 style 屬性（rounded、edgeStyle 等）
7. 箭頭使用 edge="1"，節點使用 vertex="1"

## 圖表類型樣式指引
- flowchart：使用圓角矩形、菱形判斷、箭頭連線
- sequence：使用生命線、訊息箭頭
- mindmap：放射狀展開，中心節點加粗
- er：使用表格樣式節點，1:N 標註
- class：UML 類別圖格式
- state：圓角狀態節點，起始/結束點
- architecture：方塊元件 + 箭頭資料流`

export async function generateDiagram({
  prompt,
  existingXml,
  diagramType = 'general',
}: GenerateDiagramOptions): Promise<GenerateDiagramResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY 未設定')
  }

  const googleProvider = createGoogleGenerativeAI({ apiKey })

  const contextPart = existingXml
    ? `\n\n目前的圖表 XML：\n${existingXml}\n\n請基於此圖表進行修改。`
    : ''

  const { text } = await generateText({
    model: googleProvider('gemini-3-flash-preview'),
    system: DIAGRAM_SYSTEM_PROMPT,
    prompt: `圖表類型：${diagramType}\n\n需求：${prompt}${contextPart}`,
  })

  const xml = extractXmlFromResponse(text)

  if (!validateDiagramXml(xml)) {
    throw new Error('AI 生成的圖表 XML 格式無效')
  }

  return { xml }
}

function extractXmlFromResponse(text: string): string {
  // 嘗試從 markdown code block 中提取
  const codeBlockMatch = text.match(/```(?:xml)?\s*\n?([\s\S]*?)```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // 嘗試直接提取 mxGraphModel
  const xmlMatch = text.match(/<mxGraphModel[\s\S]*?<\/mxGraphModel>/)
  if (xmlMatch) {
    return xmlMatch[0].trim()
  }

  return text.trim()
}

export function validateDiagramXml(xml: string): boolean {
  if (!xml || xml.trim().length === 0) return false
  if (!xml.includes('<mxGraphModel')) return false
  if (!xml.includes('</mxGraphModel>')) return false
  return true
}
