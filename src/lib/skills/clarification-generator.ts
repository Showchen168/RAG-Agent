/**
 * Skills System - Clarification Question Generator
 * 使用 Gemini generateObject 根據 SKILL.md 產生結構化釐清問題
 */

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import type { Skill, ClarificationQuestion } from "@/types/skills";

// ─── Zod Schema ──────────────────────────────────────

const ClarificationQuestionSchema = z.object({
  id: z.string().describe("問題 ID，格式如 q1, q2, q3"),
  question: z.string().describe("釐清問題（繁體中文）"),
  type: z
    .enum(["text", "select", "multiselect"])
    .describe("問題類型：text 自由輸入、select 單選、multiselect 多選"),
  options: z
    .array(z.string())
    .optional()
    .describe("select/multiselect 的選項（text 類型不需要）"),
  placeholder: z
    .string()
    .optional()
    .describe("text 類型的 placeholder 文字提示"),
});

const ClarificationResponseSchema = z.object({
  questions: z
    .array(ClarificationQuestionSchema)
    .min(3)
    .max(5)
    .describe("3-5 個釐清問題，幫助理解使用者的具體需求"),
});

// ─── System Prompt ──────────────────────────────────

function buildClarificationPrompt(skill: Skill, userInput: string): string {
  return `你是一個智慧文件生成助手。使用者想要使用「${skill.display_name}」技能來生成一份 ${skill.skill_config.output.fileType.toUpperCase()} 文件。

使用者的初始輸入是：「${userInput}」

## 技能說明
${skill.description}

## 輸出規格
- 檔案格式：${skill.skill_config.output.fileType}
- MIME 類型：${skill.skill_config.output.mimeType}

## 技能詳細參考
${skill.skill_md}

## 你的任務

根據上述技能的功能和使用者的初始輸入，產生 3-5 個釐清問題，幫助你更精確地理解使用者的需求。

### 問題設計原則
1. **實用性**：問題應直接影響最終文件的內容品質
2. **多樣性**：混合使用 text（自由輸入）、select（單選）、multiselect（多選）類型
3. **遞進性**：從宏觀（目標受眾、用途）到微觀（格式偏好、具體要求）
4. **繁體中文**：所有問題和選項使用繁體中文（台灣用語）

### 建議的問題維度
- 目標受眾是誰？（初學者/進階者/專業人士）
- 文件的主要用途？（教學/報告/參考文件）
- 希望涵蓋哪些主題或章節？
- 內容深度和篇幅偏好？
- 語言風格偏好？（正式/輕鬆/技術）
- 是否需要包含範例程式碼、圖表說明等？`;
}

// ─── Main Function ──────────────────────────────────

/**
 * 根據技能定義和使用者初始輸入，產生 3-5 個結構化釐清問題
 * @param skill - 技能定義
 * @param userInput - 使用者的初始輸入
 * @returns 釐清問題陣列
 */
export async function generateClarificationQuestions(
  skill: Skill,
  userInput: string,
): Promise<ReadonlyArray<ClarificationQuestion>> {
  const { object } = await generateObject({
    model: google("gemini-2.0-flash"),
    schema: ClarificationResponseSchema,
    prompt: buildClarificationPrompt(skill, userInput),
  });

  return object.questions;
}
