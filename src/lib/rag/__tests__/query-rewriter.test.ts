jest.mock('ai', () => ({
  generateObject: jest.fn(),
}))
jest.mock('@/lib/ai/providers', () => ({
  getProvider: jest.fn(() => ({ modelId: 'mock-model' })),
}))

import { rewriteQuery } from '../query-rewriter'
import { generateObject } from 'ai'

const mockGenerateObject = generateObject as jest.MockedFunction<typeof generateObject>

describe('query-rewriter', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should rewrite a simple query', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        rewrittenQuery: 'GPU（圖形處理器）效能比較',
        alternatives: ['顯示卡效能分析'],
        reason: '擴展 GPU 縮寫',
      },
    } as never)

    const result = await rewriteQuery('GPU 效能比較')
    expect(result.rewrittenQuery).toBe('GPU（圖形處理器）效能比較')
    expect(result.alternatives).toHaveLength(1)
    expect(result.reason).toBeDefined()
  })

  it('should include conversation history context', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        rewrittenQuery: '台灣半導體產業 2025 年趨勢',
        alternatives: [],
        reason: '結合對話脈絡',
      },
    } as never)

    const history = [
      { role: 'user' as const, content: '台灣的半導體產業怎麼樣？' },
      { role: 'assistant' as const, content: '台灣半導體產業持續成長...' },
    ]

    const result = await rewriteQuery('未來趨勢', history)
    expect(result.rewrittenQuery).toContain('半導體')

    // Verify prompt includes conversation context
    const call = mockGenerateObject.mock.calls[0][0]
    expect(call.prompt).toContain('對話脈絡')
  })

  it('should work without conversation history', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        rewrittenQuery: '人工智慧發展趨勢',
        alternatives: ['AI 技術進展'],
        reason: '擴展查詢',
      },
    } as never)

    const result = await rewriteQuery('AI 趨勢')
    expect(result).toBeDefined()
  })
})
