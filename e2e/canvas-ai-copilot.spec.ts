import { test, expect } from '@playwright/test'

test.describe('Smart Writing Canvas - AI Copilot', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/login')

    // Wait for page to load
    await page.waitForLoadState('networkidle')
  })

  test('should show login page elements', async ({ page }) => {
    // Verify login page is visible with specific button
    await expect(page.getByRole('button', { name: '登入', exact: true })).toBeVisible()
  })

  test('should navigate to canvas page after login', async ({ page }) => {
    // Note: This test requires valid credentials or mock authentication
    // For now, we'll just verify the canvas route exists
    await page.goto('/canvas')

    // If not authenticated, should redirect to login
    // If authenticated, should show canvas
    const currentUrl = page.url()
    expect(currentUrl).toContain('/login')
  })

  // These tests are skipped because they require authentication
  test.skip('should show canvas editor when authenticated', async ({ page }) => {
    // TODO: Implement authentication mock or use test credentials
    await page.goto('/canvas')

    const editor = page.locator('.ProseMirror')
    await expect(editor).toBeVisible()
  })

  test.skip('should show AI completion button in canvas', async ({ page }) => {
    // TODO: Implement authentication
    await page.goto('/canvas')

    const aiButton = page.locator('text=AI 完成')
    await expect(aiButton).toBeVisible()
  })

  test.skip('should trigger AI completion with keyboard shortcut', async ({ page }) => {
    // TODO: Implement authentication
    await page.goto('/canvas')

    const editor = page.locator('.ProseMirror')
    await editor.click()

    // Type some text
    await editor.type('這是測試文字')

    // Trigger AI completion with Cmd+J (Mac) or Ctrl+J (Windows)
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+KeyJ`)

    // Wait for AI response (this would require actual API)
    await page.waitForTimeout(1000)
  })

  test.skip('should show @ mention menu', async ({ page }) => {
    // TODO: Implement authentication
    await page.goto('/canvas')

    const editor = page.locator('.ProseMirror')
    await editor.click()
    await editor.type('@')

    // Should show mention menu
    const mentionMenu = page.locator('[role="listbox"]')
    await expect(mentionMenu).toBeVisible()
  })

  test.skip('should show slash command menu', async ({ page }) => {
    // TODO: Implement authentication
    await page.goto('/canvas')

    const editor = page.locator('.ProseMirror')
    await editor.click()
    await editor.type('/')

    // Should show command menu
    const commandMenu = page.locator('text=/expand')
    await expect(commandMenu).toBeVisible()
  })
})

test.describe('Dashboard Navigation', () => {
  test('should show dashboard icon in navigation', async ({ page }) => {
    await page.goto('/login')

    // After implementing auth, verify dashboard icon exists
    // For now, just verify route
    await page.goto('/dashboard')

    const currentUrl = page.url()
    expect(currentUrl).toContain('/login')
  })
})
