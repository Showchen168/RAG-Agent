import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, BorderStyle, WidthType, ImageRun, LevelFormat, AlignmentType, convertInchesToTwip } from 'docx'
import PptxGenJS from 'pptxgenjs'
// import { chromium } from 'playwright' // Change to dynamic import


interface TemplatePart {
  type: 'text' | 'template'
  text?: string
  name?: string
  templateProps?: Record<string, unknown>
}

// Block 類型定義
export type ExportBlock =
  | { type: 'text'; content: string }
  | { type: 'heading'; level: 1 | 2 | 3; content: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; title?: string; headers: string[]; rows: string[][] }
  | { type: 'chart'; title?: string; chartType?: 'bar' | 'line' | 'pie'; data: { label: string; value: number }[] }
  | { type: 'image'; title?: string; url: string; alt?: string }

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 將 TemplatePart 解析為 ExportBlock 陣列
 */
export function parseTemplatePartToBlocks(part: TemplatePart): ExportBlock[] {
  const blocks: ExportBlock[] = []
  const props = part.templateProps ?? {}
  const title = typeof props.title === 'string' ? props.title : ''

  if (part.type === 'text') {
    const lines = (part.text ?? '').split('\n')
    let currentText = ''
    let currentList: { ordered: boolean; items: string[] } | null = null
    let currentTable: { headers: string[]; rows: string[][] } | null = null

    const flushText = () => {
      if (currentText.trim()) {
        blocks.push({ type: 'text', content: currentText.trim() })
        currentText = ''
      }
    }
    const flushList = () => {
      if (currentList && currentList.items.length > 0) {
        blocks.push({ type: 'list', ordered: currentList.ordered, items: currentList.items })
        currentList = null
      }
    }
    const flushTable = () => {
      if (currentTable && currentTable.headers.length > 0) {
        blocks.push({ type: 'table', headers: currentTable.headers, rows: currentTable.rows })
        currentTable = null
      }
    }

    for (const line of lines) {
      const trimmed = line.trim()

      // Markdown 表格行（| cell1 | cell2 |）— 優先偵測，避免被其他規則破壞
      if (/^\|.+\|$/.test(trimmed)) {
        flushText()
        flushList()
        // 分隔行（| --- | --- |）直接跳過
        if (!/^\|[\s|:-]+\|$/.test(trimmed)) {
          const cells = trimmed.slice(1, -1).split('|').map((c: string) => c.trim())
          if (currentTable === null) {
            currentTable = { headers: cells, rows: [] }
          } else {
            currentTable.rows.push(cells)
          }
        }
        continue
      }

      // 非表格行時，先清空累積中的表格
      flushTable()

      // 標題（h1-h6，h4+ 對映到 h3 以避免 docx 樣式缺失）
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
      if (headingMatch) {
        flushText()
        flushList()
        const level = Math.min(headingMatch[1].length, 3) as 1 | 2 | 3
        blocks.push({ type: 'heading', level, content: headingMatch[2] })
        continue
      }

      // 無序列表（- 或 * 開頭）
      const ulMatch = trimmed.match(/^[-*]\s+(.+)$/)
      if (ulMatch) {
        flushText()
        if (!currentList || currentList.ordered) {
          flushList()
          currentList = { ordered: false, items: [] }
        }
        currentList.items.push(ulMatch[1])
        continue
      }

      // 有序列表（1. 2. 等開頭）
      const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/)
      if (olMatch) {
        flushText()
        if (!currentList || !currentList.ordered) {
          flushList()
          currentList = { ordered: true, items: [] }
        }
        currentList.items.push(olMatch[1])
        continue
      }

      // 水平線
      if (/^---+$/.test(trimmed)) {
        flushText()
        flushList()
        continue
      }

      // 引用區塊（> text）— 去除前綴，以普通文字輸出
      const quoteMatch = trimmed.match(/^>\s*(.*)$/)
      if (quoteMatch) {
        flushList()
        currentText += quoteMatch[1] + '\n'
        continue
      }

      // 其餘當普通文字
      flushList()
      currentText += line + '\n'
    }
    flushText()
    flushList()
    flushTable()
    return blocks
  }

  if (part.name === 'data_table') {
    const headers = Array.isArray(props.headers) ? (props.headers as string[]) : []
    const rows = Array.isArray(props.rows) ? (props.rows as string[][]) : []
    blocks.push({ type: 'table', title, headers, rows })
  }
  else if (part.name === 'timeline') {
    if (title) blocks.push({ type: 'heading', level: 2, content: title })
    const events = Array.isArray(props.events)
      ? (props.events as Array<{ name?: string; start?: string; end?: string }>)
      : []
    // 轉為表格呈現
    blocks.push({
      type: 'table',
      headers: ['事件', '時間'],
      rows: events.map(e => [e.name || '', `${e.start || ''}${e.end ? ' - ' + e.end : ''}`])
    })
  }
  else if (part.name === 'chart') {
    const data = Array.isArray(props.data)
      ? (props.data as Array<{ label?: string; value?: number }>)
      : []
    const chartType = (props.chartType === 'pie' || props.chartType === 'line') ? props.chartType : 'bar'
    blocks.push({
      type: 'chart',
      title,
      chartType,
      data: data.map(d => ({ label: d.label || '', value: d.value || 0 }))
    })
  }
  else if (part.name === 'steps') {
    if (title) blocks.push({ type: 'heading', level: 2, content: title })
    const steps = Array.isArray(props.steps)
      ? (props.steps as Array<{ title?: string; description?: string }>)
      : []
    steps.forEach((step, idx) => {
      blocks.push({ type: 'heading', level: 3, content: `${idx + 1}. ${step.title || ''}` })
      if (step.description) blocks.push({ type: 'text', content: step.description })
    })
  }
  else if (part.name === 'compare') {
    if (title) blocks.push({ type: 'heading', level: 2, content: title })
    const items = Array.isArray(props.items)
      ? (props.items as Array<{ name?: string; pros?: string[]; cons?: string[] }>)
      : []
    // 轉為表格
    blocks.push({
      type: 'table',
      headers: ['方案', '優點', '缺點'],
      rows: items.map(item => [
        item.name || '',
        (item.pros || []).join('\n'),
        (item.cons || []).join('\n')
      ])
    })
  }
  else {
    // Fallback
    if (title) blocks.push({ type: 'heading', level: 2, content: `[${part.name}] ${title}` })
  }

  return blocks
}

export function extractAssistantContent(content: string): ExportBlock[] {
  // 策略 1：整體是純 JSON {"response": [...]}
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed?.response)) {
      const parts = parsed.response as TemplatePart[]
      return parts.flatMap(parseTemplatePartToBlocks)
    }
  } catch {
    // 非純 JSON，繼續嘗試混合格式
  }

  // 策略 2：混合格式 — 前導文字 + 內嵌 JSON {"response": [...]}
  // Gemini 有時在 JSON 前加上純文字說明，導致整體不是 valid JSON
  const jsonStartIdx = content.indexOf('{"response"')
  if (jsonStartIdx < 0) {
    // 沒有找到，也試試 pretty-printed 形式
    const prettyIdx = content.search(/\{\s*\n?\s*"response"\s*:/)
    if (prettyIdx >= 0) {
      return extractMixedContent(content, prettyIdx)
    }
    // 完全沒有 JSON 結構，當純 markdown 處理
    return parseTemplatePartToBlocks({ type: 'text', text: content })
  }

  return extractMixedContent(content, jsonStartIdx)
}

/**
 * 處理混合格式內容：前導 markdown + 內嵌 JSON response
 */
function extractMixedContent(content: string, jsonStartIdx: number): ExportBlock[] {
  const blocks: ExportBlock[] = []

  // 1. 解析 JSON 之前的文字為 markdown blocks
  const prefixText = content.slice(0, jsonStartIdx).trim()
  if (prefixText) {
    blocks.push(...parseTemplatePartToBlocks({ type: 'text', text: prefixText }))
  }

  // 2. 從 jsonStartIdx 提取 JSON 部分
  const jsonCandidate = content.slice(jsonStartIdx)

  // 找到配對的右大括號（簡單計數法）
  let braceCount = 0
  let jsonEndIdx = -1
  for (let i = 0; i < jsonCandidate.length; i++) {
    if (jsonCandidate[i] === '{') braceCount++
    else if (jsonCandidate[i] === '}') {
      braceCount--
      if (braceCount === 0) {
        jsonEndIdx = i + 1
        break
      }
    }
  }

  const jsonStr = jsonEndIdx > 0 ? jsonCandidate.slice(0, jsonEndIdx) : jsonCandidate

  try {
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed?.response)) {
      const parts = parsed.response as TemplatePart[]
      blocks.push(...parts.flatMap(parseTemplatePartToBlocks))
    }
  } catch {
    // JSON 解析失敗（可能有 literal newlines），嘗試修復
    try {
      // 修復 JSON 字串值內的 literal newlines（Gemini 常見問題）
      const fixed = fixJsonLiteralNewlines(jsonStr)
      const parsed = JSON.parse(fixed)
      if (Array.isArray(parsed?.response)) {
        const parts = parsed.response as TemplatePart[]
        blocks.push(...parts.flatMap(parseTemplatePartToBlocks))
      }
    } catch {
      // 仍然失敗，把 JSON 部分也當文字處理（但跳過 suggestions template）
      const remainingText = jsonCandidate.trim()
      if (remainingText) {
        blocks.push(...parseTemplatePartToBlocks({ type: 'text', text: remainingText }))
      }
    }
  }

  // 3. JSON 之後的尾部文字
  if (jsonEndIdx > 0) {
    const suffixText = jsonCandidate.slice(jsonEndIdx).trim()
    if (suffixText) {
      blocks.push(...parseTemplatePartToBlocks({ type: 'text', text: suffixText }))
    }
  }

  // 過濾掉空 blocks 和 suggestions（匯出不需要建議按鈕）
  return blocks.filter(b => {
    if (b.type === 'text' && !b.content.trim()) return false
    return true
  })
}

/**
 * 修復 JSON 字串值內的 literal newlines（不合法的控制字元）
 * Gemini 回傳的 JSON 有時 text 欄位內含有未轉義的換行
 */
export function fixJsonLiteralNewlines(jsonStr: string): string {
  // 逐字元掃描，在 JSON 字串值內部將 literal \n 替換為 \\n
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i]

    if (escaped) {
      result += ch
      escaped = false
      continue
    }

    if (ch === '\\' && inString) {
      result += ch
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      result += ch
      continue
    }

    if (inString && (ch === '\n' || ch === '\r')) {
      // 將 literal newline 替換為轉義的 \\n
      if (ch === '\r' && i + 1 < jsonStr.length && jsonStr[i + 1] === '\n') {
        result += '\\n'
        i++ // skip \n after \r
      } else {
        result += '\\n'
      }
      continue
    }

    result += ch
  }

  return result
}

// 舊函式相容性保留，或是重構讓原本呼叫者改用 content (目前只有 route.ts 用)
export function extractAssistantPlainText(content: string): string {
  const blocks = extractAssistantContent(content)
  return blocks.map(b => {
    if (b.type === 'text') return b.content
    if (b.type === 'heading') return b.content
    if (b.type === 'list') return b.items.map((item, i) => b.ordered ? `${i + 1}. ${item}` : `• ${item}`).join('\n')
    if (b.type === 'table') return `[表格: ${b.title || ''}]`
    if (b.type === 'chart') return `[圖表: ${b.title || ''}]`
    return ''
  }).join('\n\n')
}

const CHART_CSS = `
  /* Charts */
  .chart-container { margin: 20px 0; border: 0; padding: 20px; border-radius: 16px; font-family: sans-serif; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); background: linear-gradient(to bottom right, #ffffff, #f8fafc); }
  
  /* Pie Chart */
  .pie-chart-container { display: flex; align-items: center; justify-content: center; gap: 32px; margin: 20px 0; padding: 20px; font-family: sans-serif; }
  .pie-chart { width: 300px; height: 300px; border-radius: 50%; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15); filter: contrast(1.1); }
  .pie-legend { display: flex; flex-direction: column; gap: 12px; font-size: 14px; }
  .pie-legend-item { display: flex; align-items: center; gap: 10px; }
  .pie-dot { width: 14px; height: 14px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }

  /* Vertical Bar Chart */
  .bar-chart-container { display: flex; align-items: flex-end; justify-content: space-around; height: 320px; margin: 20px 0; border: 0; padding: 20px 20px 40px 20px; border-radius: 16px; background: linear-gradient(to bottom, #ffffff, #f8fafc); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); font-family: sans-serif; position: relative; }
  .bar-grid-line { position: absolute; left: 0; right: 0; border-top: 1px dashed #e2e8f0; pointer-events: none; }
  .bar-column { display: flex; flex-direction: column; align-items: center; flex: 1; margin: 0 6px; z-index: 10; height: 100%; justify-content: flex-end; }
  .bar-value { font-size: 13px; font-weight: bold; margin-bottom: 6px; color: #475569; }
  .bar-fill { width: 70%; border-radius: 6px 6px 0 0; min-width: 30px; max-width: 60px; transition: height 0.3s; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); position: relative; overflow: hidden; }
  .bar-fill::after { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(to right, rgba(255,255,255,0.3), transparent); }
  .bar-label { font-size: 13px; text-align: center; margin-top: 12px; line-height: 1.3; color: #64748b; font-weight: 500; }
`

export function getChartHtml(block: ExportBlock & { type: 'chart' }): string {
  // Vibrant, diverse color palette
  const COLORS = [
    '#3b82f6', // Blue
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#f43f5e', // Rose
    '#f97316', // Orange
    '#eab308', // Yellow
    '#10b981', // Emerald
    '#06b6d4', // Cyan
    '#6366f1', // Indigo
    '#14b8a6', // Teal
  ]

  if (block.chartType === 'pie') {
    const total = block.data.reduce((sum, d) => sum + d.value, 0)
    let currentAngle = 0
    const segments = block.data.map((d, i) => {
      const percent = (d.value / total) * 100
      const angle = (d.value / total) * 360
      const color = COLORS[i % COLORS.length]
      const startStr = `${currentAngle}deg`
      currentAngle += angle
      const endStr = `${currentAngle}deg`
      return { ...d, percent, color, gradient: `${color} ${startStr} ${endStr}` }
    })
    const gradient = segments.map(s => s.gradient).join(', ')

    return `
      <div class="pie-chart-container">
        <div class="pie-chart" style="background: conic-gradient(${gradient})"></div>
        <div class="pie-legend">
          ${segments.map(s => `
            <div class="pie-legend-item">
              <span class="pie-dot" style="background-color: ${s.color}"></span>
              <span style="color: #374151; font-weight: 500;">${escapeHtml(s.label)}: <span style="font-weight: bold; color: ${s.color}">${s.value}</span> <span style="color: #9ca3af; font-size: 0.9em;">(${s.percent.toFixed(1)}%)</span></span>
            </div>
          `).join('')}
        </div>
      </div>`
  } else if (block.chartType === 'line') {
    // SVG Line Chart - Enhanced
    const width = 700
    const height = 350
    const padding = 50
    const maxValue = Math.max(...block.data.map(d => d.value), 1) * 1.1 // Add 10% headroom
    const points = block.data.map((d, i) => {
      const x = padding + (i / (block.data.length - 1 || 1)) * (width - 2 * padding)
      const y = height - padding - (d.value / maxValue) * (height - 2 * padding)
      return { x, y, value: d.value, label: d.label }
    })

    // Smooth curve (simple bezier approximation could be complex, sticking to straight lines with gradient fill)
    const linePath = points.length > 1
      ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
      : ''

    // Area fill path
    const areaPath = points.length > 1
      ? `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
      : ''

    return `
      <div class="chart-container">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; overflow: visible;">
           <defs>
             <linearGradient id="lineGap" x1="0" y1="0" x2="0" y2="1">
               <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.2"/>
               <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
             </linearGradient>
             <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
               <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
               <feMerge>
                 <feMergeNode in="coloredBlur"/>
                 <feMergeNode in="SourceGraphic"/>
               </feMerge>
             </filter>
           </defs>
           
           <!-- Grid & Labels -->
           ${[0, 0.25, 0.5, 0.75, 1].map(t => {
      const y = padding + (height - 2 * padding) * (1 - t)
      return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4,4" />
                     <text x="${padding - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="#64748b" font-weight="500">${Math.round(maxValue * t)}</text>`
    }).join('')}
    
           <!-- Area Fill -->
           <path d="${areaPath}" fill="url(#lineGap)" stroke="none" />
           
           <!-- Line -->
           <path d="${linePath}" fill="none" stroke="#3b82f6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" />
           
           <!-- Points -->
           ${points.map((p, i) => `
             <g class="point-group">
               <circle cx="${p.x}" cy="${p.y}" r="6" fill="#ffffff" stroke="#3b82f6" stroke-width="3" />
               <text x="${p.x}" y="${p.y - 20}" text-anchor="middle" font-size="13" font-weight="bold" fill="#1e293b">${p.value}</text>
               <text x="${p.x}" y="${height - 15}" text-anchor="middle" font-size="13" fill="#64748b" font-weight="500">${escapeHtml(p.label)}</text>
             </g>
           `).join('')}
        </svg>
      </div>`
  } else {
    // Vertical Bar Chart (Default) - Enhanced
    const maxVal = Math.max(...block.data.map(d => d.value)) || 100
    // Generate grid lines for background
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(t => {
      const bottomPos = t * 100
      return `<div class="bar-grid-line" style="bottom: calc(40px + ${bottomPos}% * 0.8);"></div>` // approx calc
    }).join('')

    return `<div class="bar-chart-container">
            ${gridLines}
            ${block.data.map((d, i) => {
      const color = COLORS[i % COLORS.length]
      return `
                <div class="bar-column">
                    <span class="bar-value" style="color: ${color}">${d.value}</span>
                    <div class="bar-fill" style="height: ${(d.value / maxVal) * 200}px; background: linear-gradient(to bottom, ${color}, ${color}dd);"></div>
                    <span class="bar-label">${escapeHtml(d.label)}</span>
                </div>
            `}).join('')}
        </div>`
  }
}

// --- Generators ---

/** 解析 Markdown inline 格式（**粗體**、*斜體*）為 TextRun 陣列 */
export function parseInlineMarkdown(text: string): TextRun[] {
  const runs: TextRun[] = []
  // 匹配 **粗體**、*斜體*、`行內程式碼`
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    // 前面的普通文字
    if (match.index > lastIndex) {
      runs.push(new TextRun(text.slice(lastIndex, match.index)))
    }
    if (match[1]) {
      // **粗體**
      runs.push(new TextRun({ text: match[1], bold: true }))
    } else if (match[2]) {
      // *斜體*
      runs.push(new TextRun({ text: match[2], italics: true }))
    } else if (match[3]) {
      // `行內程式碼` — Courier New 等寬字體
      runs.push(new TextRun({ text: match[3], font: { name: 'Courier New' }, size: 20 }))
    }
    lastIndex = match.index + match[0].length
  }
  // 剩餘的普通文字
  if (lastIndex < text.length) {
    runs.push(new TextRun(text.slice(lastIndex)))
  }
  if (runs.length === 0) {
    runs.push(new TextRun(text))
  }
  return runs
}

// Helper for Docx

export function createDocxTable(headers: string[], rows: string[][]): Table {
  return new Table({
    rows: [
      new TableRow({
        children: headers.map(header => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: header, bold: true })] })],
          width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1 },
            bottom: { style: BorderStyle.SINGLE, size: 1 },
            left: { style: BorderStyle.SINGLE, size: 1 },
            right: { style: BorderStyle.SINGLE, size: 1 },
          }
        }))
      }),
      ...rows.map(row => new TableRow({
        children: row.map(cell => new TableCell({
          children: [new Paragraph({ children: parseInlineMarkdown(cell) })],
          width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1 },
            bottom: { style: BorderStyle.SINGLE, size: 1 },
            left: { style: BorderStyle.SINGLE, size: 1 },
            right: { style: BorderStyle.SINGLE, size: 1 },
          }
        }))
      }))
    ],
    width: { size: 100, type: WidthType.PERCENTAGE }
  })
}

export async function generateDocxBuffer(title: string, blocks: ExportBlock[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] })
  ]

  // Lazy load playwright only if needed
  let browser: any = null
  const hasCharts = blocks.some(b => b.type === 'chart')

  try {
    if (hasCharts) {
      const { chromium } = await import('playwright')
      browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      })
    }

    for (const block of blocks) {
      if (block.type === 'heading') {
        const level = block.level === 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3
        children.push(new Paragraph({ heading: level, children: parseInlineMarkdown(block.content) }))
      } else if (block.type === 'text') {
        block.content.split('\n').forEach(line => {
          if (line.trim()) {
            children.push(new Paragraph({ children: parseInlineMarkdown(line.trim()) }))
          }
        })
      } else if (block.type === 'list') {
        block.items.forEach((item, idx) => {
          children.push(new Paragraph({
            children: parseInlineMarkdown(item),
            numbering: block.ordered
              ? { reference: 'ordered-list', level: 0 }
              : { reference: 'unordered-list', level: 0 },
          }))
        })
        children.push(new Paragraph("")) // Spacer after list
      } else if (block.type === 'table') {
        if (block.title) children.push(new Paragraph({ heading: HeadingLevel.HEADING_4, children: [new TextRun(block.title)] }))
        children.push(createDocxTable(block.headers, block.rows))
        children.push(new Paragraph("")) // Spacer
      } else if (block.type === 'chart') {
        if (block.title) children.push(new Paragraph({ heading: HeadingLevel.HEADING_4, children: [new TextRun(block.title)] }))

        if (browser) {
          try {
            const page = await browser.newPage()
            // Set scale factor for higher resolution images
            await page.setViewportSize({ width: 800, height: 600 })
            const html = `<!DOCTYPE html><html><head><style>body { background: white; margin: 0; padding: 10px; } ${CHART_CSS}</style></head><body>${getChartHtml(block)}</body></html>`
            await page.setContent(html, { waitUntil: 'load' })

            // Get the chart container element
            const element = await page.$('body > div')
            if (element) {
              const buffer = await element.screenshot({ type: 'png', omitBackground: true })
              children.push(new Paragraph({
                children: [
                  new ImageRun({
                    data: buffer,
                    transformation: {
                      width: 500,
                      height: 300,
                    },
                    type: 'png', // Explicitly specify type
                  }),
                ],
              }))
            }
            await page.close()
          } catch (e) {
            console.error('Failed to generate chart image for docx', e)
            children.push(new Paragraph("[圖表生成失敗]"))
          }
        } else {
          // Fallback if browser failed to launch (should be unreachable if hasCharts logic works)
          const headers = ['項目', '數值']
          const rows = block.data.map(d => [d.label, String(d.value)])
          children.push(createDocxTable(headers, rows))
        }
        children.push(new Paragraph("")) // Spacer
      }
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'ordered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } },
            },
          ],
        },
        {
          reference: 'unordered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } },
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  })
  return Buffer.from(await Packer.toBuffer(doc))
}


export async function generatePptxBuffer(title: string, blocks: ExportBlock[]): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'NexusMind'
  pptx.subject = title
  pptx.title = title

  // Title Slide
  const titleSlide = pptx.addSlide()
  titleSlide.addText(title, { x: 0.5, y: 1.5, w: 12, h: 1.5, fontSize: 36, bold: true, align: 'center', color: '1F2937' })
  titleSlide.addText('由 NexusMind 自動產生', { x: 0.5, y: 3.0, w: 12, h: 0.5, fontSize: 14, align: 'center', color: '6B7280' })

  // Content Slides
  let currentY = 1.0 // Start below title
  let currentSlide = pptx.addSlide()
  // Helper to add title to new slide if needed
  const checkSpace = (heightNeeded: number) => {
    if (currentY + heightNeeded > 6.5) {
      currentSlide = pptx.addSlide()
      currentY = 1.0
      return true
    }
    return false
  }

  for (const block of blocks) {
    if (block.type === 'heading') {
      const fontSize = block.level === 1 ? 24 : 20
      checkSpace(1.0)
      currentSlide.addText(block.content, { x: 0.5, y: currentY, w: 12, h: 0.8, fontSize, bold: true, color: '2563EB' })
      currentY += 1.0
    } else if (block.type === 'text') {
      // Simple text wrapping estimate
      const lines = block.content.split('\n').length
      const height = lines * 0.4
      if (checkSpace(height)) {
        // new slide
      }
      // 解析 inline 粗體
      const textParts = block.content.split(/(\*\*[^*]+\*\*)/).map(segment => {
        const boldMatch = segment.match(/^\*\*(.+)\*\*$/)
        if (boldMatch) return { text: boldMatch[1], options: { bold: true, fontSize: 16, color: '374151' } }
        return { text: segment, options: { fontSize: 16, color: '374151' } }
      }).filter(p => p.text)
      currentSlide.addText(textParts, { x: 0.5, y: currentY, w: 12, h: height })
      currentY += height + 0.2
    } else if (block.type === 'list') {
      const itemHeight = 0.35
      const totalHeight = block.items.length * itemHeight + 0.2
      checkSpace(totalHeight)
      block.items.forEach((item, idx) => {
        const prefix = block.ordered ? `${idx + 1}. ` : '• '
        // 解析 inline 粗體
        const itemParts = item.split(/(\*\*[^*]+\*\*)/).map(segment => {
          const boldMatch = segment.match(/^\*\*(.+)\*\*$/)
          if (boldMatch) return { text: boldMatch[1], options: { bold: true, fontSize: 15, color: '374151' } }
          return { text: segment, options: { fontSize: 15, color: '374151' } }
        }).filter(p => p.text)
        currentSlide.addText([{ text: prefix, options: { fontSize: 15, color: '6B7280' } }, ...itemParts], { x: 0.8, y: currentY, w: 11.5, h: itemHeight })
        currentY += itemHeight
      })
      currentY += 0.2
    } else if (block.type === 'table') {
      const tableHeaderHeight = 0.5
      const rowHeight = 0.4
      const totalHeight = tableHeaderHeight + (block.rows.length * rowHeight) + 0.5 // + title

      // Always create new slide for big tables
      if (block.rows.length > 5 || currentY > 4) {
        currentSlide = pptx.addSlide()
        currentY = 0.5
      }

      if (block.title) {
        currentSlide.addText(block.title, { x: 0.5, y: currentY, w: 12, h: 0.5, fontSize: 18, bold: true })
        currentY += 0.6
      }

      currentSlide.addTable([
        block.headers.map(h => ({ text: h, options: { bold: true, fill: 'F3F4F6' } })),
        ...block.rows.map(row => row.map(cell => ({ text: cell })))
      ], { x: 0.5, y: currentY, w: 12, fontSize: 14, border: { pt: 1, color: 'E5E7EB' } })

      currentY += (block.rows.length * rowHeight) + 1.0
    } else if (block.type === 'chart') {
      currentSlide = pptx.addSlide()
      if (block.title) {
        currentSlide.addText(block.title, { x: 0.5, y: 0.5, w: 12, h: 0.5, fontSize: 24, bold: true })
      }
      const chartData = [{
        name: block.title || 'Series 1',
        labels: block.data.map(d => d.label),
        values: block.data.map(d => d.value)
      }]

      let pptChartType = pptx.ChartType.bar
      if (block.chartType === 'pie') pptChartType = pptx.ChartType.pie
      else if (block.chartType === 'line') pptChartType = pptx.ChartType.line

      currentSlide.addChart(pptChartType, chartData, { x: 1, y: 1.5, w: 10, h: 5 })
      currentY = 6.5 // Full slide used
    }
  }

  const arrayBuffer = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer
  return Buffer.from(new Uint8Array(arrayBuffer))
}

export async function generatePdfBuffer(title: string, blocks: ExportBlock[]): Promise<Buffer> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()

    // Build HTML content
    let bodyContent = `<h1>${escapeHtml(title)}</h1>`

    for (const block of blocks) {
      if (block.type === 'heading') {
        const headingHtml = escapeHtml(block.content)
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
        bodyContent += `<h${block.level}>${headingHtml}</h${block.level}>`
      } else if (block.type === 'text') {
        const textHtml = escapeHtml(block.content)
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/\n/g, '<br/>')
        bodyContent += `<p>${textHtml}</p>`
      } else if (block.type === 'list') {
        const tag = block.ordered ? 'ol' : 'ul'
        bodyContent += `<${tag}>${block.items.map(item => {
          const itemHtml = escapeHtml(item)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
          return `<li>${itemHtml}</li>`
        }).join('')}</${tag}>`
      } else if (block.type === 'table') {
        if (block.title) bodyContent += `<h4>${escapeHtml(block.title)}</h4>`
        bodyContent += `<table>
                <thead><tr>${block.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
                <tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>`
      } else if (block.type === 'chart') {
        if (block.title) bodyContent += `<h4>${escapeHtml(block.title)}</h4>`
        bodyContent += getChartHtml(block)
      }
    }

    const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif;
      color: #111827;
      padding: 20px;
      line-height: 1.6;
      font-size: 14px;
    }
    h1 { font-size: 28px; color: #1d4ed8; margin-bottom: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
    h2 { font-size: 22px; color: #374151; margin-top: 32px; margin-bottom: 16px; }
    h3 { font-size: 18px; color: #4b5563; margin-top: 24px; margin-bottom: 12px; }
    h4 { font-size: 16px; font-weight: bold; margin-top: 20px; margin-bottom: 8px; }
    p { margin-bottom: 16px; white-space: pre-wrap; }
    ul, ol { margin: 12px 0; padding-left: 28px; }
    li { margin-bottom: 6px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; }
    th { background-color: #f3f4f6; font-weight: 600; color: #374151; }
    ${CHART_CSS}
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`
    await page.setContent(html, { waitUntil: 'load' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '14mm', bottom: '20mm', left: '14mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

export function sanitizeFilename(input: string): string {
  return input
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'document'
}
