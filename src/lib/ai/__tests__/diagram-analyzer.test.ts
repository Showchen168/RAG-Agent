import { analyzeDiagram, parseDiagramStructure } from '../diagram-analyzer'

jest.mock('ai', () => ({
  generateText: jest.fn(),
}))

jest.mock('@ai-sdk/google', () => ({
  google: jest.fn(() => 'mock-model'),
  createGoogleGenerativeAI: jest.fn(() => jest.fn(() => 'mock-model')),
}))

import { generateText } from 'ai'

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>

describe('diagram-analyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key'
  })

  afterEach(() => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
  })

  describe('parseDiagramStructure', () => {
    it('should count nodes and edges', () => {
      const xml = `<mxGraphModel><root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="A" vertex="1" parent="1"><mxGeometry x="0" y="0" width="100" height="50" as="geometry"/></mxCell>
        <mxCell id="3" value="B" vertex="1" parent="1"><mxGeometry x="0" y="100" width="100" height="50" as="geometry"/></mxCell>
        <mxCell id="4" source="2" target="3" edge="1" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
      </root></mxGraphModel>`

      const result = parseDiagramStructure(xml)
      expect(result.nodeCount).toBe(2)
      expect(result.edgeCount).toBe(1)
    })

    it('should extract node labels', () => {
      const xml = `<mxGraphModel><root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="節點A" vertex="1" parent="1"><mxGeometry x="0" y="0" width="100" height="50" as="geometry"/></mxCell>
        <mxCell id="3" value="節點B" vertex="1" parent="1"><mxGeometry x="0" y="100" width="100" height="50" as="geometry"/></mxCell>
      </root></mxGraphModel>`

      const result = parseDiagramStructure(xml)
      expect(result.nodeLabels).toContain('節點A')
      expect(result.nodeLabels).toContain('節點B')
    })

    it('should return zero counts for empty diagram', () => {
      const xml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
      const result = parseDiagramStructure(xml)
      expect(result.nodeCount).toBe(0)
      expect(result.edgeCount).toBe(0)
    })
  })

  describe('analyzeDiagram', () => {
    it('should return description and suggestions', async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: JSON.stringify({
          description: '這是一個簡單的流程圖',
          suggestions: ['加入判斷節點', '補充說明文字'],
          diagramType: 'flowchart',
        }),
      } as any)

      const xml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="A" vertex="1" parent="1"><mxGeometry x="0" y="0" width="100" height="50" as="geometry"/></mxCell></root></mxGraphModel>'
      const result = await analyzeDiagram(xml)

      expect(result.description).toBe('這是一個簡單的流程圖')
      expect(result.suggestions).toHaveLength(2)
      expect(result.structure.nodeCount).toBe(1)
    })

    it('should throw on empty XML', async () => {
      await expect(analyzeDiagram('')).rejects.toThrow()
    })

    it('should throw on missing API key', async () => {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
      const xml = '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>'
      await expect(analyzeDiagram(xml)).rejects.toThrow()
    })
  })
})
