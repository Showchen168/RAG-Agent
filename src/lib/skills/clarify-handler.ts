/**
 * Skills Clarify API Handler - Pure Function
 * POST /api/skills/clarify 的核心邏輯
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Skill, ClarificationQuestion } from "@/types/skills";
import { generateClarificationQuestions } from "./clarification-generator";

interface ApiResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export interface ClarifySkillPayload {
  readonly skillId: string;
  readonly userInput: string;
}

/**
 * POST /api/skills/clarify 的純函式處理器
 * @param supabase - Supabase client（已認證）
 * @param payload - 請求參數
 * @returns API 回應（status + body）
 */
export async function handleClarifySkill(
  supabase: SupabaseClient,
  payload: ClarifySkillPayload,
): Promise<ApiResult> {
  // 1. Auth check
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  // 2. Validate
  if (!payload.skillId) {
    return { status: 400, body: { error: "Missing skillId" } };
  }
  if (!payload.userInput?.trim()) {
    return { status: 400, body: { error: "Missing userInput" } };
  }

  // 3. 從 DB 讀取技能（系統級，不篩選 user_id）
  const { data: skill, error: fetchError } = await supabase
    .from("skills")
    .select("*")
    .eq("id", payload.skillId)
    .single();

  if (fetchError || !skill) {
    return { status: 404, body: { error: "Skill not found" } };
  }

  const typedSkill = skill as unknown as Skill;

  // 檢查用戶的偏好設定（優先於全域預設）
  const { data: pref } = await supabase
    .from("user_skill_preferences")
    .select("is_enabled")
    .eq("user_id", user.id)
    .eq("skill_id", payload.skillId)
    .single();

  const isEnabled = pref ? pref.is_enabled : typedSkill.is_enabled;
  if (!isEnabled) {
    return { status: 400, body: { error: "Skill is disabled" } };
  }

  // 4. 呼叫 Gemini 產生釐清問題
  try {
    const questions: ReadonlyArray<ClarificationQuestion> =
      await generateClarificationQuestions(typedSkill, payload.userInput);

    return {
      status: 200,
      body: { questions },
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to generate clarification questions";
    return { status: 500, body: { error: message } };
  }
}
