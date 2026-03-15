jest.mock("ai", () => ({
  embed: jest.fn(),
}));
jest.mock("@/lib/ai/providers", () => ({
  getEmbeddingModel: jest.fn(() => "mock-model"),
  EMBEDDING_PROVIDER_OPTIONS: {},
}));
jest.mock("../query-rewriter", () => ({
  rewriteQuery: jest.fn(),
}));
jest.mock("../relevance-grader", () => ({
  gradeRetrievalRelevance: jest.fn(),
}));
jest.mock("../rss-source-matcher", () => ({
  matchRssSource: jest.fn(),
}));
jest.mock("../lightrag-client", () => ({
  isLightRAGAvailable: jest.fn().mockResolvedValue(false),
  queryLightRAG: jest.fn(),
}));

import { computeContextBudget } from '../adaptive-rag'

describe('computeContextBudget', () => {
  it('returns minimal budget for simple short queries', () => {
    const budget = computeContextBudget('今天天氣')
    expect(budget.maxDocs).toBe(1)
    expect(budget.maxChunksPerDoc).toBe(3)
  })

  it('returns full budget for analytical queries', () => {
    const budget = computeContextBudget('請分析這份財報的風險點，並與去年比較')
    expect(budget.maxDocs).toBe(5)
    expect(budget.maxChunksPerDoc).toBe(10)
  })

  it('returns medium budget for general medium-length queries', () => {
    const budget = computeContextBudget('告訴我更多關於這個產品的資訊')
    expect(budget.maxDocs).toBe(3)
    expect(budget.maxChunksPerDoc).toBe(6)
  })

  it('treats long queries (>50 chars) as at least medium complexity', () => {
    const longQuery = '這是一個很長的查詢，超過五十個字元，用來測試長度判斷是否正確運作'
    const budget = computeContextBudget(longQuery)
    expect(budget.maxDocs).toBeGreaterThanOrEqual(3)
  })

  it('detects analytical keywords: 分析、比較、整理、評估', () => {
    for (const q of ['分析報告', '比較兩方案', '整理重點', '評估風險']) {
      expect(computeContextBudget(q).maxDocs).toBe(5)
    }
  })
})
