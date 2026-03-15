import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

const BASE_URL = 'http://localhost:3002'
const TEST_EMAIL = process.env.E2E_TEST_EMAIL
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD

test.describe('Week 2 Marker + LightRAG 降級測試', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, {
      baseUrl: BASE_URL,
      ...(TEST_EMAIL ? { email: TEST_EMAIL } : {}),
      ...(TEST_PASSWORD ? { password: TEST_PASSWORD } : {}),
    })
  })

  test('知識庫頁面有 Marker toggle', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge`)
    await page.waitForLoadState('networkidle')
    const markerLabel = page.locator('text=Marker').first()
    await expect(markerLabel).toBeVisible({ timeout: 5000 })
  })

  test('批次匯入區有 Marker 高品質解析 toggle', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge`)
    await page.waitForLoadState('networkidle')
    const batchBtn = page.locator('text=批次匯入').first()
    await batchBtn.click()
    const markerToggle = page.locator('text=Marker 高品質解析')
    await expect(markerToggle).toBeVisible({ timeout: 5000 })
  })

  test('Health API 回傳正確的離線狀態', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/services/health`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.marker.available).toBe(false)
    expect(body.lightrag.available).toBe(false)
  })

  test('上傳文件不帶 Marker 走 builtin 解析', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge`)
    await page.waitForLoadState('networkidle')
    const response = await page.request.post(`${BASE_URL}/api/knowledge/upload`, {
      multipart: {
        file: {
          name: 'test-playwright.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('Playwright 自動化測試內容'),
        },
      },
    })
    expect(response.ok()).toBeTruthy()
    const result = await response.json()
    expect(result.meta.parsedBy).toBe('builtin')
    expect(result.meta.markerChunks).toBeNull()
  })

  test('上傳文件帶 Marker 離線自動降級', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge`)
    await page.waitForLoadState('networkidle')
    const response = await page.request.post(`${BASE_URL}/api/knowledge/upload`, {
      multipart: {
        file: {
          name: 'test-marker-fallback.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('Marker 降級測試'),
        },
        useMarker: 'true',
      },
    })
    expect(response.ok()).toBeTruthy()
    const result = await response.json()
    expect(result.meta.parsedBy).toBe('builtin')
    expect(result.data.tags).toContain('BUILTIN_FALLBACK')
  })
})
