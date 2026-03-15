import { createAdminClient } from "@/lib/supabase/server";

/** 閒置超過 30 分鐘自動建立新對話 */
export const AUTO_NEW_SESSION_IDLE_MS = 30 * 60 * 1000;

/**
 * 驗證 Telegram Webhook Secret Token。
 * 優先從 DB 讀取（bot-config 設定的 webhook_secret），
 * fallback 到 TELEGRAM_WEBHOOK_SECRET 環境變數。
 * 若兩者皆未設定，視為開發模式，允許所有請求。
 */
export async function verifyWebhookSecret(
  headerValue: string | undefined | null,
): Promise<boolean> {
  // 1. 嘗試從 DB 讀取
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("telegram_bot_config")
      .select("webhook_secret")
      .eq("is_active", true)
      .maybeSingle();

    if (data?.webhook_secret) {
      return headerValue === data.webhook_secret;
    }
  } catch {
    // DB 讀取失敗，fallback
  }

  // 2. Fallback to env var
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true;
  return headerValue === secret;
}

interface TelegramUserMapping {
  userId: string;
  conversationId: string;
}

/**
 * 根據 Telegram chat.id 查找或建立 NexusMind 用戶。
 * 首次使用會自動建立：Auth User → Profile → Conversation → telegram_users 映射。
 */
export async function getOrCreateTelegramUser(
  chatId: number,
  firstName?: string,
  username?: string,
): Promise<TelegramUserMapping> {
  const supabase = createAdminClient();

  // 1. 查找已有映射
  const { data: existing } = await supabase
    .from("telegram_users")
    .select("user_id, default_conversation_id, last_message_at")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (existing?.user_id) {
    let conversationId = existing.default_conversation_id;

    // 閒置超時 → 自動建立新對話（確保每次新話題有獨立上下文）
    const isIdle =
      conversationId &&
      existing.last_message_at &&
      Date.now() - new Date(existing.last_message_at).getTime() >
        AUTO_NEW_SESSION_IDLE_MS;

    if (!conversationId || isIdle) {
      if (!conversationId) {
        // 有綁定但缺預設對話 → 查找已有對話
        const { data: existingConv } = await supabase
          .from("conversations")
          .select("id")
          .eq("user_id", existing.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingConv) {
          conversationId = existingConv.id;
        }
      }

      // 無對話或閒置超時 → 建立新對話
      if (!conversationId || isIdle) {
        const { data: newConv, error: convError } = await supabase
          .from("conversations")
          .insert({
            user_id: existing.user_id,
            title: isIdle ? "Telegram 新對話" : "Telegram 對話",
            model: "gemini-flash",
          })
          .select("id")
          .single();

        if (convError || !newConv) {
          throw new Error(
            `Failed to create conversation: ${convError?.message}`,
          );
        }
        conversationId = newConv.id;
      }
    }

    // 更新映射（補齊 default_conversation_id + 最後訊息時間）
    await supabase
      .from("telegram_users")
      .update({
        default_conversation_id: conversationId,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("telegram_chat_id", chatId);

    return {
      userId: existing.user_id,
      conversationId,
    };
  }

  // 2. 建立或查找 Auth 用戶（無綁定時的 fallback）
  const displayName = firstName ?? `Telegram User ${chatId}`;
  const email = `telegram_${chatId}@nexusmind.bot`;
  const password = crypto.randomUUID();

  let userId: string;

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        source: "telegram_bot",
      },
    });

  if (authError) {
    // Auth 用戶已存在（競態條件或部分建立）→ 搜尋既有用戶
    const { data: listData } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 500,
    });
    const existingUser = listData?.users?.find((u) => u.email === email);
    if (!existingUser) {
      throw new Error(`Failed to create Telegram user: ${authError.message}`);
    }
    userId = existingUser.id;
  } else {
    userId = authData.user.id;
  }

  // 3. 建立 Profile（upsert 避免重複）
  await supabase.from("profiles").upsert({
    id: userId,
    display_name: displayName,
    preferred_model: "gemini-flash",
  });

  // 4. 查找或建立預設 Conversation
  // 先檢查是否已有該用戶的 Conversation（避免競態條件重複建立）
  const { data: existingConv } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId: string;

  if (existingConv) {
    conversationId = existingConv.id;
  } else {
    const { data: newConv, error: convError } = await supabase
      .from("conversations")
      .insert({
        user_id: userId,
        title: "Telegram 對話",
        model: "gemini-flash",
      })
      .select("id")
      .single();

    if (convError || !newConv) {
      throw new Error(`Failed to create conversation: ${convError?.message}`);
    }
    conversationId = newConv.id;
  }

  // 5. 建立 telegram_users 映射
  await supabase.from("telegram_users").upsert({
    telegram_chat_id: chatId,
    telegram_username: username,
    telegram_first_name: firstName,
    user_id: userId,
    default_conversation_id: conversationId,
    last_message_at: new Date().toISOString(),
  });

  return { userId, conversationId };
}
