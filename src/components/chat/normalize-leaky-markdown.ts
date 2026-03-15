/**
 * 修正 Gemini AI 輸出中常見的 Markdown 格式外洩問題。
 *
 * 純函式 — 無副作用，無 React / DOM 依賴，方便獨立測試。
 */
export function normalizeLeakyMarkdown(input: string): string {
  if (!input) return input;

  let text = input.replace(/\r\n/g, "\n");

  // Fix leaked headings like "。### 標題" -> "。\n\n### 標題"
  text = text.replace(/([。．！？!?：:；;）)])\s*(#{1,6}\s+)/g, "$1\n\n$2");

  // Ensure heading starts on a new line when glued after plain text.
  text = text.replace(/([^\n])\s+(#{1,6}\s+)/g, "$1\n\n$2");

  // Remove empty list items (e.g. "- \n" or "* \n" or "1. \n")
  text = text.replace(/^[\t ]*[-*+]\s*$/gm, "");
  text = text.replace(/^[\t ]*\d+\.\s*$/gm, "");

  // ── LIST BULLET & NUMBERED LIST FIXES (must run BEFORE bold marker fixes) ──
  // Bold Pattern 2 ("text **" → "text**") would destroy the space in "： ***清朝",
  // making list detection impossible. So we split inline list items first.

  // Fix inline unmatched * used as list bullets by Gemini without proper newlines.
  // Gemini outputs: "...價格透明。 *公館森林：位於公館..." all on one line,
  // intending list items but without line breaks. The unmatched * leaks as literal text.
  // Strategy 1: Insert a newline before "* " when preceded by sentence-ending punctuation + space.
  // Includes colons (：:) as Gemini often uses "...的累積： *清朝末期..."
  // Also handles "： ***清朝" (colon + space + triple asterisk for bold list item).
  text = text.replace(/([。．！？!?；;：:）)」】])\s+\*/g, "$1\n* ");
  // Strategy 2: Fix line-start "*Text" (no space after *) → "* Text" for valid list syntax.
  // CommonMark requires "* " (with space) for unordered lists. "*Text" is invalid.
  text = text.replace(/^(\*)([\u4e00-\u9fff\u3400-\u4dbfA-Za-z])/gm, "* $2");

  // Fix "***text" (triple asterisk) where Gemini merges list bullet * with bold **.
  // e.g. "* **清朝末期**" on one line becomes "***清朝末期**" when flattened.
  // Split into "* **text" — a list item with bold content.
  // After Strategy 1 above, "： ***清朝" becomes "：\n* **清朝" (newline + "* " prefix + remaining "**").
  // But if *** survives at line start, this catches it.
  text = text.replace(/^\*\*\*(\S)/gm, "* **$1");

  // Fix inline numbered list items without newlines.
  // Gemini outputs: "...致命危險。 2.確認綁帶系統：..." all on one line.
  // CommonMark requires numbered list items to start on a new line with "1. " (number + dot + space).
  // Strategy 1: Insert a newline before "2.", "3.", etc. when preceded by sentence-ending punctuation.
  // Includes cases with NO whitespace: "）。2." / "：1."
  text = text.replace(/([。．！？!?；;：:）)」】])\s*(\d+\.)/g, "$1\n$2");
  // Strategy 1b: Fallback for inline numbered lists in a single paragraph:
  // "1.xxx 2.yyy 3.zzz" -> each item on a new line.
  // Keep it conservative by requiring number marker to be preceded by whitespace.
  text = text.replace(/(\S)\s+(\d+\.\s*)/g, "$1\n$2");
  // Strategy 2: Fix line-start "1.Text" (no space after dot) → "1. Text" for valid list syntax.
  text = text.replace(/^(\d+\.)([^\s\d])/gm, "$1 $2");
  // Strategy 3: Ensure a blank line before ordered list starts, to avoid parser fallback to plain text.
  text = text.replace(/([^\n])\n(\d+\.\s)/g, "$1\n\n$2");

  // ── CODE BLOCK FENCE FIXES ──
  // Streamdown streaming parser needs ``` on its own line to recognize fenced code boundaries.
  // When Gemini streams chunks, ``` may be glued to preceding/following content.
  // Fix: ensure ``` is always preceded and followed by a newline.
  text = text.replace(/([^\n])(```)/g, "$1\n$2");
  text = text.replace(/(```)([^\n`\s])/g, "$1\n$2");

  // ── LINE-START **BOLD** PROTECTION ──
  // Streamdown's parser treats line-start "**text" as list bullet "* " + "*text",
  // destroying bold formatting. Convert line-start **bold** to <strong> tags to avoid ambiguity.
  // Only matches complete **...** pairs on the same line, not incomplete markers.
  text = text.replace(/^(\*\*)([^*\n]+)(\*\*)/gm, "<strong>$2</strong>");

  // ── BOLD MARKER FIXES (run AFTER list fixes so "： ***" is already split) ──
  // Fix bold markers (**) with space between marker and content.
  // CommonMark requires ** to be flush against the content — a space breaks it.
  // Gemini frequently outputs: "透過** 「挑選位置」**" instead of "透過 **「挑選位置」**"
  // Pattern 0: "word** text" → "word **text" (move opening ** from end of prev word to start of next)
  // This handles: "透過**⎵「挑選" → "透過⎵**「挑選" so left-flanking delimiter rule is satisfied.
  text = text.replace(/(\S)\*\*\s+(\S)/g, "$1 **$2");
  // Pattern 1: "** text**" → "**text**" (space after opening ** that is already at word boundary)
  text = text.replace(/\*\*\s+(\S)/g, "**$1");
  // Pattern 2: "**text **" → "**text**" (space before closing **)
  // Exclude * as the preceding char to avoid collapsing "* **bold" (list bullet + bold opener).
  text = text.replace(/([^\s*])\s+\*\*/g, "$1**");

  // ── ADJACENT BOLD MARKER FIXES (must run AFTER bold space fixes) ──
  // Gemini frequently outputs adjacent bold segments without space:
  // "**text1****text2**" — the middle **** should be "** **" (close + open).
  // Bold space fixes above don't touch **** (no spaces), so it survives intact.
  // Split **** into ** ** (closing bold + space + opening bold).
  text = text.replace(/\*\*\*\*/g, "** **");

  // Escape single tildes used as range separator (e.g. "14:00~15:00") to prevent
  // remark-gfm from treating them as strikethrough markers.
  // Match ~ that sits between non-whitespace characters and is NOT part of ~~.
  text = text.replace(/([^\s~])~([^\s~])/g, "$1\u223C$2");

  // Remove trailing lone JSON-like braces leaked from structured output.
  // Gemini sometimes leaks "{" or "{ " at the very end when switching from text to JSON mode.
  // Only strip if it's truly a lone brace at the end (not part of code/math).
  text = text.replace(/\n?\s*\{\s*$/, "");

  // Collapse excessive blank lines for stable rendering.
  text = text.replace(/\n{4,}/g, "\n\n\n");

  return text;
}
