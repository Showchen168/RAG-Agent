/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: any, opts?: any) => ({
      body,
      status: opts?.status ?? 200,
    })),
  },
}))

const mockFrom = jest.fn()
const mockAuthGetUser = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: () => mockAuthGetUser() },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}))

import { GET } from '../route'
import { NextResponse } from 'next/server'

// jsdom 沒有 Request，用簡單 mock
const mockRequest = () => ({} as unknown as Request)

describe('GET /api/knowledge/[id]/related', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when user is not authenticated', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: new Error('No session') })

    const req = mockRequest()
    await GET(req, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(NextResponse.json).toHaveBeenCalledWith(
      { error: 'Unauthorized' },
      { status: 401 },
    )
  })

  it('returns related document IDs from both directions', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })

    const mockSelect = jest.fn().mockReturnValue({
      or: jest.fn().mockResolvedValue({
        data: [
          { source_document_id: 'doc-1', target_document_id: 'doc-2' },
          { source_document_id: 'doc-3', target_document_id: 'doc-1' },
        ],
        error: null,
      }),
    })
    mockFrom.mockReturnValue({ select: mockSelect })

    const req = mockRequest()
    await GET(req, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(mockFrom).toHaveBeenCalledWith('document_relations')
    expect(NextResponse.json).toHaveBeenCalledWith({
      relatedDocIds: ['doc-2', 'doc-3'],
    })
  })

  it('returns empty array when no relations exist', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })

    const mockSelect = jest.fn().mockReturnValue({
      or: jest.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    })
    mockFrom.mockReturnValue({ select: mockSelect })

    const req = mockRequest()
    await GET(req, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(NextResponse.json).toHaveBeenCalledWith({
      relatedDocIds: [],
    })
  })
})
