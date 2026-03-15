import { test, expect, type Page } from '@playwright/test'
import { login } from './helpers/auth'

const BASE_URL = 'http://localhost:3000'

async function submit(page: Page, prompt: string) {
  const input = page.getByRole('textbox').first()
  await input.waitFor({ state: 'visible', timeout: 20000 })
  await expect(page.getByText('生成中')).toHaveCount(0, { timeout: 60000 })
  await input.fill(prompt)
  const form = input.locator('xpath=ancestor::form[1]')
  const submitButton = form.locator('button[type="submit"]')
  await expect(submitButton).toBeEnabled({ timeout: 10000 })
  await submitButton.click()
  await expect(input).toHaveValue('', { timeout: 10000 })
}

test.describe('RAG Knowledge 20 Turns', () => {
  test('建立知識庫文件後，連續 5 題 RAG 命中', async ({ page }) => {
    test.setTimeout(10 * 60 * 1000)

    await login(page, { baseUrl: BASE_URL })

    const created = await page.evaluate(async () => {
      const content = [
        '這是一份 RAG 測試文件，請以此內容回答問題。',
        '',
        'RAG_FACT_01: 專案代號是 NEXUS-ALPHA。',
        'RAG_FACT_02: 內部版本號是 v2026.02.17.',
        'RAG_FACT_03: 主要資料庫是 PostgreSQL 16。',
        'RAG_FACT_04: 快取系統是 Redis 7。',
        'RAG_FACT_05: 向量維度設定為 1536。',
        'RAG_FACT_06: API 逾時秒數是 45 秒。',
        'RAG_FACT_07: 前端框架是 Next.js 16。',
        'RAG_FACT_08: 後端主要語言是 TypeScript。',
        'RAG_FACT_09: 監控平台是 Langfuse。',
        'RAG_FACT_10: 備援區域是 ap-northeast-1。',
        'RAG_FACT_11: 每日批次時間是 02:30。',
        'RAG_FACT_12: 報表輸出格式包含 PDF 與 DOCX。',
        'RAG_FACT_13: 主要模型預設為 Gemini 3 Flash。',
        'RAG_FACT_14: 安全稽核週期是每 14 天。',
        'RAG_FACT_15: 用戶分群數量是 8 群。',
        'RAG_FACT_16: 知識庫更新頻率是每小時。',
        'RAG_FACT_17: 單檔上傳限制是 10MB。',
        'RAG_FACT_18: 標準回應語言是繁體中文。',
        'RAG_FACT_19: 服務目標可用率是 99.9%。',
        'RAG_FACT_20: 災難復原目標時間 RTO 是 30 分鐘。',
      ].join('\n')

      const createRes = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `RAG 測試文件 ${Date.now()}`,
          content,
        }),
      })
      if (!createRes.ok) throw new Error(`create failed: ${createRes.status}`)
      const createJson = await createRes.json()
      const documentId = createJson?.data?.id as string
      if (!documentId) throw new Error('missing documentId')

      const embedRes = await fetch('/api/knowledge/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })
      if (!embedRes.ok) throw new Error(`embed failed: ${embedRes.status}`)

      return { documentId }
    })

    await page.goto(`${BASE_URL}/chat?docId=${created.documentId}`)
    await page.selectOption('select', 'gemini-flash')
    await expect(page.getByText('正在研讀：')).toBeVisible({ timeout: 15000 })

    const turns = [
      ['RAG_FACT_01', 'NEXUS-ALPHA'],
      ['RAG_FACT_02', 'v2026.02.17'],
      ['RAG_FACT_03', 'PostgreSQL 16'],
      ['RAG_FACT_04', 'Redis 7'],
      ['RAG_FACT_05', '1536'],
      ['RAG_FACT_06', '45 秒'],
      ['RAG_FACT_07', 'Next.js 16'],
      ['RAG_FACT_08', 'TypeScript'],
      ['RAG_FACT_09', 'Langfuse'],
      ['RAG_FACT_10', 'ap-northeast-1'],
      ['RAG_FACT_11', '02:30'],
      ['RAG_FACT_12', 'PDF 與 DOCX'],
      ['RAG_FACT_13', 'Gemini 3 Flash'],
      ['RAG_FACT_14', '14 天'],
      ['RAG_FACT_15', '8 群'],
      ['RAG_FACT_16', '每小時'],
      ['RAG_FACT_17', '10MB'],
      ['RAG_FACT_18', '繁體中文'],
      ['RAG_FACT_19', '99.9%'],
      ['RAG_FACT_20', '30 分鐘'],
    ].slice(0, 5) as const

    for (const [factKey, expected] of turns) {
      await submit(page, `請根據知識庫回答：${factKey} 的值是什麼？只回答值。`)
      await expect(page.locator('main p').filter({ hasText: expected }).last()).toBeVisible({ timeout: 45000 })
      await expect(page.getByText('此回覆內容遺失')).toHaveCount(0)
      await expect(page.getByText('生成中')).toHaveCount(0, { timeout: 60000 })
    }
  })
})
