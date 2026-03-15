import { type ModelMessage } from "ai";
import { TelegramUpdateSchema } from "@/lib/telegram/types";
import {
  verifyWebhookSecret,
  getOrCreateTelegramUser,
} from "@/lib/telegram/auth";
import { sendMessage, sendChatAction } from "@/lib/telegram/bot";
import { verifyAndLink } from "@/lib/telegram/link";
import { generateTextNative } from "@/lib/ai/providers";
import { createAdminClient } from "@/lib/supabase/server";
import { executeAdaptiveRAG } from "@/lib/rag/adaptive-rag";
import {
  truncateContext,
  MAX_CONTEXT_CHARS_TELEGRAM,
} from "@/lib/rag/context-truncation";
import { DEFAULT_PERSONA } from "@/lib/crayon/prompts";
import { formatCitationsForTelegram } from "@/lib/chat/format-citations";

export const maxDuration = 120;

// 固定回傳 200 的 helper（避免 Telegram retry storms）
function ok() {
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  try {
    // 1. 驗證 Webhook Secret
    const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
    if (!(await verifyWebhookSecret(secretHeader))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. 解析 Telegram Update
    const body = await req.json();
    const parsed = TelegramUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return ok();
    }

    const update = parsed.data;
    const message = update.message;

    // 3. 忽略非文字訊息 & 非私聊
    if (!message?.text || message.chat.type !== "private") {
      return ok();
    }

    const chatId = message.chat.id;
    const userText = message.text.trim();

    // 4. 忽略空訊息
    if (!userText) {
      return ok();
    }

    // 5. 處理 /start 指令（含 deep link 綁定）
    if (userText === "/start") {
      await sendMessage(
        chatId,
        "歡迎使用 NexusMind！\n\n直接傳送文字訊息，我會用 AI + 知識庫來回覆你。\n\n**可用指令：**\n/newchat - 開始新對話\n/link <綁定碼> - 綁定 NexusMind 帳號\n/unlink - 解除帳號綁定",
      );
      return ok();
    }

    // 5a. Deep Link 綁定 (/start link_CODE)
    if (userText.startsWith("/start link_")) {
      const code = userText.replace("/start link_", "").trim();
      await sendChatAction(chatId);
      if (!code) {
        await sendMessage(chatId, "綁定碼不能為空。");
        return ok();
      }
      const linkResult = await verifyAndLink(code, chatId);
      if (linkResult.success) {
        await sendMessage(
          chatId,
          "帳號綁定成功！現在你可以透過 Telegram 存取你的 NexusMind 知識庫了。",
        );
      } else {
        await sendMessage(chatId, `綁定失敗：${linkResult.error}`);
      }
      return ok();
    }

    // 5b. 手動綁定 (/link CODE)
    if (userText.startsWith("/link")) {
      const code = userText.replace("/link", "").trim();
      await sendChatAction(chatId);
      if (!code) {
        await sendMessage(
          chatId,
          "請提供綁定碼。\n\n用法：/link NM-XXXXXX\n\n在 NexusMind 設定頁的「整合服務」產生綁定碼。",
        );
        return ok();
      }
      const linkResult = await verifyAndLink(code, chatId);
      if (linkResult.success) {
        await sendMessage(
          chatId,
          "帳號綁定成功！現在你可以透過 Telegram 存取你的 NexusMind 知識庫了。",
        );
      } else {
        await sendMessage(chatId, `綁定失敗：${linkResult.error}`);
      }
      return ok();
    }

    // 5c. 解除綁定 (/unlink)
    if (userText === "/unlink") {
      await sendChatAction(chatId);
      const supabaseAdmin = createAdminClient();
      const { data: binding } = await supabaseAdmin
        .from("telegram_users")
        .select("id")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();
      if (!binding) {
        await sendMessage(chatId, "目前沒有綁定任何 NexusMind 帳號。");
      } else {
        await supabaseAdmin
          .from("telegram_users")
          .delete()
          .eq("telegram_chat_id", chatId);
        await sendMessage(
          chatId,
          "已解除帳號綁定。下次傳送訊息時會自動建立臨時帳號。使用 /link 可重新綁定。",
        );
      }
      return ok();
    }

    // 6. 顯示「正在輸入」
    await sendChatAction(chatId);

    // 7. 取得/建立用戶映射
    const { userId, conversationId } = await getOrCreateTelegramUser(
      chatId,
      message.from?.first_name,
      message.from?.username,
    );

    const supabase = createAdminClient();

    // 7.5 讀取用戶偏好模型 + 顯示名稱
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferred_model, display_name")
      .eq("id", userId)
      .maybeSingle();
    const userModel = (profile?.preferred_model as "gemini-pro" | "gemini-flash" | "gemini-flash-lite") ?? "gemini-flash";

    // 8. 處理 /newchat 指令
    if (userText === "/newchat") {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          title: "Telegram 新對話",
          model: userModel,
        })
        .select("id")
        .single();

      if (newConv) {
        await supabase
          .from("telegram_users")
          .update({
            default_conversation_id: newConv.id,
            updated_at: new Date().toISOString(),
          })
          .eq("telegram_chat_id", chatId);

        await sendMessage(chatId, "已建立新對話！請開始提問。");
      }

      return ok();
    }

    // 9. 存入用戶訊息
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: userText,
    });

    // 10. 載入對話歷史（最近 10 則，取最新的再反轉為時間順序）
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(10);

    const messages: ModelMessage[] = (history ?? []).reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // 11. 執行 Adaptive RAG
    let knowledgeContext = "";
    let ragCitations: string[] = [];
    try {
      const ragResult = await executeAdaptiveRAG({
        userQuery: userText,
        conversationHistory: messages,
        userId,
        supabase,
      });

      console.info("[Telegram RAG]", {
        method: ragResult?.retrievalMethod,
        docs: ragResult?.relevantDocIds?.length ?? 0,
        citations: ragResult?.citationTitles,
        ctxLen: ragResult?.knowledgeContext?.length ?? 0,
        score: ragResult?.metadata?.relevanceScore,
      });

      if (ragResult?.knowledgeContext) {
        knowledgeContext = truncateContext(
          ragResult.knowledgeContext,
          MAX_CONTEXT_CHARS_TELEGRAM,
        );
        ragCitations = ragResult.citationTitles ?? [];
      }
    } catch (ragError) {
      console.error(
        "[Telegram RAG] FAILED:",
        ragError instanceof Error ? ragError.message : ragError,
      );
    }

    // 12. 組建 System Prompt
    const now = new Date();
    const dateStr = now.toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Taipei",
    });

    const systemPrompt = [
      `[SYSTEM DATE] 今天是 ${dateStr}。`,
      "",
      DEFAULT_PERSONA.systemPrompt,
      "",
      "Telegram 平台注意事項:",
      "- 回覆盡量控制在 2000 字元以內，適合手機閱讀",
      "- Telegram 支援 **粗體**、`程式碼`、```程式碼區塊```",
      "- 不支援 Markdown 標題（#）和表格，改用條列和粗體",
      knowledgeContext ? `\n知識庫參考資料:\n${knowledgeContext}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    // 13. 呼叫 Gemini API（原生 HTTP，繞過 Vercel AI SDK 的 Docker 空回應 bug）
    console.info("[Telegram LLM] model:", userModel, "systemPrompt length:", systemPrompt.length);
    let aiResponse = "";
    const MAX_LLM_RETRIES = 2;
    for (let attempt = 0; attempt < MAX_LLM_RETRIES; attempt++) {
      try {
        const plainMessages = messages.map((m) => ({
          role: String(m.role),
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        }));
        const result = await generateTextNative({
          model: userModel,
          systemPrompt,
          messages: plainMessages,
          maxOutputTokens: 8192,
        });
        aiResponse = result.text;
        console.info("[Telegram LLM]", {
          attempt,
          responseLen: aiResponse?.length ?? 0,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
        if (aiResponse) break;
        console.warn(`[Telegram LLM] Empty response on attempt ${attempt + 1}, retrying...`);
      } catch (llmError) {
        console.error(
          "[Telegram LLM] FAILED:",
          llmError instanceof Error ? llmError.message : llmError,
        );
        break;
      }
    }

    // 14. 存入 AI 回覆（空回覆不寫入，避免污染對話歷史）
    if (aiResponse) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: aiResponse,
      });
    }

    // 15. 發送回覆到 Telegram（附帶 RAG 引用來源）
    let reply = aiResponse || "抱歉，我無法生成回覆。請再試一次。";
    reply += formatCitationsForTelegram(ragCitations);
    await sendMessage(chatId, reply);

    return ok();
  } catch (error) {
    // 記錄錯誤但固定回傳 200，防止 Telegram 瘋狂重試
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[Telegram Webhook] Error:", errMsg);
    return ok();
  }
}
