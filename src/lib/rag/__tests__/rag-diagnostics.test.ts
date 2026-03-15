import {
  generateDiagnosticReport,
  classifyFailureReason,
  generateSuggestions,
  type RAGDiagnosticReport,
} from "../rag-diagnostics";

describe("rag-diagnostics", () => {
  describe("classifyFailureReason", () => {
    it("should return 'zero_results' when matchCount is 0", () => {
      const reason = classifyFailureReason({
        matchCount: 0,
        topSimilarity: 0,
        gradingTimedOut: false,
        emptyResponse: false,
      });
      expect(reason).toBe("zero_results");
    });

    it("should return 'low_similarity' when top similarity < 0.6", () => {
      const reason = classifyFailureReason({
        matchCount: 3,
        topSimilarity: 0.45,
        gradingTimedOut: false,
        emptyResponse: false,
      });
      expect(reason).toBe("low_similarity");
    });

    it("should return 'grading_timeout' when grading timed out", () => {
      const reason = classifyFailureReason({
        matchCount: 3,
        topSimilarity: 0.7,
        gradingTimedOut: true,
        emptyResponse: false,
      });
      expect(reason).toBe("grading_timeout");
    });

    it("should return 'empty_response' when response is empty", () => {
      const reason = classifyFailureReason({
        matchCount: 3,
        topSimilarity: 0.7,
        gradingTimedOut: false,
        emptyResponse: true,
      });
      expect(reason).toBe("empty_response");
    });

    it("should prioritize zero_results over other conditions", () => {
      const reason = classifyFailureReason({
        matchCount: 0,
        topSimilarity: 0,
        gradingTimedOut: true,
        emptyResponse: true,
      });
      expect(reason).toBe("zero_results");
    });
  });

  describe("generateSuggestions", () => {
    it("should suggest expanding knowledge base for zero_results", () => {
      const report: RAGDiagnosticReport = {
        triggeredAt: new Date().toISOString(),
        triggerReason: "zero_results",
        retriever: {
          matchCount: 0,
          topSimilarity: 0,
          avgSimilarity: 0,
          queryRewriteUsed: false,
          searchMethod: "hybrid",
          embeddingModel: "text-embedding-004",
        },
        generator: {
          contextLength: 0,
          contextTokenEstimate: 0,
          budgetUsed: { maxDocs: 3, maxChunksPerDoc: 6 },
          truncated: false,
        },
        suggestions: [],
      };
      const suggestions = generateSuggestions(report);
      expect(suggestions.some((s) => s.includes("知識庫"))).toBe(true);
    });

    it("should suggest optimizing query for low_similarity", () => {
      const report: RAGDiagnosticReport = {
        triggeredAt: new Date().toISOString(),
        triggerReason: "low_similarity",
        retriever: {
          matchCount: 3,
          topSimilarity: 0.45,
          avgSimilarity: 0.35,
          queryRewriteUsed: true,
          searchMethod: "hybrid",
          embeddingModel: "text-embedding-004",
        },
        generator: {
          contextLength: 5000,
          contextTokenEstimate: 2000,
          budgetUsed: { maxDocs: 3, maxChunksPerDoc: 6 },
          truncated: false,
        },
        suggestions: [],
      };
      const suggestions = generateSuggestions(report);
      expect(
        suggestions.some((s) => s.includes("查詢") || s.includes("閾值")),
      ).toBe(true);
    });

    it("should suggest checking embedding model for low_similarity without rewrite", () => {
      const report: RAGDiagnosticReport = {
        triggeredAt: new Date().toISOString(),
        triggerReason: "low_similarity",
        retriever: {
          matchCount: 2,
          topSimilarity: 0.5,
          avgSimilarity: 0.4,
          queryRewriteUsed: false,
          searchMethod: "vector",
          embeddingModel: "text-embedding-004",
        },
        generator: {
          contextLength: 3000,
          contextTokenEstimate: 1200,
          budgetUsed: { maxDocs: 3, maxChunksPerDoc: 6 },
          truncated: false,
        },
        suggestions: [],
      };
      const suggestions = generateSuggestions(report);
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it("should return suggestions about grading for grading_timeout", () => {
      const report: RAGDiagnosticReport = {
        triggeredAt: new Date().toISOString(),
        triggerReason: "grading_timeout",
        retriever: {
          matchCount: 5,
          topSimilarity: 0.7,
          avgSimilarity: 0.65,
          queryRewriteUsed: true,
          searchMethod: "hybrid",
          embeddingModel: "text-embedding-004",
        },
        generator: {
          contextLength: 15000,
          contextTokenEstimate: 6000,
          budgetUsed: { maxDocs: 5, maxChunksPerDoc: 10 },
          truncated: false,
        },
        suggestions: [],
      };
      const suggestions = generateSuggestions(report);
      expect(suggestions.some((s) => s.includes("評分") || s.includes("超時"))).toBe(true);
    });

    it("should return suggestions about context for empty_response", () => {
      const report: RAGDiagnosticReport = {
        triggeredAt: new Date().toISOString(),
        triggerReason: "empty_response",
        retriever: {
          matchCount: 3,
          topSimilarity: 0.75,
          avgSimilarity: 0.65,
          queryRewriteUsed: false,
          searchMethod: "hybrid",
          embeddingModel: "text-embedding-004",
        },
        generator: {
          contextLength: 25000,
          contextTokenEstimate: 10000,
          budgetUsed: { maxDocs: 5, maxChunksPerDoc: 10 },
          truncated: true,
        },
        suggestions: [],
      };
      const suggestions = generateSuggestions(report);
      expect(suggestions.some((s) => s.includes("context") || s.includes("截斷") || s.includes("長度"))).toBe(true);
    });
  });

  describe("generateDiagnosticReport", () => {
    it("should generate report with triggerReason zero_results when no matches", () => {
      const report = generateDiagnosticReport({
        matchCount: 0,
        topSimilarity: 0,
        avgSimilarity: 0,
        queryRewriteUsed: false,
        searchMethod: "hybrid",
        embeddingModel: "text-embedding-004",
        contextLength: 0,
        contextTokenEstimate: 0,
        budgetUsed: { maxDocs: 3, maxChunksPerDoc: 6 },
        truncated: false,
        gradingTimedOut: false,
        emptyResponse: false,
      });

      expect(report.triggerReason).toBe("zero_results");
      expect(report.triggeredAt).toBeDefined();
      expect(report.retriever.matchCount).toBe(0);
      expect(report.generator.contextLength).toBe(0);
      expect(report.suggestions.length).toBeGreaterThan(0);
    });

    it("should generate report with triggerReason low_similarity", () => {
      const report = generateDiagnosticReport({
        matchCount: 5,
        topSimilarity: 0.45,
        avgSimilarity: 0.35,
        queryRewriteUsed: true,
        searchMethod: "hybrid",
        embeddingModel: "text-embedding-004",
        contextLength: 8000,
        contextTokenEstimate: 3200,
        budgetUsed: { maxDocs: 3, maxChunksPerDoc: 6 },
        truncated: false,
        gradingTimedOut: false,
        emptyResponse: false,
      });

      expect(report.triggerReason).toBe("low_similarity");
      expect(report.retriever.topSimilarity).toBe(0.45);
      expect(report.retriever.queryRewriteUsed).toBe(true);
    });

    it("should include complete retriever and generator fields", () => {
      const report = generateDiagnosticReport({
        matchCount: 2,
        topSimilarity: 0.5,
        avgSimilarity: 0.4,
        queryRewriteUsed: false,
        searchMethod: "vector",
        embeddingModel: "text-embedding-004",
        contextLength: 5000,
        contextTokenEstimate: 2000,
        budgetUsed: { maxDocs: 3, maxChunksPerDoc: 6 },
        truncated: false,
        gradingTimedOut: false,
        emptyResponse: false,
      });

      // Retriever fields
      expect(report.retriever).toEqual({
        matchCount: 2,
        topSimilarity: 0.5,
        avgSimilarity: 0.4,
        queryRewriteUsed: false,
        searchMethod: "vector",
        embeddingModel: "text-embedding-004",
      });

      // Generator fields
      expect(report.generator).toEqual({
        contextLength: 5000,
        contextTokenEstimate: 2000,
        budgetUsed: { maxDocs: 3, maxChunksPerDoc: 6 },
        truncated: false,
      });
    });

    it("should be a pure function (no side effects)", () => {
      const params = {
        matchCount: 0,
        topSimilarity: 0,
        avgSimilarity: 0,
        queryRewriteUsed: false,
        searchMethod: "hybrid" as const,
        embeddingModel: "text-embedding-004",
        contextLength: 0,
        contextTokenEstimate: 0,
        budgetUsed: { maxDocs: 3, maxChunksPerDoc: 6 },
        truncated: false,
        gradingTimedOut: false,
        emptyResponse: false,
      };

      const report1 = generateDiagnosticReport(params);
      const report2 = generateDiagnosticReport(params);

      // Same input should produce same structure (except triggeredAt timestamp)
      expect(report1.triggerReason).toBe(report2.triggerReason);
      expect(report1.retriever).toEqual(report2.retriever);
      expect(report1.generator).toEqual(report2.generator);
      expect(report1.suggestions).toEqual(report2.suggestions);
    });
  });
});
