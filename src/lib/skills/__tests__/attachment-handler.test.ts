/**
 * Skills Attachment Download Handler - Unit Tests
 * TDD: Tests for GET /api/skills/attachments/[id]
 */

import { handleGetAttachment } from '../attachment-handler'

// ========== Fixtures ==========

const mockAttachment = {
  id: 'att-001',
  message_id: 'msg-001',
  skill_id: 'skill-001',
  file_name: 'output.md',
  file_type: 'md',
  mime_type: 'text/markdown',
  file_size: 1024,
  storage_path: '/data/skills-output/output.md',
  preview_content: '# Generated Document',
  created_at: '2026-02-26T00:00:00Z',
}

function createMockSupabase(options: {
  user?: { id: string } | null
  attachment?: typeof mockAttachment | null
  attachmentError?: { message: string } | null
}) {
  const { user = { id: 'user-001' }, attachment = mockAttachment, attachmentError = null } = options

  // skill_attachments query chain: from → select → eq(id) → single
  const mockSingle = jest.fn().mockResolvedValue({
    data: attachment,
    error: attachmentError,
  })
  const mockEqId = jest.fn().mockReturnValue({ single: mockSingle })
  const mockSelect = jest.fn().mockReturnValue({ eq: mockEqId })
  const mockFrom = jest.fn().mockReturnValue({ select: mockSelect })

  const mockGetUser = jest.fn().mockResolvedValue({
    data: { user: user ? { id: user.id } : null },
    error: user ? null : { message: 'Not authenticated' },
  })

  return {
    from: mockFrom,
    auth: { getUser: mockGetUser },
  }
}

// ========== Tests ==========

describe('handleGetAttachment', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return 401 when user is not authenticated', async () => {
    const supabase = createMockSupabase({ user: null })

    const result = await handleGetAttachment(supabase as never, 'att-001')

    expect(result.status).toBe(401)
    expect(result.body).toEqual({ error: 'Unauthorized' })
  })

  it('should return 400 when attachment id is missing', async () => {
    const supabase = createMockSupabase({})

    const result = await handleGetAttachment(supabase as never, '')

    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: 'Missing attachment id' })
  })

  it('should return 404 when attachment is not found', async () => {
    const supabase = createMockSupabase({ attachment: null })

    const result = await handleGetAttachment(supabase as never, 'nonexistent')

    expect(result.status).toBe(404)
    expect(result.body).toEqual({ error: 'Attachment not found' })
  })

  it('should return attachment metadata on success', async () => {
    const supabase = createMockSupabase({})

    const result = await handleGetAttachment(supabase as never, 'att-001')

    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      id: 'att-001',
      fileName: 'output.md',
      fileType: 'md',
      mimeType: 'text/markdown',
      fileSize: 1024,
      storagePath: '/data/skills-output/output.md',
      previewContent: '# Generated Document',
    })
  })

  it('should return 500 when supabase query throws', async () => {
    const supabase = createMockSupabase({
      attachmentError: { message: 'DB connection failed' },
    })

    const result = await handleGetAttachment(supabase as never, 'att-001')

    expect(result.status).toBe(500)
    expect((result.body as Record<string, string>).error).toContain('DB connection failed')
  })
})
