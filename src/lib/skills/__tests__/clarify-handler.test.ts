/**
 * Skills Clarify API Handler - Unit Tests
 * TDD: Tests for POST /api/skills/clarify pure function handler
 */

// Mock clarification-generator module
const mockGenerateClarificationQuestions = jest.fn();
jest.mock("../clarification-generator", () => ({
  generateClarificationQuestions: (...args: unknown[]) =>
    mockGenerateClarificationQuestions(...args),
}));

import { handleClarifySkill } from "../clarify-handler";
import type { Skill } from "@/types/skills";

// ========== Fixtures ==========

const mockSkill: Skill = {
  id: "skill-001",
  user_id: "user-001",
  name: "docx-skill",
  display_name: "DOCX 文件生成",
  description: "根據主題產生 Word 文件",
  icon: "file-text",
  category: "document",
  version: "1.0.0",
  skill_md: "# DOCX Skill",
  skill_config: {
    name: "docx-skill",
    displayName: "DOCX 文件生成",
    description: "根據主題產生 Word 文件",
    icon: "file-text",
    category: "document",
    version: "1.0.0",
    input: { type: "both", userInputLabel: "輸入主題" },
    output: {
      fileType: "docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      previewFormat: "markdown",
    },
    runtime: { baseImage: "node:20-slim", timeout: 120, maxMemory: "512m" },
  },
  storage_path: "/data/skills/user-001/docx-skill/scripts",
  is_system: false,
  is_enabled: true,
  created_at: "2026-02-27T00:00:00Z",
  updated_at: "2026-02-27T00:00:00Z",
};

const mockQuestions = [
  {
    id: "q1",
    question: "目標受眾是誰？",
    type: "select" as const,
    options: ["初學者", "進階者", "專業人士"],
  },
  {
    id: "q2",
    question: "文件的主要用途？",
    type: "select" as const,
    options: ["教學", "報告", "參考文件"],
  },
  {
    id: "q3",
    question: "希望包含哪些主題？",
    type: "text" as const,
    placeholder: "例如：核心概念、實作範例",
  },
];

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

  const mockFrom = jest.fn((table: string) => {
    if (table === "skills") {
      const mockSingle = jest.fn().mockResolvedValue({
        data: skill,
        error: skillError,
      });
      const mockEqId = jest.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEqId });
      return { select: mockSelect };
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
    return { select: jest.fn() };
  });

  const mockGetUser = jest.fn().mockResolvedValue({
    data: { user: user ? { id: user.id } : null },
    error: user ? null : { message: "Not authenticated" },
  });

  return {
    from: mockFrom,
    auth: { getUser: mockGetUser },
  };
}

// ========== Tests ==========

describe("handleClarifySkill", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 when user is not authenticated", async () => {
    const supabase = createMockSupabase({ user: null });

    const result = await handleClarifySkill(supabase as never, {
      skillId: "skill-001",
      userInput: "TypeScript 教學",
    });

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: "Unauthorized" });
  });

  it("should return 400 when skillId is missing", async () => {
    const supabase = createMockSupabase({});

    const result = await handleClarifySkill(supabase as never, {
      skillId: "",
      userInput: "TypeScript 教學",
    });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Missing skillId" });
  });

  it("should return 400 when userInput is missing", async () => {
    const supabase = createMockSupabase({});

    const result = await handleClarifySkill(supabase as never, {
      skillId: "skill-001",
      userInput: "",
    });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Missing userInput" });
  });

  it("should return 400 when userInput is whitespace only", async () => {
    const supabase = createMockSupabase({});

    const result = await handleClarifySkill(supabase as never, {
      skillId: "skill-001",
      userInput: "   ",
    });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Missing userInput" });
  });

  it("should return 404 when skill is not found", async () => {
    const supabase = createMockSupabase({ skill: null });

    const result = await handleClarifySkill(supabase as never, {
      skillId: "nonexistent",
      userInput: "test",
    });

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "Skill not found" });
  });

  it("should return 400 when skill is disabled", async () => {
    const disabledSkill = { ...mockSkill, is_enabled: false };
    const supabase = createMockSupabase({ skill: disabledSkill });

    const result = await handleClarifySkill(supabase as never, {
      skillId: "skill-001",
      userInput: "test",
    });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Skill is disabled" });
  });

  it("should return 200 with questions on success", async () => {
    const supabase = createMockSupabase({});
    mockGenerateClarificationQuestions.mockResolvedValue(mockQuestions);

    const result = await handleClarifySkill(supabase as never, {
      skillId: "skill-001",
      userInput: "TypeScript 入門教學",
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ questions: mockQuestions });
    expect(mockGenerateClarificationQuestions).toHaveBeenCalledTimes(1);
    expect(mockGenerateClarificationQuestions).toHaveBeenCalledWith(
      expect.objectContaining({ id: "skill-001" }),
      "TypeScript 入門教學",
    );
  });

  it("should return 500 when generator throws an error", async () => {
    const supabase = createMockSupabase({});
    mockGenerateClarificationQuestions.mockRejectedValue(
      new Error("Gemini API rate limit"),
    );

    const result = await handleClarifySkill(supabase as never, {
      skillId: "skill-001",
      userInput: "test topic",
    });

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Gemini API rate limit" });
  });

  it("should return generic 500 message for non-Error throws", async () => {
    const supabase = createMockSupabase({});
    mockGenerateClarificationQuestions.mockRejectedValue("unexpected");

    const result = await handleClarifySkill(supabase as never, {
      skillId: "skill-001",
      userInput: "test topic",
    });

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: "Failed to generate clarification questions",
    });
  });

  it("should return 404 when supabase returns an error", async () => {
    const supabase = createMockSupabase({
      skillError: { message: "DB error" },
      skill: null,
    });

    const result = await handleClarifySkill(supabase as never, {
      skillId: "skill-001",
      userInput: "test",
    });

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "Skill not found" });
  });
});
