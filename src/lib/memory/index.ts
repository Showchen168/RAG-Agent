/**
 * Personalized Memory System - Public API
 */

// Types
export type {
  UserMemory,
  MemoryCategory,
  ExtractedMemory,
  MemorySearchResult,
  MemorySearchOptions,
  MemoryListOptions,
  CreateMemoryData,
  UpdateMemoryData,
} from "./types";
export { MEMORY_CATEGORIES } from "./types";

// Repository (CRUD)
export {
  getUserMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  searchMemories,
} from "./memory-repository";

// Extractor (rule-based extraction)
export { extractMemories, deduplicateMemories } from "./memory-extractor";

// Retriever (search + format)
export { retrieveMemories, formatMemoryContext } from "./memory-retriever";
