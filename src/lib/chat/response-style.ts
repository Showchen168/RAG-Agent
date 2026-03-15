export type ResponseStyleMode = 'risk' | 'comparison' | 'action' | 'default'

export function inferResponseStyleMode(text: string): ResponseStyleMode {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return 'default'

  if (/(風險|risk|危機|阻塞|瓶頸|缺口|高風險|失敗機率)/i.test(normalized)) {
    return 'risk'
  }

  if (/(比較|對比|差異|選哪個|哪個比較好|trade-?off|優缺點|方案a|方案b|選項)/i.test(normalized)) {
    return 'comparison'
  }

  if (/(怎麼做|下一步|行動|計畫|落地|執行|roadmap|待辦|步驟)/i.test(normalized)) {
    return 'action'
  }

  return 'default'
}

export function buildResponseStylePrompt(mode: ResponseStyleMode): string {
  if (mode === 'risk') {
    return `\n\n[RESPONSE STYLE: RISK ANALYSIS]
1) 先用 2~3 句明確說出「最高風險」與「影響範圍」。
2) 風險條目請用條列：風險描述 / 影響 / 發生機率 / 緩解建議。
3) 若有數據，優先用簡短表格呈現，避免冗長敘述。`
  }

  if (mode === 'comparison') {
    return `\n\n[RESPONSE STYLE: COMPARISON]
1) 先給一句結論（推薦哪個與原因）。
2) 再給比較表，欄位建議：方案、優點、缺點、適用情境、成本/風險。
3) 最後補上「何時不該選推薦方案」的提醒。`
  }

  if (mode === 'action') {
    return `\n\n[RESPONSE STYLE: ACTION PLAN]
1) 先給可執行的 3~7 步驟，按時間順序排列。
2) 每一步要有輸出成果（deliverable）與完成判準。
3) 若存在依賴條件或風險，放在步驟後的短註記。`
  }

  return '\n\n[RESPONSE STYLE: DEFAULT]\n保持自然、直接、有條理。'
}
