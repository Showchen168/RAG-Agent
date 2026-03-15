/**
 * Skills System - Zod Validation Schemas
 * 技能包 skill.json 的驗證 schema
 */

import { z } from 'zod'

// ========== Constants ==========

export const SKILL_CATEGORIES = ['document', 'data', 'creative', 'utility'] as const
export const SKILL_INPUT_TYPES = ['context', 'user', 'both'] as const
export const SKILL_PREVIEW_FORMATS = ['markdown', 'plaintext', 'image'] as const

/** ZIP 檔案大小上限：10MB */
export const MAX_ZIP_SIZE = 10 * 1024 * 1024

/** 技能名稱正則：僅允許小寫字母、數字、連字符 */
const SKILL_NAME_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/

// ========== Sub-schemas ==========

export const skillInputConfigSchema = z.object({
  type: z.enum(SKILL_INPUT_TYPES),
  userInputLabel: z.string().optional(),
})

export const skillOutputConfigSchema = z.object({
  fileType: z.string().min(1),
  mimeType: z.string().min(1),
  previewFormat: z.enum(SKILL_PREVIEW_FORMATS),
})

export const skillRuntimeConfigSchema = z.object({
  baseImage: z.string().min(1),
  timeout: z.number().int().min(1).max(300).default(60),
  maxMemory: z.string().default('512m'),
})

// ========== Main schema ==========

export const skillConfigSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(SKILL_NAME_REGEX, 'Skill name must be lowercase alphanumeric with hyphens only'),
  displayName: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1),
  category: z.enum(SKILL_CATEGORIES),
  version: z.string().optional(),
  input: skillInputConfigSchema,
  output: skillOutputConfigSchema,
  runtime: skillRuntimeConfigSchema,
})

export type SkillConfigInput = z.input<typeof skillConfigSchema>
export type SkillConfigOutput = z.output<typeof skillConfigSchema>
