import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/auth";

const BASE_URL = "http://localhost:3000";

// ─── Helpers ──────────────────────────────────────────

async function waitForChatReady(page: Page) {
  await page.waitForLoadState("networkidle");
  await page
    .locator("textarea")
    .first()
    .waitFor({ state: "visible", timeout: 10000 });
}

// ─── Mock Data ────────────────────────────────────────

const mockUserSkill = {
  id: "e2e-clarify-skill",
  user_id: "test-user",
  name: "e2e-clarify-skill",
  display_name: "E2E 釐清測試",
  description: "測試釐清問題流程的技能",
  icon: "Sparkles",
  category: "document",
  version: "1.0.0",
  skill_md: "# E2E Clarify Test Skill",
  skill_config: {
    name: "e2e-clarify-skill",
    displayName: "E2E 釐清測試",
    description: "測試釐清問題流程的技能",
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
  storage_path: "/skills/e2e-clarify",
  is_system: false,
  is_enabled: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockClarificationQuestions = [
  {
    id: "q1",
    question: "目標受眾是誰？",
    type: "select",
    options: ["初學者", "進階者", "專業人士"],
  },
  {
    id: "q2",
    question: "希望涵蓋哪些主題？",
    type: "text",
    placeholder: "例如：核心概念、實作範例",
  },
  {
    id: "q3",
    question: "需要包含哪些元素？",
    type: "multiselect",
    options: ["程式碼範例", "圖表說明", "練習題", "參考資料"],
  },
];

// ─── API Mocks ────────────────────────────────────────

function mockSkillsApi(page: Page) {
  return page.route("**/api/skills", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ skills: [mockUserSkill] }),
    });
  });
}

function mockClarifyApiSuccess(page: Page) {
  return page.route("**/api/skills/clarify", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ questions: mockClarificationQuestions }),
    });
  });
}

function mockClarifyApiEmpty(page: Page) {
  return page.route("**/api/skills/clarify", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ questions: [] }),
    });
  });
}

function mockClarifyApiError(page: Page) {
  return page.route("**/api/skills/clarify", (route) => {
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Gemini API rate limit" }),
    });
  });
}

function mockExecuteSuccess(page: Page) {
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

// ─── Test Suite ───────────────────────────────────────

test.describe("Skill Clarification Flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockSkillsApi(page);
    await login(page, { baseUrl: BASE_URL });
    await page.goto(`${BASE_URL}/chat`);
    await waitForChatReady(page);
  });

  test.describe("Initial → Clarifying Phase Transition", () => {
    test("輸入主題後按下一步，應顯示釐清問題表單", async ({ page }) => {
      await mockClarifyApiSuccess(page);

      // 點擊技能按鈕
      const skillBtn = page.locator(
        '[data-testid="skill-button-e2e-clarify-skill"]',
      );
      await expect(skillBtn).toBeVisible({ timeout: 10000 });
      await skillBtn.click();

      // 對話框出現（initial 階段）
      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // 輸入主題
      const textarea = dialog.locator("#skill-input");
      await textarea.fill("TypeScript 完整教學");

      // 點擊「下一步」按鈕
      const submitBtn = dialog.locator(
        '[data-testid="skill-dialog-submit-btn"]',
      );
      await submitBtn.click();

      // 等待釐清問題表單出現
      const clarifyForm = dialog.locator(
        '[data-testid="skill-clarification-form"]',
      );
      await expect(clarifyForm).toBeVisible({ timeout: 10000 });

      // 驗證三個問題都已渲染
      await expect(clarifyForm.locator("label").first()).toContainText(
        "目標受眾是誰",
      );
    });

    test("輸入主題後按 Enter，應觸發釐清流程", async ({ page }) => {
      await mockClarifyApiSuccess(page);

      const skillBtn = page.locator(
        '[data-testid="skill-button-e2e-clarify-skill"]',
      );
      await expect(skillBtn).toBeVisible({ timeout: 10000 });
      await skillBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const textarea = dialog.locator("#skill-input");
      await textarea.fill("React 入門");
      await textarea.press("Enter");

      // 應顯示釐清問題表單
      const clarifyForm = dialog.locator(
        '[data-testid="skill-clarification-form"]',
      );
      await expect(clarifyForm).toBeVisible({ timeout: 10000 });
    });

    test("提交後應顯示 loading 指示器", async ({ page }) => {
      // 延遲 clarify 回應以捕捉 loading 狀態
      await page.route("**/api/skills/clarify", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ questions: mockClarificationQuestions }),
        });
      });

      const skillBtn = page.locator(
        '[data-testid="skill-button-e2e-clarify-skill"]',
      );
      await expect(skillBtn).toBeVisible({ timeout: 10000 });
      await skillBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const textarea = dialog.locator("#skill-input");
      await textarea.fill("測試主題");

      const submitBtn = dialog.locator(
        '[data-testid="skill-dialog-submit-btn"]',
      );
      await submitBtn.click();

      // 驗證 loading 指示器出現
      const loader = dialog.locator(
        '[data-testid="skill-clarifying-loader"]',
      );
      await expect(loader).toBeVisible({ timeout: 3000 });
      await expect(loader).toContainText("正在分析您的需求");
    });
  });

  test.describe("Clarifying Phase - Question Types", () => {
    test("驗證三種問題類型的 UI 渲染", async ({ page }) => {
      await mockClarifyApiSuccess(page);

      const skillBtn = page.locator(
        '[data-testid="skill-button-e2e-clarify-skill"]',
      );
      await expect(skillBtn).toBeVisible({ timeout: 10000 });
      await skillBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const textarea = dialog.locator("#skill-input");
      await textarea.fill("TypeScript 教學");

      const submitBtn = dialog.locator(
        '[data-testid="skill-dialog-submit-btn"]',
      );
      await submitBtn.click();

      const clarifyForm = dialog.locator(
        '[data-testid="skill-clarification-form"]',
      );
      await expect(clarifyForm).toBeVisible({ timeout: 10000 });

      // 1. select 類型（q1）— radio 按鈕
      const selectGroup = dialog.locator('[data-testid="clarify-select-q1"]');
      await expect(selectGroup).toBeVisible();
      const radios = selectGroup.locator('input[type="radio"]');
      await expect(radios).toHaveCount(3);

      // 2. text 類型（q2）— textarea
      const textInput = dialog.locator('[data-testid="clarify-input-q2"]');
      await expect(textInput).toBeVisible();

      // 3. multiselect 類型（q3）— checkbox
      const multiGroup = dialog.locator(
        '[data-testid="clarify-multiselect-q3"]',
      );
      await expect(multiGroup).toBeVisible();
      const checkboxes = multiGroup.locator('input[type="checkbox"]');
      await expect(checkboxes).toHaveCount(4);
    });

    test("未回答所有問題時生成按鈕應禁用", async ({ page }) => {
      await mockClarifyApiSuccess(page);

      const skillBtn = page.locator(
        '[data-testid="skill-button-e2e-clarify-skill"]',
      );
      await expect(skillBtn).toBeVisible({ timeout: 10000 });
      await skillBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await dialog.locator("#skill-input").fill("教學");
      await dialog
        .locator('[data-testid="skill-dialog-submit-btn"]')
        .click();

      await dialog
        .locator('[data-testid="skill-clarification-form"]')
        .waitFor({ state: "visible", timeout: 10000 });

      // 生成按鈕應禁用（尚未回答）
      const generateBtn = dialog.locator(
        '[data-testid="skill-dialog-generate-btn"]',
      );
      await expect(generateBtn).toBeDisabled();
    });

    test("回答所有問題後生成按鈕應啟用", async ({ page }) => {
      await mockClarifyApiSuccess(page);

      const skillBtn = page.locator(
        '[data-testid="skill-button-e2e-clarify-skill"]',
      );
      await expect(skillBtn).toBeVisible({ timeout: 10000 });
      await skillBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await dialog.locator("#skill-input").fill("教學");
      await dialog
        .locator('[data-testid="skill-dialog-submit-btn"]')
        .click();

      await dialog
        .locator('[data-testid="skill-clarification-form"]')
        .waitFor({ state: "visible", timeout: 10000 });

      // 回答 q1 (select): 選擇「初學者」
      await dialog
        .locator('[data-testid="clarify-select-q1"] input[type="radio"]')
        .first()
        .click();

      // 回答 q2 (text): 輸入文字
      await dialog
        .locator('[data-testid="clarify-input-q2"]')
        .fill("核心概念與實作範例");

      // 回答 q3 (multiselect): 勾選第一個選項
      await dialog
        .locator(
          '[data-testid="clarify-multiselect-q3"] input[type="checkbox"]',
        )
        .first()
        .click();

      // 生成按鈕應啟用
      const generateBtn = dialog.locator(
        '[data-testid="skill-dialog-generate-btn"]',
      );
      await expect(generateBtn).toBeEnabled();
    });
  });

  test.describe("Complete Clarification Journey", () => {
    test("完整旅程：輸入 → 釐清 → 回答 → 生成 → 對話框關閉", async ({
      page,
    }) => {
      await mockClarifyApiSuccess(page);
      await mockExecuteSuccess(page);

      // Step 1: 點擊技能按鈕
      const skillBtn = page.locator(
        '[data-testid="skill-button-e2e-clarify-skill"]',
      );
      await expect(skillBtn).toBeVisible({ timeout: 10000 });
      await skillBtn.click();

      // Step 2: 對話框出現（initial 階段）
      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Step 3: 輸入主題並提交
      await dialog.locator("#skill-input").fill("TypeScript 完整教學");
      await dialog
        .locator('[data-testid="skill-dialog-submit-btn"]')
        .click();

      // Step 4: 釐清問題表單出現
      const clarifyForm = dialog.locator(
        '[data-testid="skill-clarification-form"]',
      );
      await expect(clarifyForm).toBeVisible({ timeout: 10000 });

      // Step 5: 回答所有問題
      // q1 (select)
      await dialog
        .locator('[data-testid="clarify-select-q1"] input[type="radio"]')
        .first()
        .click();
      // q2 (text)
      await dialog
        .locator('[data-testid="clarify-input-q2"]')
        .fill("核心概念、實作範例、最佳實踐");
      // q3 (multiselect) - 勾選前兩個
      const checkboxes = dialog.locator(
        '[data-testid="clarify-multiselect-q3"] input[type="checkbox"]',
      );
      await checkboxes.nth(0).click();
      await checkboxes.nth(1).click();

      // Step 6: 點擊「生成」
      const generateBtn = dialog.locator(
        '[data-testid="skill-dialog-generate-btn"]',
      );
      await expect(generateBtn).toBeEnabled();
      await generateBtn.click();

      // Step 7: 對話框應關閉
      await expect(dialog).toBeHidden({ timeout: 5000 });
    });
  });

  test.describe("Navigation and Cancel", () => {
    test("釐清階段按 Escape 應返回初始階段", async ({ page }) => {
      await mockClarifyApiSuccess(page);

      const skillBtn = page.locator(
        '[data-testid="skill-button-e2e-clarify-skill"]',
      );
      await expect(skillBtn).toBeVisible({ timeout: 10000 });
      await skillBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await dialog.locator("#skill-input").fill("教學");
      await dialog
        .locator('[data-testid="skill-dialog-submit-btn"]')
        .click();

      await dialog
        .locator('[data-testid="skill-clarification-form"]')
        .waitFor({ state: "visible", timeout: 10000 });

      // 按 Escape 返回 initial 階段
      await page.keyboard.press("Escape");

      // 釐清表單消失
      await expect(
        dialog.locator('[data-testid="skill-clarification-form"]'),
      ).toBeHidden();

      // 初始 textarea 重新出現
      await expect(dialog.locator("#skill-input")).toBeVisible();
    });

    test("釐清階段點擊返回按鈕應返回初始階段", async ({ page }) => {
      await mockClarifyApiSuccess(page);

      const skillBtn = page.locator(
        '[data-testid="skill-button-e2e-clarify-skill"]',
      );
      await expect(skillBtn).toBeVisible({ timeout: 10000 });
      await skillBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await dialog.locator("#skill-input").fill("教學");
      await dialog
        .locator('[data-testid="skill-dialog-submit-btn"]')
        .click();

      await dialog
        .locator('[data-testid="skill-clarification-form"]')
        .waitFor({ state: "visible", timeout: 10000 });

      // 點擊「返回」按鈕（左下角）
      const backBtn = dialog.locator(
        '[data-testid="skill-dialog-cancel-btn"]',
      );
      await expect(backBtn).toContainText("返回");
      await backBtn.click();

      // 初始 textarea 重新出現
      await expect(dialog.locator("#skill-input")).toBeVisible();

      // 之前輸入的值應保留
      await expect(dialog.locator("#skill-input")).toHaveValue(
        "教學",
      );
    });

    test("初始階段按 Escape 應關閉對話框", async ({ page }) => {
      const skillBtn = page.locator(
        '[data-testid="skill-button-e2e-clarify-skill"]',
      );
      await expect(skillBtn).toBeVisible({ timeout: 10000 });
      await skillBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });
  });

  test.describe("Clarify API Fallback", () => {
    test("釐清 API 回傳空問題時，應直接提交執行", async ({ page }) => {
      await mockClarifyApiEmpty(page);
      await mockExecuteSuccess(page);

      const skillBtn = page.locator(
        '[data-testid="skill-button-e2e-clarify-skill"]',
      );
      await expect(skillBtn).toBeVisible({ timeout: 10000 });
      await skillBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await dialog.locator("#skill-input").fill("快速測試");
      await dialog
        .locator('[data-testid="skill-dialog-submit-btn"]')
        .click();

      // 應直接關閉對話框（跳過釐清階段）
      await expect(dialog).toBeHidden({ timeout: 5000 });
    });

    test("釐清 API 失敗時，應直接提交執行", async ({ page }) => {
      await mockClarifyApiError(page);
      await mockExecuteSuccess(page);

      const skillBtn = page.locator(
        '[data-testid="skill-button-e2e-clarify-skill"]',
      );
      await expect(skillBtn).toBeVisible({ timeout: 10000 });
      await skillBtn.click();

      const dialog = page.locator('[data-testid="skill-input-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await dialog.locator("#skill-input").fill("快速測試");
      await dialog
        .locator('[data-testid="skill-dialog-submit-btn"]')
        .click();

      // API 失敗 → clarifySkill 回傳 null → 直接提交 → 對話框關閉
      await expect(dialog).toBeHidden({ timeout: 10000 });
    });
  });
});
