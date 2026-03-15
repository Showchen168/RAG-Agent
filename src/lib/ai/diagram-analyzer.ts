import { generateText } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

interface DiagramStructure {
  nodeCount: number
  edgeCount: number
  nodeLabels: string[]
}

interface DiagramAnalysis {
  description: string
  suggestions: string[]
  diagramType: string
  structure: DiagramStructure
}

export function parseDiagramStructure(xml: string): DiagramStructure {
  const nodeMatches = xml.match(/vertex="1"/g)
  const edgeMatches = xml.match(/edge="1"/g)
  const labelMatches = [...xml.matchAll(/value="([^"]+)".*?vertex="1"/g)]

  return {
    nodeCount: nodeMatches?.length ?? 0,
    edgeCount: edgeMatches?.length ?? 0,
    nodeLabels: labelMatches.map(m => m[1]),
  }
}

export async function analyzeDiagram(xml: string): Promise<DiagramAnalysis> {
  if (!xml || !xml.includes('<mxGraphModel')) {
    throw new Error('無效的圖表 XML')
  }

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY 未設定')
  }

  const structure = parseDiagramStructure(xml)
  const googleProvider = createGoogleGenerativeAI({ apiKey })

  const { text } = await generateText({
    model: googleProvider('gemini-3-flash-preview'),
    system: `你是一位圖表分析專家。分析 draw.io XML 圖表並以 JSON 格式回覆。

回覆格式（只回覆 JSON，不要其他文字）：
{
  "description": "圖表的中文描述（100-200字）",
  "suggestions": ["改進建議1", "改進建議2", "改進建議3"],
  "diagramType": "flowchart|sequence|mindmap|er|class|state|architecture|other"
}`,
    prompt: `分析以下 draw.io 圖表：

節點數量：${structure.nodeCount}
邊數量：${structure.edgeCount}
節點標籤：${structure.nodeLabels.join(', ') || '（無）'}

XML：
${xml}`,
  })

  try {
    const cleanText = text.replace(/```(?:json)?\s*\n?/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleanText) as {
      description: string
      suggestions: string[]
      diagramType: string
    }

    return {
      description: parsed.description ?? '無法解析圖表描述',
      suggestions: parsed.suggestions ?? [],
      diagramType: parsed.diagramType ?? 'other',
      structure,
    }
  } catch {
    return {
      description: text.slice(0, 500),
      suggestions: [],
      diagramType: 'other',
      structure,
    }
  }
}
