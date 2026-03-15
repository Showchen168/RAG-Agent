import {
  truncateContext,
  estimateTokens,
  MAX_CONTEXT_CHARS_WEB,
  MAX_CONTEXT_CHARS_TELEGRAM,
} from "../context-truncation";

describe("context-truncation", () => {
  describe("truncateContext", () => {
    it("should return context unchanged when within maxChars limit", () => {
      const shortContext = "<context_layers><source>short</source></context_layers>";
      const result = truncateContext(shortContext, 1000);
      expect(result).toBe(shortContext);
    });

    it("should truncate at last </source> boundary within maxChars", () => {
      const source1 = '    <source title="Doc1" page="1" relevance="0.9">\n      First chunk content\n    </source>';
      const source2 = '    <source title="Doc2" page="2" relevance="0.8">\n      Second chunk content that is very long\n    </source>';
      const context =
        `<context_layers>\n  <layer priority="high" type="vector_search">\n` +
        source1 + "\n" + source2 +
        `\n  </layer>\n</context_layers>`;

      // Set maxChars so source1 fits but source2 does not fully fit
      const maxChars = source1.length + 80; // enough for source1 + wrapper, not source2
      const result = truncateContext(context, maxChars);

      expect(result).toContain("</source>");
      expect(result).not.toContain("Second chunk content");
      expect(result).toContain("First chunk content");
    });

    it("should append truncation notice after truncating", () => {
      const source1 = '    <source title="Doc1" page="1" relevance="0.9">\n      Content 1\n    </source>';
      const source2 = '    <source title="Doc2" page="2" relevance="0.8">\n      Content 2 which is extra long to force truncation padding here\n    </source>';
      const context =
        `<context_layers>\n  <layer priority="high" type="vector_search">\n` +
        source1 + "\n" + source2 +
        `\n  </layer>\n</context_layers>`;

      const maxChars = source1.length + 80;
      const result = truncateContext(context, maxChars);

      expect(result).toContain("[知識庫內容因長度限制已截斷，已保留最相關的文件段落]");
    });

    it("should add closing tags after truncation", () => {
      const source1 = '    <source title="Doc1" page="1" relevance="0.9">\n      Content 1\n    </source>';
      const source2 = '    <source title="Doc2" page="2" relevance="0.8">\n      Content 2 extra long content\n    </source>';
      const context =
        `<context_layers>\n  <layer priority="high" type="vector_search">\n` +
        source1 + "\n" + source2 +
        `\n  </layer>\n</context_layers>`;

      const maxChars = source1.length + 80;
      const result = truncateContext(context, maxChars);

      expect(result).toContain("</layer>");
      expect(result).toContain("</context_layers>");
    });

    it("should fallback to hard slice when no </source> tag found", () => {
      const plainText = "A".repeat(500);
      const result = truncateContext(plainText, 100);

      expect(result.length).toBeLessThanOrEqual(200); // hard slice + possible notice
      expect(result).toContain("A".repeat(100));
    });

    it("should handle empty context", () => {
      const result = truncateContext("", 1000);
      expect(result).toBe("");
    });

    it("should handle context exactly at maxChars", () => {
      const context = "A".repeat(100);
      const result = truncateContext(context, 100);
      expect(result).toBe(context);
    });
  });

  describe("estimateTokens", () => {
    it("should estimate pure Chinese text at ~1.5 chars/token", () => {
      const chineseText = "這是一段純中文的測試文字用於估算";
      const tokens = estimateTokens(chineseText);
      // 16 Chinese chars / 1.5 ≈ 10.67 → ~11 tokens
      const expectedApprox = Math.ceil(chineseText.length / 1.5);
      expect(tokens).toBeCloseTo(expectedApprox, 0);
    });

    it("should estimate pure English text at ~4 chars/token", () => {
      const englishText = "This is a pure English test text for token estimation";
      const tokens = estimateTokens(englishText);
      const expectedApprox = Math.ceil(englishText.length / 4);
      expect(tokens).toBeCloseTo(expectedApprox, 0);
    });

    it("should estimate mixed Chinese-English text with weighted average", () => {
      // 50% Chinese, 50% English
      const mixedText = "這是中文TextHere";
      const tokens = estimateTokens(mixedText);
      // Should be between pure Chinese and pure English estimates
      const pureChineseEstimate = Math.ceil(mixedText.length / 1.5);
      const pureEnglishEstimate = Math.ceil(mixedText.length / 4);
      expect(tokens).toBeGreaterThanOrEqual(pureEnglishEstimate);
      expect(tokens).toBeLessThanOrEqual(pureChineseEstimate);
    });

    it("should return 0 for empty text", () => {
      expect(estimateTokens("")).toBe(0);
    });
  });

  describe("constants", () => {
    it("should export MAX_CONTEXT_CHARS_WEB = 20000", () => {
      expect(MAX_CONTEXT_CHARS_WEB).toBe(20000);
    });

    it("should export MAX_CONTEXT_CHARS_TELEGRAM = 10000", () => {
      expect(MAX_CONTEXT_CHARS_TELEGRAM).toBe(10000);
    });
  });
});
