import JSZip from "jszip";
import { parseSkillZip, SkillZipError } from "../zip-parser";
import { MAX_ZIP_SIZE } from "../schemas";

/** 建立合法的 skill.json 內容 */
function makeValidSkillJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: "test-skill",
    displayName: "Test Skill",
    description: "A test skill",
    icon: "Zap",
    category: "utility",
    input: { type: "context" },
    output: {
      fileType: "md",
      mimeType: "text/markdown",
      previewFormat: "markdown",
    },
    runtime: { baseImage: "node:20-slim", timeout: 60, maxMemory: "512m" },
    ...overrides,
  });
}

/** 建立合法的 ZIP buffer */
async function makeValidZip(
  skillJson?: string,
  skillMd?: string,
  scripts?: Record<string, string>,
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("skill.json", skillJson ?? makeValidSkillJson());
  zip.file("SKILL.md", skillMd ?? "# Test Skill\nThis is a test skill.");

  if (scripts) {
    for (const [name, content] of Object.entries(scripts)) {
      zip.file(`scripts/${name}`, content);
    }
  } else {
    zip.file("scripts/entrypoint.sh", '#!/bin/bash\necho "hello"');
  }

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return buf;
}

describe("parseSkillZip", () => {
  it("should parse a valid ZIP with all required files", async () => {
    const zipBuffer = await makeValidZip();
    const result = await parseSkillZip(zipBuffer);

    expect(result.skillConfig.name).toBe("test-skill");
    expect(result.skillConfig.displayName).toBe("Test Skill");
    expect(result.skillMd).toContain("# Test Skill");
    expect(result.scriptsEntries.length).toBeGreaterThanOrEqual(1);
  });

  it("should extract all scripts entries", async () => {
    const zipBuffer = await makeValidZip(undefined, undefined, {
      "entrypoint.sh": '#!/bin/bash\necho "hello"',
      "helper.py": 'print("helper")',
      Dockerfile: "FROM node:20-slim",
    });

    const result = await parseSkillZip(zipBuffer);
    expect(result.scriptsEntries).toHaveLength(3);

    const paths = result.scriptsEntries.map((e) => e.path);
    expect(paths).toContain("scripts/entrypoint.sh");
    expect(paths).toContain("scripts/helper.py");
    expect(paths).toContain("scripts/Dockerfile");
  });

  it("should parse ZIP with only SKILL.md (no skill.json) using frontmatter", async () => {
    const skillMd = `---
name: docx
description: "Create and edit Word documents"
license: MIT
---

# DOCX Skill

Create Word documents.`;

    const zip = new JSZip();
    zip.file("SKILL.md", skillMd);
    zip.file("scripts/main.py", 'print("hello")');
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    const result = await parseSkillZip(buf);
    expect(result.skillConfig.name).toBe("docx");
    expect(result.skillConfig.description).toBe(
      "Create and edit Word documents",
    );
    expect(result.skillConfig.displayName).toBe("Docx");
    expect(result.skillConfig.category).toBe("document");
    expect(result.skillConfig.icon).toBe("utility");
    expect(result.skillConfig.input.type).toBe("both");
    expect(result.skillConfig.output.previewFormat).toBe("markdown");
    expect(result.skillConfig.runtime.baseImage).toBe(
      "nexusmind-skill-runtime:latest",
    );
    expect(result.skillMd).toContain("# DOCX Skill");
  });

  it("should parse ZIP with SKILL.md frontmatter in nested folder", async () => {
    const skillMd = `---
name: my-tool
description: "A utility tool"
---

# My Tool`;

    const zip = new JSZip();
    zip.file("my-tool/SKILL.md", skillMd);
    zip.file("my-tool/scripts/run.sh", "#!/bin/bash");
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    const result = await parseSkillZip(buf);
    expect(result.skillConfig.name).toBe("my-tool");
  });

  it("should throw SkillZipError when SKILL.md has no frontmatter and no skill.json", async () => {
    const zip = new JSZip();
    zip.file("SKILL.md", "# No frontmatter\nJust content.");
    zip.file("scripts/entrypoint.sh", '#!/bin/bash\necho "hello"');
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    await expect(parseSkillZip(buf)).rejects.toThrow(SkillZipError);
    await expect(parseSkillZip(buf)).rejects.toThrow(/name/);
  });

  it("should throw SkillZipError when SKILL.md frontmatter is missing name", async () => {
    const skillMd = `---
description: "No name field"
---

# Missing name`;

    const zip = new JSZip();
    zip.file("SKILL.md", skillMd);
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    await expect(parseSkillZip(buf)).rejects.toThrow(SkillZipError);
    await expect(parseSkillZip(buf)).rejects.toThrow(/name/);
  });

  it("should prefer skill.json over SKILL.md frontmatter when both exist", async () => {
    const skillMd = `---
name: from-frontmatter
description: "From frontmatter"
---

# Test`;

    const zipBuffer = await makeValidZip(
      makeValidSkillJson({ name: "from-json", displayName: "From JSON" }),
      skillMd,
    );

    const result = await parseSkillZip(zipBuffer);
    expect(result.skillConfig.name).toBe("from-json");
    expect(result.skillConfig.displayName).toBe("From JSON");
  });

  it("should throw SkillZipError when ZIP is missing SKILL.md", async () => {
    const zip = new JSZip();
    zip.file("skill.json", makeValidSkillJson());
    zip.file("scripts/entrypoint.sh", '#!/bin/bash\necho "hello"');
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    await expect(parseSkillZip(buf)).rejects.toThrow(SkillZipError);
    await expect(parseSkillZip(buf)).rejects.toThrow(/SKILL\.md/);
  });

  it("should throw SkillZipError when skill.json is invalid JSON", async () => {
    const zip = new JSZip();
    zip.file("skill.json", "not valid json{{{");
    zip.file("SKILL.md", "# Test");
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    await expect(parseSkillZip(buf)).rejects.toThrow(SkillZipError);
    await expect(parseSkillZip(buf)).rejects.toThrow(/JSON/);
  });

  it("should throw SkillZipError when skill.json fails schema validation", async () => {
    const invalidJson = JSON.stringify({ name: "test" }); // missing required fields
    const zip = new JSZip();
    zip.file("skill.json", invalidJson);
    zip.file("SKILL.md", "# Test");
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    await expect(parseSkillZip(buf)).rejects.toThrow(SkillZipError);
    await expect(parseSkillZip(buf)).rejects.toThrow(/validation/);
  });

  it("should throw SkillZipError when ZIP exceeds size limit", async () => {
    // Create a buffer larger than MAX_ZIP_SIZE
    const oversizedBuffer = Buffer.alloc(MAX_ZIP_SIZE + 1, 0);

    await expect(parseSkillZip(oversizedBuffer)).rejects.toThrow(SkillZipError);
    await expect(parseSkillZip(oversizedBuffer)).rejects.toThrow(/size/);
  });

  it("should throw SkillZipError for invalid ZIP data", async () => {
    const notAZip = Buffer.from("this is not a zip file");

    await expect(parseSkillZip(notAZip)).rejects.toThrow(SkillZipError);
  });

  it("should handle ZIP with nested folder structure (skill files inside root folder)", async () => {
    const zip = new JSZip();
    // Some ZIP tools create a root folder
    zip.file("my-skill/skill.json", makeValidSkillJson());
    zip.file("my-skill/SKILL.md", "# Nested Skill");
    zip.file("my-skill/scripts/entrypoint.sh", "#!/bin/bash");
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    const result = await parseSkillZip(buf);
    expect(result.skillConfig.name).toBe("test-skill");
    expect(result.skillMd).toContain("# Nested Skill");
  });

  it("should reject ZIP containing path traversal in file names", async () => {
    const zip = new JSZip();
    zip.file("skill.json", makeValidSkillJson());
    zip.file("SKILL.md", "# Test");
    zip.file("../../../etc/passwd", "malicious content");
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    await expect(parseSkillZip(buf)).rejects.toThrow(SkillZipError);
    await expect(parseSkillZip(buf)).rejects.toThrow(/path traversal/);
  });

  it("should handle empty SKILL.md gracefully", async () => {
    const zipBuffer = await makeValidZip(undefined, "");

    // Empty SKILL.md should be allowed (not ideal, but not an error)
    const result = await parseSkillZip(zipBuffer);
    expect(result.skillMd).toBe("");
  });

  it("should handle ZIP without scripts directory", async () => {
    const zip = new JSZip();
    zip.file("skill.json", makeValidSkillJson());
    zip.file("SKILL.md", "# No Scripts");
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    const result = await parseSkillZip(buf);
    expect(result.scriptsEntries).toHaveLength(0);
  });
});
