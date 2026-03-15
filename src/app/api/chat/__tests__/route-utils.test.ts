/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock 所有外部依賴，避免模組載入時爆炸
jest.mock("ai", () => ({
  streamText: jest.fn(),
  smoothStream: jest.fn(),
  generateText: jest.fn(),
}));
jest.mock("@ai-sdk/google", () => ({ google: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/ai/providers", () => ({ getProvider: jest.fn() }));
jest.mock("@/lib/chat/citation-guards", () => ({
  extractFreshnessAnchors: jest.fn(),
  docMatchesFreshnessAnchors: jest.fn(),
}));
jest.mock("@/lib/chat/response-style", () => ({
  inferResponseStyleMode: jest.fn(),
  buildResponseStylePrompt: jest.fn(() => ""),
}));
jest.mock("@/lib/rag/adaptive-rag", () => ({
  executeAdaptiveRAG: jest.fn(),
}));

import {
  inferSourceType,
  getConfidenceLabel,
  getFreshnessLabel,
  toZhDate,
  buildKnowledgeQualitySignals,
  toTextContent,
} from "../route";

// ─── inferSourceType ───────────────────────────────────────────────

describe("inferSourceType", () => {
  it("null tags → 內部（知識庫上傳預設為內部）", () => {
    expect(inferSourceType(null)).toBe("內部");
  });

  it("undefined tags → 內部", () => {
    expect(inferSourceType(undefined)).toBe("內部");
  });

  it("empty array → 內部", () => {
    expect(inferSourceType([])).toBe("內部");
  });

  it("tags 包含 WEB → 外部", () => {
    expect(inferSourceType(["WEB"])).toBe("外部");
  });

  it("tags 包含 news（小寫）→ 外部", () => {
    expect(inferSourceType(["news"])).toBe("外部");
  });

  it("tags 包含 EXTERNAL → 外部", () => {
    expect(inferSourceType(["EXTERNAL"])).toBe("外部");
  });

  it("tags 包含 RSS → 外部", () => {
    expect(inferSourceType(["RSS"])).toBe("外部");
  });

  it("tags 包含 MONITOR → 外部", () => {
    expect(inferSourceType(["MONITOR"])).toBe("外部");
  });

  it("無法辨識的 tags → 內部（預設）", () => {
    expect(inferSourceType(["random", "tag"])).toBe("內部");
  });

  it("混合 tags 時，外部優先（因為先檢查外部標記）", () => {
    expect(inferSourceType(["WEB", "PDF"])).toBe("外部");
  });
});

// ─── getConfidenceLabel ────────────────────────────────────────────

describe("getConfidenceLabel", () => {
  it("高 similarity + 未知來源 → 高（>=0.82）", () => {
    expect(getConfidenceLabel(0.85, "未知")).toBe("高");
  });

  it("中 similarity + 未知來源 → 中（>=0.7, <0.82）", () => {
    expect(getConfidenceLabel(0.75, "未知")).toBe("中");
  });

  it("低 similarity + 未知來源 → 低（<0.7）", () => {
    expect(getConfidenceLabel(0.5, "未知")).toBe("低");
  });

  it("內部來源 boost +0.04：0.78 + 0.04 = 0.82 → 高", () => {
    expect(getConfidenceLabel(0.78, "內部")).toBe("高");
  });

  it("外部來源 penalty -0.02：0.71 - 0.02 = 0.69 → 低", () => {
    expect(getConfidenceLabel(0.71, "外部")).toBe("低");
  });

  it("邊界值：adjusted 剛好 0.82 → 高", () => {
    expect(getConfidenceLabel(0.82, "未知")).toBe("高");
  });

  it("邊界值：adjusted 剛好 0.7 → 中", () => {
    expect(getConfidenceLabel(0.7, "未知")).toBe("中");
  });

  it("邊界值：adjusted 剛好 0.6999 → 低", () => {
    expect(getConfidenceLabel(0.6999, "未知")).toBe("低");
  });
});

// ─── getFreshnessLabel ─────────────────────────────────────────────

describe("getFreshnessLabel", () => {
  it("null → 偏舊", () => {
    expect(getFreshnessLabel(null)).toBe("偏舊");
  });

  it("10 天前 → 最新", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
    expect(getFreshnessLabel(tenDaysAgo)).toBe("最新");
  });

  it("30 天前 → 最新（邊界）", () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    expect(getFreshnessLabel(thirtyDaysAgo)).toBe("最新");
  });

  it("90 天前 → 近期", () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
    expect(getFreshnessLabel(ninetyDaysAgo)).toBe("近期");
  });

  it("180 天前 → 近期（邊界）", () => {
    const d = new Date(Date.now() - 180 * 86400000).toISOString();
    expect(getFreshnessLabel(d)).toBe("近期");
  });

  it("365 天前 → 偏舊", () => {
    const d = new Date(Date.now() - 365 * 86400000).toISOString();
    expect(getFreshnessLabel(d)).toBe("偏舊");
  });

  it("無效日期字串 → 偏舊", () => {
    expect(getFreshnessLabel("not-a-date")).toBe("偏舊");
  });

  it("空字串 → 偏舊", () => {
    expect(getFreshnessLabel("")).toBe("偏舊");
  });
});

// ─── toZhDate ──────────────────────────────────────────────────────

describe("toZhDate", () => {
  it("null → 未知", () => {
    expect(toZhDate(null)).toBe("未知");
  });

  it("無效日期 → 未知", () => {
    expect(toZhDate("invalid")).toBe("未知");
  });

  it("空字串 → 未知", () => {
    expect(toZhDate("")).toBe("未知");
  });

  it("合法 ISO 日期 → 格式化輸出（含年月日）", () => {
    const result = toZhDate("2025-06-15T00:00:00Z");
    // 使用 zh-TW + Asia/Taipei → 應包含 2025 年
    expect(result).toContain("2025");
    // 應包含月和日的數字
    expect(result).toMatch(/\d/);
  });
});

// ─── buildKnowledgeQualitySignals ──────────────────────────────────

describe("buildKnowledgeQualitySignals", () => {
  const baseItem = {
    title: "文件A",
    sourceType: "內部" as const,
    confidence: "高" as const,
    freshness: "最新" as const,
    updatedAt: "2025/06/15",
  };

  it("建構包含項目的信號字串", () => {
    const result = buildKnowledgeQualitySignals({
      items: [baseItem],
      possibleConflict: false,
    });
    expect(result).toContain("[KNOWLEDGE QUALITY SIGNALS");
    expect(result).toContain("文件A");
    expect(result).toContain("來源:內部");
    expect(result).toContain("可信度:高");
    expect(result).toContain("新鮮度:最新");
    expect(result).toContain("更新:2025/06/15");
  });

  it("possibleConflict=true → 包含衝突訊號", () => {
    const result = buildKnowledgeQualitySignals({
      items: [baseItem],
      possibleConflict: true,
    });
    expect(result).toContain("是（可能存在版本或數值差異，需明確標註）");
  });

  it("possibleConflict=false → 無衝突訊號", () => {
    const result = buildKnowledgeQualitySignals({
      items: [baseItem],
      possibleConflict: false,
    });
    expect(result).toContain("否（未偵測到明顯衝突）");
    expect(result).not.toContain("是（可能存在版本或數值差異");
  });

  it("多筆項目正確編號", () => {
    const items = [
      { ...baseItem, title: "文件A" },
      { ...baseItem, title: "文件B" },
    ];
    const result = buildKnowledgeQualitySignals({
      items,
      possibleConflict: false,
    });
    expect(result).toContain("1. 文件A");
    expect(result).toContain("2. 文件B");
  });
});

// ─── toTextContent ─────────────────────────────────────────────────

describe("toTextContent", () => {
  it("string content → 原樣回傳", () => {
    expect(toTextContent("hello world")).toBe("hello world");
  });

  it("空字串 → 空字串", () => {
    expect(toTextContent("")).toBe("");
  });

  it("array with text parts → 串接文字", () => {
    const content = [
      { type: "text" as const, text: "part1" },
      { type: "text" as const, text: "part2" },
    ];
    expect(toTextContent(content as any)).toBe("part1\npart2");
  });

  it("array 混合 type → 只取 text 類型", () => {
    const content = [
      { type: "text" as const, text: "visible" },
      { type: "image" as const, image: "data:..." },
      { type: "text" as const, text: "also visible" },
    ];
    expect(toTextContent(content as any)).toBe("visible\nalso visible");
  });

  it("空 array → 空字串", () => {
    expect(toTextContent([] as any)).toBe("");
  });

  it("非 string 非 array → 空字串", () => {
    expect(toTextContent(123 as any)).toBe("");
    expect(toTextContent(null as any)).toBe("");
    expect(toTextContent(undefined as any)).toBe("");
  });
});
