import type { Page } from "@playwright/test";

const GENERATED_EMAIL = `e2e+${Date.now()}@nexusmind.dev`;
const DEFAULT_EMAIL = process.env.E2E_EMAIL ?? GENERATED_EMAIL;
const DEFAULT_PASSWORD = process.env.E2E_PASSWORD ?? "Test123456!";

export const E2E_EMAIL = DEFAULT_EMAIL;

interface LoginOptions {
  baseUrl?: string;
  email?: string;
  password?: string;
  displayName?: string;
}

async function tryLogin(
  page: Page,
  baseUrl: string,
  email: string,
  password: string,
): Promise<boolean> {
  await page.goto(`${baseUrl}/login`);

  // 已有 session 時 /login 可能直接導向 chat/dashboard
  if (/\/(chat|dashboard)(\/|$)/.test(page.url())) {
    return true;
  }

  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL(/\/(chat|dashboard)(\/|$)/, { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function registerUser(
  page: Page,
  baseUrl: string,
  email: string,
  password: string,
  displayName: string,
): Promise<void> {
  await page.goto(`${baseUrl}/register`);
  await page.fill("#displayName", displayName);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL(/\/(chat|dashboard)(\/|$)/, { timeout: 10000 });
    return;
  } catch {
    const alreadyRegistered = page
      .locator("p.text-sm.text-red-500")
      .filter({ hasText: /already registered|已被註冊/i });
    if ((await alreadyRegistered.count()) > 0) {
      return;
    }
    throw new Error("註冊測試帳號失敗");
  }
}

export async function login(
  page: Page,
  options: LoginOptions = {},
): Promise<void> {
  const baseUrl = options.baseUrl ?? "http://localhost:3000";
  const email = options.email ?? DEFAULT_EMAIL;
  const password = options.password ?? DEFAULT_PASSWORD;
  const displayName = options.displayName ?? "E2E User";

  const loggedIn = await tryLogin(page, baseUrl, email, password);
  if (loggedIn) return;

  // 顯式指定帳密時不做 fallback，自動回報
  if (options.email || options.password || process.env.E2E_EMAIL) {
    throw new Error(
      `E2E 登入失敗：${email}。請確認 E2E_EMAIL / E2E_PASSWORD 是否正確。`,
    );
  }

  await registerUser(page, baseUrl, email, password, displayName);

  const loggedInAfterRegister = await tryLogin(page, baseUrl, email, password);
  if (!loggedInAfterRegister) {
    throw new Error("E2E fallback 註冊後仍無法登入");
  }
}

