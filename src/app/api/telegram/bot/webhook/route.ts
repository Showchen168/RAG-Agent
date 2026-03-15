import { createClient } from "@/lib/supabase/server";
import {
  registerWebhook,
  deleteWebhook,
  getWebhookStatus,
} from "@/lib/telegram/bot-config";

/**
 * POST /api/telegram/bot/webhook
 * 註冊 Webhook
 * Body: { webhookUrl?: string }
 * 若未提供 webhookUrl，自動從 request headers 推斷
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

    const body = (await req.json()) as { webhookUrl?: string };
    let webhookUrl = body.webhookUrl?.trim();

    // 自動偵測 webhook URL
    if (!webhookUrl) {
      const host = req.headers.get("host");
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      if (host) {
        webhookUrl = `${proto}://${host}/api/telegram/webhook`;
      }
    }

    if (!webhookUrl) {
      return Response.json(
        { error: "無法偵測 Webhook URL，請手動輸入" },
        { status: 400 },
      );
    }

    const result = await registerWebhook(webhookUrl);
    if (!result.success) {
      return Response.json(
        { error: result.error ?? "Webhook 註冊失敗" },
        { status: 500 },
      );
    }

    // 查詢狀態確認
    const status = await getWebhookStatus();

    return Response.json({
      success: true,
      webhookUrl,
      status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook 註冊失敗";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/telegram/bot/webhook
 * 取消 Webhook 註冊
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

    const result = await deleteWebhook();
    if (!result.success) {
      return Response.json(
        { error: result.error ?? "Webhook 取消失敗" },
        { status: 500 },
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook 取消失敗";
    return Response.json({ error: message }, { status: 500 });
  }
}
