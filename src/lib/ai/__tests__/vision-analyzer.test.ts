jest.mock('ai', () => ({
  generateText: jest.fn(),
}))
jest.mock('../providers', () => ({
  getProvider: jest.fn(() => ({ modelId: 'gemini-3-flash-preview' })),
}))

import { analyzeImage } from '../vision-analyzer'
import { generateText } from 'ai'

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>

describe('vision-analyzer', () => {
  beforeEach(() => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key'
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should return text from image analysis', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '這是一張圖表，顯示了銷售趨勢',
    } as never)

    const result = await analyzeImage(Buffer.from('fake-image'))
    expect(result).toBe('這是一張圖表，顯示了銷售趨勢')
  })

  it('should call generateText with correct parameters', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: 'test' } as never)

    await analyzeImage(Buffer.from('test-image'))

    expect(mockGenerateText).toHaveBeenCalledTimes(1)
    const call = mockGenerateText.mock.calls[0][0]
    expect(call.messages).toHaveLength(1)
    expect(call.messages![0].role).toBe('user')
  })

  it('should return empty string on error', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('API error'))

    const result = await analyzeImage(Buffer.from('bad-image'))
    expect(result).toBe('')
  })
})
