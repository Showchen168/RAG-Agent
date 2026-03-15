/**
 * Skills Execute API Handler - Pure Function
 * POST /api/skills/execute 的核心邏輯
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createRawClient } from "@supabase/supabase-js";
import type { Skill, ClarificationAnswer } from "@/types/skills";
import { executeSkill, type SkillExecutionResult } from "./executor";

interface ApiResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export interface ExecuteSkillPayload {
  readonly skillId: string;
  readonly conversationId?: string;
  readonly messageId?: string;
  readonly messageHistory?: ReadonlyArray<string>;
  readonly userInput?: string;
  /** 使用者訊息文字（持久化到 messages 表） */
  readonly userMessageContent?: string;
  /** 釐清問題的回答（多輪釐清功能） */
  readonly clarificationAnswers?: ReadonlyArray<ClarificationAnswer>;
}

/** 取得 admin client（繞過 RLS） */
function getAdminClient(supabase: SupabaseClient): SupabaseClient {
  if (
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ) {
    return createRawClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  }
  return supabase;
}

/**
 * POST /api/skills/execute 的純函式處理器
 * @param supabase - Supabase client（已認證）
 * @param payload - 執行請求參數
 * @returns API 回應（status + body）
 */
export async function handleExecuteSkill(
  supabase: SupabaseClient,
  payload: ExecuteSkillPayload,
): Promise<ApiResult> {
  const t0 = Date.now();
  console.log("[SkillExecute] === START ===", {
    skillId: payload.skillId,
    hasInput: Boolean(payload.userInput),
    hasHistory: Boolean(payload.messageHistory?.length),
  });

  // 1. Auth check（用一般 client 驗證身分）
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    console.log("[SkillExecute] Auth failed:", authError?.message);
    return { status: 401, body: { error: "Unauthorized" } };
  }
  console.log("[SkillExecute] Auth OK, userId:", user.id, `(+${Date.now() - t0}ms)`);

  // 2. Validate skillId
  if (!payload.skillId) {
    return { status: 400, body: { error: "Missing skillId" } };
  }

  // 使用 admin client 繞過 RLS（技能 / 訊息 / 附件表都需要）
  const adminClient = getAdminClient(supabase);

  // 3. 從 DB 讀取技能（系統級，不篩選 user_id）
  const { data: skill, error: fetchError } = await adminClient
    .from("skills")
    .select("*")
    .eq("id", payload.skillId)
    .single();

  if (fetchError || !skill) {
    return { status: 404, body: { error: "Skill not found" } };
  }

  const typedSkill = skill as unknown as Skill;

  // 檢查用戶的偏好設定（優先於全域預設）
  const { data: pref } = await adminClient
    .from("user_skill_preferences")
    .select("is_enabled")
    .eq("user_id", user.id)
    .eq("skill_id", payload.skillId)
    .single();

  const isEnabled = pref ? pref.is_enabled : typedSkill.is_enabled;
  if (!isEnabled) {
    return { status: 400, body: { error: "Skill is disabled" } };
  }

  // 4. 驗證輸入：根據 input type 檢查必要輸入
  const inputType = typedSkill.skill_config.input.type;
  const hasUserInput = Boolean(payload.userInput?.trim());
  const hasContext = Boolean(payload.messageHistory?.length);

  if (inputType === "user" && !hasUserInput) {
    return {
      status: 400,
      body: { error: "User input is required for this skill" },
    };
  }

  if (inputType === "context" && !hasContext) {
    return {
      status: 400,
      body: { error: "Conversation context is required for this skill" },
    };
  }

  if (inputType === "both" && !hasUserInput && !hasContext) {
    return {
      status: 400,
      body: { error: "Either user input or conversation context is required" },
    };
  }

  // 5. 持久化訊息到 DB（如果有 conversationId）— 使用 admin client
  const messageId = payload.messageId ?? crypto.randomUUID();
  const conversationId = payload.conversationId;

  if (conversationId && payload.userMessageContent?.trim()) {
    await adminClient.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: payload.userMessageContent,
    });
  }

  // 先插入 assistant 訊息佔位（確保 skill_attachments FK 參照有效）
  if (conversationId) {
    await adminClient.from("messages").insert({
      id: messageId,
      conversation_id: conversationId,
      role: "assistant",
      content: "",
    });
  }

  // 6. 執行技能（傳入 admin client）
  console.log("[SkillExecute] Starting executeSkill...", `(+${Date.now() - t0}ms)`);
  try {
    const result: SkillExecutionResult = await executeSkill(adminClient, {
      skill: typedSkill,
      messageId,
      userInput: payload.userInput,
      messageHistory: payload.messageHistory,
      clarificationAnswers: payload.clarificationAnswers,
      userId: user.id,
    });

    const elapsed = Date.now() - t0;
    console.log("[SkillExecute] executeSkill completed", {
      elapsed: `${elapsed}ms`,
      hasAttachment: Boolean(result.attachment),
      messageLen: result.message.length,
    });

    // 更新 assistant 訊息的實際內容
    if (conversationId) {
      await adminClient
        .from("messages")
        .update({ content: result.message })
        .eq("id", messageId);
    }

    console.log("[SkillExecute] === SUCCESS ===", `total: ${Date.now() - t0}ms`);
    return {
      status: 200,
      body: {
        message: result.message,
        attachment: result.attachment ?? null,
      },
    };
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error("[SkillExecute] === ERROR ===", `after ${elapsed}ms:`, err);
    if (conversationId) {
      await adminClient
        .from("messages")
        .update({ content: "（技能執行失敗）" })
        .eq("id", messageId);
    }
    const message =
      err instanceof Error ? err.message : "Skill execution failed";
    return { status: 500, body: { error: message } };
  }
}
