/**
 * Personalized Memory System - Type Definitions
 *
 * flat 4 分類記憶系統的核心型別。
 * 與 Supabase user_memories 表結構對應。
 */

export type MemoryCategory = "preference" | "fact" | "behavior" | "context";

export const MEMORY_CATEGORIES: readonly MemoryCategory[] = [
  "preference",
  "fact",
  "behavior",
  "context",
] as const;

export interface UserMemory {
  id: string;
  user_id: string;
  content: string;
  category: MemoryCategory;
  importance_score: number;
  source_conversation_id: string | null;
  source_type: "auto" | "manual";
  is_active: boolean;
  access_count: number;
  last_accessed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ExtractedMemory {
  content: string;
  category: MemoryCategory;
  importance_score: number;
}

export interface MemorySearchResult {
  id: string;
  content: string;
  category: MemoryCategory;
  importance_score: number;
  similarity: number;
}

export interface MemorySearchOptions {
  threshold?: number;
  maxResults?: number;
}

export interface MemoryListOptions {
  category?: MemoryCategory;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateMemoryData {
  content: string;
  category: MemoryCategory;
  importance_score?: number;
  source_conversation_id?: string;
  source_type?: "auto" | "manual";
  metadata?: Record<string, unknown>;
}

export interface UpdateMemoryData {
  content?: string;
  category?: MemoryCategory;
  importance_score?: number;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
}
