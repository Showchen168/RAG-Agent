jest.mock('ai', () => ({
  generateObject: jest.fn(),
}))
jest.mock('@/lib/ai/providers', () => ({
  getProvider: jest.fn(() => ({ modelId: 'mock-model' })),
}))

import { gradeRetrievalRelevance } from '../relevance-grader'
import { generateObject } from 'ai'

const mockGenerateObject = generateObject as jest.MockedFunction<typeof generateObject>

describe('relevance-grader', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should return fallback_web for empty chunks', async () => {
    const result = await gradeRetrievalRelevance('test query', [], [])
    expect(result.score).toBe(0)
    expect(result.verdict).toBe('fallback_web')
    expect(result.reason).toContain('無任何匹配結果')
    // Should not call LLM
    expect(mockGenerateObject).not.toHaveBeenCalled()
  })

  it('should return sufficient for high score', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { score: 0.85, reason: '內容高度相關' },
    } as never)

    const result = await gradeRetrievalRelevance(
      'AI 技術',
      ['AI 技術的最新發展...'],
      ['AI 白皮書']
    )
    expect(result.verdict).toBe('sufficient')
    expect(result.score).toBe(0.85)
  })

  it('should return retry for medium score', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { score: 0.55, reason: '部分相關' },
    } as never)

    const result = await gradeRetrievalRelevance(
      'test',
      ['some content'],
      ['doc title']
    )
    expect(result.verdict).toBe('retry')
  })

  it('should return fallback_web for low score', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { score: 0.2, reason: '幾乎無關' },
    } as never)

    const result = await gradeRetrievalRelevance(
      'test',
      ['unrelated content'],
      ['unrelated doc']
    )
    expect(result.verdict).toBe('fallback_web')
  })

  it('should use exact threshold boundaries', async () => {
    // Score exactly at 0.7 → sufficient
    mockGenerateObject.mockResolvedValueOnce({
      object: { score: 0.7, reason: '剛好及格' },
    } as never)
    const result1 = await gradeRetrievalRelevance('q', ['c'], ['d'])
    expect(result1.verdict).toBe('sufficient')

    // Score exactly at 0.4 → retry
    mockGenerateObject.mockResolvedValueOnce({
      object: { score: 0.4, reason: '邊界' },
    } as never)
    const result2 = await gradeRetrievalRelevance('q', ['c'], ['d'])
    expect(result2.verdict).toBe('retry')

    // Score just below 0.4 → fallback_web
    mockGenerateObject.mockResolvedValueOnce({
      object: { score: 0.39, reason: '不足' },
    } as never)
    const result3 = await gradeRetrievalRelevance('q', ['c'], ['d'])
    expect(result3.verdict).toBe('fallback_web')
  })

  it('should only send first 3 chunks', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { score: 0.8, reason: 'ok' },
    } as never)

    const chunks = ['chunk1', 'chunk2', 'chunk3', 'chunk4', 'chunk5']
    await gradeRetrievalRelevance('query', chunks, ['doc'])

    const call = mockGenerateObject.mock.calls[0][0]
    // Should contain chunk 1-3 but not 4-5
    expect(call.prompt).toContain('片段 1')
    expect(call.prompt).toContain('片段 3')
    expect(call.prompt).not.toContain('片段 4')
  })
})
