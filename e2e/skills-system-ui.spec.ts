import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/auth";

const BASE_URL = "http://localhost:3000";

// ─── Helpers ──────────────────────────────────────────

async function waitForChatReady(page: Page) {
  await page.waitForLoadState("networkidle");
  // Wait for the chat interface to be ready
  await page
    .locator("textarea")
    .first()
    .waitFor({ state: "visible", timeout: 10000 });
}

// ─── Skills API Mock ──────────────────────────────────

function mockSkillsApi(page: Page) {
  return page.route("**/api/skills", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skills: [
          {
            id: "e2e-context-skill",
            user_id: "test-user",
            name: "e2e-context-skill",
            display_name: "E2E 摘要",
            description: "測試用上下文技能",
            icon: "FileText",
            category: "document",
            version: "1.0.0",
            skill_md: "# Test",
            skill_config: {
              name: "e2e-context-skill",
              displayName: "E2E 摘要",
              description: "測試用上下文技能",
              icon: "FileText",
              category: "document",
              input: { type: "context" },
              output: {
                fileType: "md",
                mimeType: "text/markdown",
                previewFormat: "markdown",
              },
              runtime: { baseImage: "node:20", timeout: 30, maxMemory: "256m" },
            },
            storage_path: "/skills/e2e-context",
            is_system: false,
            is_enabled: true,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "e2e-user-skill",
            user_id: "test-user",
            name: "e2e-user-skill",
            display_name: "E2E 生成",
            description: "測試用用戶輸入技能",
            icon: "Sparkles",
            category: "document",
            version: "1.0.0",
            skill_md: "# Test",
            skill_config: {
              name: "e2e-user-skill",
              displayName: "E2E 生成",
              description: "測試用用戶輸入技能",
              icon: "Sparkles",
              category: "document",
              input: { type: "user", userInputLabel: "請輸入主題" },
              output: {
                fileType: "md",
                mimeType: "text/markdown",
                previewFormat: "markdown",
              },
              runtime: { baseImage: "node:20", timeout: 30, maxMemory: "256m" },
            },
            storage_path: "/skills/e2e-user",
            is_system: false,
            is_enabled: true,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    });
  });
}

function mockSkillExecuteSuccess(page: Page) {
  return page.route("**/api/skills/execute", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "E2E 技能執行成功",
        attachment: null,
      }),
    });
  });
}

function mockSkillExecuteError(page: Page) {
  return page.route("**/api/skills/execute", (route) => {
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: "技能執行失敗：SKILL_EXECUTOR_URL 未設定",
      }),
    });
  });
}

/** Mock clarify API 回傳空問題（跳過釐清，直接提交） */
function mockClarifyApiEmpty(page: Page) {
  return page.route("**/api/skills/clarify", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ questions: [] }),
    });
  });
}

// ─── Test Suite ───────────────────────────────────────

test.describe("Skills System UI", () => {
  test.beforeEach(async ({ page }) => {
    await mockSkillsApi(page);
    await login(page, { baseUrl: BASE_URL });
    await page.goto(`${BASE_URL}/chat`);
    await waitForChatReady(page);
  });

  test.describe("Skill Button Panel", () => {
    test("技能按鈕面板在聊天頁面可見", async ({ page }) => {
      const panel = page.locator('[data-testid="skill-button-panel"]');
      await expect(panel).toBeVisible({ timeout: 10000 });

      // 驗證兩個 mock 技能按鈕都已渲染
      const buttons = panel.locator("button");
      await expect(buttons).toHaveCount(2);
    });

    test("技能按鈕顯示正確的名稱和圖標", async ({ page }) => {
      const panel = page.locator('[data-testid="skill-button-panel"]');
      await expect(panel).toBeVisible({ timeout: 10000 });

      // 桌面版應顯示技能名稱
      const contextBtn = page.locator(
        '[data-testid="skill-button-e2e-context-skill"]',
      );
      const userBtn = page.locator(
        '[data-testid="skill-button-e2e-user-skill"]',
      );

      await expect(contextBtn).toBeVisible();
      await expect(userBtn).toBeVisible();

      // 驗證 title 屬性（hover 時顯示名稱）
      await expect(contextBtn).toHaveAttribute("title", "E2E 摘要");
      await expect(userBtn).toHaveAttribute("title", "E2E 生成");
    });

    test("點擊 context 類型技能不應彈出對話框", async ({ page }) => {
      await mockSkillExecuteSuccess(page);

      const contextBtn = page.locator(
        '[data-testid="skill-button-e2e-context-skill"]',
      );
      await expect(contextBtn).toBeVisible({ timeout: 10000 });
      await contextBtn.click();

      // 不應出現 SkillInputDialog
      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeHidden();
    });
  });

  test.describe("Skill Input Dialog", () => {
    test("點擊 user 類型技能應彈出輸入對話框", async ({ page }) => {
      const userBtn = page.locator(
        '[data-testid="skill-button-e2e-user-skill"]',
      );
      await expect(userBtn).toBeVisible({ timeout: 10000 });
      await userBtn.click();

      // SkillInputDialog 應出現
      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // 驗證對話框內容
      await expect(dialog.locator("h3")).toContainText("E2E 生成");
      await expect(dialog.locator("label")).toContainText("請輸入主題");

      // textarea 應自動聚焦
      const textarea = dialog.locator("#skill-input");
      await expect(textarea).toBeVisible();
      await expect(textarea).toBeFocused({ timeout: 2000 });
    });

    test("空輸入時提交按鈕應禁用", async ({ page }) => {
      const userBtn = page.locator(
        '[data-testid="skill-button-e2e-user-skill"]',
      );
      await expect(userBtn).toBeVisible({ timeout: 10000 });
      await userBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const submitBtn = dialog.locator(
        '[data-testid="skill-dialog-submit-btn"]',
      );
      await expect(submitBtn).toBeDisabled();

      // 輸入文字後應啟用
      const textarea = dialog.locator("#skill-input");
      await textarea.fill("測試主題");
      await expect(submitBtn).toBeEnabled();
    });

    test("點擊取消按鈕應關閉對話框", async ({ page }) => {
      const userBtn = page.locator(
        '[data-testid="skill-button-e2e-user-skill"]',
      );
      await expect(userBtn).toBeVisible({ timeout: 10000 });
      await userBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const cancelBtn = dialog.locator(
        '[data-testid="skill-dialog-cancel-btn"]',
      );
      await cancelBtn.click();

      await expect(dialog).toBeHidden();
    });

    test("按 Escape 應關閉對話框", async ({ page }) => {
      const userBtn = page.locator(
        '[data-testid="skill-button-e2e-user-skill"]',
      );
      await expect(userBtn).toBeVisible({ timeout: 10000 });
      await userBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await page.keyboard.press("Escape");

      await expect(dialog).toBeHidden();
    });

    test("輸入後按 Enter 應提交", async ({ page }) => {
      await mockClarifyApiEmpty(page);
      await mockSkillExecuteSuccess(page);

      const userBtn = page.locator(
        '[data-testid="skill-button-e2e-user-skill"]',
      );
      await expect(userBtn).toBeVisible({ timeout: 10000 });
      await userBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const textarea = dialog.locator("#skill-input");
      await textarea.fill("測試主題");
      await textarea.press("Enter");

      // 對話框應關閉（表示已提交）
      await expect(dialog).toBeHidden({ timeout: 5000 });
    });

    test("點擊執行按鈕應提交並關閉對話框", async ({ page }) => {
      await mockClarifyApiEmpty(page);
      await mockSkillExecuteSuccess(page);

      const userBtn = page.locator(
        '[data-testid="skill-button-e2e-user-skill"]',
      );
      await expect(userBtn).toBeVisible({ timeout: 10000 });
      await userBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const textarea = dialog.locator("#skill-input");
      await textarea.fill("測試主題");

      const submitBtn = dialog.locator(
        '[data-testid="skill-dialog-submit-btn"]',
      );
      await submitBtn.click();

      await expect(dialog).toBeHidden({ timeout: 5000 });
    });
  });

  test.describe("Skill Execution Error Toast", () => {
    test("技能執行失敗時顯示錯誤 toast", async ({ page }) => {
      await mockSkillExecuteError(page);

      // 點擊 context 技能（直接執行，不需要對話框）
      const contextBtn = page.locator(
        '[data-testid="skill-button-e2e-context-skill"]',
      );
      await expect(contextBtn).toBeVisible({ timeout: 10000 });
      await contextBtn.click();

      // 等待錯誤 toast 出現
      const toast = page.locator('[data-testid="skill-error-toast"]');
      await expect(toast).toBeVisible({ timeout: 10000 });

      // 驗證錯誤內容
      await expect(toast).toContainText("技能執行失敗");
      await expect(toast).toContainText("SKILL_EXECUTOR_URL");
    });

    test("點擊關閉按鈕可關閉錯誤 toast", async ({ page }) => {
      await mockSkillExecuteError(page);

      const contextBtn = page.locator(
        '[data-testid="skill-button-e2e-context-skill"]',
      );
      await expect(contextBtn).toBeVisible({ timeout: 10000 });
      await contextBtn.click();

      const toast = page.locator('[data-testid="skill-error-toast"]');
      await expect(toast).toBeVisible({ timeout: 10000 });

      // 點擊關閉按鈕
      const closeBtn = toast.locator('button[aria-label="關閉錯誤提示"]');
      await closeBtn.click();

      await expect(toast).toBeHidden();
    });
  });

  test.describe("Skill Execution Flow (user-type)", () => {
    test("完整用戶旅程：開啟對話框 → 輸入 → 提交 → 執行失敗 → 顯示錯誤 → 關閉錯誤", async ({
      page,
    }) => {
      await mockClarifyApiEmpty(page);
      await mockSkillExecuteError(page);

      // Step 1: 點擊 user 類型技能按鈕
      const userBtn = page.locator(
        '[data-testid="skill-button-e2e-user-skill"]',
      );
      await expect(userBtn).toBeVisible({ timeout: 10000 });
      await userBtn.click();

      // Step 2: 對話框出現
      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Step 3: 輸入主題
      const textarea = dialog.locator("#skill-input");
      await textarea.fill("AI 趨勢分析報告");

      // Step 4: 點擊執行
      const submitBtn = dialog.locator(
        '[data-testid="skill-dialog-submit-btn"]',
      );
      await submitBtn.click();

      // Step 5: 對話框關閉
      await expect(dialog).toBeHidden({ timeout: 5000 });

      // Step 6: 錯誤 toast 出現
      const toast = page.locator('[data-testid="skill-error-toast"]');
      await expect(toast).toBeVisible({ timeout: 10000 });

      // Step 7: 關閉錯誤
      const closeBtn = toast.locator('button[aria-label="關閉錯誤提示"]');
      await closeBtn.click();
      await expect(toast).toBeHidden();

      // Step 8: 確認技能按鈕仍可點擊（非禁用狀態）
      await expect(userBtn).toBeEnabled();
    });
  });
});
