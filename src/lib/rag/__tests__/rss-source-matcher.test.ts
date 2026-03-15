import { matchRssSource } from '../rss-source-matcher'

// Mock Supabase client
function createMockSupabase(sourcesData: Record<string, unknown>[] | null, sourceError: unknown = null, docData: Record<string, unknown> | null = { id: 'doc-1' }) {
  const supabase = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnValue({
      data: sourcesData,
      error: sourceError,
    }),
  }

  // For the document verification query
  if (docData !== undefined) {
    const docChain = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnValue({ data: docData }),
    }
    // After the first .from('knowledge_sources') chain, override for .from('documents')
    let callCount = 0
    supabase.from = jest.fn().mockImplementation((table: string) => {
      callCount++
      if (table === 'documents' || callCount > 1) {
        return docChain
      }
      return supabase
    })
  }

  return supabase as never
}

describe('rss-source-matcher', () => {
  it('should return null when no sources found', async () => {
    const supabase = createMockSupabase(null)
    const result = await matchRssSource('test query', 'user-1', supabase)
    expect(result).toBeNull()
  })

  it('should return null when sources array is empty', async () => {
    const supabase = createMockSupabase([])
    const result = await matchRssSource('test query', 'user-1', supabase)
    expect(result).toBeNull()
  })

  it('should return null when query has error', async () => {
    const supabase = createMockSupabase(null, new Error('db error'))
    const result = await matchRssSource('test query', 'user-1', supabase)
    expect(result).toBeNull()
  })

  it('should skip sources with short names (< 3 chars)', async () => {
    const supabase = createMockSupabase([
      { name: 'AI', document_id: 'doc-1', source_type: 'rss' },
    ])
    const result = await matchRssSource('AI 新聞', 'user-1', supabase)
    expect(result).toBeNull()
  })

  it('should match Chinese source name with includes', async () => {
    const supabase = createMockSupabase([
      { name: '科技新報', document_id: 'doc-1', source_type: 'rss' },
    ])
    const result = await matchRssSource('科技新報的最新文章', 'user-1', supabase)
    expect(result).not.toBeNull()
    expect(result!.sourceName).toBe('科技新報')
  })

  it('should match English source with word boundary', async () => {
    const supabase = createMockSupabase([
      { name: 'TechCrunch', document_id: 'doc-1', source_type: 'rss' },
    ])
    const result = await matchRssSource('TechCrunch 有什麼新聞', 'user-1', supabase)
    expect(result).not.toBeNull()
    expect(result!.sourceName).toBe('TechCrunch')
  })

  it('should pick longest name when multiple match', async () => {
    const supabase = createMockSupabase([
      { name: 'Tech', document_id: 'doc-1', source_type: 'rss' },
      { name: 'TechCrunch News', document_id: 'doc-2', source_type: 'rss' },
    ])
    const result = await matchRssSource('TechCrunch News 報導了什麼', 'user-1', supabase)
    expect(result).not.toBeNull()
    expect(result!.sourceName).toBe('TechCrunch News')
  })
})
