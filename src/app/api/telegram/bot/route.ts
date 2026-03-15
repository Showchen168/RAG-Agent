import { createClient } from "@/lib/supabase/server";
import {
  verifyBotToken,
  saveBotConfig,
  getBotConfig,
  deleteBotConfig,
  getWebhookStatus,
} from "@/lib/telegram/bot-config";

/**
 * GET /api/telegram/bot
 * 讀取 Bot 設定（Token 遮罩化）+ Webhook 狀態
 *
 * 安全設計：不同使用者訪問時，只回傳提示，不刪除任何資料。
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

    const config = await getBotConfig();

    // 若 Bot config 屬於其他使用者 → 回傳提示，不刪除任何資料
    if (config && config.configured_by && config.configured_by !== user.id) {
      return Response.json({ config: null, webhook: null, owned_by_other: true });
    }

    const webhookStatus = config ? await getWebhookStatus() : null;

    return Response.json({
      config,
      webhook: webhookStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "查詢失敗";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/telegram/bot
 * 驗證並儲存 Bot Token
 * Body: { token: string }
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "未登入" }, { status: 401 });
    }

    const body = (await req.json()) as { token?: string };
    const token = body.token?.trim();

    if (!token) {
      return Response.json({ error: "請提供 Bot Token" }, { status: 400 });
    }

    // 驗證 Token
    const verification = await verifyBotToken(token);
    if (!verification.ok || !verification.bot) {
      return Response.json(
        { error: verification.error ?? "Token 無效" },
        { status: 400 },
      );
    }

    // 儲存到 DB
    const saveResult = await saveBotConfig(token, verification.bot, user.id);
    if (!saveResult.success) {
      return Response.json(
        { error: saveResult.error ?? "儲存失敗" },
        { status: 500 },
      );
    }

    return Response.json({
      success: true,
      bot: {
        id: verification.bot.id,
        username: verification.bot.username,
        first_name: verification.bot.first_name,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "設定失敗";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/telegram/bot
 * 刪除 Bot 設定
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

    const result = await deleteBotConfig();
    if (!result.success) {
      return Response.json(
        { error: result.error ?? "刪除失敗" },
        { status: 500 },
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "刪除失敗";
    return Response.json({ error: message }, { status: 500 });
  }
}
