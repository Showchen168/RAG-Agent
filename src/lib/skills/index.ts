/**
 * Skills System - Public API
 */

export {
  skillConfigSchema,
  MAX_ZIP_SIZE,
  SKILL_CATEGORIES,
  SKILL_INPUT_TYPES,
  SKILL_PREVIEW_FORMATS,
} from "./schemas";

// Lazy Loading exports
export { buildSkillsIndexText, toSkillIndexEntry } from "./skill-index";
export type { SkillIndexEntry } from "./skill-index";
export {
  detectSkillLoadRequest,
  stripSkillLoadMarkers,
  LOAD_SKILL_PATTERN,
} from "./stream-detector";
export {
  loadSkillContent,
  buildSkillSystemMessage,
  createSkillCache,
} from "./lazy-loader";
export type { LoadedSkillContent, SkillCache } from "./lazy-loader";
export type { SkillConfigInput, SkillConfigOutput } from "./schemas";
export { parseSkillZip, SkillZipError } from "./zip-parser";
export {
  handleGetSkills,
  handlePatchSkill,
} from "./api-handlers";
export { handleExecuteSkill } from "./execute-handler";
export type { ExecuteSkillPayload } from "./execute-handler";
export { handleGetAttachment } from "./attachment-handler";
export {
  executeSkill,
  callGeminiWithSkill,
  callExecutorService,
  saveAttachment,
  FULL_REPORT_DELIMITER,
} from "./executor";
export type {
  SkillExecutionInput,
  ExecutorServiceParams,
  ExecutorServiceResult,
  ExecutorServiceFile,
  SaveAttachmentParams,
  SkillExecutionResult,
  ExecuteSkillParams,
  GeminiSkillResult,
} from "./executor";
