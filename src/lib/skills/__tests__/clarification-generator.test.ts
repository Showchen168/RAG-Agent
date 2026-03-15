/**
 * Clarification Generator - Unit Tests
 * TDD: Tests for generateClarificationQuestions with mocked AI SDK
 */

// Mock AI SDK generateObject
const mockGenerateObject = jest.fn();
jest.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

jest.mock("@ai-sdk/google", () => ({
  google: jest.fn(() => "mock-model"),
}));

import { generateClarificationQuestions } from "../clarification-generator";
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
  skill_md: "# DOCX Skill\n\n產生結構化的 Word 文件。",
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
    question: "希望包含哪些主題或章節？",
    type: "text" as const,
    placeholder: "例如：介紹、核心概念、實作範例",
  },
];

// ========== Tests ==========

describe("generateClarificationQuestions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return structured questions from generateObject", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { questions: mockQuestions },
    });

    const result = await generateClarificationQuestions(
      mockSkill,
      "TypeScript 入門教學",
    );

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("q1");
    expect(result[0].type).toBe("select");
    expect(result[0].options).toEqual(["初學者", "進階者", "專業人士"]);
    expect(result[2].type).toBe("text");
    expect(result[2].placeholder).toBeDefined();
  });

  it("should call generateObject with correct model and schema", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { questions: mockQuestions },
    });

    await generateClarificationQuestions(mockSkill, "React 教學");

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);

    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.model).toBe("mock-model");
    expect(callArgs.schema).toBeDefined();
    expect(callArgs.prompt).toContain("DOCX 文件生成");
    expect(callArgs.prompt).toContain("React 教學");
  });

  it("should include skill metadata in prompt", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { questions: mockQuestions },
    });

    await generateClarificationQuestions(mockSkill, "測試主題");

    const callArgs = mockGenerateObject.mock.calls[0][0];
    const prompt = callArgs.prompt as string;

    expect(prompt).toContain(mockSkill.display_name);
    expect(prompt).toContain(mockSkill.description);
    expect(prompt).toContain(mockSkill.skill_md);
    expect(prompt).toContain(
      mockSkill.skill_config.output.fileType.toUpperCase(),
    );
  });

  it("should propagate errors from generateObject", async () => {
    mockGenerateObject.mockRejectedValue(new Error("API quota exceeded"));

    await expect(
      generateClarificationQuestions(mockSkill, "some topic"),
    ).rejects.toThrow("API quota exceeded");
  });

  it("should handle 5-question response", async () => {
    const fiveQuestions = [
      ...mockQuestions,
      {
        id: "q4",
        question: "內容深度？",
        type: "select" as const,
        options: ["淺顯", "中等", "深入"],
      },
      {
        id: "q5",
        question: "希望的語言風格？",
        type: "multiselect" as const,
        options: ["正式", "輕鬆", "技術"],
      },
    ];

    mockGenerateObject.mockResolvedValue({
      object: { questions: fiveQuestions },
    });

    const result = await generateClarificationQuestions(
      mockSkill,
      "進階主題",
    );

    expect(result).toHaveLength(5);
    expect(result[4].type).toBe("multiselect");
    expect(result[4].options).toContain("正式");
  });
});
