/**
 * normalizeLeakyMarkdown — 修正 Gemini 輸出的 Markdown 格式問題
 *
 * 針對 Gemini AI 常見的 Markdown 外洩模式進行正規化：
 * - 相鄰粗體標記 (**text1****text2**) 拆分
 * - 行首四星號 (****text) 修正
 * - 已有修正的回歸測試
 */

import { normalizeLeakyMarkdown } from "../normalize-leaky-markdown";

/** 檢查文字是否以粗體形式存在（**text** 或 <strong>text</strong>） */
function containsBold(result: string, text: string): boolean {
  return result.includes(`**${text}**`) || result.includes(`<strong>${text}</strong>`);
}

describe("normalizeLeakyMarkdown", () => {
  // ── 新增：相鄰粗體標記拆分 ──

  it("splits adjacent bold markers: **text1****text2**", () => {
    const input = "**關鍵材料與技術重點：****電路板材料：**傳統 FR4";
    const result = normalizeLeakyMarkdown(input);
    // 中間的 **** 應被正確拆分，不應有連續四星號
    expect(result).not.toContain("****");
    // 兩段粗體都應正確存在（可能是 **text** 或 <strong>text</strong>）
    expect(containsBold(result, "關鍵材料與技術重點：")).toBe(true);
    expect(containsBold(result, "電路板材料：")).toBe(true);
  });

  it("splits adjacent bold markers mid-sentence", () => {
    const input = "採用**Panasonic Megtron 7****或 Megtron 8**等極低損耗板材";
    const result = normalizeLeakyMarkdown(input);
    expect(result).not.toContain("****");
    expect(containsBold(result, "Panasonic Megtron 7")).toBe(true);
    expect(containsBold(result, "或 Megtron 8")).toBe(true);
  });

  it("handles line-start quadruple asterisks: ****text**", () => {
    const input = "****共同封裝光學（CPO）**被視為解決功耗牆";
    const result = normalizeLeakyMarkdown(input);
    expect(result).not.toContain("****");
    // 應以某種粗體形式存在
    expect(result).toContain("共同封裝光學（CPO）");
  });

  it("handles multiple adjacent bold groups in one line", () => {
    const input = "**A****B****C**";
    const result = normalizeLeakyMarkdown(input);
    expect(result).not.toContain("****");
    // 所有粗體內容都應存在
    expect(result).toContain("A");
    expect(result).toContain("B");
    expect(result).toContain("C");
  });

  it("splits six asterisks (triple bold boundary)", () => {
    const input = "text**bold1****bold2**end";
    const result = normalizeLeakyMarkdown(input);
    expect(result).not.toContain("****");
  });

  // ── 回歸測試：確保現有修正不被破壞 ──

  it("preserves normal bold markers", () => {
    const input = "這是 **粗體** 文字";
    const result = normalizeLeakyMarkdown(input);
    expect(result).toContain("**粗體**");
  });

  it("does not affect code blocks with ****", () => {
    const input = '```\nconst a = "****";\n```';
    const result = normalizeLeakyMarkdown(input);
    expect(result).toContain("```");
  });

  it("fixes heading glued after punctuation", () => {
    const input = "結束了。### 新章節";
    const result = normalizeLeakyMarkdown(input);
    expect(result).toContain("。\n\n### 新章節");
  });

  it("fixes space inside bold markers: ** text**", () => {
    const input = "這是 ** 粗體文字**";
    const result = normalizeLeakyMarkdown(input);
    expect(result).toContain("**粗體文字**");
  });

  it("fixes space before closing bold: **text **", () => {
    const input = "這是 **粗體文字 **結束";
    const result = normalizeLeakyMarkdown(input);
    expect(result).toContain("**粗體文字**");
  });

  it("converts line-start **bold** to <strong> tags", () => {
    const input = "**標題文字**";
    const result = normalizeLeakyMarkdown(input);
    expect(result).toContain("<strong>標題文字</strong>");
  });

  it("handles empty input", () => {
    expect(normalizeLeakyMarkdown("")).toBe("");
  });

  it("handles undefined input", () => {
    // @ts-expect-error testing undefined
    expect(normalizeLeakyMarkdown(undefined)).toBeUndefined();
  });
});
