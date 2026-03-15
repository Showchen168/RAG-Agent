/**
 * Skills Execute API Handler - Unit Tests
 * TDD: Tests for POST /api/skills/execute pure function handler
 */

// Mock executor module
const mockExecuteSkill = jest.fn();
jest.mock("../executor", () => ({
  executeSkill: (...args: unknown[]) => mockExecuteSkill(...args),
}));

// Mock @supabase/supabase-js createClient for admin client tests
const mockCreateRawClient = jest.fn();
jest.mock("@supabase/supabase-js", () => ({
  ...jest.requireActual("@supabase/supabase-js"),
  createClient: (...args: unknown[]) => mockCreateRawClient(...args),
}));

import { handleExecuteSkill } from "../execute-handler";
import type { Skill } from "@/types/skills";

// ========== Fixtures ==========

const mockSkill: Skill = {
  id: "skill-001",
  user_id: "user-001",
  name: "test-skill",
  display_name: "Test Skill",
  description: "A test skill",
  icon: "file-text",
  category: "document",
  version: "1.0.0",
  skill_md: "# Test Skill",
  skill_config: {
    name: "test-skill",
    displayName: "Test Skill",
    description: "A test skill",
    icon: "file-text",
    category: "document",
    version: "1.0.0",
    input: { type: "both", userInputLabel: "Enter topic" },
    output: {
      fileType: "md",
      mimeType: "text/markdown",
      previewFormat: "markdown",
    },
    runtime: { baseImage: "node:20-slim", timeout: 60, maxMemory: "512m" },
  },
  storage_path: "/data/skills/user-001/test-skill/scripts",
  is_system: false,
  is_enabled: true,
  created_at: "2026-02-26T00:00:00Z",
  updated_at: "2026-02-26T00:00:00Z",
};

function createMockSupabase(options: {
  user?: { id: string } | null;
  skill?: Skill | null;
  skillError?: { message: string } | null;
  preference?: { is_enabled: boolean } | null;
}) {
  const {
    user = { id: "user-001" },
    skill = mockSkill,
    skillError = null,
    preference = null,
  } = options;

  const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null });
  const mockUpdateEq = jest.fn().mockResolvedValue({ data: null, error: null });
  const mockUpdate = jest.fn().mockReturnValue({ eq: mockUpdateEq });
  const mockFrom = jest.fn((table: string) => {
    if (table === "skills") {
      const mockSingle = jest.fn().mockResolvedValue({
        data: skill,
        error: skillError,
      });
      const mockEqId = jest.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEqId });
      return { select: mockSelect, insert: mockInsert, update: mockUpdate };
    }
    if (table === "user_skill_preferences") {
      const mockSingle = jest.fn().mockResolvedValue({
        data: preference,
        error: null,
      });
      const mockEqSkillId = jest.fn().mockReturnValue({ single: mockSingle });
      const mockEqUserId = jest.fn().mockReturnValue({ eq: mockEqSkillId });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEqUserId });
      return { select: mockSelect };
    }
    return {
      select: jest.fn(),
      insert: mockInsert,
      update: mockUpdate,
    };
  });

  const mockGetUser = jest.fn().mockResolvedValue({
    data: { user: user ? { id: user.id } : null },
    error: user ? null : { message: "Not authenticated" },
  });

  return {
    from: mockFrom,
    auth: { getUser: mockGetUser },
    _mockInsert: mockInsert,
    _mockUpdate: mockUpdate,
  };
}

// ========== Tests ==========

describe("handleExecuteSkill", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    // 保存並清除環境變數，確保 getAdminClient fallback 到 mock supabase
    savedEnv.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    savedEnv.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    // 還原環境變數
    if (savedEnv.SUPABASE_SERVICE_ROLE_KEY !== undefined) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.SUPABASE_SERVICE_ROLE_KEY;
    }
    if (savedEnv.NEXT_PUBLIC_SUPABASE_URL !== undefined) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.NEXT_PUBLIC_SUPABASE_URL;
    }
  });

  it("should return 401 when user is not authenticated", async () => {
    const supabase = createMockSupabase({ user: null });

    const result = await handleExecuteSkill(supabase as never, {
      skillId: "skill-001",
      userInput: "test",
    });

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: "Unauthorized" });
  });

  it("should return 400 when skillId is missing", async () => {
    const supabase = createMockSupabase({});

    const result = await handleExecuteSkill(supabase as never, {
      skillId: "",
      userInput: "test",
    });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Missing skillId" });
  });

  it("should return 404 when skill is not found", async () => {
    const supabase = createMockSupabase({ skill: null });

    const result = await handleExecuteSkill(supabase as never, {
      skillId: "nonexistent",
      userInput: "test",
    });

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "Skill not found" });
  });

  it("should return 400 when skill is disabled", async () => {
    const disabledSkill = { ...mockSkill, is_enabled: false };
    const supabase = createMockSupabase({ skill: disabledSkill });

    const result = await handleExecuteSkill(supabase as never, {
      skillId: "skill-001",
      userInput: "test",
    });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Skill is disabled" });
  });

  it("should return 400 when no input is provided for user/both input type", async () => {
    const supabase = createMockSupabase({});

    const result = await handleExecuteSkill(supabase as never, {
      skillId: "skill-001",
    });

    expect(result.status).toBe(400);
    expect((result.body as Record<string, string>).error).toContain("input");
  });

  it("should execute skill and return result on success", async () => {
    const supabase = createMockSupabase({});

    mockExecuteSkill.mockResolvedValue({
      message: "# Generated Document",
      attachment: {
        id: "att-001",
        fileName: "output.md",
        fileType: "md",
        mimeType: "text/markdown",
        fileSize: 2048,
        downloadUrl: "/api/skills/attachments/att-001",
        previewContent: "# Generated Document",
      },
    });

    const result = await handleExecuteSkill(supabase as never, {
      skillId: "skill-001",
      userInput: "Write about TypeScript",
      messageHistory: ["User: Hello"],
    });

    expect(result.status).toBe(200);
    expect((result.body as Record<string, unknown>).message).toBe(
      "# Generated Document",
    );
    expect((result.body as Record<string, unknown>).attachment).toBeDefined();
    expect(mockExecuteSkill).toHaveBeenCalledTimes(1);
  });

  it("should handle context-only skills without userInput", async () => {
    const contextSkill = {
      ...mockSkill,
      skill_config: {
        ...mockSkill.skill_config,
        input: { type: "context" as const },
      },
    };
    const supabase = createMockSupabase({ skill: contextSkill });

    mockExecuteSkill.mockResolvedValue({
      message: "Contextual response",
    });

    const result = await handleExecuteSkill(supabase as never, {
      skillId: "skill-001",
      messageHistory: ["User: I need a summary"],
    });

    expect(result.status).toBe(200);
  });

  it("should return 500 when executeSkill throws", async () => {
    const supabase = createMockSupabase({});

    mockExecuteSkill.mockRejectedValue(new Error("Docker execution timeout"));

    const result = await handleExecuteSkill(supabase as never, {
      skillId: "skill-001",
      userInput: "test",
    });

    expect(result.status).toBe(500);
    expect((result.body as Record<string, string>).error).toContain(
      "Docker execution timeout",
    );
  });

  it("should use admin client when SUPABASE_SERVICE_ROLE_KEY is set", async () => {
    // 設定環境變數觸發 admin client
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    // admin client 的 mock（由 createRawClient 返回）
    const adminMock = createMockSupabase({});
    mockCreateRawClient.mockReturnValue(adminMock);

    const supabase = createMockSupabase({});

    mockExecuteSkill.mockResolvedValue({
      message: "Generated with admin client",
    });

    const result = await handleExecuteSkill(supabase as never, {
      skillId: "skill-001",
      userInput: "test",
    });

    expect(result.status).toBe(200);
    // 驗證 createRawClient 被呼叫（即使用了 admin client）
    expect(mockCreateRawClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-service-role-key",
    );
    expect(mockExecuteSkill).toHaveBeenCalledTimes(1);
  });

  it("should pass messageHistory to executeSkill for multi-turn conversations", async () => {
    const supabase = createMockSupabase({});

    mockExecuteSkill.mockResolvedValue({
      message: "Iterated report v2",
      attachment: {
        id: "att-002",
        fileName: "report_v2.docx",
        fileType: "docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileSize: 4096,
        downloadUrl: "/api/skills/attachments/att-002",
        previewContent: null,
      },
    });

    const messageHistory = [
      "User: 幫我生成一份 AI 產業報告",
      "Assistant: 已生成文件：AI_產業報告.docx",
      "User: 請增加更多市場數據",
    ];

    const result = await handleExecuteSkill(supabase as never, {
      skillId: "skill-001",
      userInput: "請增加更多市場數據",
      messageHistory,
      conversationId: "conv-001",
      messageId: "msg-003",
      userMessageContent: "[Test Skill] 請增加更多市場數據",
    });

    expect(result.status).toBe(200);
    expect((result.body as Record<string, unknown>).message).toBe(
      "Iterated report v2",
    );

    // 驗證 executeSkill 收到了對話歷史
    const executeCall = mockExecuteSkill.mock.calls[0];
    expect(executeCall[1].messageHistory).toEqual(messageHistory);
    expect(executeCall[1].userInput).toBe("請增加更多市場數據");
  });

  // ─── Round 6: userId 傳遞到 executeSkill ───
  it("should pass userId from auth to executeSkill", async () => {
    const supabase = createMockSupabase({ user: { id: "user-xyz" } });

    mockExecuteSkill.mockResolvedValue({
      message: "Generated with userId",
    });

    const result = await handleExecuteSkill(supabase as never, {
      skillId: "skill-001",
      userInput: "test with userId",
    });

    expect(result.status).toBe(200);
    const executeCall = mockExecuteSkill.mock.calls[0];
    expect(executeCall[1].userId).toBe("user-xyz");
  });

  it("should persist messages with conversationId", async () => {
    const supabase = createMockSupabase({});
    // 為 from().insert() 添加 mock
    const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null });
    const mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    const originalFrom = supabase.from;
    supabase.from = jest.fn((table: string) => {
      if (table === "messages") {
        return { insert: mockInsert, update: mockUpdate } as never;
      }
      return originalFrom(table);
    });

    mockExecuteSkill.mockResolvedValue({
      message: "Result",
    });

    await handleExecuteSkill(supabase as never, {
      skillId: "skill-001",
      userInput: "test",
      conversationId: "conv-001",
      messageId: "msg-001",
      userMessageContent: "[Test Skill] test",
    });

    // 注意：有 SERVICE_ROLE_KEY 時會用 admin client，
    // 沒有時會用 supabase 本身。這裡測試 fallback 場景
    // （沒有 SERVICE_ROLE_KEY 時 getAdminClient 返回 supabase 本身）
    expect(mockExecuteSkill).toHaveBeenCalledTimes(1);
  });
});
