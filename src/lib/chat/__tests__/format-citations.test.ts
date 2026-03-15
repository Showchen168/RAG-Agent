import {
  formatCitationsForTelegram,
  formatCitationsForWeb,
} from "../format-citations";

describe("format-citations", () => {
  describe("formatCitationsForTelegram", () => {
    it("should format citation titles with bullet list and header", () => {
      const titles = ["文件A", "文件B", "文件C"];
      const result = formatCitationsForTelegram(titles);

      expect(result).toContain("📚 **參考來源：**");
      expect(result).toContain("• 文件A");
      expect(result).toContain("• 文件B");
      expect(result).toContain("• 文件C");
    });

    it("should return empty string for empty array", () => {
      const result = formatCitationsForTelegram([]);
      expect(result).toBe("");
    });

    it("should include separator line before citations", () => {
      const result = formatCitationsForTelegram(["文件A"]);
      expect(result).toContain("---");
    });

    it("should be a pure function (same input produces same output)", () => {
      const titles = ["文件X", "文件Y"];
      const result1 = formatCitationsForTelegram(titles);
      const result2 = formatCitationsForTelegram(titles);
      expect(result1).toBe(result2);
    });
  });

  describe("formatCitationsForWeb", () => {
    it("should return RAGMetadata-compatible structure with chunkPreview", () => {
      const ragResult = {
        relevantDocIds: ["doc-1", "doc-2"],
        docTitleMap: new Map([
          ["doc-1", "技術文件A"],
          ["doc-2", "研究報告B"],
        ]),
        docSimilarityMap: new Map([
          ["doc-1", 0.85],
          ["doc-2", 0.72],
        ]),
        chunksByDoc: new Map([
          ["doc-1", [{ text: "這是文件A的第一段內容，非常詳細。", metadata: {} }]],
          ["doc-2", [{ text: "研究報告B的摘要部分。", metadata: {} }]],
        ]),
      };

      const result = formatCitationsForWeb(ragResult);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        title: "技術文件A",
        similarity: 0.85,
        chunkPreview: "這是文件A的第一段內容，非常詳細。",
      });
      expect(result[1]).toEqual({
        title: "研究報告B",
        similarity: 0.72,
        chunkPreview: "研究報告B的摘要部分。",
      });
    });

    it("should return empty array when no documents", () => {
      const ragResult = {
        relevantDocIds: [],
        docTitleMap: new Map(),
        docSimilarityMap: new Map(),
        chunksByDoc: new Map(),
      };

      const result = formatCitationsForWeb(ragResult);
      expect(result).toEqual([]);
    });

    it("should limit chunkPreview to 200 characters", () => {
      const longText = "A".repeat(300);
      const ragResult = {
        relevantDocIds: ["doc-1"],
        docTitleMap: new Map([["doc-1", "長文件"]]),
        docSimilarityMap: new Map([["doc-1", 0.9]]),
        chunksByDoc: new Map([
          ["doc-1", [{ text: longText, metadata: {} }]],
        ]),
      };

      const result = formatCitationsForWeb(ragResult);
      expect(result[0].chunkPreview.length).toBeLessThanOrEqual(203); // 200 + "..."
      expect(result[0].chunkPreview).toContain("...");
    });

    it("should handle missing chunks gracefully", () => {
      const ragResult = {
        relevantDocIds: ["doc-1"],
        docTitleMap: new Map([["doc-1", "無內容文件"]]),
        docSimilarityMap: new Map([["doc-1", 0.7]]),
        chunksByDoc: new Map(),
      };

      const result = formatCitationsForWeb(ragResult);
      expect(result[0].chunkPreview).toBe("");
    });
  });
});
