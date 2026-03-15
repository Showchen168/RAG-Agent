import { createClient } from "@/lib/supabase/server";
import { createLinkCode, unlinkTelegram } from "@/lib/telegram/link";

/**
 * POST /api/telegram/link
 * 產生 Telegram 帳號綁定碼（需登入）
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "未登入" }, { status: 401 });
    }

    const result = await createLinkCode(user.id);

    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
    const deepLink = botUsername
      ? `https://t.me/${botUsername}?start=link_${result.code}`
      : null;

    return Response.json({
      code: result.code,
      expires_at: result.expires_at,
      deep_link: deepLink,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "產生綁定碼失敗";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/telegram/link
 * 解除 Telegram 帳號綁定（需登入）
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "未登入" }, { status: 401 });
    }

    const result = await unlinkTelegram(user.id);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "解除綁定失敗";
    return Response.json({ error: message }, { status: 500 });
  }
}
