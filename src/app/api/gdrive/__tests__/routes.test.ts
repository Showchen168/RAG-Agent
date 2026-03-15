import { Request, Response } from 'node-fetch'
import { createClient } from '@/lib/supabase/server'
import { getAuthUrl, handleCallback } from '@/lib/gdrive/auth'
import { isConnected, deleteTokens, saveTokens, getValidToken } from '@/lib/gdrive/tokens'
import { listFiles, downloadFile, exportFile, getFileMetadata } from '@/lib/gdrive/client'
import { detectFileType, parseFileWithMarker } from '@/lib/parsers/file-parser'

type JsonBody = Record<string, unknown>
type MockUser = { id: string } | null

;(global as unknown as { Request: typeof Request }).Request = Request
;(global as unknown as { Response: typeof Response }).Response = Response
;(global as unknown as { Response: typeof Response }).Response.json = (
  body: JsonBody,
  init?: ResponseInit
) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      'content-type': 'application/json',
    },
  })

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/gdrive/auth', () => ({
  getAuthUrl: jest.fn(),
  handleCallback: jest.fn(),
}))

jest.mock('@/lib/gdrive/tokens', () => ({
  isConnected: jest.fn(),
  deleteTokens: jest.fn(),
  saveTokens: jest.fn(),
  getValidToken: jest.fn(),
}))

jest.mock('@/lib/gdrive/client', () => ({
  listFiles: jest.fn(),
  downloadFile: jest.fn(),
  exportFile: jest.fn(),
  getFileMetadata: jest.fn(),
}))

jest.mock('@/lib/parsers/file-parser', () => ({
  detectFileType: jest.fn(),
  parseFileWithMarker: jest.fn(),
}))

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>
const mockGetAuthUrl = getAuthUrl as jest.MockedFunction<typeof getAuthUrl>
const mockHandleCallback = handleCallback as jest.MockedFunction<typeof handleCallback>
const mockIsConnected = isConnected as jest.MockedFunction<typeof isConnected>
const mockDeleteTokens = deleteTokens as jest.MockedFunction<typeof deleteTokens>
const mockSaveTokens = saveTokens as jest.MockedFunction<typeof saveTokens>
const mockGetValidToken = getValidToken as jest.MockedFunction<typeof getValidToken>
const mockListFiles = listFiles as jest.MockedFunction<typeof listFiles>
const mockDownloadFile = downloadFile as jest.MockedFunction<typeof downloadFile>
const mockExportFile = exportFile as jest.MockedFunction<typeof exportFile>
const mockGetFileMetadata = getFileMetadata as jest.MockedFunction<typeof getFileMetadata>
const mockDetectFileType = detectFileType as jest.MockedFunction<typeof detectFileType>
const mockParseFileWithMarker = parseFileWithMarker as jest.MockedFunction<typeof parseFileWithMarker>

const mockSingle = jest.fn()
const mockSelect = jest.fn(() => ({ single: mockSingle }))
const mockInsert = jest.fn(() => ({ select: mockSelect }))
const mockFrom = jest.fn(() => ({ insert: mockInsert }))

let connectGET: () => Promise<Response>
let connectPOST: () => Promise<Response>
let connectDELETE: () => Promise<Response>
let callbackGET: (req: Request) => Promise<Response>
let listGET: (req: Request) => Promise<Response>
let importPOST: (req: Request) => Promise<Response>

function mockAuthUser(user: MockUser = { id: 'user-1' }, error: Error | null = null): void {
  mockCreateClient.mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user },
        error,
      }),
    },
    from: mockFrom,
  } as never)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDetectFileType.mockReturnValue('pdf')
  mockParseFileWithMarker.mockResolvedValue({
    text: 'parsed-content',
    pages: [{ pageNumber: 1, text: 'parsed-content' }],
    parsedBy: 'builtin',
  })
  mockSingle.mockResolvedValue({
    data: { id: 'doc-1', title: 'n', content: 'parsed-content', tags: ['PDF', 'GDRIVE'] },
    error: null,
  })
})

beforeAll(async () => {
  const connectRoute = await import('../connect/route')
  const callbackRoute = await import('../callback/route')
  const listRoute = await import('../list/route')
  const importRoute = await import('../import/route')

  connectGET = connectRoute.GET
  connectPOST = connectRoute.POST
  connectDELETE = connectRoute.DELETE
  callbackGET = callbackRoute.GET
  listGET = listRoute.GET
  importPOST = importRoute.POST
})

describe('gdrive API routes', () => {
  describe('connect route', () => {
    it('GET returns connected true when token exists', async () => {
      mockAuthUser()
      mockIsConnected.mockResolvedValue(true)

      const res = await connectGET()
      const body = (await res.json()) as JsonBody
      const data = body.data as JsonBody

      expect(body.success).toBe(true)
      expect(data.connected).toBe(true)
    })

    it('GET returns authUrl when not connected', async () => {
      mockAuthUser()
      mockIsConnected.mockResolvedValue(false)
      mockGetAuthUrl.mockReturnValue('http://auth')

      const res = await connectGET()
      const body = (await res.json()) as JsonBody
      const data = body.data as JsonBody

      expect(data.connected).toBe(false)
      expect(data.authUrl).toBe('http://auth')
    })

    it('POST returns authUrl', async () => {
      mockAuthUser()
      mockGetAuthUrl.mockReturnValue('http://auth')

      const res = await connectPOST()
      const body = (await res.json()) as JsonBody
      const data = body.data as JsonBody

      expect(body.success).toBe(true)
      expect(data.authUrl).toBe('http://auth')
    })

    it('DELETE revokes tokens', async () => {
      mockAuthUser()
      mockDeleteTokens.mockResolvedValue(undefined)

      const res = await connectDELETE()
      const body = (await res.json()) as JsonBody
      expect(body.success).toBe(true)
      expect(mockDeleteTokens).toHaveBeenCalledWith('user-1')
    })

    it('GET unauthorized when no user', async () => {
      mockAuthUser(null, new Error('auth fail'))
      const res = await connectGET()
      expect(res.status).toBe(401)
    })
  })

  describe('callback route', () => {
    it('handles OAuth callback and saves tokens', async () => {
      mockHandleCallback.mockResolvedValue({
        access_token: 'a',
        refresh_token: 'b',
        expiry_date: 123,
      })

      const req = new Request('http://localhost?code=abc&state=user-1')
      const res = await callbackGET(req)

      expect(mockSaveTokens).toHaveBeenCalledWith('user-1', expect.any(Object))
      expect(res.headers.get('location')).toContain('/knowledge?gdrive_connected=true')
    })

    it('callback missing params returns redirect with error', async () => {
      const req = new Request('http://localhost')
      const res = await callbackGET(req)
      expect(res.headers.get('location')).toContain('missing_code_or_state')
    })
  })

  describe('list route', () => {
    it('returns 403 when not connected', async () => {
      mockAuthUser()
      mockGetValidToken.mockResolvedValue(null as never)

      const res = await listGET(new Request('http://localhost'))
      expect(res.status).toBe(403)
    })

    it('returns files when connected', async () => {
      mockAuthUser()
      mockGetValidToken.mockResolvedValue('token')
      mockListFiles.mockResolvedValue({
        files: [{ id: 'f1', name: 'foo', mimeType: 'application/pdf' }],
        nextPageToken: 'nt',
      })

      const res = await listGET(new Request('http://localhost'))
      const body = (await res.json()) as JsonBody
      const data = body.data as JsonBody
      const files = data.files as JsonBody[]
      expect(body.success).toBe(true)
      expect(files).toHaveLength(1)
      expect(data.nextPageToken).toBe('nt')
    })
  })

  describe('import route', () => {
    const baseReq = (body: object) =>
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      })

    it('returns 400 on missing fields', async () => {
      mockAuthUser()
      const res = await importPOST(baseReq({ fileId: 'x' }))
      expect(res.status).toBe(400)
    })

    it('returns 403 when not connected', async () => {
      mockAuthUser()
      mockGetValidToken.mockResolvedValue(null as never)
      const res = await importPOST(
        baseReq({ fileId: 'id', fileName: 'n', mimeType: 'application/pdf' })
      )
      expect(res.status).toBe(403)
    })

    it('downloads regular file successfully', async () => {
      mockAuthUser()
      mockGetValidToken.mockResolvedValue('token')
      mockGetFileMetadata.mockResolvedValue({
        id: 'id',
        name: 'n',
        mimeType: 'application/pdf',
      })
      mockDownloadFile.mockResolvedValue(Buffer.from('hello'))

      const res = await importPOST(
        baseReq({ fileId: 'id', fileName: 'n', mimeType: 'application/pdf' })
      )
      const body = (await res.json()) as JsonBody
      const data = body.data as JsonBody
      const meta = body.meta as JsonBody
      expect(body.success).toBe(true)
      expect(data.id).toBe('doc-1')
      expect(meta.fileType).toBe('pdf')
      expect(mockFrom).toHaveBeenCalledWith('documents')
    })

    it('exports google-native file', async () => {
      mockAuthUser()
      mockGetValidToken.mockResolvedValue('token')
      mockGetFileMetadata.mockResolvedValue({
        id: 'id',
        name: 'n',
        mimeType: 'application/vnd.google-apps.document',
      })
      mockExportFile.mockResolvedValue(Buffer.from('world'))

      const res = await importPOST(
        baseReq({
          fileId: 'id',
          fileName: 'n',
          mimeType: 'application/vnd.google-apps.document',
        })
      )
      const body = (await res.json()) as JsonBody
      const meta = body.meta as JsonBody
      expect(body.success).toBe(true)
      expect(meta.fileType).toBe('docx')
      expect(mockParseFileWithMarker).toHaveBeenCalled()
    })
  })
})
