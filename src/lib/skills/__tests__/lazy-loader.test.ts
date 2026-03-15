/**
 * Lazy Loader — Unit tests
 * 技能懶載入協調器測試
 */

import {
  loadSkillContent,
  buildSkillSystemMessage,
  createSkillCache,
} from "../lazy-loader";

// Mock Supabase client
function createMockSupabase(overrides: {
  user?: { id: string } | null;
  authError?: Error | null;
  skillData?: Record<string, unknown> | null;
  skillError?: Error | null;
} = {}) {
  const {
    user = { id: "user-123" },
    authError = null,
    skillData = null,
    skillError = null,
  } = overrides;

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user },
        error: authError,
      }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: skillData,
              error: skillError,
            }),
          }),
          single: jest.fn().mockResolvedValue({
            data: skillData,
            error: skillError,
          }),
        }),
      }),
    }),
  };
}

describe("loadSkillContent", () => {
  it("should load skill content by name", async () => {
    const mockSkill = {
      id: "skill-1",
      name: "docx-generator",
      display_name: "Word 文件產生器",
      description: "產生 Word 文件",
      skill_md: "# Docx Generator\nGenerate Word documents from conversation.",
      skill_config: { name: "docx-generator" },
      is_enabled: true,
    };

    const supabase = createMockSupabase({ skillData: mockSkill });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSkillContent("docx-generator", "user-123", supabase as any);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("docx-generator");
    expect(result!.skill_md).toContain("Docx Generator");
  });

  it("should return null for non-existent skill", async () => {
    const supabase = createMockSupabase({ skillData: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSkillContent("non-existent", "user-123", supabase as any);

    expect(result).toBeNull();
  });

  it("should return null on database error", async () => {
    const supabase = createMockSupabase({
      skillError: new Error("DB connection failed"),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSkillContent("docx-generator", "user-123", supabase as any);

    expect(result).toBeNull();
  });
});

describe("buildSkillSystemMessage", () => {
  it("should build system message from skill data", () => {
    const skill = {
      name: "docx-generator",
      display_name: "Word 文件產生器",
      description: "產生 Word 文件",
      skill_md: "# Docx Generator\n\nYou can generate Word documents.",
    };

    const result = buildSkillSystemMessage(skill);

    expect(result).toContain("[SKILL LOADED: docx-generator]");
    expect(result).toContain("Word 文件產生器");
    expect(result).toContain("# Docx Generator");
  });

  it("should include skill_md content in the message", () => {
    const skill = {
      name: "csv-export",
      display_name: "CSV 匯出",
      description: "匯出 CSV 資料",
      skill_md: "## Instructions\nExport data to CSV format.\n\n## Parameters\n- columns: list of columns",
    };

    const result = buildSkillSystemMessage(skill);

    expect(result).toContain("## Instructions");
    expect(result).toContain("Export data to CSV format");
    expect(result).toContain("## Parameters");
  });
});

describe("createSkillCache", () => {
  it("should return cached skill on second call", () => {
    const cache = createSkillCache();

    const skill = {
      name: "docx-generator",
      display_name: "Word 文件產生器",
      description: "產生 Word 文件",
      skill_md: "content",
    };

    cache.set("docx-generator", skill);
    const result = cache.get("docx-generator");

    expect(result).toEqual(skill);
  });

  it("should return undefined for uncached skill", () => {
    const cache = createSkillCache();

    expect(cache.get("unknown")).toBeUndefined();
  });

  it("should track loaded skill names", () => {
    const cache = createSkillCache();

    cache.set("skill-a", { name: "skill-a", display_name: "A", description: "A", skill_md: "" });
    cache.set("skill-b", { name: "skill-b", display_name: "B", description: "B", skill_md: "" });

    expect(cache.getLoadedNames()).toEqual(["skill-a", "skill-b"]);
  });

  it("should check if skill is loaded", () => {
    const cache = createSkillCache();

    cache.set("skill-a", { name: "skill-a", display_name: "A", description: "A", skill_md: "" });

    expect(cache.has("skill-a")).toBe(true);
    expect(cache.has("skill-b")).toBe(false);
  });
});
