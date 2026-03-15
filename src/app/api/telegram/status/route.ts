import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getTelegramStatus } from "@/lib/telegram/link";

/**
 * GET /api/telegram/status
 * 查詢用戶的 Telegram 綁定狀態（需登入）
 * 同時回傳 Bot username 供前端顯示連結
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "未登入" }, { status: 401 });
    }

    const status = await getTelegramStatus(user.id);

    // 取得 Bot username 供前端顯示
    const admin = createAdminClient();
    const { data: botConfig } = await admin
      .from("telegram_bot_config")
      .select("bot_username")
      .eq("is_active", true)
      .maybeSingle();

    return Response.json({
      ...status,
      botUsername: botConfig?.bot_username ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "查詢狀態失敗";
    return Response.json({ error: message }, { status: 500 });
  }
}
