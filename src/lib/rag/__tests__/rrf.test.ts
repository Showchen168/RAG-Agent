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

import { reciprocalRankFusion } from '../adaptive-rag'

describe('reciprocalRankFusion', () => {
  it('ranks documents appearing in both lists higher', () => {
    const vectorResults = [
      { document_id: 'doc1', similarity: 0.9, chunk_text: 'a', title: 'A' },
      { document_id: 'doc2', similarity: 0.7, chunk_text: 'b', title: 'B' },
    ]
    const bm25Results = [
      { document_id: 'doc2', similarity: 0.8, chunk_text: 'b', title: 'B' },
      { document_id: 'doc3', similarity: 0.6, chunk_text: 'c', title: 'C' },
    ]
    const fused = reciprocalRankFusion(vectorResults, bm25Results)
    expect(fused[0].document_id).toBe('doc2')
  })

  it('returns empty array when both inputs are empty', () => {
    expect(reciprocalRankFusion([], [])).toEqual([])
  })

  it('handles one empty list gracefully', () => {
    const result = reciprocalRankFusion(
      [{ document_id: 'doc1', similarity: 0.9, chunk_text: 'a', title: 'A' }],
      []
    )
    expect(result).toHaveLength(1)
    expect(result[0].document_id).toBe('doc1')
  })

  it('deduplicates documents, keeps highest similarity', () => {
    const fused = reciprocalRankFusion(
      [{ document_id: 'doc1', similarity: 0.9, chunk_text: 'a', title: 'A' }],
      [{ document_id: 'doc1', similarity: 0.5, chunk_text: 'a2', title: 'A' }]
    )
    expect(fused).toHaveLength(1)
    expect(fused[0].similarity).toBe(0.9)
  })
})
