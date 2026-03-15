import { generateDiagram, validateDiagramXml } from '../diagram-generator'

// Mock Vercel AI SDK
jest.mock('ai', () => ({
  generateText: jest.fn(),
}))

jest.mock('@ai-sdk/google', () => ({
  google: jest.fn(() => 'mock-model'),
  createGoogleGenerativeAI: jest.fn(() => jest.fn(() => 'mock-model')),
}))

import { generateText } from 'ai'

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>

describe('diagram-generator', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key'
  })

  afterEach(() => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
  })

  describe('generateDiagram', () => {
    it('should generate valid draw.io XML from prompt', async () => {
      const mockXml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
      mockGenerateText.mockResolvedValueOnce({
        text: mockXml,
      } as any)

      const result = await generateDiagram({ prompt: '畫一個流程圖' })
      expect(result.xml).toContain('<mxGraphModel>')
      expect(result.xml).toContain('</mxGraphModel>')
    })

    it('should pass existing XML for modification', async () => {
      const existingXml = '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>'
      const modifiedXml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
      mockGenerateText.mockResolvedValueOnce({ text: modifiedXml } as any)

      const result = await generateDiagram({
        prompt: '加一個節點',
        existingXml,
      })
      expect(result.xml).toContain('<mxGraphModel>')
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining(existingXml),
        })
      )
    })

    it('should accept diagram type parameter', async () => {
      const mockXml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
      mockGenerateText.mockResolvedValueOnce({ text: mockXml } as any)

      await generateDiagram({ prompt: '畫圖', diagramType: 'flowchart' })
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('flowchart'),
        })
      )
    })

    it('should extract XML from markdown code block', async () => {
      const wrappedXml = '```xml\n<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>\n```'
      mockGenerateText.mockResolvedValueOnce({ text: wrappedXml } as any)

      const result = await generateDiagram({ prompt: '畫圖' })
      expect(result.xml).toContain('<mxGraphModel>')
      expect(result.xml).not.toContain('```')
    })

    it('should throw on missing API key', async () => {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
      await expect(generateDiagram({ prompt: '畫圖' })).rejects.toThrow()
    })
  })

  describe('validateDiagramXml', () => {
    it('should accept valid draw.io XML', () => {
      const xml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
      expect(validateDiagramXml(xml)).toBe(true)
    })

    it('should reject non-mxGraphModel XML', () => {
      expect(validateDiagramXml('<html><body>not a diagram</body></html>')).toBe(false)
    })

    it('should reject empty string', () => {
      expect(validateDiagramXml('')).toBe(false)
    })

    it('should reject non-XML', () => {
      expect(validateDiagramXml('hello world')).toBe(false)
    })
  })
})
