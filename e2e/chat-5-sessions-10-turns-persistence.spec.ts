import { test, expect, type ConsoleMessage, type Page, type Response } from '@playwright/test'
import { login } from './helpers/auth'

const BASE_URL = 'http://localhost:3000'
const SESSION_COUNT = 5
const TURNS_PER_SESSION = 10

async function createNewChat(page: Page) {
  await page.getByRole('button', { name: '新對話' }).click()
  await page.waitForURL(/\/chat(?:\?.*)?$/, { timeout: 10000 })
}

async function submit(page: Page, prompt: string) {
  const input = page.locator('textarea').first()
  await input.waitFor({ state: 'visible', timeout: 10000 })
  await input.fill(prompt)
  await input.press('Enter')
}

async function waitReplyFinished(page: Page) {
  const stop = page.getByRole('button', { name: '停止生成' }).first()
  await stop.waitFor({ state: 'visible', timeout: 15000 })
  await stop.waitFor({ state: 'hidden', timeout: 45000 })
}

test.describe('Chat 5 Sessions x 10 Turns Persistence Regression', () => {
  test('跨 session 持久化、Markdown 渲染與複雜對話內容穩定', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000)

    const seed = Date.now().toString().slice(-6)
    const consoleErrors: string[] = []
    const apiErrors: string[] = []
    const sessions: Array<{ label: string; firstToken: string; lastToken: string }> = []

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    page.on('response', async (res: Response) => {
      const url = res.url()
      if (!url.includes('/api/chat') && !url.includes('/api/conversations/')) return
      if (res.status() >= 400) apiErrors.push(`${res.status()} ${url}`)
    })

    await login(page, { baseUrl: BASE_URL })
    await page.goto(`${BASE_URL}/chat`)
    await page.waitForLoadState('networkidle')
    await page.selectOption('select', 'gemini-flash')

    for (let s = 1; s <= SESSION_COUNT; s++) {
      await createNewChat(page)

      const label = `[S${s}_${seed}]`
      let firstToken = ''
      let lastToken = ''

      for (let t = 1; t <= TURNS_PER_SESSION; t++) {
        const token = `${label}_T${t}`
        if (!firstToken) firstToken = token
        lastToken = token

        const prompt = t === 3
          ? [
              `請只輸出以下 markdown，且不可增加其他文字，必須包含 ${token}`,
              `# ${token} 標題`,
              '1. 第一點',
              '2. 第二點',
              '3. 第三點',
              '```ts',
              `const marker = "${token}"`,
              '```',
            ].join('\n')
          : [
              `你是資深顧問，請回覆複雜任務 ${token}`,
              '要求：',
              '1) 第一行必須包含 token',
              '2) 請給 3 點策略，各點 15 字內',
              '3) 最後一行以「結論：」開頭且 20 字內',
              `題目：跨 session 對話壓測第 ${s} 組第 ${t} 輪`,
            ].join('\n')

        await submit(page, prompt)
        await waitReplyFinished(page)

        await expect.poll(async () => {
          return await page.getByText(token).count()
        }, { timeout: 30000 }).toBeGreaterThanOrEqual(2)

        await expect(page.getByText('（此回覆內容遺失，請重新送出一次）')).toHaveCount(0)

        if (t === 3) {
          const assistantBubble = page.locator('.rounded-2xl').filter({ hasText: token }).last()
          await expect(assistantBubble).toBeVisible({ timeout: 10000 })
          const bubbleText = (await assistantBubble.innerText()).trim()
          expect(bubbleText).not.toContain('```')
          expect(bubbleText).not.toContain('# ')
        }
      }

      sessions.push({ label, firstToken, lastToken })
    }

    // 跨 session 切換，驗證歷史訊息仍可讀取
    for (const session of sessions) {
      await page.getByRole('link', { name: new RegExp(`\\${session.label}`) }).first().click()
      await page.waitForURL(/\/chat\/.+/, { timeout: 10000 })
      await expect.poll(async () => {
        return await page.getByText(session.firstToken, { exact: true }).count()
      }, { timeout: 30000 }).toBeGreaterThan(0)
      await expect.poll(async () => {
        return await page.getByText(session.lastToken, { exact: true }).count()
      }, { timeout: 30000 }).toBeGreaterThan(0)
      await expect(page.getByText('（此回覆內容遺失，請重新送出一次）')).toHaveCount(0)
    }

    expect(apiErrors, `API 錯誤: ${apiErrors.join(' | ')}`).toEqual([])
    expect(consoleErrors, `Console 錯誤: ${consoleErrors.join(' | ')}`).toEqual([])
  })
})
