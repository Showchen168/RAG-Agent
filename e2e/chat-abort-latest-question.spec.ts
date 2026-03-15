import { test, expect, type Page } from '@playwright/test'
import { login } from './helpers/auth'

const BASE_URL = 'http://localhost:3000'

async function submitMessage(page: Page, text: string) {
  const input = page.locator('textarea').first()
  await input.waitFor({ state: 'visible', timeout: 10000 })
  await input.fill(text)
  await input.press('Enter')
}

async function clickStopGeneration(page: Page): Promise<boolean> {
  const stopButton = page.getByRole('button', { name: '停止生成' }).first()
  try {
    await stopButton.waitFor({ state: 'visible', timeout: 15000 })
    await expect(stopButton).toBeEnabled({ timeout: 15000 })
    await stopButton.click({ force: true })
    return true
  } catch {
    return false
  }
}

test.describe('Chat Abort Recovery', () => {
  test('abort 後下一題應回覆最新問題', async ({ page }) => {
    await login(page, { baseUrl: BASE_URL })
    await page.goto(`${BASE_URL}/chat`)
    await page.waitForLoadState('networkidle')

    const oldToken = `OLD_${Date.now()}`
    const newToken = `NEW_${Date.now()}`

    await submitMessage(page, `請只回覆字串 ${oldToken}，不要其他內容。`)

    await clickStopGeneration(page)

    await submitMessage(page, `請只回覆字串 ${newToken}，不要其他內容。`)

    await expect(page.getByText(newToken)).toBeVisible({ timeout: 30000 })
    await expect(page.getByText(oldToken)).toHaveCount(1)
  })

  test('雙擊送出 + abort 後下一題仍回覆最新問題', async ({ page }) => {
    await login(page, { baseUrl: BASE_URL })
    await page.goto(`${BASE_URL}/chat`)
    await page.waitForLoadState('networkidle')

    const oldToken = `OLD_DBL_${Date.now()}`
    const newToken = `NEW_DBL_${Date.now()}`

    const input = page.locator('textarea').first()
    await input.waitFor({ state: 'visible', timeout: 10000 })
    await input.fill(`請只回覆字串 ${oldToken}，不要其他內容。`)

    const sendButton = page.locator('form button[type="submit"]').last()
    await sendButton.dblclick()

    await clickStopGeneration(page)

    await submitMessage(page, `請只回覆字串 ${newToken}，不要其他內容。`)

    await expect(page.getByText(newToken)).toBeVisible({ timeout: 30000 })
    await expect(page.getByText(oldToken)).toHaveCount(1)
  })
})
