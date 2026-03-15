jest.mock("ai", () => ({
  embed: jest.fn(),
}));
jest.mock("@/lib/ai/providers", () => ({
  getEmbeddingModel: jest.fn(() => "mock-embedding-model"),
  EMBEDDING_PROVIDER_OPTIONS: { google: { outputDimensionality: 3072 } },
}));
jest.mock("../memory-repository", () => ({
  searchMemories: jest.fn(),
}));

import { embed } from "ai";
import { searchMemories } from "../memory-repository";
import { retrieveMemories, formatMemoryContext } from "../memory-retriever";
import type { MemorySearchResult } from "../types";

const mockEmbed = embed as jest.MockedFunction<typeof embed>;
const mockSearchMemories = searchMemories as jest.MockedFunction<
  typeof searchMemories
>;

describe("memory-retriever", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -- formatMemoryContext (純函數，不需 mock) --
  describe("formatMemoryContext", () => {
    it("should return empty string for empty memories array", () => {
      const result = formatMemoryContext([]);
      expect(result).toBe("");
    });

    it("should format single memory as correct XML", () => {
      const memories: MemorySearchResult[] = [
        {
          id: "mem-1",
          content: "使用者偏好深色模式",
          category: "preference",
          importance_score: 0.8,
          similarity: 0.9,
        },
      ];

      const result = formatMemoryContext(memories);

      expect(result).toContain("<user_memory_context>");
      expect(result).toContain("</user_memory_context>");
      expect(result).toContain('<memory category="preference"');
      expect(result).toContain('importance="0.8"');
      expect(result).toContain('similarity="0.9"');
      expect(result).toContain("使用者偏好深色模式</memory>");
    });

    it("should format multiple memories in correct order", () => {
      const memories: MemorySearchResult[] = [
        {
          id: "mem-1",
          content: "User prefers Traditional Chinese",
          category: "preference",
          importance_score: 0.9,
          similarity: 0.85,
        },
        {
          id: "mem-2",
          content: "User is a software engineer",
          category: "fact",
          importance_score: 0.8,
          similarity: 0.75,
        },
      ];

      const result = formatMemoryContext(memories);

      expect(result).toContain("<user_memory_context>");
      expect(result).toContain("</user_memory_context>");
      // 第一個 memory 應先出現
      const prefIdx = result.indexOf("User prefers Traditional Chinese");
      const factIdx = result.indexOf("User is a software engineer");
      expect(prefIdx).toBeLessThan(factIdx);
    });

    it("should escape XML special characters in memory content", () => {
      const memories: MemorySearchResult[] = [
        {
          id: "mem-xss",
          content: "<script>alert(\"xss\")</script> & 'injection'",
          category: "fact",
          importance_score: 0.5,
          similarity: 0.8,
        },
      ];

      const result = formatMemoryContext(memories);

      expect(result).not.toContain("<script>");
      expect(result).toContain("&lt;script&gt;");
      expect(result).toContain("&amp;");
      expect(result).toContain("&quot;");
      expect(result).toContain("&apos;");
    });

    it("should include category, importance, and similarity attributes", () => {
      const memories: MemorySearchResult[] = [
        {
          id: "mem-1",
          content: "Test memory",
          category: "fact",
          importance_score: 0.7,
          similarity: 0.85,
        },
      ];

      const result = formatMemoryContext(memories);

      expect(result).toContain('category="fact"');
      expect(result).toContain('importance="0.7"');
      expect(result).toContain('similarity="0.85"');
    });
  });

  // -- retrieveMemories (需 mock) --
  describe("retrieveMemories", () => {
    it("should call searchMemories and format result", async () => {
      const mockEmbedding = new Array(3072).fill(0.1);
      mockEmbed.mockResolvedValue({
        embedding: mockEmbedding,
        usage: { tokens: 10 },
      } as unknown as Awaited<ReturnType<typeof embed>>);

      const mockResults: MemorySearchResult[] = [
        {
          id: "mem-1",
          content: "User prefers Traditional Chinese",
          category: "preference",
          importance_score: 0.9,
          similarity: 0.85,
        },
        {
          id: "mem-2",
          content: "User is a software engineer",
          category: "fact",
          importance_score: 0.8,
          similarity: 0.75,
        },
      ];

      mockSearchMemories.mockResolvedValue({
        data: mockResults,
        error: null,
      });

      const supabase = {} as Parameters<typeof retrieveMemories>[0]["supabase"];

      const result = await retrieveMemories({
        userId: "user-123",
        query: "How should I structure my React project?",
        supabase,
      });

      expect(mockEmbed).toHaveBeenCalledWith(
        expect.objectContaining({
          value: "How should I structure my React project?",
        }),
      );
      expect(mockSearchMemories).toHaveBeenCalledWith(
        "user-123",
        mockEmbedding,
        supabase,
        expect.objectContaining({
          threshold: expect.any(Number),
          maxResults: expect.any(Number),
        }),
      );
      expect(result.memories).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.formattedContext).toContain("<user_memory_context>");
    });

    it("should return empty result when no memories found", async () => {
      mockEmbed.mockResolvedValue({
        embedding: new Array(3072).fill(0.1),
        usage: { tokens: 10 },
      } as unknown as Awaited<ReturnType<typeof embed>>);

      mockSearchMemories.mockResolvedValue({
        data: [],
        error: null,
      });

      const supabase = {} as Parameters<typeof retrieveMemories>[0]["supabase"];
      const result = await retrieveMemories({
        userId: "user-123",
        query: "test query",
        supabase,
      });

      expect(result.totalCount).toBe(0);
      expect(result.formattedContext).toBe("");
      expect(result.memories).toEqual([]);
    });

    it("should return empty result when search returns error", async () => {
      mockEmbed.mockResolvedValue({
        embedding: new Array(3072).fill(0.1),
        usage: { tokens: 10 },
      } as unknown as Awaited<ReturnType<typeof embed>>);

      mockSearchMemories.mockResolvedValue({
        data: null,
        error: { message: "RPC failed" },
      });

      const supabase = {} as Parameters<typeof retrieveMemories>[0]["supabase"];
      const result = await retrieveMemories({
        userId: "user-123",
        query: "test query",
        supabase,
      });

      expect(result.totalCount).toBe(0);
      expect(result.formattedContext).toBe("");
      expect(result.memories).toEqual([]);
    });

    it("should return empty result when embedding fails", async () => {
      mockEmbed.mockRejectedValue(new Error("Embedding API error"));

      const supabase = {} as Parameters<typeof retrieveMemories>[0]["supabase"];
      const result = await retrieveMemories({
        userId: "user-123",
        query: "test query",
        supabase,
      });

      expect(result.totalCount).toBe(0);
      expect(result.formattedContext).toBe("");
      expect(result.memories).toEqual([]);
    });

    it("should sort results by importance * similarity weighted score", async () => {
      mockEmbed.mockResolvedValue({
        embedding: new Array(3072).fill(0.1),
        usage: { tokens: 10 },
      } as unknown as Awaited<ReturnType<typeof embed>>);

      const mockResults: MemorySearchResult[] = [
        {
          id: "mem-1",
          content: "Low similarity, high importance",
          category: "fact",
          importance_score: 1.0,
          similarity: 0.6,
          // weighted = 1.0 * 0.3 + 0.6 * 0.7 = 0.72
        },
        {
          id: "mem-2",
          content: "High similarity, low importance",
          category: "preference",
          importance_score: 0.3,
          similarity: 0.95,
          // weighted = 0.3 * 0.3 + 0.95 * 0.7 = 0.755
        },
      ];

      mockSearchMemories.mockResolvedValue({
        data: mockResults,
        error: null,
      });

      const supabase = {} as Parameters<typeof retrieveMemories>[0]["supabase"];
      const result = await retrieveMemories({
        userId: "user-123",
        query: "test query",
        supabase,
      });

      // mem-2 should come first (higher weighted score)
      expect(result.memories[0].id).toBe("mem-2");
      expect(result.memories[1].id).toBe("mem-1");
    });
  });
});
