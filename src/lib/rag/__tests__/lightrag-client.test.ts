// Save and restore original env
const originalEnv = process.env
const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  process.env = { ...originalEnv }
  mockFetch.mockReset()
})

afterEach(() => {
  process.env = originalEnv
})

// We need to re-import in each test since module caches LIGHTRAG_URL at import time.

describe('lightrag-client', () => {
  describe('isLightRAGAvailable', () => {
    it('should return false when LIGHTRAG_SERVICE_URL is not set', async () => {
      delete process.env.LIGHTRAG_SERVICE_URL
      const mod = await importFresh()
      const result = await mod.isLightRAGAvailable()
      expect(result).toBe(false)
    })

    it('should return true when service responds ok', async () => {
      process.env.LIGHTRAG_SERVICE_URL = 'http://localhost:9621'
      mockFetch.mockResolvedValueOnce({ ok: true } as Response)
      const mod = await importFresh()
      const result = await mod.isLightRAGAvailable()
      expect(result).toBe(true)
    })

    it('should return false when fetch throws', async () => {
      process.env.LIGHTRAG_SERVICE_URL = 'http://localhost:9621'
      mockFetch.mockRejectedValueOnce(new Error('connection refused'))
      const mod = await importFresh()
      const result = await mod.isLightRAGAvailable()
      expect(result).toBe(false)
    })
  })

  describe('indexDocument', () => {
    it('should return error when URL not configured', async () => {
      delete process.env.LIGHTRAG_SERVICE_URL
      const mod = await importFresh()
      const result = await mod.indexDocument({ text: 'test', docId: '1', userId: 'u1' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('not configured')
    })

    it('should index document successfully', async () => {
      process.env.LIGHTRAG_SERVICE_URL = 'http://localhost:9621'
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true }),
      } as Response)
      const mod = await importFresh()
      const result = await mod.indexDocument({ text: 'content', docId: 'd1', userId: 'u1' })
      expect(result.success).toBe(true)
    })

    it('should handle fetch error gracefully', async () => {
      process.env.LIGHTRAG_SERVICE_URL = 'http://localhost:9621'
      mockFetch.mockRejectedValueOnce(new Error('timeout'))
      const mod = await importFresh()
      const result = await mod.indexDocument({ text: 'test', docId: '1', userId: 'u1' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
    })
  })

  describe('queryLightRAG', () => {
    it('should return error when URL not configured', async () => {
      delete process.env.LIGHTRAG_SERVICE_URL
      const mod = await importFresh()
      const result = await mod.queryLightRAG({ query: 'test', userId: 'u1' })
      expect(result.success).toBe(false)
    })

    it('should query successfully', async () => {
      process.env.LIGHTRAG_SERVICE_URL = 'http://localhost:9621'
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: true,
          result: 'AI 是人工智慧',
          mode: 'hybrid',
          query_time_seconds: 1.5,
        }),
      } as Response)
      const mod = await importFresh()
      const result = await mod.queryLightRAG({ query: '什麼是 AI', userId: 'u1' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.result).toContain('AI')
      }
    })

    it('should handle query failure response', async () => {
      process.env.LIGHTRAG_SERVICE_URL = 'http://localhost:9621'
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'no results' }),
      } as Response)
      const mod = await importFresh()
      const result = await mod.queryLightRAG({ query: 'q', userId: 'u1' })
      expect(result.success).toBe(false)
    })

    it('should handle fetch error', async () => {
      process.env.LIGHTRAG_SERVICE_URL = 'http://localhost:9621'
      mockFetch.mockRejectedValueOnce(new Error('network error'))
      const mod = await importFresh()
      const result = await mod.queryLightRAG({ query: 'q', userId: 'u1' })
      expect(result.success).toBe(false)
    })
  })

  describe('getLightRAGGraph', () => {
    it('should return error when URL not configured', async () => {
      delete process.env.LIGHTRAG_SERVICE_URL
      const mod = await importFresh()
      const result = await mod.getLightRAGGraph('u1')
      expect(result.success).toBe(false)
      expect(result.nodes).toEqual([])
      expect(result.edges).toEqual([])
    })

    it('should return graph data', async () => {
      process.env.LIGHTRAG_SERVICE_URL = 'http://localhost:9621'
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: true,
          nodes: [{ id: 'n1', label: 'AI', type: 'entity', description: '' }],
          edges: [{ source: 'n1', target: 'n2', relation: 'is', weight: 1 }],
        }),
      } as Response)
      const mod = await importFresh()
      const result = await mod.getLightRAGGraph('u1')
      expect(result.success).toBe(true)
      expect(result.nodes).toHaveLength(1)
      expect(result.edges).toHaveLength(1)
    })

    it('should handle fetch error', async () => {
      process.env.LIGHTRAG_SERVICE_URL = 'http://localhost:9621'
      mockFetch.mockRejectedValueOnce(new Error('fail'))
      const mod = await importFresh()
      const result = await mod.getLightRAGGraph('u1')
      expect(result.success).toBe(false)
    })
  })
})

async function importFresh() {
  // Clear module cache to get fresh import with current env
  jest.resetModules()
  // Re-assign mock fetch after module reset
  global.fetch = mockFetch
  return import('../lightrag-client')
}
