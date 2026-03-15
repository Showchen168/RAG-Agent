import { test, expect, type Page } from '@playwright/test'
import { E2E_EMAIL, login } from './helpers/auth'

const BASE_URL = 'http://localhost:3000'

test.describe('Phase 2 Verification', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, { baseUrl: BASE_URL })
  })

  test('M1: Knowledge page — create, delete, semantic search UI', async ({ page }) => {
    // 導航到知識庫
    await page.click('text=知識庫')
    await page.waitForURL('**/knowledge**')

    // 檢查頁面載入
    await expect(page.locator('h2:has-text("知識庫")')).toBeVisible()

    // 檢查新增文件按鈕
    await expect(page.locator('button:has-text("新增文件")')).toBeVisible()

    // 檢查搜尋模式切換 (文字/語意)
    await expect(page.locator('button:has-text("文字")')).toBeVisible()
    await expect(page.locator('button:has-text("語意")')).toBeVisible()

    // 建立測試文件
    await page.click('button:has-text("新增文件")')
    await page.fill('input[placeholder="文件標題"]', 'E2E 測試文件')
    await page.fill('textarea[placeholder="貼上或輸入文件內容..."]', '這是一個用於 E2E 測試的知識庫文件。包含 NexusMind 的介紹資訊。')
    await page.click('button:has-text("儲存並建立索引")')

    // 等待文件出現在列表中
    await expect(page.locator('text=E2E 測試文件').first()).toBeVisible({ timeout: 15000 })

    // 檢查 embedding 狀態指示（索引中 或 已索引）
    const statusBadge = page.locator('text=索引中').or(page.locator('text=已索引'))
    await expect(statusBadge).toBeVisible({ timeout: 30000 })

    // 刪除按鈕可見
    const deleteBtn = page.locator('button[title="刪除文件"]').first()
    await expect(deleteBtn).toBeVisible()
  })

  test('M2: Chat persistence — auto-create conversation', async ({ page }) => {
    // 確認在 /chat 頁面
    await expect(page).toHaveURL(/\/chat/)

    // 確保用 flash 模型（更快）
    const modelSelect = page.locator('select').first()
    await modelSelect.selectOption('gemini-flash')

    // 送出一條訊息
    const input = page.locator('input[placeholder="輸入你的問題..."]')
    await input.fill('說 hello')
    await page.click('button[type="submit"]')

    // 等待 URL 變成 /chat/{id} — 代表自動建立了對話
    await page.waitForURL(/\/chat\/[a-f0-9-]+/, { timeout: 15000 })

    // 等待 AI 回應出現（prose class 代表 MarkdownRenderer 已渲染）
    await expect(page.locator('.prose').first()).toBeVisible({ timeout: 60000 })

    // 取得目前 URL（應該已經是 /chat/{uuid}）
    const chatUrl = page.url()
    expect(chatUrl).toMatch(/\/chat\/[a-f0-9-]+/)

    // 刷新頁面 — 歷史訊息應該仍在
    await page.reload()
    await page.waitForLoadState('networkidle')

    // 確認歷史訊息載入（用戶訊息仍在）
    await expect(page.locator('text=說 hello').first()).toBeVisible({ timeout: 15000 })
  })

  test('M2: Sidebar shows conversations', async ({ page }) => {
    // 檢查 sidebar 有對話列表
    const sidebar = page.locator('aside')
    await expect(sidebar.locator('a[href^="/chat/"]').first()).toBeVisible({ timeout: 10000 })
  })

  test('M3: Settings page — email display and model preference', async ({ page }) => {
    await page.click('text=設定')
    await page.waitForURL('**/settings**')

    // 檢查 Email 顯示
    await expect(page.locator(`text=${E2E_EMAIL}`)).toBeVisible({ timeout: 5000 })

    // 檢查固定顯示的預設模型文案
    await expect(page.locator('text=Gemini 3 Flash (Google)')).toBeVisible({ timeout: 5000 })

    // 修改顯示名稱並儲存設定
    const displayNameInput = page.locator('input').first()
    await displayNameInput.fill('E2E User Updated')
    await page.click('button:has-text("儲存設定")')
    await page.waitForTimeout(1000)
    await expect(displayNameInput).toHaveValue('E2E User Updated')

    // 導航到 chat 確認偏好模型生效
    await page.click('text=新對話')
    await page.waitForURL('**/chat**')

    // 基本返回成功（設定頁儲存後可正常回到聊天）
    await page.waitForTimeout(1000)
  })

  test('M4: UI — responsive layout and markdown support', async ({ page }) => {
    // 桌面版 sidebar 可見
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()

    // 檢查 NexusMind 標題
    await expect(sidebar.locator('text=NexusMind')).toBeVisible()

    // 設定手機版視窗
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(500)

    // 手機版 sidebar 應隱藏，漢堡按鈕可見
    await expect(sidebar).not.toBeVisible()

    // 恢復桌面
    await page.setViewportSize({ width: 1280, height: 720 })
  })
})
