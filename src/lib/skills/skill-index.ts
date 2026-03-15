/**
 * Skill Index — 技能索引管理器
 * 負責生成輕量的技能索引文字，注入 systemPrompt
 * 不包含完整的 prompt_template 或 skill_md，只有名稱 + 描述
 */

/** 技能索引條目（輕量格式） */
export interface SkillIndexEntry {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
}

/**
 * 從 DB skills 表的資料建立索引條目
 */
export function toSkillIndexEntry(skill: {
  readonly name: string;
  readonly display_name: string;
  readonly description: string;
}): SkillIndexEntry {
  return {
    name: skill.name,
    displayName: skill.display_name,
    description: skill.description,
  };
}

/**
 * 建立技能索引文字，注入 systemPrompt
 *
 * 格式：
 * [AVAILABLE SKILLS INDEX]
 * 以下是你可以使用的技能列表。當需要使用某個技能時，
 * 在回覆中輸出 [LOAD_SKILL: skill-name] 標記來載入完整技能內容。
 *
 * 1. docx-generator (Word 文件產生器): 產生 Word 文件
 *    → 載入指令: [LOAD_SKILL: docx-generator]
 * ...
 */
export function buildSkillsIndexText(
  skills: ReadonlyArray<SkillIndexEntry>,
): string {
  if (skills.length === 0) return "";

  const header = `[AVAILABLE SKILLS INDEX]
You have access to the following skills. When the user's request requires a specific skill,
output [LOAD_SKILL: skill-name] in your response to load the full skill content.
Only load a skill when it is directly relevant to the user's request.
Do NOT mention the [LOAD_SKILL: ...] marker in visible text to the user — it is an internal directive.

Available skills:`;

  const entries = skills.map(
    (skill, idx) =>
      `${idx + 1}. ${skill.name} (${skill.displayName}): ${skill.description}\n   → Load: [LOAD_SKILL: ${skill.name}]`,
  );

  return `${header}\n${entries.join("\n")}`;
}
