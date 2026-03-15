/**
 * @jest-environment node
 */

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/ai/diagram-generator', () => ({
  generateDiagram: jest.fn(),
}))

jest.mock('@/lib/ai/diagram-analyzer', () => ({
  analyzeDiagram: jest.fn(),
}))

import { POST } from '../route'
import { createClient } from '@/lib/supabase/server'
import { generateDiagram } from '@/lib/ai/diagram-generator'
import { analyzeDiagram } from '@/lib/ai/diagram-analyzer'

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>
const mockGenerateDiagram = generateDiagram as jest.MockedFunction<typeof generateDiagram>
const mockAnalyzeDiagram = analyzeDiagram as jest.MockedFunction<typeof analyzeDiagram>

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/canvas/diagram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/canvas/diagram', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key'
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
        }),
      },
    } as any)
  })

  afterEach(() => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
  })

  it('should return 401 if not authenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any)

    const res = await POST(makeRequest({ action: 'generate', prompt: 'test' }))
    expect(res.status).toBe(401)
  })

  it('should return 400 for invalid action', async () => {
    const res = await POST(makeRequest({ action: 'invalid' }))
    expect(res.status).toBe(400)
  })

  it('should generate diagram', async () => {
    mockGenerateDiagram.mockResolvedValueOnce({
      xml: '<mxGraphModel><root></root></mxGraphModel>',
    })

    const res = await POST(makeRequest({
      action: 'generate',
      prompt: '流程圖',
      diagramType: 'flowchart',
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.xml).toContain('<mxGraphModel>')
  })

  it('should analyze diagram', async () => {
    mockAnalyzeDiagram.mockResolvedValueOnce({
      description: '測試圖表',
      suggestions: ['建議1'],
      diagramType: 'flowchart',
      structure: { nodeCount: 1, edgeCount: 0, nodeLabels: ['A'] },
    })

    const res = await POST(makeRequest({
      action: 'analyze',
      xml: '<mxGraphModel><root></root></mxGraphModel>',
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.description).toBe('測試圖表')
  })

  it('should modify existing diagram', async () => {
    mockGenerateDiagram.mockResolvedValueOnce({
      xml: '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>',
    })

    const res = await POST(makeRequest({
      action: 'modify',
      prompt: '加一個節點',
      xml: '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>',
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.xml).toBeDefined()
  })
})
