/**
 * Stream Detector
 * Detects [LOAD_SKILL: name] markers in AI response stream
 *
 * Security:
 * - Skill name restricted to [a-z0-9-] format
 * - Max name length: 50 characters
 * - Prevents path traversal, SQL injection, XSS
 */

/** Maximum valid skill name length */
const MAX_SKILL_NAME_LENGTH = 50;

/** Valid skill name format: lowercase letters, numbers, hyphens */
const VALID_SKILL_NAME = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

/**
 * Regex for [LOAD_SKILL: name] markers.
 * - Allows whitespace after colon
 * - Capture group 1 is the skill name (may need trim)
 * - Global flag (g) for multiple matches
 */
export const LOAD_SKILL_PATTERN =
  /\[LOAD_SKILL:\s*([a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])\s*\]/g;

/**
 * Validate skill name format
 */
function isValidSkillName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_SKILL_NAME_LENGTH) {
    return false;
  }
  return VALID_SKILL_NAME.test(trimmed);
}

/**
 * Detect all [LOAD_SKILL: name] markers in text.
 * Returns deduplicated array of valid skill names.
 */
export function detectSkillLoadRequest(text: string): string[] {
  if (!text) return [];

  const names: string[] = [];
  const seen = new Set<string>();

  // Reset regex lastIndex (global flag requires this)
  LOAD_SKILL_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = LOAD_SKILL_PATTERN.exec(text)) !== null) {
    const rawName = match[1].trim();

    if (!isValidSkillName(rawName)) continue;
    if (seen.has(rawName)) continue;

    seen.add(rawName);
    names.push(rawName);
  }

  return names;
}

/**
 * Remove all [LOAD_SKILL: name] markers from text.
 * Used to clean processed markers before displaying to user.
 */
export function stripSkillLoadMarkers(text: string): string {
  if (!text) return "";
  return text.replace(
    /\[LOAD_SKILL:\s*[a-z0-9][a-z0-9-]*[a-z0-9]\s*\]|\[LOAD_SKILL:\s*[a-z0-9]\s*\]/g,
    "",
  );
}
