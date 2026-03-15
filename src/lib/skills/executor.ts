/**
 * Skills Executor - Core Logic
 * 兩階段 Pipeline：Phase 1 研究員（Google Search） → Phase 2 工程師（程式碼生成）
 */

import { generateText } from "ai";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Skill,
  SkillAttachment,
  ClarificationAnswer,
} from "@/types/skills";
import { executeAdaptiveRAG } from "@/lib/rag/adaptive-rag";

// ========== Model Fallback ==========

/** 主模型與備援模型 */
const PRIMARY_MODEL = "gemini-3.1-pro-preview";
const FALLBACK_MODEL = "gemini-3-flash-preview";

/**
 * 判斷錯誤是否為 API 過載（503 / 429 / rate limit），適合使用備援模型重試
 */
function isOverloadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as Record<string, unknown>;
  // AI SDK wraps lastError for retry errors
  const lastError = (err.lastError ?? error) as Record<string, unknown>;
  const statusCode = lastError.statusCode ?? (lastError as Record<string, unknown>).status;
  if (statusCode === 503 || statusCode === 429) return true;
  const message = String(lastError.message ?? err.message ?? "");
  return /high demand|overloaded|unavailable|rate.?limit|resource.?exhaust/i.test(message);
}

/**
 * generateText with automatic fallback：先用 PRIMARY_MODEL，若 503/429 則自動降級為 FALLBACK_MODEL
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateTextWithFallback(
  googleProvider: ReturnType<typeof createGoogleGenerativeAI>,
  params: Record<string, unknown>,
  phase: string,
): Promise<{ text: string }> {
  try {
    console.log(`[SkillExec] ${phase}: Using PRIMARY model ${PRIMARY_MODEL}`);
    const result = await generateText({
      ...params,
      model: googleProvider(PRIMARY_MODEL),
    } as Parameters<typeof generateText>[0]);
    console.log(`[SkillExec] ${phase}: SUCCESS with ${PRIMARY_MODEL}`);
    return result;
  } catch (error) {
    if (isOverloadError(error)) {
      console.warn(
        `[SkillExec] ${phase}: ${PRIMARY_MODEL} overloaded (503/429), falling back to ${FALLBACK_MODEL}`,
      );
      const result = await generateText({
        ...params,
        model: googleProvider(FALLBACK_MODEL),
      } as Parameters<typeof generateText>[0]);
      console.log(`[SkillExec] ${phase}: SUCCESS with FALLBACK ${FALLBACK_MODEL}`);
      return result;
    }
    throw error;
  }
}

// ========== Types ==========

export interface SkillExecutionInput {
  readonly userInput?: string;
  readonly messageHistory?: ReadonlyArray<string>;
  readonly clarificationAnswers?: ReadonlyArray<ClarificationAnswer>;
  /** RAG 知識庫上下文（由 executeAdaptiveRAG 產出） */
  readonly knowledgeContext?: string;
}

export interface ExecutorServiceParams {
  readonly scriptsPath: string;
  readonly llmOutput: string;
  readonly baseImage: string;
  readonly timeout: number;
  readonly maxMemory: string;
  readonly entrypoint: string;
  /** 動態 entrypoint 腳本內容（可選）。提供時由 executor 寫入 /input/ 並使用 */
  readonly entrypointScript?: string;
}

export interface ExecutorServiceFile {
  readonly name: string;
  readonly path: string;
  readonly size: number;
  /** 檔案內容（base64 編碼） */
  readonly contentBase64: string;
}

export interface ExecutorServiceResult {
  readonly success: boolean;
  readonly files: ReadonlyArray<ExecutorServiceFile>;
  readonly logs: string;
}

export interface SaveAttachmentParams {
  readonly messageId: string;
  readonly skillId: string;
  readonly fileName: string;
  readonly fileType: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly storagePath: string;
  readonly previewContent: string | null;
}

export interface SkillExecutionResult {
  readonly message: string;
  readonly attachment?: {
    readonly id: string;
    readonly fileName: string;
    readonly fileType: string;
    readonly mimeType: string;
    readonly fileSize: number;
    readonly downloadUrl: string;
    readonly previewContent: string | null;
  };
}

export interface ExecuteSkillParams {
  readonly skill: Skill;
  readonly messageId: string;
  readonly userInput?: string;
  readonly messageHistory?: ReadonlyArray<string>;
  readonly clarificationAnswers?: ReadonlyArray<ClarificationAnswer>;
  /** 使用者 ID（用於 RAG 知識庫查詢） */
  readonly userId?: string;
}

// ========== Code Generation System Prompt (Phase 2) ==========

/**
 * Phase 2 專用：程式碼生成 system prompt
 * 此時研究資料已由 Phase 1 準備好，Phase 2 只需將內容包裝為可執行的 JS 程式碼
 */
const JS_RUNTIME_PREAMBLE = `## 你的角色

你是一位報告封面設計師。Markdown→Word 的轉換由系統自動處理，你**不需要生成任何 JavaScript 程式碼**。

你只需要提供：
1. 一段給使用者的說明文字（繁體中文）
2. 一個 JSON 配置區塊（封面資訊）

## 輸出格式（必須嚴格遵守）

**第一部分：說明文字**
用流暢、專業的繁體中文向使用者說明報告的重點和架構。這段文字會直接顯示在聊天室中。

**第二部分：修改建議**
提供三個簡短的後續修改建議，使用精確的語法：
:::suggestions
- 建議一
- 建議二
- 建議三
:::

**第三部分：封面配置 JSON**
使用 \`\`\`json 區塊提供封面資訊：
\`\`\`json
{
  "title": "報告標題",
  "subtitle": "副標題（可選）",
  "date": "2026-03-02",
  "fileName": "報告.docx"
}
\`\`\`

**⚠️ 禁止事項：**
- 不要生成 JavaScript 程式碼
- 不要生成 \`\`\`javascript 區塊
- 不要嘗試讀取檔案或呼叫 API
- 只提供說明文字 + suggestions + JSON 配置

---
## Technical Reference

`;

/**
 * 為 Python runtime 建立程式碼生成系統提示
 */
const PYTHON_RUNTIME_PREAMBLE = `## Execution Environment

You are a code generator. Your output will be automatically extracted and executed in a sandboxed Docker container.

**Environment:**
- Python 3.11 with pre-installed packages available via /scripts/
- Working directory: /output/
- Scripts directory: /scripts/ (read-only, contains skill package helper scripts)
- No internet access

**Output rules (MANDATORY):**
1. Your response MUST contain exactly ONE Python code block (\`\`\`python ... \`\`\`)
2. The code MUST be self-contained and immediately executable with \`python3\`
3. The code MUST write output file(s) to \`/output/\` directory
4. Do NOT use any external CLI tools unless available in the container
5. Do NOT reference any agent tools (Edit tool, Read tool, etc.)
6. Do NOT use \`pip install\` - use only pre-installed packages

---
## Technical Reference (use as guidance for your generated code)

`;

/**
 * 根據 runtime 類型建立完整的 system prompt
 * Agent 風格的 SKILL.md 會被包裝為 code generation prompt
 */
function buildSystemPrompt(skill: Skill): string {
  const baseImage = skill.skill_config.runtime.baseImage;

  if (baseImage.startsWith("nexusmind-skill-runtime:")) {
    return JS_RUNTIME_PREAMBLE + skill.skill_md;
  }

  if (baseImage.startsWith("python:")) {
    return PYTHON_RUNTIME_PREAMBLE + skill.skill_md;
  }

  // 其他 runtime：直接使用 SKILL.md（假設已是正確格式）
  return skill.skill_md;
}

// ========== Two-Phase Pipeline ==========

/**
 * 取得當前日期字串（注入 prompt，確保 LLM 知道當前時間）
 */
function getCurrentDateContext(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}（${y} 年 ${m} 月 ${d} 日）`;
}

/**
 * 組合使用者 prompt（共用於 Phase 1 & Phase 2）
 */
function buildUserPrompt(skill: Skill, input: SkillExecutionInput): string {
  const inputType = skill.skill_config.input.type;
  let prompt = "";

  // 日期上下文放最前面
  prompt += `## 當前日期\n${getCurrentDateContext()}\n\n`;

  // RAG 知識庫上下文（如果有的話）
  if (input.knowledgeContext) {
    prompt += "## 知識庫參考資料\n\n";
    prompt += "以下是來自使用者知識庫的相關資料，請在研究報告中優先參考並引用這些內容：\n\n";
    prompt += input.knowledgeContext;
    prompt += "\n\n";
  }

  if (
    (inputType === "context" || inputType === "both") &&
    input.messageHistory?.length
  ) {
    prompt += "## 對話上下文\n";
    prompt += input.messageHistory.join("\n");
    prompt += "\n\n";
  }

  if ((inputType === "user" || inputType === "both") && input.userInput) {
    prompt += "## 使用者輸入\n";
    prompt += input.userInput;
  } else if (inputType === "context" && input.userInput) {
    prompt += "## 額外指示\n";
    prompt += input.userInput;
  }

  // 釐清問題的回答
  if (input.clarificationAnswers?.length) {
    prompt += "\n\n## 使用者需求釐清\n\n";
    for (const answer of input.clarificationAnswers) {
      const formattedAnswer = answer.answer.includes("|||")
        ? answer.answer
          .split("|||")
          .map((a) => `  - ${a}`)
          .join("\n")
        : answer.answer;

      prompt += `**Q: ${answer.question}**\n`;
      prompt += answer.answer.includes("|||")
        ? `A:\n${formattedAnswer}\n\n`
        : `A: ${formattedAnswer}\n\n`;
    }
  }

  if (!prompt.trim()) {
    throw new Error("No input provided for skill execution");
  }

  return prompt;
}

// ─── Phase 1: Writer System Prompt ───────────────────

const WRITER_SYSTEM_PROMPT = `你是一位資深領域專家與內容撰寫專家。你的任務是為一份專業文件進行深度分析，然後撰寫完整的報告內容。
請遵循以下原則：
1. 嚴格基於使用者提供的 [參考資料] 或自身領域知識進行撰寫。
2. 以結構化的 Markdown 格式輸出，包含摘要、目錄、核心內容、結論等。
3. 若內容太長，請適度分段，避免冗長無重點的敘述。
4. 始終保持客觀、專業、中立的語氣。

## ⚠️ 最高優先級：嚴格遵從使用者的需求

**在一切開始之前，仔細閱讀使用者的需求（包含「使用者輸入」和「使用者需求釐清」區塊）。** 使用者指定的以下內容具有最高優先級，必須完全遵從：

1. **報告頁數 / 字數**：如果使用者要求特定頁數（如「5 頁」「10 頁」），你必須按此調整內容長度。
   - 1 頁 ≈ 500-600 中文字（A4 單欄排版）
   - 例：使用者要求「5 頁」→ 總字數 2,500-3,000 字；「10 頁」→ 5,000-6,000 字；「20 頁」→ 10,000-12,000 字
   - 章節數量也應按頁數比例調整（5 頁 → 3-4 章；10 頁 → 5-7 章；20 頁 → 8-12 章）
2. **報告主題與重點**：報告必須緊密圍繞使用者指定的主題，不要偏離
3. **特定內容要求**：使用者要求包含的特定分析、數據、觀點必須全部涵蓋
4. **語言與格式要求**：遵從使用者指定的語言和格式
5. **目標受眾**：根據使用者描述的受眾調整寫作深度和專業程度

**如果使用者沒有指定上述項目，則使用下方的預設標準。**

## 工作方式

### 第一步：研究（必須使用 Google Search）
1. **主動使用 Google Search 搜尋最新資料** — 這是你最重要的工具
2. 搜尋時注意「當前日期」（prompt 中會提供），確保資料是最新的
3. 每個主題至少搜尋 3-5 次，從不同角度收集資料
4. 交叉比對多個來源，確保數據準確性
5. **搜尋方向必須與使用者指定的主題高度相關**，不要搜尋無關話題

### 第二步：撰寫完整報告
基於搜尋到的資料，撰寫一份完整的專業報告。不是大綱，不是摘要，是完整的報告正文。
**報告的結構、長度、章節數量必須符合使用者的需求。**

## 輸出格式

直接輸出完整的報告內容（純文字，使用 Markdown 格式）：

# [報告標題]

## 摘要
[200-300 字的執行摘要，包含最重要的發現和結論]

## 第一章：[章節標題]
[完整的章節內容，包含具體數據、分析、案例]

## 第二章：[章節標題]
[完整的章節內容]

...（章節數量根據使用者要求的頁數調整，預設 5-8 章）

## 結論與建議
[基於分析得出的結論和具體可行的建議]

## 參考資料
[列出所有引用的資料來源]

## 品質標準（必須遵守）
- 每個章節的內容長度根據使用者要求的總頁數按比例分配（預設每章 500-1,000 字）
- 數據必須有具體數字（市場規模、成長率、佔比、金額、時間線等）
- 不要使用模糊描述如「快速成長」「顯著提升」，必須給出具體百分比或數字
- 所有年份必須與「當前日期」一致（不要把未來預測當作事實）
- 包含至少 3 個數據表格（用 Markdown 表格格式）
- 技術主題必須包含完整的程式碼範例和逐行說明
- 如果使用者沒有指定字數，預設總字數至少 5,000 字（中文字元）`;

// ─── callGeminiWithSkill: Two-Phase Pipeline ───────────

/** Phase 1 完整報告與 Phase 2 程式碼的分隔符（寫入 /input/llm_output.txt） */
export const FULL_REPORT_DELIMITER = '\n\n---FULL_REPORT_CONTENT---\n\n';

/** callGeminiWithSkill 的回傳結果 */
export interface GeminiSkillResult {
  /** Phase 2 的完整輸出（說明文字 + JS 程式碼區塊） */
  readonly llmOutput: string;
  /** Phase 1 的完整研究報告（Markdown 格式） */
  readonly fullReport: string;
}

/**
 * 兩階段技能執行 Pipeline：
 * Phase 1（研究員 + 撰稿員）：使用 Google Search 搜尋最新資料 → 撰寫完整報告內容
 * Phase 2（排版工程師）：生成 Markdown→docx 動態解析程式碼
 *
 * @param skill - 技能定義（含 skill_md 和 skill_config）
 * @param input - 使用者輸入 / 對話上下文
 * @returns Phase 2 輸出 + Phase 1 完整報告
 */
export async function callGeminiWithSkill(
  skill: Skill,
  input: SkillExecutionInput,
): Promise<GeminiSkillResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY 環境變數未設定");
  }

  const googleProvider = createGoogleGenerativeAI({ apiKey });

  const userPrompt = buildUserPrompt(skill, input);

  // ═══ Phase 1: 研究員 + 撰稿員 — 搜尋最新資料並撰寫完整報告 ═══
  const { text: fullReport } = await generateTextWithFallback(
    googleProvider,
    {
      system: WRITER_SYSTEM_PROMPT,
      prompt: userPrompt,
      tools: {
        google_search: google.tools.googleSearch({}),
      },
      maxOutputTokens: 32768,
    },
    "Phase 1 Research",
  );

  // ═══ Phase 2: 排版工程師 — 生成 Markdown→docx 動態解析程式碼 ═══
  const codeGenPrompt = `## 報告結構概覽

以下是研究員撰寫的報告摘要（前 1500 字），供你了解報告主題和結構：

${fullReport.substring(0, 1500)}${fullReport.length > 1500 ? '\n\n... (以下省略)' : ''}

---

## 使用者原始需求

${userPrompt}

---

## 你的任務

Markdown→Word 的轉換由系統自動處理，你**不需要生成任何 JavaScript 程式碼**。

你只需要：
1. **說明文字**：用流暢的繁體中文向使用者說明報告的重點、架構。若是基於舊對話的修改，請指出修改了哪些內容。
2. **修改建議**：提供三個簡短的後續修改建議，使用 :::suggestions 語法。
3. **封面配置**：提供一個 JSON 區塊，包含報告的封面資訊。

**輸出格式（依序排列）：**

先寫說明文字，然後：

:::suggestions
- 建議一（針對報告內容的改進）
- 建議二
- 建議三
:::

最後提供封面配置：
\`\`\`json
{
  "title": "根據報告主題填寫",
  "subtitle": "副標題（可選）",
  "date": "${new Date().toISOString().split("T")[0]}",
  "fileName": "根據主題命名.docx"
}
\`\`\`

**⚠️ 禁止生成 JavaScript 程式碼或 \`\`\`javascript 區塊。**`;

  const systemPrompt = buildSystemPrompt(skill);

  const { text } = await generateTextWithFallback(
    googleProvider,
    {
      system: systemPrompt,
      prompt: codeGenPrompt,
      maxOutputTokens: 65536,
    },
    "Phase 2 CodeGen",
  );

  return { llmOutput: text, fullReport };
}

// ========== callExecutorService ==========

/**
 * 呼叫 skill-executor Docker 微服務
 * @param params - 執行參數（scripts 路徑、LLM 輸出、容器設定）
 * @returns 執行結果（檔案列表 + 日誌）
 */
export async function callExecutorService(
  params: ExecutorServiceParams,
): Promise<ExecutorServiceResult> {
  const executorUrl = process.env.SKILL_EXECUTOR_URL;
  if (!executorUrl) {
    throw new Error("SKILL_EXECUTOR_URL 環境變數未設定");
  }

  const t = Date.now();
  console.log("[Executor] Calling", `${executorUrl}/execute`, {
    scriptsPath: params.scriptsPath,
    baseImage: params.baseImage,
    timeout: params.timeout,
  });

  const response = await fetch(`${executorUrl}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scriptsPath: params.scriptsPath,
      llmOutput: params.llmOutput,
      baseImage: params.baseImage,
      timeout: params.timeout,
      maxMemory: params.maxMemory,
      entrypoint: params.entrypoint,
      ...(params.entrypointScript
        ? { entrypointScript: params.entrypointScript }
        : {}),
    }),
  });

  console.log("[Executor] Response status:", response.status, `(+${Date.now() - t}ms)`);

  if (!response.ok) {
    const errorBody = await response
      .json()
      .catch(() => ({ error: "Unknown executor error" }));
    console.error("[Executor] Error body:", errorBody);
    throw new Error(
      (errorBody as Record<string, string>).error ??
      `Executor service returned ${response.status}`,
    );
  }

  const result = await response.json() as ExecutorServiceResult;
  console.log("[Executor] Result:", {
    filesCount: result.files?.length ?? 0,
    logs: result.logs?.substring(0, 200),
    totalTime: `${Date.now() - t}ms`,
  });
  return result;
}

// ========== saveAttachment ==========

/**
 * 將技能輸出附件記錄寫入 skill_attachments 表
 * @param supabase - Supabase client
 * @param params - 附件參數
 * @returns 附件記錄
 */
export async function saveAttachment(
  supabase: SupabaseClient,
  params: SaveAttachmentParams,
): Promise<SkillAttachment> {
  const { data, error } = await supabase
    .from("skill_attachments")
    .insert({
      message_id: params.messageId,
      skill_id: params.skillId,
      file_name: params.fileName,
      file_type: params.fileType,
      mime_type: params.mimeType,
      file_size: params.fileSize,
      storage_path: params.storagePath,
      preview_content: params.previewContent,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as SkillAttachment;
}

// ========== generateEntrypointScript ==========

/** LLM 輸出為 JS code 時的 entrypoint：
 *  1. 確定性地將 delimiter 後的 Markdown 寫入 /input/report_content.md
 *  2. 從 LLM 輸出中提取 JSON 配置（封面資訊）
 *  3. 用內建的確定性 Markdown→docx 解析器生成 Word 文件
 */
const JS_ENTRYPOINT_SCRIPT = `#!/bin/sh
# Auto-generated: deterministic Markdown→docx converter
cat > /output/_converter.js << 'CONVERTER'
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, WidthType, AlignmentType, PageBreak, BorderStyle } = require('docx');

// ═══ Step 1: 分割 delimiter，提取 Markdown 報告 ═══
const raw = fs.readFileSync('/input/llm_output.txt', 'utf8');
const DELIMITER = '---FULL_REPORT_CONTENT---';
const delimIdx = raw.indexOf(DELIMITER);

let markdown = '';
let llmOutput = raw;
if (delimIdx !== -1) {
  llmOutput = raw.substring(0, delimIdx);
  markdown = raw.substring(delimIdx + DELIMITER.length).trim();
} else {
  console.warn('[Converter] WARN: delimiter not found');
}

fs.writeFileSync('/input/report_content.md', markdown, 'utf8');
console.log('[Converter] report_content.md:', markdown.length, 'chars');

// ═══ Step 2: 提取 AI 的封面配置（JSON） ═══
let coverConfig = {};
try {
  const jsonMatch = llmOutput.match(/\\\`\\\`\\\`json\\s*\\n([\\s\\S]*?)\\n\\\`\\\`\\\`/);
  if (jsonMatch) {
    coverConfig = JSON.parse(jsonMatch[1]);
    console.log('[Converter] Cover config:', JSON.stringify(coverConfig));
  }
} catch (e) {
  console.warn('[Converter] WARN: Failed to parse cover config JSON:', e.message);
}

// ═══ Step 3: 確定性 Markdown 解析器 ═══

/** 解析粗體 **text** 和斜體 *text* */
function parseInlineFormatting(text, fontSize) {
  const sz = fontSize || 24;
  const font = 'Microsoft JhengHei';
  const runs = [];
  // 處理粗體 **text**
  const parts = text.split(/(\\*\\*[^*]+\\*\\*)/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, size: sz, font }));
    } else if (part) {
      runs.push(new TextRun({ text: part, size: sz, font }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text, size: sz, font })];
}

/** 完整的 Markdown→docx 解析器（逐行處理） */
function parseMarkdownToDocx(md) {
  const lines = md.split('\\n');
  const children = [];
  let i = 0;
  const font = 'Microsoft JhengHei';

  while (i < lines.length) {
    const line = lines[i];

    // === 標題 ===
    if (line.startsWith('#### ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line.slice(5).trim(), bold: true, size: 24, font })],
        spacing: { before: 240, after: 120 },
      }));
    } else if (line.startsWith('### ')) {
      children.push(new Paragraph({
        text: line.slice(4).trim(),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 240, after: 120 },
      }));
    } else if (line.startsWith('## ')) {
      children.push(new Paragraph({
        text: line.slice(3).trim(),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 160 },
      }));
    } else if (line.startsWith('# ')) {
      children.push(new Paragraph({
        text: line.slice(2).trim(),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 200 },
      }));
    }
    // === Markdown 表格 ===
    else if (line.includes('|') && line.trim().startsWith('|')) {
      const tableRows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
        const row = lines[i].trim();
        // 跳過分隔行 |---|---|
        if (!/^\\|[\\s\\-:|]+\\|$/.test(row)) {
          const cells = row.split('|').filter(c => c.trim() !== '').map(c => c.trim());
          if (cells.length > 0) tableRows.push(cells);
        }
        i++;
      }
      if (tableRows.length > 0) {
        const numCols = Math.max(...tableRows.map(r => r.length));
        const colWidth = Math.floor(9000 / numCols);
        try {
          children.push(new Table({
            rows: tableRows.map((cells, ri) => new TableRow({
              children: Array.from({ length: numCols }, (_, ci) => {
                const cellText = (cells[ci] || '').trim();
                return new TableCell({
                  children: [new Paragraph({
                    children: ri === 0
                      ? [new TextRun({ text: cellText, bold: true, size: 20, font })]
                      : parseInlineFormatting(cellText, 20),
                    spacing: { before: 40, after: 40 },
                  })],
                  width: { size: colWidth, type: WidthType.DXA },
                });
              }),
            })),
          }));
        } catch (e) {
          console.warn('[Converter] Table parse error:', e.message);
          // fallback: 把表格行作為普通文字
          tableRows.forEach(cells => {
            children.push(new Paragraph({
              children: [new TextRun({ text: cells.join(' | '), size: 22, font })],
            }));
          });
        }
      }
      continue; // 已在迴圈內推進 i
    }
    // === 無序列表 ===
    else if (line.match(/^\\s*[-*]\\s+/)) {
      const text = line.replace(/^\\s*[-*]\\s+/, '');
      children.push(new Paragraph({
        children: parseInlineFormatting(text),
        bullet: { level: 0 },
        spacing: { after: 80 },
      }));
    }
    // === 有序列表 ===
    else if (line.match(/^\\s*\\d+[.)]\\s+/)) {
      const text = line.replace(/^\\s*\\d+[.)]\\s+/, '');
      children.push(new Paragraph({
        children: parseInlineFormatting(text),
        numbering: { reference: 'default-numbering', level: 0 },
        spacing: { after: 80 },
      }));
    }
    // === 引用區塊 ===
    else if (line.startsWith('> ')) {
      const text = line.slice(2);
      children.push(new Paragraph({
        children: parseInlineFormatting(text),
        indent: { left: 720 },
        spacing: { after: 120 },
      }));
    }
    // === 水平分隔線 ===
    else if (/^\\s*[-*_]{3,}\\s*$/.test(line)) {
      children.push(new Paragraph({
        children: [new TextRun({ text: '' })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' } },
        spacing: { before: 200, after: 200 },
      }));
    }
    // === 普通段落（非空行） ===
    else if (line.trim()) {
      children.push(new Paragraph({
        children: parseInlineFormatting(line),
        spacing: { after: 160, line: 360 },
      }));
    }

    i++;
  }
  return children;
}

// ═══ Step 4: 生成 Word 文件 ═══
const reportChildren = parseMarkdownToDocx(markdown);

// 計算實際字數（去除 Markdown 語法符號）
const actualCharCount = markdown.replace(/[\\s#|*\\-_>\\[\\]()\\\\]/g, '').length;
const pageEstimate = Math.ceil(actualCharCount / 550);
console.log('[Converter] Actual chars:', actualCharCount, '(~' + pageEstimate + ' pages)');
console.log('[Converter] Parsed', reportChildren.length, 'docx elements');

// 封面資訊
const title = coverConfig.title || '研究報告';
const subtitle = coverConfig.subtitle || '';
const date = coverConfig.date || new Date().toISOString().split('T')[0];
const fileName = coverConfig.fileName || '報告.docx';

const doc = new Document({
  numbering: {
    config: [{
      reference: 'default-numbering',
      levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
    }],
  },
  sections: [
    {
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: [
        // 封面頁
        new Paragraph({ spacing: { before: 3000 } }),
        new Paragraph({
          children: [new TextRun({ text: title, bold: true, size: 52, font: 'Microsoft JhengHei' })],
          alignment: AlignmentType.CENTER,
        }),
        ...(subtitle ? [new Paragraph({
          children: [new TextRun({ text: subtitle, size: 28, color: '666666', font: 'Microsoft JhengHei' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
        })] : []),
        new Paragraph({
          children: [new TextRun({ text: date, size: 24, color: '888888', font: 'Microsoft JhengHei' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
        }),
        new Paragraph({
          children: [new TextRun({
            text: '總字數：約 ' + actualCharCount.toLocaleString() + ' 字（約 ' + pageEstimate + ' 頁）',
            size: 22, color: '888888', font: 'Microsoft JhengHei',
          })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
        }),
        new Paragraph({ children: [new PageBreak()] }),
        // 報告主體（確定性解析）
        ...reportChildren,
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  const outPath = '/output/' + fileName;
  fs.writeFileSync(outPath, buffer);
  console.log('[Converter] Written:', outPath, '(' + buffer.length + ' bytes)');
}).catch(err => {
  console.error('[Converter] ERROR:', err);
  process.exit(1);
});
CONVERTER
cd /output
node _converter.js
EXIT_CODE=$?
rm -f _converter.js
exit $EXIT_CODE
`;

/** LLM 輸出為 Python code 時的 entrypoint */
const PYTHON_ENTRYPOINT_SCRIPT = `#!/bin/sh
# Auto-generated: extract Python from LLM output and run
cat > /output/_extract.py << 'EXTRACTOR'
import re, sys
raw = open('/input/llm_output.txt', 'r').read()
m = re.search(r'\`\`\`(?:python|py)?\\s*\\n([\\s\\S]*?)\\n\`\`\`', raw)
if not m:
    print('ERROR: No Python code block found in LLM output', file=sys.stderr)
    print('LLM output preview:', raw[:500], file=sys.stderr)
    sys.exit(1)
open('/output/_generate.py', 'w').write(m.group(1))
EXTRACTOR
cd /output
python3 _extract.py && python3 _generate.py
EXIT_CODE=$?
rm -f _extract.py _generate.py
exit $EXIT_CODE
`;

/**
 * 根據 skill 設定判斷是否需要動態生成 entrypoint
 * - nexusmind-skill-runtime → JS 提取腳本（這些技能沒有自訂 entrypoint.sh）
 * - python:* → 不生成（zip-parser 在有 entrypoint.sh 時才設定此 image）
 */
function generateEntrypointScript(skill: Skill): string | undefined {
  if (
    skill.skill_config.runtime.baseImage.startsWith("nexusmind-skill-runtime:")
  ) {
    return JS_ENTRYPOINT_SCRIPT;
  }
  return undefined;
}

// ========== executeSkill ==========

/**
 * 完整技能執行流程：Phase1 研究 → Phase2 生成程式碼 → Docker Executor → 儲存附件
 * @param supabase - Supabase client
 * @param params - 執行參數
 * @returns 執行結果（AI 文字 + 附件資訊）
 */
export async function executeSkill(
  supabase: SupabaseClient,
  params: ExecuteSkillParams,
): Promise<SkillExecutionResult> {
  const { skill, messageId, userInput, messageHistory, clarificationAnswers } =
    params;

  if (!skill.is_enabled) {
    throw new Error(`Skill "${skill.display_name}" is disabled`);
  }

  // Step 0: Phase 0 事前討論與意圖判斷 (使用輕量級模型如 gemini-2.5-flash)
  const t0 = Date.now();
  console.log("[SkillExec] Phase 0: Intent check starting...");
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY 環境變數未設定");
  }
  const googleProvider = createGoogleGenerativeAI({ apiKey });

  const phase0Prompt = `你是一個專業的報告產生助理。你的任務是評估使用者目前的需求是否足夠清晰，可以開始撰寫正式的 Word 報告。

## 評估標準：
1. 使用者是否已經明確指出報告的「主題」或「重點」？
2. 是否有足夠的資訊或上下文可以作為撰寫依據？

**注意**：以下項目是「加分」但非必要的 — 即使使用者沒有提供，也不要追問：
- 報告頁數（沒指定時用預設 5-8 章）
- 語言（沒指定時用繁體中文）
- 詳細的章節結構（由 AI 自行規劃）

**只有在完全看不出主題是什麼的時候，才需要追問。**

## 當前上下文：
${messageHistory?.join("\n") || "無歷史紀錄"}
使用者最新輸入：${userInput || "無"}

## 輸出規則（必須嚴格遵守）：
- 如果你認為需求 **足夠清晰**（主題明確），請**只**輸出 \`__READY_TO_GENERATE__\` 這串字（不要加任何其他廢話）。
- 如果你認為需求 **不夠明確**（連主題都不清楚），請回答並詢問缺少的部分。這次你**不要**輸出 \`__READY_TO_GENERATE__\`。
  - **重要**：回覆請務必使用標準的 **Markdown 格式**，例如使用無序列表 (\`-\`) 或數字列表 (\`1.\`, \`2.\`) 條列重點，並適當換行與使用粗體，讓畫面排版美觀清晰。`;

  const { text: phase0Result } = await generateTextWithFallback(
    googleProvider,
    {
      prompt: phase0Prompt,
      maxOutputTokens: 16384,
    },
    "Phase 0 Intent",
  );

  console.log("[SkillExec] Phase 0: completed", `(+${Date.now() - t0}ms)`, {
    ready: phase0Result.includes("__READY_TO_GENERATE__"),
    resultLen: phase0Result.length,
  });

  if (!phase0Result.includes("__READY_TO_GENERATE__")) {
    // 需求不夠明確，直接回傳 AI 的追問文字，中斷後續耗時生成
    return { message: phase0Result.trim() };
  }

  // Step 0.5: RAG 知識庫查詢（有 userId 才觸發，失敗不中斷主流程）
  let knowledgeContext: string | undefined;
  if (params.userId) {
    try {
      const ragResult = await executeAdaptiveRAG({
        userQuery: userInput || "",
        userId: params.userId,
        supabase,
      });
      if (ragResult.knowledgeContext) {
        knowledgeContext = ragResult.knowledgeContext;
      }
    } catch {
      // RAG 查詢失敗時 graceful degradation，退化為純 Google Search
    }
  }

  // Step 1: 兩階段 Gemini 呼叫（研究 → 程式碼生成）
  console.log("[SkillExec] Phase 1: Gemini code generation starting...", `(+${Date.now() - t0}ms)`);
  const { llmOutput, fullReport } = await callGeminiWithSkill(skill, {
    userInput,
    messageHistory,
    clarificationAnswers,
    knowledgeContext,
  });

  // 組合 Docker 輸入：Phase 2 輸出 + 分隔符 + Phase 1 完整報告
  // JS 程式碼會從 /input/llm_output.txt 中讀取分隔符後的 Markdown 內容
  const dockerInput = llmOutput + FULL_REPORT_DELIMITER + fullReport;

  // Step 2: 呼叫 executor service（自動生成 entrypoint 如需要）
  console.log("[SkillExec] Phase 1: Gemini completed, llmOutput length:", llmOutput.length, "fullReport length:", fullReport.length, `(+${Date.now() - t0}ms)`);
  console.log("[SkillExec] Phase 2: Calling executor service...", `(+${Date.now() - t0}ms)`);
  const entrypointScript = generateEntrypointScript(skill);
  const executionResult = await callExecutorService({
    scriptsPath: skill.storage_path,
    llmOutput: dockerInput,
    baseImage: skill.skill_config.runtime.baseImage,
    timeout: skill.skill_config.runtime.timeout,
    maxMemory: skill.skill_config.runtime.maxMemory,
    entrypoint: "entrypoint.sh",
    entrypointScript,
  });

  console.log("[SkillExec] Phase 2: Executor completed", {
    filesCount: executionResult.files.length,
    elapsed: `+${Date.now() - t0}ms`,
  });

  // 判斷是否為程式碼生成型技能（LLM 輸出為 JS code，非人類可讀內容）
  const isCodeGenerating = skill.skill_config.runtime.baseImage.startsWith(
    "nexusmind-skill-runtime:",
  );

  // Step 3: 如果沒有產出檔案
  if (!executionResult.files.length) {
    console.log("[SkillExec] No files produced, executor logs:", executionResult.logs?.substring(0, 500));

    // 程式碼生成型技能：移除 code blocks（JSON 配置等），不洩漏到 UI
    if (isCodeGenerating) {
      const codeBlockRegex = /```(?:javascript|js|node|python|py|json)?\s*\n[\s\S]*?\n```/g;
      const textOnly = llmOutput.replace(codeBlockRegex, "").trim();
      const errorHint = "\n\n⚠️ 文件生成失敗，程式碼執行時發生錯誤，請重新嘗試。";
      return {
        message: textOnly.length > 0
          ? textOnly + errorHint
          : "⚠️ 文件生成失敗，程式碼執行時發生錯誤，請重新嘗試。",
      };
    }

    return { message: llmOutput };
  }

  // Step 4: 取第一個輸出檔案，將內容寫入磁碟並儲存附件記錄
  const outputFile = executionResult.files[0];
  const outputBasePath =
    process.env.SKILLS_OUTPUT_PATH ?? "/data/skills-output";
  const storagePath = `${outputBasePath}/${outputFile.name}`;

  // 將 base64 檔案內容寫入磁碟
  await mkdir(dirname(storagePath), { recursive: true });
  await writeFile(storagePath, Buffer.from(outputFile.contentBase64, "base64"));

  // 程式碼生成型技能：previewContent 設為 null（原始 JS 程式碼不是有意義的預覽）
  const previewFormat = skill.skill_config.output.previewFormat;
  const previewContent =
    isCodeGenerating || previewFormat === "image" ? null : llmOutput;

  const attachment = await saveAttachment(supabase, {
    messageId,
    skillId: skill.id,
    fileName: outputFile.name,
    fileType: skill.skill_config.output.fileType,
    mimeType: skill.skill_config.output.mimeType,
    fileSize: outputFile.size,
    storagePath,
    previewContent,
  });

  // 程式碼生成型技能：擷取純文字部分，移除 JSON 配置區塊
  let extractedMessage = llmOutput;
  if (isCodeGenerating) {
    const codeBlockRegex = /```(?:javascript|js|node|json)?\s*\n[\s\S]*?\n```/g;
    const textOnly = llmOutput.replace(codeBlockRegex, "").trim();

    if (textOnly.length > 0) {
      extractedMessage = textOnly;
    } else {
      extractedMessage = `已生成文件：${outputFile.name}`;
    }
  }

  console.log("[SkillExec] === DONE ===", {
    fileName: outputFile.name,
    fileSize: outputFile.size,
    attachmentId: attachment.id,
    totalElapsed: `${Date.now() - t0}ms`,
  });

  return {
    message: extractedMessage,
    attachment: {
      id: attachment.id,
      fileName: attachment.file_name,
      fileType: attachment.file_type,
      mimeType: attachment.mime_type,
      fileSize: attachment.file_size,
      downloadUrl: `/api/skills/attachments/${attachment.id}`,
      previewContent: attachment.preview_content,
    },
  };
}
