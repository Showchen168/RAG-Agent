/**
 * Skill Index — Unit tests
 * 技能索引格式生成與查詢的測試
 */

import {
  buildSkillsIndexText,
  toSkillIndexEntry,
  type SkillIndexEntry,
} from "../skill-index";

describe("buildSkillsIndexText", () => {
  it("should return empty string for empty skills array", () => {
    const result = buildSkillsIndexText([]);
    expect(result).toBe("");
  });

  it("should generate index text for a single skill", () => {
    const skills: SkillIndexEntry[] = [
      {
        name: "docx-generator",
        displayName: "Word \u6587\u4ef6\u7522\u751f\u5668",
        description:
          "\u5c07\u5c0d\u8a71\u5167\u5bb9\u8f49\u63db\u70ba Word \u6587\u4ef6",
      },
    ];

    const result = buildSkillsIndexText(skills);

    expect(result).toContain("[AVAILABLE SKILLS INDEX]");
    expect(result).toContain("docx-generator");
    expect(result).toContain("Word \u6587\u4ef6\u7522\u751f\u5668");
    expect(result).toContain(
      "\u5c07\u5c0d\u8a71\u5167\u5bb9\u8f49\u63db\u70ba Word \u6587\u4ef6",
    );
    expect(result).toContain("[LOAD_SKILL: docx-generator]");
  });

  it("should generate index text for multiple skills", () => {
    const skills: SkillIndexEntry[] = [
      {
        name: "docx-generator",
        displayName: "Word \u6587\u4ef6\u7522\u751f\u5668",
        description: "\u7522\u751f Word \u6587\u4ef6",
      },
      {
        name: "csv-export",
        displayName: "CSV \u532f\u51fa",
        description: "\u5c07\u8cc7\u6599\u532f\u51fa\u70ba CSV",
      },
      {
        name: "code-review",
        displayName: "\u7a0b\u5f0f\u78bc\u5be9\u67e5",
        description: "\u5be9\u67e5\u7a0b\u5f0f\u78bc\u54c1\u8cea",
      },
    ];

    const result = buildSkillsIndexText(skills);

    expect(result).toContain("docx-generator");
    expect(result).toContain("csv-export");
    expect(result).toContain("code-review");
    // Should contain numbered list
    expect(result).toMatch(/1\./);
    expect(result).toMatch(/2\./);
    expect(result).toMatch(/3\./);
  });

  it("should not contain prompt_template or skill_md content", () => {
    const skills: SkillIndexEntry[] = [
      {
        name: "docx-generator",
        displayName: "Word \u6587\u4ef6\u7522\u751f\u5668",
        description: "\u7522\u751f Word \u6587\u4ef6",
      },
    ];

    const result = buildSkillsIndexText(skills);

    // Should be lightweight — no full prompt template
    expect(result).not.toContain("prompt_template");
    expect(result).not.toContain("skill_md");
    // Should be reasonably short
    expect(result.length).toBeLessThan(2000);
  });

  it("should include instruction for AI to use LOAD_SKILL marker", () => {
    const skills: SkillIndexEntry[] = [
      {
        name: "test-skill",
        displayName: "Test",
        description: "Test skill",
      },
    ];

    const result = buildSkillsIndexText(skills);

    expect(result).toContain("[LOAD_SKILL:");
    expect(result).toContain("test-skill");
  });
});

describe("toSkillIndexEntry", () => {
  it("should convert DB skill format to index entry", () => {
    const dbSkill = {
      name: "docx-generator",
      display_name: "Word Generator",
      description: "Generates Word documents",
    };

    const entry = toSkillIndexEntry(dbSkill);

    expect(entry.name).toBe("docx-generator");
    expect(entry.displayName).toBe("Word Generator");
    expect(entry.description).toBe("Generates Word documents");
  });
});
