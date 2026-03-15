import { deduplicateMemories } from "../memory-extractor";
import type { ExtractedMemory } from "../types";

// extractMemories 現在是 async + LLM 驅動，單元測試用 deduplicateMemories
// LLM 萃取的整合測試應在 e2e 或 integration test 中進行

describe("memory-extractor", () => {
  describe("deduplicateMemories", () => {
    it("should remove memories with content similar to existing ones", () => {
      const existing = ["使用者偏好深色模式", "使用者是軟體工程師"];
      const newMemories: ExtractedMemory[] = [
        { content: "深色模式", category: "preference", importance_score: 0.7 },
        { content: "使用 React", category: "preference", importance_score: 0.7 },
      ];
      const result = deduplicateMemories(existing, newMemories);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("使用 React");
    });

    it("should return all memories when no duplicates exist", () => {
      const existing = ["使用者偏好深色模式"];
      const newMemories: ExtractedMemory[] = [
        { content: "使用 TypeScript", category: "preference", importance_score: 0.7 },
        { content: "前端工程師", category: "fact", importance_score: 0.6 },
      ];
      const result = deduplicateMemories(existing, newMemories);
      expect(result).toHaveLength(2);
    });

    it("should return empty array when all memories are duplicates", () => {
      const existing = ["使用者偏好深色模式", "使用者喜歡 TypeScript"];
      const newMemories: ExtractedMemory[] = [
        { content: "偏好深色模式", category: "preference", importance_score: 0.7 },
      ];
      const result = deduplicateMemories(existing, newMemories);
      expect(result).toHaveLength(0);
    });

    it("should return all memories when existing list is empty", () => {
      const existing: string[] = [];
      const newMemories: ExtractedMemory[] = [
        { content: "使用 React", category: "preference", importance_score: 0.7 },
      ];
      const result = deduplicateMemories(existing, newMemories);
      expect(result).toHaveLength(1);
    });

    it("should return empty array when newMemories is empty", () => {
      const existing = ["使用者偏好深色模式"];
      const newMemories: ExtractedMemory[] = [];
      const result = deduplicateMemories(existing, newMemories);
      expect(result).toHaveLength(0);
    });
  });
});
