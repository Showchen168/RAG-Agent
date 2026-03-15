/**
 * Memory Repository - CRUD operations for user_memories table
 *
 * 所有 DB 操作的封裝層，使用注入的 Supabase client 確保 RLS 隔離。
 */

import { embed } from "ai";
import {
  getEmbeddingModel,
  EMBEDDING_PROVIDER_OPTIONS,
} from "@/lib/ai/providers";
import type {
  UserMemory,
  MemorySearchResult,
  MemorySearchOptions,
  MemoryListOptions,
  CreateMemoryData,
  UpdateMemoryData,
} from "./types";

/**
 * Supabase client 的簡化型別
 *
 * 使用 SupabaseClient from @supabase/supabase-js 在實際整合時，
 * 這裡用簡化型別方便 mock 測試。
 */
type SupabaseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => Record<string, any>;
  rpc: (
    fn: string,
    params: Record<string, unknown>,
  ) => {
    data: MemorySearchResult[] | null;
    error: { message: string } | null;
  };
};

interface RepositoryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

/**
 * 生成文字的 embedding 向量
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: getEmbeddingModel(),
    value: text,
    providerOptions: EMBEDDING_PROVIDER_OPTIONS,
  });
  return embedding;
}

/**
 * 取得使用者記憶列表
 */
export async function getUserMemories(
  userId: string,
  supabase: SupabaseClient,
  options: MemoryListOptions = {},
): Promise<RepositoryResult<UserMemory[]>> {
  const { category, isActive = true, limit = 50, offset = 0 } = options;

  let query = supabase
    .from("user_memories")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", isActive);

  if (category) {
    query = query.eq("category", category) as typeof query;
  }

  const result = query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Handle both sync (mock) and async (real Supabase PromiseLike) results
  const resolved = await Promise.resolve(result);

  return {
    data: resolved.data as UserMemory[] | null,
    error: resolved.error,
  };
}

/**
 * 建立新記憶（含 embedding 生成）
 */
export async function createMemory(
  userId: string,
  supabase: SupabaseClient,
  data: CreateMemoryData,
): Promise<RepositoryResult<UserMemory>> {
  try {
    const embedding = await generateEmbedding(data.content);

    const insertData = {
      user_id: userId,
      content: data.content,
      embedding: JSON.stringify(embedding),
      category: data.category,
      importance_score: data.importance_score ?? 0.5,
      source_conversation_id: data.source_conversation_id ?? null,
      source_type: data.source_type ?? "auto",
      metadata: data.metadata ?? {},
    };

    const result = supabase
      .from("user_memories")
      .insert(insertData)
      .select("*")
      .single();

    // Handle both sync (mock) and async (real Supabase PromiseLike) results
    const resolved = await Promise.resolve(result);

    return {
      data: resolved.data as UserMemory | null,
      error: resolved.error,
    };
  } catch (error) {
    return {
      data: null,
      error: {
        message:
          error instanceof Error ? error.message : "Failed to create memory",
      },
    };
  }
}

/**
 * 更新記憶（如果 content 有變更則重新生成 embedding）
 */
export async function updateMemory(
  memoryId: string,
  userId: string,
  supabase: SupabaseClient,
  data: UpdateMemoryData,
): Promise<RepositoryResult<UserMemory>> {
  try {
    const updatePayload: Record<string, unknown> = {
      ...data,
      updated_at: new Date().toISOString(),
    };

    // 如果 content 有變更，重新生成 embedding
    if (data.content) {
      const embedding = await generateEmbedding(data.content);
      updatePayload.embedding = JSON.stringify(embedding);
    }

    const result = supabase
      .from("user_memories")
      .update(updatePayload)
      .eq("id", memoryId)
      .eq("user_id", userId)
      .select("*")
      .single();

    // Handle both sync (mock) and async (real Supabase PromiseLike) results
    const resolved = await Promise.resolve(result);

    return {
      data: resolved.data as UserMemory | null,
      error: resolved.error,
    };
  } catch (error) {
    return {
      data: null,
      error: {
        message:
          error instanceof Error ? error.message : "Failed to update memory",
      },
    };
  }
}

/**
 * 刪除記憶
 * @param hard - true: 硬刪除（真刪除）, false: 軟刪除（is_active = false）
 */
export async function deleteMemory(
  memoryId: string,
  userId: string,
  supabase: SupabaseClient,
  hard = false,
): Promise<RepositoryResult<null>> {
  if (hard) {
    const result = supabase
      .from("user_memories")
      .delete()
      .eq("id", memoryId)
      .eq("user_id", userId);

    // Handle both sync (mock) and async (real Supabase PromiseLike) results
    const resolved = await Promise.resolve(result);

    return { data: null, error: resolved.error };
  }

  // 軟刪除：設為 is_active = false
  const result = supabase
    .from("user_memories")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", memoryId)
    .eq("user_id", userId);

  // Handle both sync (mock) and async (real Supabase PromiseLike) results
  const resolvedSoft = await Promise.resolve(result);

  return { data: null, error: resolvedSoft.error };
}

/**
 * 語意搜尋記憶（透過 match_user_memories RPC）
 */
export async function searchMemories(
  userId: string,
  queryEmbedding: number[],
  supabase: SupabaseClient,
  options: MemorySearchOptions = {},
): Promise<RepositoryResult<MemorySearchResult[]>> {
  const { threshold = 0.5, maxResults = 5 } = options;

  const result = supabase.rpc("match_user_memories", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: threshold,
    match_count: maxResults,
    p_user_id: userId,
  });

  // Handle both sync (mock) and async (real Supabase PromiseLike) results
  const resolved = await Promise.resolve(result);

  return {
    data: resolved.data as MemorySearchResult[] | null,
    error: resolved.error,
  };
}
