/**
 * Memory Extractor - 從對話中提取使用者記憶
 *
 * 混合策略：LLM 萃取（主要）+ 規則式提取（備援）
 * LLM 會分析對話內容，提取使用者的偏好、事實、行為模式等
 */

import { generateText } from "ai";
import { getProvider, THINKING_PROVIDER_OPTIONS } from "@/lib/ai/providers";
import type { ExtractedMemory, MemoryCategory } from "./types";

interface ExtractionInput {
  userMessage: string;
  assistantResponse: string;
  conversationId?: string;
}

interface ExtractionResult {
  memories: ExtractedMemory[];
  shouldStore: boolean;
}

const EXTRACTION_PROMPT = `You are a memory extraction system. Analyze the user's message and extract factual information worth remembering for future conversations.

Extract ONLY from the USER's message (not the assistant's response). Focus on:
1. **Identity**: name, nickname, profession, role, age, location
2. **Preferences**: likes, dislikes, habits, communication style
3. **Facts**: personal facts, relationships, projects, goals
4. **Behaviors**: routines, patterns, recurring actions

Rules:
- Only extract clear, explicit statements (not implications or guesses)
- Skip questions (the user asking something is NOT a fact)
- Skip greetings, filler words, or generic conversation
- Each memory should be a concise, self-contained statement in the user's language
- Return empty array if nothing worth remembering
- Maximum 3 memories per message

Respond with ONLY a JSON array (no markdown, no explanation):
[{"content": "記憶內容", "category": "fact|preference|behavior|context", "importance_score": 0.5-0.9}]

Or empty array if nothing to extract:
[]`;

/**
 * 使用 LLM 從對話中萃取記憶
 */
export async function extractMemories(
  input: ExtractionInput,
): Promise<ExtractionResult> {
  const emptyResult: ExtractionResult = { memories: [], shouldStore: false };

  // 跳過太短的訊息（問候語等）
  if (input.userMessage.trim().length < 5) {
    return emptyResult;
  }

  // 跳過純問句（以 ? 或 ？ 結尾且沒有陳述句）
  const trimmed = input.userMessage.trim();
  if (/^[？?]$/.test(trimmed.slice(-1)) && trimmed.length < 20) {
    return emptyResult;
  }

  try {
    // 用 flash-lite 模型（最便宜）做記憶萃取
    const result = await generateText({
      model: getProvider("gemini-flash-lite"),
      system: EXTRACTION_PROMPT,
      prompt: `User message: ${input.userMessage}`,
      maxOutputTokens: 512,
      providerOptions: THINKING_PROVIDER_OPTIONS,
    });

    const text = result.text.trim();
    if (!text || text === "[]") {
      return emptyResult;
    }

    // 解析 JSON（容錯：移除可能的 markdown 包裹）
    const cleaned = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return emptyResult;
    }

    // 驗證並過濾有效記憶
    const validCategories = new Set<string>([
      "preference",
      "fact",
      "behavior",
      "context",
    ]);
    const memories: ExtractedMemory[] = parsed
      .filter(
        (m: Record<string, unknown>) =>
          typeof m.content === "string" &&
          m.content.length >= 3 &&
          typeof m.category === "string" &&
          validCategories.has(m.category),
      )
      .slice(0, 3) // 最多 3 筆
      .map((m: Record<string, unknown>) => ({
        content: String(m.content),
        category: String(m.category) as MemoryCategory,
        importance_score: Math.min(
          0.9,
          Math.max(0.5, Number(m.importance_score) || 0.6),
        ),
      }));

    return {
      memories,
      shouldStore: memories.length > 0,
    };
  } catch (err) {
    console.warn(
      "[Memory Extractor] LLM extraction failed, falling back to regex:",
      err instanceof Error ? err.message : err,
    );
    // 備援：用 regex 萃取
    return extractMemoriesRegex(input);
  }
}

// ─── 以下為備援 regex 萃取（保留原邏輯） ───

interface ExtractionRule {
  pattern: RegExp;
  category: MemoryCategory;
  importance_score: number;
}

const PREFERENCE_RULES: ExtractionRule[] = [
  { pattern: /我喜歡(.+)/u, category: "preference", importance_score: 0.7 },
  { pattern: /我偏好(.+)/u, category: "preference", importance_score: 0.7 },
  { pattern: /我習慣(.+)/u, category: "preference", importance_score: 0.7 },
  { pattern: /我不喜歡(.+)/u, category: "preference", importance_score: 0.7 },
  { pattern: /我討厭(.+)/u, category: "preference", importance_score: 0.7 },
  {
    pattern: /I prefer\s+(.+)/i,
    category: "preference",
    importance_score: 0.7,
  },
  { pattern: /I like\s+(.+)/i, category: "preference", importance_score: 0.7 },
  {
    pattern: /I always\s+(.+)/i,
    category: "preference",
    importance_score: 0.7,
  },
  {
    pattern: /I don'?t like\s+(.+)/i,
    category: "preference",
    importance_score: 0.7,
  },
];

const IDENTITY_RULES: ExtractionRule[] = [
  { pattern: /我叫(.+)/u, category: "fact", importance_score: 0.9 },
  { pattern: /我名字是(.+)/u, category: "fact", importance_score: 0.9 },
  { pattern: /叫我(.+)/u, category: "fact", importance_score: 0.9 },
  { pattern: /你可以叫我(.+)/u, category: "fact", importance_score: 0.9 },
  { pattern: /我的名字是(.+)/u, category: "fact", importance_score: 0.9 },
  { pattern: /My name is\s+(.+)/i, category: "fact", importance_score: 0.9 },
  { pattern: /I'm\s+(.+)/i, category: "fact", importance_score: 0.8 },
  { pattern: /Call me\s+(.+)/i, category: "fact", importance_score: 0.9 },
];

const FACT_RULES: ExtractionRule[] = [
  { pattern: /我是(.+)/u, category: "fact", importance_score: 0.8 },
  { pattern: /我在(.+)/u, category: "fact", importance_score: 0.6 },
  { pattern: /我住在(.+)/u, category: "fact", importance_score: 0.7 },
  { pattern: /我來自(.+)/u, category: "fact", importance_score: 0.7 },
  { pattern: /我的(.+)/u, category: "fact", importance_score: 0.6 },
  { pattern: /I am\s+(.+)/i, category: "fact", importance_score: 0.8 },
  { pattern: /I work\s+(.+)/i, category: "fact", importance_score: 0.6 },
  { pattern: /I live in\s+(.+)/i, category: "fact", importance_score: 0.7 },
  { pattern: /My\s+(.+)/i, category: "fact", importance_score: 0.6 },
];

const BEHAVIOR_RULES: ExtractionRule[] = [
  { pattern: /每次都(.+)/u, category: "behavior", importance_score: 0.5 },
  { pattern: /通常我會(.+)/u, category: "behavior", importance_score: 0.5 },
  { pattern: /我通常會(.+)/u, category: "behavior", importance_score: 0.5 },
  { pattern: /我經常(.+)/u, category: "behavior", importance_score: 0.5 },
  { pattern: /I usually\s+(.+)/i, category: "behavior", importance_score: 0.5 },
  { pattern: /I often\s+(.+)/i, category: "behavior", importance_score: 0.5 },
];

const ALL_RULES: ExtractionRule[] = [
  ...IDENTITY_RULES,
  ...PREFERENCE_RULES,
  ...FACT_RULES,
  ...BEHAVIOR_RULES,
];

const QUESTION_SUFFIX_RE = /[誰什麼哪怎嗎呢吧嘛呀幾多少何]$/u;
const QUESTION_PHRASE_RE =
  /是什麼|是誰|是哪|怎麼|如何|有沒有|能不能|可不可以|是否/u;

function isQuestion(clause: string, originalText: string): boolean {
  const idx = originalText.indexOf(clause);
  if (idx >= 0) {
    const afterClause = originalText.slice(
      idx + clause.length,
      idx + clause.length + 5,
    );
    if (/[？?]/.test(afterClause)) return true;
  }
  if (QUESTION_SUFFIX_RE.test(clause)) return true;
  if (QUESTION_PHRASE_RE.test(clause)) return true;
  return false;
}

function cleanContent(raw: string): string {
  return raw.replace(/[，。！？,.!?]$/, "").trim();
}

function splitIntoClauses(text: string): string[] {
  return text
    .split(/[，,；;。.！!]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const MIN_CONTENT_LENGTH = 3;

function extractMemoriesRegex(input: ExtractionInput): ExtractionResult {
  const clauses = splitIntoClauses(input.userMessage);
  const memories: ExtractedMemory[] = [];
  const seenContents = new Set<string>();

  for (const clause of clauses) {
    if (isQuestion(clause, input.userMessage)) continue;

    for (const rule of ALL_RULES) {
      const match = clause.match(rule.pattern);
      if (match) {
        const content = cleanContent(match[0]);
        if (
          content.length >= MIN_CONTENT_LENGTH &&
          !seenContents.has(content)
        ) {
          seenContents.add(content);
          memories.push({
            content,
            category: rule.category,
            importance_score: rule.importance_score,
          });
        }
        break;
      }
    }
  }

  return {
    memories,
    shouldStore: memories.length >= 1,
  };
}

function computeStringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const getBigrams = (str: string): Set<string> => {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.slice(i, i + 2));
    }
    return bigrams;
  };

  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);

  let intersection = 0;
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) {
      intersection++;
    }
  }

  const union = (bigramsA.size + bigramsB.size) / 2;
  if (union === 0) return 0.0;

  return intersection / union;
}

const DEDUP_SIMILARITY_THRESHOLD = 0.6;

export function deduplicateMemories(
  existing: string[],
  newMemories: ExtractedMemory[],
): ExtractedMemory[] {
  if (newMemories.length === 0) return [];
  if (existing.length === 0) return [...newMemories];

  return newMemories.filter((memory) => {
    const isDuplicate = existing.some((existingContent) => {
      if (
        existingContent.includes(memory.content) ||
        memory.content.includes(existingContent)
      ) {
        return true;
      }
      return (
        computeStringSimilarity(memory.content, existingContent) >=
        DEDUP_SIMILARITY_THRESHOLD
      );
    });
    return !isDuplicate;
  });
}
