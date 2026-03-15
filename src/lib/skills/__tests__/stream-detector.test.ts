/**
 * Stream Detector — Unit tests
 * Marker detection and security tests
 */

import {
  detectSkillLoadRequest,
  stripSkillLoadMarkers,
  LOAD_SKILL_PATTERN,
} from "../stream-detector";

describe("LOAD_SKILL_PATTERN", () => {
  it("should match valid skill load marker", () => {
    const text = "[LOAD_SKILL: docx-generator]";
    LOAD_SKILL_PATTERN.lastIndex = 0;
    const match = LOAD_SKILL_PATTERN.exec(text);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("docx-generator");
  });

  it("should match marker without spaces", () => {
    const text = "[LOAD_SKILL:docx-generator]";
    LOAD_SKILL_PATTERN.lastIndex = 0;
    const match = LOAD_SKILL_PATTERN.exec(text);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("docx-generator");
  });

  it("should match marker with extra spaces", () => {
    const text = "[LOAD_SKILL:  csv-export  ]";
    LOAD_SKILL_PATTERN.lastIndex = 0;
    const match = LOAD_SKILL_PATTERN.exec(text);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBe("csv-export");
  });

  it("should not match path traversal attempts", () => {
    const text = "[LOAD_SKILL: ../../etc/passwd]";
    LOAD_SKILL_PATTERN.lastIndex = 0;
    const match = LOAD_SKILL_PATTERN.exec(text);
    if (match) {
      expect(match[1]).not.toContain("/");
    }
  });

  it("should not match SQL injection attempts", () => {
    const text = '[LOAD_SKILL: "; DROP TABLE skills;]';
    LOAD_SKILL_PATTERN.lastIndex = 0;
    const match = LOAD_SKILL_PATTERN.exec(text);
    if (match) {
      expect(match[1]).not.toContain(";");
    }
  });

  it("should not match XSS attempts", () => {
    const text = "[LOAD_SKILL: <script>alert(1)</script>]";
    LOAD_SKILL_PATTERN.lastIndex = 0;
    const match = LOAD_SKILL_PATTERN.exec(text);
    if (match) {
      expect(match[1]).not.toContain("<");
    }
  });
});

describe("detectSkillLoadRequest", () => {
  it("should detect a single skill load request", () => {
    const text =
      "I need to load a skill. [LOAD_SKILL: docx-generator] Please wait...";
    const result = detectSkillLoadRequest(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("docx-generator");
  });

  it("should detect multiple skill load requests", () => {
    const text =
      "[LOAD_SKILL: docx-generator] and [LOAD_SKILL: csv-export] needed";
    const result = detectSkillLoadRequest(text);
    expect(result).toHaveLength(2);
    expect(result).toContain("docx-generator");
    expect(result).toContain("csv-export");
  });

  it("should return empty array when no markers found", () => {
    const text = "This is plain text without any markers";
    const result = detectSkillLoadRequest(text);
    expect(result).toEqual([]);
  });

  it("should return empty array for empty string", () => {
    expect(detectSkillLoadRequest("")).toEqual([]);
  });

  it("should deduplicate repeated skill names", () => {
    const text =
      "[LOAD_SKILL: docx-generator] and [LOAD_SKILL: docx-generator]";
    const result = detectSkillLoadRequest(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("docx-generator");
  });

  it("should reject names that are too long", () => {
    const longName = "a".repeat(100);
    const text = `[LOAD_SKILL: ${longName}]`;
    const result = detectSkillLoadRequest(text);
    expect(result).toEqual([]);
  });

  it("should only accept valid skill name format", () => {
    const validText = "[LOAD_SKILL: my-skill-123]";
    const invalidText = "[LOAD_SKILL: My_Skill!]";
    expect(detectSkillLoadRequest(validText)).toHaveLength(1);
    expect(detectSkillLoadRequest(invalidText)).toEqual([]);
  });
});

describe("stripSkillLoadMarkers", () => {
  it("should remove skill load markers from text", () => {
    const text =
      "OK, loading skill. [LOAD_SKILL: docx-generator] Please wait...";
    const result = stripSkillLoadMarkers(text);
    expect(result).not.toContain("[LOAD_SKILL:");
    expect(result).toContain("OK");
    expect(result).toContain("Please wait");
  });

  it("should remove multiple markers", () => {
    const text = "A[LOAD_SKILL: skill-a]B[LOAD_SKILL: skill-b]C";
    const result = stripSkillLoadMarkers(text);
    expect(result).toBe("ABC");
  });

  it("should return original text when no markers", () => {
    const text = "No markers here";
    expect(stripSkillLoadMarkers(text)).toBe(text);
  });

  it("should handle empty string", () => {
    expect(stripSkillLoadMarkers("")).toBe("");
  });
});
