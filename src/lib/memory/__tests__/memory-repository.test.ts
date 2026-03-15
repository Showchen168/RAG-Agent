jest.mock("ai", () => ({
  embed: jest.fn(),
}));
jest.mock("@/lib/ai/providers", () => ({
  getEmbeddingModel: jest.fn(() => "mock-embedding-model"),
  EMBEDDING_PROVIDER_OPTIONS: { google: { outputDimensionality: 3072 } },
}));

import { embed } from "ai";
import {
  getUserMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  searchMemories,
} from "../memory-repository";
import type { MemoryCategory } from "../types";

const mockEmbed = embed as jest.MockedFunction<typeof embed>;

// -- Mock Supabase Client Factory --
function createMockSupabase(
  opts: {
    selectData?: Record<string, unknown>[] | null;
    selectError?: { message: string } | null;
    insertData?: Record<string, unknown> | null;
    insertError?: { message: string } | null;
    updateData?: Record<string, unknown> | null;
    updateError?: { message: string } | null;
    deleteError?: { message: string } | null;
    rpcData?: Record<string, unknown>[] | null;
    rpcError?: { message: string } | null;
  } = {},
) {
  const selectDataOrDefault = opts.selectError ? null : (opts.selectData ?? []);
  const orderReturn = {
    range: jest.fn().mockReturnValue({
      data: selectDataOrDefault,
      error: opts.selectError ?? null,
    }),
    data: selectDataOrDefault,
    error: opts.selectError ?? null,
  };
  const eqChain = {
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnValue(orderReturn),
    single: jest.fn().mockReturnValue({
      data: opts.selectData?.[0] ?? null,
      error: opts.selectError ?? null,
    }),
    data: selectDataOrDefault,
    error: opts.selectError ?? null,
  };

  const selectChain = {
    eq: jest.fn().mockReturnValue(eqChain),
    order: jest.fn().mockReturnValue(orderReturn),
  };

  const insertChain = {
    select: jest.fn().mockReturnValue({
      single: jest.fn().mockReturnValue({
        data: opts.insertData ?? null,
        error: opts.insertError ?? null,
      }),
    }),
  };

  const updateChain = {
    eq: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockReturnValue({
            data: opts.updateData ?? null,
            error: opts.updateError ?? null,
          }),
        }),
        data: opts.updateData ?? null,
        error: opts.updateError ?? null,
      }),
    }),
  };

  const deleteChain = {
    eq: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        data: null,
        error: opts.deleteError ?? null,
      }),
    }),
  };

  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue(selectChain),
      insert: jest.fn().mockReturnValue(insertChain),
      update: jest.fn().mockReturnValue(updateChain),
      delete: jest.fn().mockReturnValue(deleteChain),
    }),
    rpc: jest.fn().mockReturnValue({
      data: opts.rpcData ?? null,
      error: opts.rpcError ?? null,
    }),
  } as unknown as Parameters<typeof getUserMemories>[1];
}

const TEST_USER_ID = "user-123-abc";
const TEST_MEMORY_ID = "mem-456-def";

describe("memory-repository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -- getUserMemories --
  describe("getUserMemories", () => {
    it("should return user memories with default options", async () => {
      const mockMemories = [
        {
          id: TEST_MEMORY_ID,
          user_id: TEST_USER_ID,
          content: "User prefers Traditional Chinese",
          category: "preference",
          importance_score: 0.9,
          is_active: true,
          created_at: "2026-02-26T00:00:00Z",
          updated_at: "2026-02-26T00:00:00Z",
        },
      ];
      const supabase = createMockSupabase({ selectData: mockMemories });

      const result = await getUserMemories(TEST_USER_ID, supabase);

      expect(result.data).toEqual(mockMemories);
      expect(result.error).toBeNull();
      expect(supabase.from).toHaveBeenCalledWith("user_memories");
    });

    it("should filter by category when provided", async () => {
      const supabase = createMockSupabase({ selectData: [] });

      await getUserMemories(TEST_USER_ID, supabase, { category: "preference" });

      const fromCall = supabase.from("user_memories");
      const selectCall = fromCall.select("*");
      expect(selectCall.eq).toHaveBeenCalledWith("user_id", TEST_USER_ID);
    });

    it("should return error when query fails", async () => {
      const supabase = createMockSupabase({
        selectData: null,
        selectError: { message: "DB connection failed" },
      });

      const result = await getUserMemories(TEST_USER_ID, supabase);

      expect(result.error).toBeTruthy();
      expect(result.data).toBeNull();
    });
  });

  // -- createMemory --
  describe("createMemory", () => {
    it("should create a memory with embedding", async () => {
      const mockEmbedding = new Array(3072).fill(0.1);
      mockEmbed.mockResolvedValue({
        embedding: mockEmbedding,
        usage: { tokens: 10 },
      } as unknown as Awaited<ReturnType<typeof embed>>);

      const createdMemory = {
        id: TEST_MEMORY_ID,
        user_id: TEST_USER_ID,
        content: "User is a software engineer",
        category: "fact",
        importance_score: 0.8,
        source_type: "auto",
        is_active: true,
        created_at: "2026-02-26T00:00:00Z",
        updated_at: "2026-02-26T00:00:00Z",
      };
      const supabase = createMockSupabase({ insertData: createdMemory });

      const result = await createMemory(TEST_USER_ID, supabase, {
        content: "User is a software engineer",
        category: "fact",
        importance_score: 0.8,
      });

      expect(mockEmbed).toHaveBeenCalledWith(
        expect.objectContaining({
          value: "User is a software engineer",
        }),
      );
      expect(result.data).toEqual(createdMemory);
      expect(result.error).toBeNull();
    });

    it("should use default importance_score when not provided", async () => {
      mockEmbed.mockResolvedValue({
        embedding: new Array(3072).fill(0.1),
        usage: { tokens: 10 },
      } as unknown as Awaited<ReturnType<typeof embed>>);

      const supabase = createMockSupabase({
        insertData: { id: TEST_MEMORY_ID, importance_score: 0.5 },
      });

      await createMemory(TEST_USER_ID, supabase, {
        content: "Test memory",
        category: "fact",
      });

      const fromCall = supabase.from("user_memories");
      expect(fromCall.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          importance_score: 0.5,
        }),
      );
    });

    it("should return error when embedding generation fails", async () => {
      mockEmbed.mockRejectedValue(new Error("Embedding API error"));

      const supabase = createMockSupabase();

      const result = await createMemory(TEST_USER_ID, supabase, {
        content: "Test memory",
        category: "fact",
      });

      expect(result.error).toBeTruthy();
      expect(result.data).toBeNull();
    });
  });

  // -- updateMemory --
  describe("updateMemory", () => {
    it("should update memory content and regenerate embedding", async () => {
      const mockEmbedding = new Array(3072).fill(0.2);
      mockEmbed.mockResolvedValue({
        embedding: mockEmbedding,
        usage: { tokens: 10 },
      } as unknown as Awaited<ReturnType<typeof embed>>);

      const updatedMemory = {
        id: TEST_MEMORY_ID,
        content: "Updated content",
        category: "fact",
      };
      const supabase = createMockSupabase({ updateData: updatedMemory });

      const result = await updateMemory(
        TEST_MEMORY_ID,
        TEST_USER_ID,
        supabase,
        {
          content: "Updated content",
        },
      );

      expect(mockEmbed).toHaveBeenCalled();
      expect(result.data).toEqual(updatedMemory);
      expect(result.error).toBeNull();
    });

    it("should not regenerate embedding when content is not changed", async () => {
      const supabase = createMockSupabase({
        updateData: { id: TEST_MEMORY_ID, importance_score: 0.9 },
      });

      await updateMemory(TEST_MEMORY_ID, TEST_USER_ID, supabase, {
        importance_score: 0.9,
      });

      expect(mockEmbed).not.toHaveBeenCalled();
    });
  });

  // -- deleteMemory --
  describe("deleteMemory", () => {
    it("should soft-delete memory by setting is_active to false", async () => {
      const supabase = createMockSupabase({
        updateData: { id: TEST_MEMORY_ID, is_active: false },
      });

      const result = await deleteMemory(TEST_MEMORY_ID, TEST_USER_ID, supabase);

      expect(result.error).toBeNull();
    });

    it("should hard-delete memory when hard flag is true", async () => {
      const supabase = createMockSupabase();

      const result = await deleteMemory(
        TEST_MEMORY_ID,
        TEST_USER_ID,
        supabase,
        true,
      );

      expect(result.error).toBeNull();
      expect(supabase.from).toHaveBeenCalledWith("user_memories");
    });
  });

  // -- searchMemories --
  describe("searchMemories", () => {
    it("should call match_user_memories RPC with correct params", async () => {
      const mockEmbedding = new Array(3072).fill(0.3);
      const mockResults = [
        {
          id: TEST_MEMORY_ID,
          content: "User prefers Traditional Chinese",
          category: "preference",
          importance_score: 0.9,
          similarity: 0.85,
        },
      ];
      const supabase = createMockSupabase({ rpcData: mockResults });

      const result = await searchMemories(
        TEST_USER_ID,
        mockEmbedding,
        supabase,
        { threshold: 0.7, maxResults: 5 },
      );

      expect(supabase.rpc).toHaveBeenCalledWith("match_user_memories", {
        query_embedding: JSON.stringify(mockEmbedding),
        match_threshold: 0.7,
        match_count: 5,
        p_user_id: TEST_USER_ID,
      });
      expect(result.data).toEqual(mockResults);
      expect(result.error).toBeNull();
    });

    it("should use default options when not provided", async () => {
      const mockEmbedding = new Array(3072).fill(0.1);
      const supabase = createMockSupabase({ rpcData: [] });

      await searchMemories(TEST_USER_ID, mockEmbedding, supabase);

      expect(supabase.rpc).toHaveBeenCalledWith("match_user_memories", {
        query_embedding: JSON.stringify(mockEmbedding),
        match_threshold: 0.5,
        match_count: 5,
        p_user_id: TEST_USER_ID,
      });
    });

    it("should return error when RPC fails", async () => {
      const supabase = createMockSupabase({
        rpcError: { message: "RPC function not found" },
      });

      const result = await searchMemories(
        TEST_USER_ID,
        new Array(3072).fill(0),
        supabase,
      );

      expect(result.error).toBeTruthy();
      expect(result.data).toBeNull();
    });
  });
});
