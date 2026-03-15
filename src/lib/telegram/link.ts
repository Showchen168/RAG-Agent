import { createAdminClient } from "@/lib/supabase/server";

// ========== 常數 ==========
const CODE_PREFIX = "NM-";
const CODE_LENGTH = 6;
const CODE_EXPIRY_MINUTES = 10;
const CLEANUP_THRESHOLD_HOURS = 1;

// 排除容易混淆的字元：0, 1, O, I, L
const ALLOWED_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// ========== 綁定碼格式驗證 ==========
const CODE_PATTERN = /^NM-[A-HJ-KM-NP-Z2-9]{6}$/;

// ========== 核心函數 ==========

/**
 * 產生隨機綁定碼（NM-XXXXXX）
 * 字元集：A-Z + 2-9，排除 O/0/I/1/L 避免混淆
 */
export function generateRandomCode(): string {
  const chars: string[] = [];
  for (let i = 0; i < CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * ALLOWED_CHARS.length);
    chars.push(ALLOWED_CHARS[randomIndex]);
  }
  return `${CODE_PREFIX}${chars.join("")}`;
}

/**
 * 為用戶產生綁定碼。若已有未過期碼則直接返回。
 * 同時附帶清理該用戶超過 1 小時的舊碼。
 */
export async function createLinkCode(
  userId: string,
): Promise<{ code: string; expires_at: string }> {
  const supabase = createAdminClient();

  // 1. 檢查是否已有未過期、未使用的碼
  const { data: existing } = await supabase
    .from("telegram_link_codes")
    .select("code, expires_at")
    .eq("user_id", userId)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { code: existing.code, expires_at: existing.expires_at };
  }

  // 2. 清理該用戶超過 1 小時的舊碼（KISS，免 cron）
  const cleanupThreshold = new Date(
    Date.now() - CLEANUP_THRESHOLD_HOURS * 60 * 60 * 1000,
  ).toISOString();

  await supabase
    .from("telegram_link_codes")
    .delete()
    .eq("user_id", userId)
    .lt("created_at", cleanupThreshold);

  // 3. 產生新碼
  const code = generateRandomCode();
  const expiresAt = new Date(
    Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000,
  ).toISOString();

  const { data: newCode } = await supabase
    .from("telegram_link_codes")
    .insert({
      code,
      user_id: userId,
      expires_at: expiresAt,
    })
    .select("code, expires_at")
    .single();

  if (!newCode) {
    throw new Error("建立綁定碼失敗");
  }

  return { code: newCode.code, expires_at: newCode.expires_at };
}

/**
 * 驗證綁定碼並完成帳號綁定。
 * 將 telegram_users.user_id 指向真實帳號。
 */
export async function verifyAndLink(
  code: string,
  chatId: number,
): Promise<{ success: boolean; userId?: string; error?: string }> {
  // 1. 格式驗證
  if (!CODE_PATTERN.test(code)) {
    return { success: false, error: "綁定碼格式不正確" };
  }

  const supabase = createAdminClient();

  // 2. 查找綁定碼
  const { data: linkCode } = await supabase
    .from("telegram_link_codes")
    .select("id, code, user_id, expires_at, used")
    .eq("code", code)
    .maybeSingle();

  if (!linkCode) {
    return { success: false, error: "綁定碼無效或不存在" };
  }

  // 3. 檢查是否已使用
  if (linkCode.used) {
    return { success: false, error: "此綁定碼已使用" };
  }

  // 4. 檢查是否過期
  if (new Date(linkCode.expires_at) < new Date()) {
    return { success: false, error: "綁定碼已過期，請重新產生" };
  }

  // 5. 標記碼為已使用
  await supabase
    .from("telegram_link_codes")
    .update({
      used: true,
      used_at: new Date().toISOString(),
      used_by_chat_id: chatId,
    })
    .eq("id", linkCode.id);

  // 6. Upsert telegram_users：將 user_id 指向真實帳號
  await supabase.from("telegram_users").upsert(
    {
      telegram_chat_id: chatId,
      user_id: linkCode.user_id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "telegram_chat_id" },
  );

  return { success: true, userId: linkCode.user_id };
}

/**
 * 查詢用戶的 Telegram 綁定狀態。
 */
export async function getTelegramStatus(userId: string): Promise<{
  linked: boolean;
  telegramChatId?: number;
  telegramUsername?: string;
  telegramFirstName?: string;
}> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("telegram_users")
    .select("telegram_chat_id, telegram_username, telegram_first_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    return { linked: false };
  }

  return {
    linked: true,
    telegramChatId: data.telegram_chat_id,
    telegramUsername: data.telegram_username ?? undefined,
    telegramFirstName: data.telegram_first_name ?? undefined,
  };
}

/**
 * 解除 Telegram 帳號綁定。
 * 刪除 telegram_users 中的映射記錄。
 */
export async function unlinkTelegram(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  // 1. 檢查是否有綁定
  const { data: existing } = await supabase
    .from("telegram_users")
    .select("id, telegram_chat_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    return { success: false, error: "目前未綁定 Telegram 帳號" };
  }

  // 2. 刪除映射（而非 soft delete，保持簡潔）
  await supabase
    .from("telegram_users")
    .delete()
    .eq("user_id", userId);

  return { success: true };
}
