/**
 * Lazy Loader — 技能懶載入協調器
 * 負責按需載入完整技能內容，並建構注入用的 system message
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** 載入後的技能內容（用於注入 system message） */
export interface LoadedSkillContent {
  readonly name: string;
  readonly display_name: string;
  readonly description: string;
  readonly skill_md: string;
}

/** 技能快取介面 */
export interface SkillCache {
  get(name: string): LoadedSkillContent | undefined;
  set(name: string, skill: LoadedSkillContent): void;
  has(name: string): boolean;
  getLoadedNames(): string[];
}

/**
 * 建立技能快取（per-request 或 per-conversation）
 */
export function createSkillCache(): SkillCache {
  const cache = new Map<string, LoadedSkillContent>();

  return {
    get(name: string): LoadedSkillContent | undefined {
      return cache.get(name);
    },
    set(name: string, skill: LoadedSkillContent): void {
      cache.set(name, skill);
    },
    has(name: string): boolean {
      return cache.has(name);
    },
    getLoadedNames(): string[] {
      return Array.from(cache.keys());
    },
  };
}

/**
 * 從 DB 載入完整技能內容
 *
 * @param skillName - 技能名稱（如 "docx-generator"）
 * @param userId - 使用者 ID（用於權限驗證）
 * @param supabase - Supabase client
 * @returns 技能內容，或 null（不存在/無權限/錯誤）
 */
export async function loadSkillContent(
  skillName: string,
  userId: string,
  supabase: SupabaseClient,
): Promise<LoadedSkillContent | null> {
  try {
    const { data, error } = await supabase
      .from("skills")
      .select("name, display_name, description, skill_md")
      .eq("name", skillName)
      .eq("user_id", userId)
      .single();

    if (error || !data) return null;

    return {
      name: data.name,
      display_name: data.display_name,
      description: data.description,
      skill_md: data.skill_md,
    };
  } catch {
    return null;
  }
}

/**
 * 將載入的技能內容組合為可注入的 system message
 *
 * @param skill - 載入的技能內容
 * @returns 注入用的 system message 文字
 */
export function buildSkillSystemMessage(skill: {
  readonly name: string;
  readonly display_name: string;
  readonly description: string;
  readonly skill_md: string;
}): string {
  return `[SKILL LOADED: ${skill.name}]
Skill: ${skill.display_name} — ${skill.description}

${skill.skill_md}

[END SKILL: ${skill.name}]`;
}
