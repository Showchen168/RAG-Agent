/**
 * Skills System - API Handler Logic
 * 純函式：可被 Next.js route handlers 呼叫，也可被單元測試直接測試
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { parseSkillZip, SkillZipError } from "./zip-parser";
import { MAX_ZIP_SIZE } from "./schemas";
import type { Skill } from "@/types/skills";
import { promises as fs } from "fs";
import path from "path";

interface ApiResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** 取得當前認證使用者，失敗回傳 null */
async function getAuthUser(
  supabase: SupabaseClient,
): Promise<{ id: string } | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { id: user.id };
}

/**
 * GET /api/skills — 取得所有技能（全域共享），合併用戶偏好的 is_enabled
 */
export async function handleGetSkills(
  supabase: SupabaseClient,
): Promise<ApiResult> {
  const user = await getAuthUser(supabase);
  if (!user) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  try {
    // 使用 admin client 查詢所有技能（繞過 RLS 以確保一致性）
    const adminClient = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createRawClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
      : supabase;

    const { data: skills, error } = await adminClient
      .from("skills")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return { status: 500, body: { error: error.message } };
    }

    // 查詢此用戶的偏好設定
    const { data: prefs } = await adminClient
      .from("user_skill_preferences")
      .select("skill_id, is_enabled")
      .eq("user_id", user.id);

    const prefMap = new Map(
      (prefs ?? []).map((p: { skill_id: string; is_enabled: boolean }) => [p.skill_id, p.is_enabled])
    );

    // 合併：用戶偏好 > 技能預設值
    const mergedSkills = (skills ?? []).map((s: Record<string, unknown>) => ({
      ...s,
      is_enabled: prefMap.has(s.id as string)
        ? prefMap.get(s.id as string)
        : s.is_enabled,
    }));

    return { status: 200, body: { skills: mergedSkills } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { status: 500, body: { error: message } };
  }
}

/**
 * POST /api/skills/upload — 上傳 ZIP 技能包
 */
export async function handleUploadSkill(
  supabase: SupabaseClient,
  zipBuffer: Buffer,
  storageBasePath: string,
): Promise<ApiResult> {
  const user = await getAuthUser(supabase);
  if (!user) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  // 驗證 buffer 不為空
  if (!zipBuffer || zipBuffer.length === 0) {
    return { status: 400, body: { error: "No file uploaded" } };
  }

  // 驗證大小
  if (zipBuffer.length > MAX_ZIP_SIZE) {
    return {
      status: 400,
      body: {
        error: `File too large. Maximum size is ${MAX_ZIP_SIZE / 1024 / 1024}MB`,
      },
    };
  }

  // 解析 ZIP
  let parsed;
  try {
    parsed = await parseSkillZip(zipBuffer);
  } catch (err) {
    if (err instanceof SkillZipError) {
      return { status: 400, body: { error: err.message } };
    }
    return { status: 500, body: { error: "Failed to parse skill package" } };
  }

  const { skillConfig, skillMd, scriptsEntries } = parsed;

  // 儲存 scripts 到本地檔案系統
  const skillStoragePath = path.join(
    storageBasePath,
    user.id,
    skillConfig.name,
  );

  try {
    await fs.mkdir(skillStoragePath, { recursive: true });

    for (const entry of scriptsEntries) {
      const entryPath = path.join(skillStoragePath, entry.path);
      const entryDir = path.dirname(entryPath);
      await fs.mkdir(entryDir, { recursive: true });
      await fs.writeFile(entryPath, entry.content);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      status: 500,
      body: { error: `Failed to save skill files: ${message}` },
    };
  }

  // 寫入 DB（upsert：同名技能覆蓋更新）
  try {
    const skillData = {
      user_id: user.id,
      name: skillConfig.name,
      display_name: skillConfig.displayName,
      description: skillConfig.description,
      icon: skillConfig.icon,
      category: skillConfig.category,
      version: skillConfig.version ?? "1.0.0",
      skill_md: skillMd,
      skill_config: skillConfig,
      storage_path: skillStoragePath,
      is_system: false,
      is_enabled: true,
      updated_at: new Date().toISOString(),
    };

    const { data: skill, error } = await supabase
      .from("skills")
      .upsert(skillData, { onConflict: "user_id,name" })
      .select()
      .single();

    if (error) {
      return { status: 500, body: { error: error.message } };
    }

    return { status: 200, body: { skill } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { status: 500, body: { error: message } };
  }
}

/**
 * PATCH /api/skills — 啟用/停用技能（寫入 user_skill_preferences）或重新命名
 */
export async function handlePatchSkill(
  supabase: SupabaseClient,
  payload: { id?: string; is_enabled?: boolean; display_name?: string },
): Promise<ApiResult> {
  const user = await getAuthUser(supabase);
  if (!user) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  if (!payload.id) {
    return { status: 400, body: { error: "Missing skill id" } };
  }

  // 至少要有一個可更新欄位
  if (typeof payload.is_enabled !== "boolean" && typeof payload.display_name !== "string") {
    return { status: 400, body: { error: "Missing updatable field (is_enabled or display_name)" } };
  }

  try {
    const adminClient = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createRawClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
      : supabase;

    // 啟用/停用 → 寫入 user_skill_preferences（per-user 偏好）
    if (typeof payload.is_enabled === "boolean") {
      const { error: prefError } = await adminClient
        .from("user_skill_preferences")
        .upsert(
          {
            user_id: user.id,
            skill_id: payload.id,
            is_enabled: payload.is_enabled,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,skill_id" }
        );

      if (prefError) {
        return { status: 500, body: { error: prefError.message } };
      }
    }

    // 重新命名 → 更新 skills 表（全域生效）
    if (typeof payload.display_name === "string" && payload.display_name.trim()) {
      const { error: renameError } = await adminClient
        .from("skills")
        .update({
          display_name: payload.display_name.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.id);

      if (renameError) {
        return { status: 500, body: { error: renameError.message } };
      }
    }

    // 回傳最新的技能資料（含用戶偏好）
    const { data: skill, error: fetchError } = await adminClient
      .from("skills")
      .select("*")
      .eq("id", payload.id)
      .single();

    if (fetchError) {
      return { status: 500, body: { error: fetchError.message } };
    }

    // 合併用戶偏好
    const { data: pref } = await adminClient
      .from("user_skill_preferences")
      .select("is_enabled")
      .eq("user_id", user.id)
      .eq("skill_id", payload.id)
      .single();

    const mergedSkill = {
      ...skill,
      is_enabled: pref ? pref.is_enabled : skill.is_enabled,
    };

    return { status: 200, body: { skill: mergedSkill } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { status: 500, body: { error: message } };
  }
}

/**
 * DELETE /api/skills — 刪除技能
 */
export async function handleDeleteSkill(
  supabase: SupabaseClient,
  skillId: string,
): Promise<ApiResult> {
  const user = await getAuthUser(supabase);
  if (!user) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  if (!skillId) {
    return { status: 400, body: { error: "Missing skill id" } };
  }

  try {
    // 先查詢技能確認存在
    const { data: existingSkill, error: fetchError } = await supabase
      .from("skills")
      .select("id, is_system, storage_path")
      .eq("id", skillId)
      .single();

    if (fetchError || !existingSkill) {
      return { status: 404, body: { error: "Skill not found" } };
    }

    const typedSkill = existingSkill as Pick<
      Skill,
      "id" | "is_system" | "storage_path"
    >;

    // 刪除本地檔案
    if (typedSkill.storage_path) {
      try {
        await fs.rm(typedSkill.storage_path, { recursive: true, force: true });
      } catch {
        // 忽略檔案刪除失敗（可能已不存在）
      }
    }

    // 從 DB 刪除
    // 使用 Admin Client 突破 RLS，避免系統技能因 user_id 不同的權限問題
    const adminClient = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createRawClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
      : supabase;

    const { data: deletedData, error: deleteError } = await adminClient
      .from("skills")
      .delete()
      .eq("id", skillId)
      .select();

    if (deleteError) {
      return { status: 500, body: { error: deleteError.message } };
    }

    if (!deletedData || deletedData.length === 0) {
      return { status: 403, body: { error: "權限不足，無法刪除此技能（可能是系統技能或非您的專屬技能）" } };
    }

    return { status: 200, body: { success: true } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { status: 500, body: { error: message } };
  }
}
