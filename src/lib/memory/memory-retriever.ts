/**
 * Memory Retriever - 檢索與查詢相關的使用者記憶
 *
 * 負責：
 * 1. 將使用者查詢轉為 embedding
 * 2. 透過 searchMemories RPC 搜尋相關記憶
 * 3. 按加權分數排序
 * 4. 格式化為 XML 注入 system prompt
 */

import { embed } from "ai";
import {
  getEmbeddingModel,
  EMBEDDING_PROVIDER_OPTIONS,
} from "@/lib/ai/providers";
import { searchMemories } from "./memory-repository";
import type { MemorySearchResult } from "./types";

/**
 * 跳脫 XML 特殊字元，防止使用者內容注入 system prompt
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const DEFAULT_SEARCH_THRESHOLD = 0.5;
const DEFAULT_MAX_RESULTS = 10;
/** 加權公式：similarity * 0.7 + importance * 0.3 */
const SIMILARITY_WEIGHT = 0.7;
const IMPORTANCE_WEIGHT = 0.3;

type SupabaseClient = Parameters<typeof searchMemories>[2];

interface MemoryRetrievalInput {
  userId: string;
  query: string;
  supabase: SupabaseClient;
}

interface MemoryRetrievalResult {
  memories: MemorySearchResult[];
  formattedContext: string;
  totalCount: number;
}

/**
 * 計算記憶的加權分數
 */
function computeWeightedScore(memory: MemorySearchResult): number {
  return (
    memory.similarity * SIMILARITY_WEIGHT +
    memory.importance_score * IMPORTANCE_WEIGHT
  );
}

/**
 * 檢索與查詢相關的使用者記憶
 *
 * @param input - 包含 userId, query, supabase client
 * @returns MemoryRetrievalResult - 記憶列表、格式化上下文、總數
 */
export async function retrieveMemories(
  input: MemoryRetrievalInput,
): Promise<MemoryRetrievalResult> {
  const emptyResult: MemoryRetrievalResult = {
    memories: [],
    formattedContext: "",
    totalCount: 0,
  };

  try {
    // 1. 生成 query embedding
    const { embedding: queryEmbedding } = await embed({
      model: getEmbeddingModel(),
      value: input.query,
      providerOptions: EMBEDDING_PROVIDER_OPTIONS,
    });

    // 2. 搜尋相關記憶
    const { data, error } = await searchMemories(
      input.userId,
      queryEmbedding,
      input.supabase,
      {
        threshold: DEFAULT_SEARCH_THRESHOLD,
        maxResults: DEFAULT_MAX_RESULTS,
      },
    );

    if (error || !data || data.length === 0) {
      return emptyResult;
    }

    // 3. 按加權分數排序（高分優先）
    const sorted = [...data].sort(
      (a, b) => computeWeightedScore(b) - computeWeightedScore(a),
    );

    // 4. 格式化為 XML
    const formattedContext = formatMemoryContext(sorted);

    return {
      memories: sorted,
      formattedContext,
      totalCount: sorted.length,
    };
  } catch {
    // embedding 或搜尋失敗時靜默返回空結果，不影響聊天流程
    return emptyResult;
  }
}

/**
 * 將記憶列表格式化為 XML 注入 system prompt
 *
 * 格式：
 * ```xml
 * <user_memory_context>
 *   <memory category="preference" importance="0.8" similarity="0.9">使用者偏好深色模式</memory>
 *   <memory category="fact" importance="0.7" similarity="0.85">使用者是軟體工程師</memory>
 * </user_memory_context>
 * ```
 *
 * @param memories - 排序後的記憶列表
 * @returns XML 格式字串，空記憶回傳空字串
 */
export function formatMemoryContext(memories: MemorySearchResult[]): string {
  if (memories.length === 0) {
    return "";
  }

  const memoryTags = memories
    .map(
      (m) =>
        `  <memory category="${escapeXml(m.category)}" importance="${m.importance_score}" similarity="${m.similarity}">${escapeXml(m.content)}</memory>`,
    )
    .join("\n");

  return `<user_memory_context>
${memoryTags}
</user_memory_context>`;
}
