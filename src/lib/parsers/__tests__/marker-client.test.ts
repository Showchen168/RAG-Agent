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

describe('marker-client', () => {
  describe('isMarkerAvailable', () => {
    it('should return false when MARKER_SERVICE_URL is not set', async () => {
      delete process.env.MARKER_SERVICE_URL
      const mod = await importFresh()
      expect(await mod.isMarkerAvailable()).toBe(false)
    })

    it('should return true when service responds ok', async () => {
      process.env.MARKER_SERVICE_URL = 'http://localhost:8001'
      mockFetch.mockResolvedValueOnce({ ok: true } as Response)
      const mod = await importFresh()
      expect(await mod.isMarkerAvailable()).toBe(true)
    })

    it('should return false when fetch throws', async () => {
      process.env.MARKER_SERVICE_URL = 'http://localhost:8001'
      mockFetch.mockRejectedValueOnce(new Error('connection refused'))
      const mod = await importFresh()
      expect(await mod.isMarkerAvailable()).toBe(false)
    })

    it('should return false when response is not ok', async () => {
      process.env.MARKER_SERVICE_URL = 'http://localhost:8001'
      mockFetch.mockResolvedValueOnce({ ok: false } as Response)
      const mod = await importFresh()
      expect(await mod.isMarkerAvailable()).toBe(false)
    })
  })

  describe('parseWithMarker', () => {
    it('should return error when URL not configured', async () => {
      delete process.env.MARKER_SERVICE_URL
      const mod = await importFresh()
      const result = await mod.parseWithMarker(Buffer.from('test'), 'test.pdf')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('not configured')
      }
    })

    it('should parse successfully', async () => {
      process.env.MARKER_SERVICE_URL = 'http://localhost:8001'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          markdown: '# Title\nContent',
          chunks: [{ text: 'Content', page: 1, chunk_type: 'text' }],
          metadata: { filename: 'test.pdf', page_count: 1, parse_time_seconds: 0.5 },
        }),
      } as Response)
      const mod = await importFresh()
      const result = await mod.parseWithMarker(Buffer.from('pdf-bytes'), 'test.pdf')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.markdown).toContain('Title')
        expect(result.chunks).toHaveLength(1)
      }
    })

    it('should handle HTTP error', async () => {
      process.env.MARKER_SERVICE_URL = 'http://localhost:8001'
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      } as Response)
      const mod = await importFresh()
      const result = await mod.parseWithMarker(Buffer.from('test'), 'test.pdf')
      expect(result.success).toBe(false)
    })

    it('should handle fetch error', async () => {
      process.env.MARKER_SERVICE_URL = 'http://localhost:8001'
      mockFetch.mockRejectedValueOnce(new Error('timeout'))
      const mod = await importFresh()
      const result = await mod.parseWithMarker(Buffer.from('test'), 'test.pdf')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('timeout')
      }
    })

    it('should handle non-success response from Marker', async () => {
      process.env.MARKER_SERVICE_URL = 'http://localhost:8001'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: false, error: 'Parse error' }),
      } as Response)
      const mod = await importFresh()
      const result = await mod.parseWithMarker(Buffer.from('test'), 'test.pdf')
      expect(result.success).toBe(false)
    })
  })
})

async function importFresh() {
  jest.resetModules()
  global.fetch = mockFetch
  return import('../marker-client')
}
