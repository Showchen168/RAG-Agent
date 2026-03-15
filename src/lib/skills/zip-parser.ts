/**
 * Skills System - ZIP Parser
 * 解析技能包 ZIP 檔案，驗證結構與內容
 */

import JSZip from "jszip";
import { skillConfigSchema, MAX_ZIP_SIZE } from "./schemas";
import type { ParsedSkillPackage } from "@/types/skills";
import type { SkillConfigInput } from "./schemas";

/** 技能包 ZIP 解析錯誤 */
export class SkillZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillZipError";
  }
}

/** 檢測路徑穿越攻擊 */
function hasPathTraversal(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    normalized.includes("/..")
  );
}

/**
 * 從 SKILL.md 的 YAML frontmatter 解析 metadata
 * 支援只有 SKILL.md 沒有 skill.json 的技能包
 */
function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();
      // 移除引號
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** 根據技能名稱推斷 fileType 與 mimeType（當 frontmatter 未指定時） */
function inferOutputConfig(name: string): {
  fileType: string;
  mimeType: string;
  category: "document" | "data" | "creative" | "utility";
} {
  const docTypes: Record<
    string,
    {
      fileType: string;
      mimeType: string;
      category: "document" | "data" | "creative" | "utility";
    }
  > = {
    docx: {
      fileType: "docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      category: "document",
    },
    pptx: {
      fileType: "pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      category: "document",
    },
    xlsx: {
      fileType: "xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      category: "data",
    },
    pdf: {
      fileType: "pdf",
      mimeType: "application/pdf",
      category: "document",
    },
    html: {
      fileType: "html",
      mimeType: "text/html",
      category: "creative",
    },
    csv: {
      fileType: "csv",
      mimeType: "text/csv",
      category: "data",
    },
  };

  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(docTypes)) {
    if (lowerName.includes(key)) {
      return value;
    }
  }
  return { fileType: "md", mimeType: "text/markdown", category: "utility" };
}

/** 從 frontmatter 建立完整的 skill config（填入預設值） */
function buildConfigFromFrontmatter(
  fm: Record<string, string>,
  hasEntrypoint: boolean,
): SkillConfigInput {
  const name = fm.name;
  if (!name) {
    throw new SkillZipError(
      "SKILL.md frontmatter missing required field: name",
    );
  }

  const displayName =
    fm.displayName ?? name.charAt(0).toUpperCase() + name.slice(1);

  // 自動推斷 fileType/mimeType（若 frontmatter 未指定）
  const inferred = inferOutputConfig(name);

  // 若沒有 entrypoint.sh，使用 nexusmind-skill-runtime（LLM 生成 JS code → Node.js 執行）
  const defaultBaseImage = hasEntrypoint
    ? "python:3.11-slim"
    : "nexusmind-skill-runtime:latest";

  return {
    name,
    displayName,
    description: fm.description ?? `${displayName} skill`,
    icon: fm.icon ?? fm.category ?? "utility",
    category:
      (fm.category as "document" | "data" | "creative" | "utility") ??
      inferred.category,
    version: fm.version ?? "1.0.0",
    input: {
      type: (fm.inputType as "context" | "user" | "both") ?? "both",
      userInputLabel: fm.userInputLabel,
    },
    output: {
      fileType: fm.fileType ?? inferred.fileType,
      mimeType: fm.mimeType ?? inferred.mimeType,
      previewFormat:
        (fm.previewFormat as "markdown" | "plaintext" | "image") ?? "markdown",
    },
    runtime: {
      baseImage: fm.baseImage ?? defaultBaseImage,
      timeout: fm.timeout ? parseInt(fm.timeout, 10) : 60,
      maxMemory: fm.maxMemory ?? "512m",
    },
  };
}

/**
 * 找出 ZIP 中的根前綴（處理某些 ZIP 工具會建立根資料夾的情況）
 * 例如 "my-skill/skill.json" → 前綴為 "my-skill/"
 */
function detectRootPrefix(fileNames: readonly string[]): string {
  // 先檢查根層級是否直接有 skill.json 或 SKILL.md
  if (fileNames.includes("skill.json") || fileNames.includes("SKILL.md")) {
    return "";
  }

  // 找出可能的根資料夾前綴
  const potentialPrefixes = new Set<string>();
  for (const name of fileNames) {
    const slashIndex = name.indexOf("/");
    if (slashIndex > 0) {
      potentialPrefixes.add(name.substring(0, slashIndex + 1));
    }
  }

  // 優先找有 skill.json 的前綴，其次找有 SKILL.md 的
  for (const prefix of potentialPrefixes) {
    if (fileNames.includes(`${prefix}skill.json`)) {
      return prefix;
    }
  }
  for (const prefix of potentialPrefixes) {
    if (fileNames.includes(`${prefix}SKILL.md`)) {
      return prefix;
    }
  }

  return "";
}

/**
 * 解析技能包 ZIP 檔案
 * @param zipBuffer - ZIP 檔案的 Buffer
 * @returns 解析結果，包含 skillConfig、skillMd、scriptsEntries
 * @throws SkillZipError 解析失敗時拋出
 */
export async function parseSkillZip(
  zipBuffer: Buffer,
): Promise<ParsedSkillPackage> {
  // 1. 檢查檔案大小
  if (zipBuffer.length > MAX_ZIP_SIZE) {
    throw new SkillZipError(
      `ZIP file size (${zipBuffer.length} bytes) exceeds maximum allowed size (${MAX_ZIP_SIZE} bytes)`,
    );
  }

  // 2. 解壓 ZIP
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    throw new SkillZipError(
      "Failed to parse ZIP file: invalid or corrupted archive",
    );
  }

  // 3. 取得所有項目名稱（含目錄）並檢查路徑穿越
  const allEntryNames = Object.keys(zip.files);

  for (const entryName of allEntryNames) {
    if (hasPathTraversal(entryName)) {
      throw new SkillZipError(
        `Security violation: path traversal detected in file "${entryName}"`,
      );
    }
  }

  // 過濾出非目錄的檔案
  const fileNames = allEntryNames.filter((name) => !zip.files[name].dir);

  // 4. 檢測根前綴
  const prefix = detectRootPrefix(fileNames);

  // 5. 檢測檔案路徑
  const skillJsonPath = `${prefix}skill.json`;
  const skillMdPath = `${prefix}SKILL.md`;
  const hasSkillJson = fileNames.includes(skillJsonPath);
  const hasSkillMd = fileNames.includes(skillMdPath);

  // SKILL.md 是必要的（無論哪種模式）
  if (!hasSkillMd) {
    throw new SkillZipError(
      "Missing required file: SKILL.md not found in ZIP archive",
    );
  }

  // 6. 讀取 SKILL.md
  const skillMd = await zip.files[skillMdPath].async("string");

  // 7. 解析技能設定：優先 skill.json，fallback 到 SKILL.md frontmatter
  let skillConfig: ParsedSkillPackage["skillConfig"];

  if (hasSkillJson) {
    // 模式 A: 有 skill.json → 嚴格驗證
    const skillJsonContent = await zip.files[skillJsonPath].async("string");

    let rawConfig: unknown;
    try {
      rawConfig = JSON.parse(skillJsonContent);
    } catch {
      throw new SkillZipError(
        "Invalid skill.json: failed to parse JSON content",
      );
    }

    const parseResult = skillConfigSchema.safeParse(rawConfig);
    if (!parseResult.success) {
      const errors = parseResult.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw new SkillZipError(`skill.json validation failed: ${errors}`);
    }
    skillConfig = parseResult.data;
  } else {
    // 模式 B: 只有 SKILL.md → 從 frontmatter 建立 config + 預設值
    const frontmatter = parseFrontmatter(skillMd);
    if (!frontmatter) {
      throw new SkillZipError(
        "No skill.json found and SKILL.md has no YAML frontmatter. " +
          "Either provide skill.json or add frontmatter with at least 'name' field.",
      );
    }

    // 檢查 ZIP 中是否含 scripts/entrypoint.sh（影響 baseImage 預設值）
    const entrypointPath = `${prefix}scripts/entrypoint.sh`;
    const hasEntrypoint = fileNames.includes(entrypointPath);

    const configInput = buildConfigFromFrontmatter(frontmatter, hasEntrypoint);
    const parseResult = skillConfigSchema.safeParse(configInput);
    if (!parseResult.success) {
      const errors = parseResult.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw new SkillZipError(
        `SKILL.md frontmatter validation failed: ${errors}`,
      );
    }
    skillConfig = parseResult.data;
  }

  // 8. 提取 scripts/ 目錄中的所有檔案
  const scriptsPrefix = `${prefix}scripts/`;
  const scriptsEntries: Array<{ path: string; content: Buffer }> = [];

  for (const fileName of fileNames) {
    if (fileName.startsWith(scriptsPrefix) && fileName !== scriptsPrefix) {
      const content = await zip.files[fileName].async("nodebuffer");
      // 移除根前綴，保留 scripts/ 前綴
      const relativePath = prefix
        ? fileName.substring(prefix.length)
        : fileName;
      scriptsEntries.push({
        path: relativePath,
        content,
      });
    }
  }

  return {
    skillConfig,
    skillMd,
    scriptsEntries,
  };
}
