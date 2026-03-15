import { createAdminClient } from "@/lib/supabase/server";
import { telegramRequest } from "./bot";
import { encryptToken, decryptToken, maskToken } from "./crypto";

// ── Types ──────────────────────────────────────────

interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

interface VerifyResult {
  ok: boolean;
  bot?: TelegramBotInfo;
  error?: string;
}

export interface BotConfigRow {
  id: string;
  bot_id: number | null;
  bot_username: string | null;
  bot_first_name: string | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  webhook_registered_at: string | null;
  is_active: boolean;
  configured_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BotConfigPublic extends BotConfigRow {
  bot_token_masked: string;
}

interface WebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
}

// ── Helpers ────────────────────────────────────────

export function getEncryptionKey(): string {
  const key = process.env.BOT_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "BOT_TOKEN_ENCRYPTION_KEY 環境變數未設定。請設定 32-byte hex 金鑰（64 字元）。",
    );
  }
  return key;
}

// ── Core Functions ─────────────────────────────────

/**
 * 驗證 Bot Token 是否有效（呼叫 Telegram getMe API）。
 */
export async function verifyBotToken(token: string): Promise<VerifyResult> {
  try {
    const res = await telegramRequest<TelegramBotInfo>(
      `/bot${token}/getMe`,
    );
    if (res.ok && res.result) {
      return { ok: true, bot: res.result };
    }
    return { ok: false, error: "Token 無效或已過期" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "驗證失敗",
    };
  }
}

/**
 * 儲存 Bot 設定到 DB（加密 Token，upsert 模式）。
 * 安全設計：先查是否有現有記錄，有則 update，無則 insert。
 * 不使用 delete，避免「刪了但插入失敗」導致設定永久消失。
 */
export async function saveBotConfig(
  token: string,
  bot: TelegramBotInfo,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const key = getEncryptionKey();
    const encrypted = encryptToken(token, key);
    const supabase = createAdminClient();

    const configData = {
      bot_token_encrypted: encrypted,
      bot_id: bot.id,
      bot_username: bot.username,
      bot_first_name: bot.first_name,
      is_active: true,
      configured_by: userId,
      updated_at: new Date().toISOString(),
    };

    // 查詢是否已有記錄
    const { data: existing } = await supabase
      .from("telegram_bot_config")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();

    if (existing) {
      // 有現有記錄 → update
      const { error } = await supabase
        .from("telegram_bot_config")
        .update(configData)
        .eq("id", existing.id);

      if (error) {
        return { success: false, error: error.message };
      }
    } else {
      // 沒有記錄 → insert
      const { error } = await supabase
        .from("telegram_bot_config")
        .insert(configData);

      if (error) {
        return { success: false, error: error.message };
      }
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "儲存失敗",
    };
  }
}

/**
 * 從 DB 讀取目前的 Bot 設定（Token 遮罩化）。
 */
export async function getBotConfig(): Promise<BotConfigPublic | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("telegram_bot_config")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return null;

  // 解密 Token 只為了遮罩顯示
  let maskedToken = "***";
  try {
    const key = getEncryptionKey();
    const rawToken = decryptToken(data.bot_token_encrypted, key);
    maskedToken = maskToken(rawToken);
  } catch {
    // 解密失敗（key 不對等），顯示 ***
  }

  const { bot_token_encrypted: _removed, ...rest } = data;
  return { ...rest, bot_token_masked: maskedToken };
}

/**
 * 取得目前啟用的 Bot Token（解密後的明文）。
 * 優先從 DB 讀取，fallback 到 TELEGRAM_BOT_TOKEN env var。
 */
export async function getActiveBotToken(): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("telegram_bot_config")
      .select("bot_token_encrypted")
      .eq("is_active", true)
      .maybeSingle();

    if (data?.bot_token_encrypted) {
      const key = getEncryptionKey();
      return decryptToken(data.bot_token_encrypted, key);
    }
  } catch {
    // DB 或解密失敗，fallback
  }

  // Fallback to env var
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

/**
 * 刪除 Bot 設定。
 */
export async function deleteBotConfig(): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("telegram_bot_config")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "刪除失敗",
    };
  }
}

/**
 * 註冊 Webhook（呼叫 Telegram setWebhook API）。
 */
export async function registerWebhook(
  webhookUrl: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getActiveBotToken();
    if (!token) {
      return { success: false, error: "未設定 Bot Token" };
    }

    // 產生 webhook secret
    const secret =
      process.env.TELEGRAM_WEBHOOK_SECRET ??
      crypto.randomUUID().replace(/-/g, "");

    const res = await telegramRequest(
      `/bot${token}/setWebhook`,
      {
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ["message"],
      },
    );

    if (!res.ok) {
      return { success: false, error: "setWebhook 失敗" };
    }

    // 更新 DB
    const supabase = createAdminClient();
    await supabase
      .from("telegram_bot_config")
      .update({
        webhook_url: webhookUrl,
        webhook_secret: secret,
        webhook_registered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("is_active", true);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Webhook 註冊失敗",
    };
  }
}

/**
 * 取消 Webhook 註冊。
 */
export async function deleteWebhook(): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getActiveBotToken();
    if (!token) {
      return { success: false, error: "未設定 Bot Token" };
    }

    const res = await telegramRequest(`/bot${token}/deleteWebhook`);
    if (!res.ok) {
      return { success: false, error: "deleteWebhook 失敗" };
    }

    // 清除 DB webhook 資訊
    const supabase = createAdminClient();
    await supabase
      .from("telegram_bot_config")
      .update({
        webhook_url: null,
        webhook_secret: null,
        webhook_registered_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("is_active", true);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Webhook 取消失敗",
    };
  }
}

/**
 * 查詢 Webhook 狀態。
 */
export async function getWebhookStatus(): Promise<{
  connected: boolean;
  info?: WebhookInfo;
  error?: string;
}> {
  try {
    const token = await getActiveBotToken();
    if (!token) {
      return { connected: false, error: "未設定 Bot Token" };
    }

    const res = await telegramRequest<WebhookInfo>(
      `/bot${token}/getWebhookInfo`,
    );

    if (!res.ok || !res.result) {
      return { connected: false, error: "無法取得 Webhook 資訊" };
    }

    return {
      connected: !!res.result.url,
      info: res.result,
    };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : "查詢失敗",
    };
  }
}
