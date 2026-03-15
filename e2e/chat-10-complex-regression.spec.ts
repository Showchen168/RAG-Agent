import { test, expect, type ConsoleMessage, type Response } from '@playwright/test'
import { login } from './helpers/auth'

const BASE_URL = 'http://localhost:3000'

async function submit(page: import('@playwright/test').Page, prompt: string) {
  const input = page.locator('textarea').first()
  await input.waitFor({ state: 'visible', timeout: 10000 })
  await input.fill(prompt)
  await input.press('Enter')
}

test.describe('Chat 10-Turn Complex Regression', () => {
  test('10 筆複雜對話應穩定回覆且無後端錯誤', async ({ page }) => {
    test.setTimeout(180000)

    const consoleErrors: string[] = []
    const apiErrors: string[] = []

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    page.on('response', async (res: Response) => {
      if (!res.url().includes('/api/chat')) return
      if (res.status() >= 400) {
        apiErrors.push(`${res.status()} ${res.url()}`)
      }
    })

    await login(page, { baseUrl: BASE_URL })
    await page.goto(`${BASE_URL}/chat`)
    await page.waitForLoadState('networkidle')
    await page.selectOption('select', 'gemini-flash')

    const turns = Array.from({ length: 10 }, (_, i) => {
      const token = `C${i + 1}_${Date.now().toString().slice(-6)}`
      return {
        token,
        prompt: [
          '你是技術顧問，請遵守以下規格：',
          `1) 第一行必須完整包含字串 ${token}`,
          '2) 內文要有 3 個條列重點，每點最多 18 字',
          '3) 最後一行用「結論：」開頭，最多 20 字',
          `4) 題目：複雜對話回歸測試案例 ${i + 1}`,
        ].join('\n'),
      }
    })

    for (const turn of turns) {
      await submit(page, turn.prompt)
      const stop = page.getByRole('button', { name: '停止生成' }).first()
      await stop.waitFor({ state: 'visible', timeout: 10000 })
      await stop.waitFor({ state: 'hidden', timeout: 20000 })
      await expect.poll(async () => {
        return await page.getByText(turn.token).count()
      }, { timeout: 20000 }).toBeGreaterThanOrEqual(2)
    }

    expect(apiErrors, `api/chat 發生錯誤: ${apiErrors.join(' | ')}`).toEqual([])
    expect(consoleErrors, `瀏覽器 console error: ${consoleErrors.join(' | ')}`).toEqual([])
  })
})
