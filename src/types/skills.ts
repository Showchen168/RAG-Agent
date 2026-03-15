/**
 * Skills System Type Definitions
 * 技能系統的 TypeScript 型別定義
 */

/** 技能分類 */
export type SkillCategory = "document" | "data" | "creative" | "utility";

/** 技能輸入類型 */
export type SkillInputType = "context" | "user" | "both";

/** 預覽格式 */
export type SkillPreviewFormat = "markdown" | "plaintext" | "image";

/** skill.json 的 input 區段 */
export interface SkillInputConfig {
  readonly type: SkillInputType;
  readonly userInputLabel?: string;
}

/** skill.json 的 output 區段 */
export interface SkillOutputConfig {
  readonly fileType: string;
  readonly mimeType: string;
  readonly previewFormat: SkillPreviewFormat;
}

/** skill.json 的 runtime 區段 */
export interface SkillRuntimeConfig {
  readonly baseImage: string;
  readonly timeout: number;
  readonly maxMemory: string;
}

/** skill.json 完整結構 */
export interface SkillConfig {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;
  readonly category: SkillCategory;
  readonly version?: string;
  readonly input: SkillInputConfig;
  readonly output: SkillOutputConfig;
  readonly runtime: SkillRuntimeConfig;
}

/** DB skills 表 row */
export interface Skill {
  readonly id: string;
  readonly user_id: string;
  readonly name: string;
  readonly display_name: string;
  readonly description: string;
  readonly icon: string;
  readonly category: SkillCategory;
  readonly version: string;
  readonly skill_md: string;
  readonly skill_config: SkillConfig;
  readonly storage_path: string;
  readonly is_system: boolean;
  readonly is_enabled: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

/** DB skill_attachments 表 row */
export interface SkillAttachment {
  readonly id: string;
  readonly message_id: string;
  readonly skill_id: string;
  readonly file_name: string;
  readonly file_type: string;
  readonly mime_type: string;
  readonly file_size: number;
  readonly storage_path: string;
  readonly preview_content: string | null;
  readonly created_at: string;
}

// ─── Clarification (Multi-turn) Types ────────────────

/** 釐清問題型別 */
export type ClarificationQuestionType = "text" | "select" | "multiselect";

/** 單一釐清問題 */
export interface ClarificationQuestion {
  readonly id: string;
  readonly question: string;
  readonly type: ClarificationQuestionType;
  readonly options?: ReadonlyArray<string>;
  readonly placeholder?: string;
}

/** 使用者對釐清問題的回答 */
export interface ClarificationAnswer {
  readonly questionId: string;
  readonly question: string;
  readonly answer: string;
}

/** SkillInputDialog 的三階段 */
export type SkillDialogPhase = "initial" | "clarifying" | "submitting";

// ─── Skill Generator Types ──────────────────────────

/** Gemini 生成的 skill config（前端可編輯欄位） */
export interface GeneratedSkillConfig {
  readonly display_name: string;
  readonly description: string;
  readonly prompt_template: string;
  readonly category: SkillCategory;
  readonly icon: string;
  readonly input_type: SkillInputType;
}

/** 檔案載入結果 */
export interface LoadedFileResult {
  readonly fileName: string;
  readonly fileType: "json" | "markdown" | "text";
  readonly content: string;
  /** JSON 檔案解析後的 skill config（若適用） */
  readonly parsedConfig?: GeneratedSkillConfig;
}

// ─── ZIP Types ──────────────────────────────────────

/** ZIP 解析結果 */
export interface ParsedSkillPackage {
  readonly skillConfig: SkillConfig;
  readonly skillMd: string;
  readonly scriptsEntries: ReadonlyArray<{
    readonly path: string;
    readonly content: Buffer;
  }>;
}
