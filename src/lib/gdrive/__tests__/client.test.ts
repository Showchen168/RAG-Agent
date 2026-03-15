import { Readable } from 'stream'
import { google } from 'googleapis'
import * as tokenModule from '../tokens'
import { listFiles, downloadFile, exportFile, getFileMetadata } from '../client'

const mockList = jest.fn()
const mockGet = jest.fn()
const mockExport = jest.fn()

jest.mock('../tokens', () => ({
  getValidToken: jest.fn(),
}))

jest.mock('googleapis', () => ({
  google: {
    drive: jest.fn(() => ({
      files: {
        list: mockList,
        get: mockGet,
        export: mockExport,
      },
    })),
  },
}))

const mockTokenModule = tokenModule as jest.Mocked<typeof tokenModule>
const mockGoogleDrive = google.drive as jest.MockedFunction<typeof google.drive>

describe('gdrive/client', () => {
  const userId = 'user-123'
  const accessToken = 'ya29.valid_access_token'

  beforeEach(() => {
    jest.clearAllMocks()
    mockTokenModule.getValidToken.mockResolvedValue(accessToken)
  })

  describe('listFiles', () => {
    it('should list files with mapped output format', async () => {
      mockList.mockResolvedValue({
        data: {
          files: [
            {
              id: 'f1',
              name: 'Doc 1',
              mimeType: 'application/pdf',
              size: '42',
              createdTime: '2026-03-03T00:00:00Z',
              modifiedTime: '2026-03-03T00:00:00Z',
              parents: ['root'],
            },
          ],
          nextPageToken: 'next-token',
        },
      })

      const result = await listFiles(userId, { pageSize: 5, searchQuery: 'Doc' })

      expect(mockGoogleDrive).toHaveBeenCalledWith({
        version: 'v3',
        auth: accessToken,
      })
      expect(mockList).toHaveBeenCalled()
      expect(result.files[0]).toMatchObject({
        id: 'f1',
        name: 'Doc 1',
        mimeType: 'application/pdf',
        size: 42,
      })
      expect(result.nextPageToken).toBe('next-token')
    })
  })

  describe('downloadFile', () => {
    it('should download binary file as buffer', async () => {
      mockGet.mockResolvedValue({
        data: Readable.from([Buffer.from('hello')]),
      })

      const buffer = await downloadFile(userId, 'file-123')

      expect(mockGet).toHaveBeenCalledWith(
        { fileId: 'file-123', alt: 'media' },
        { responseType: 'stream' }
      )
      expect(buffer.toString()).toBe('hello')
    })
  })

  describe('exportFile', () => {
    it('should export google native file as buffer', async () => {
      mockExport.mockResolvedValue({
        data: Readable.from([Buffer.from('world')]),
      })

      const buffer = await exportFile(userId, 'file-123', 'application/pdf')

      expect(mockExport).toHaveBeenCalledWith(
        { fileId: 'file-123', mimeType: 'application/pdf' },
        { responseType: 'stream' }
      )
      expect(buffer.toString()).toBe('world')
    })
  })

  describe('getFileMetadata', () => {
    it('should return metadata in normalized format', async () => {
      mockGet.mockResolvedValue({
        data: {
          id: 'f1',
          name: 'Meta File',
          mimeType: 'text/plain',
          size: '10',
          parents: ['root'],
        },
      })

      const metadata = await getFileMetadata(userId, 'f1')

      expect(mockGet).toHaveBeenCalledWith({
        fileId: 'f1',
        fields: 'id, name, mimeType, size, createdTime, modifiedTime, parents',
      })
      expect(metadata).toMatchObject({
        id: 'f1',
        name: 'Meta File',
        mimeType: 'text/plain',
        size: 10,
      })
    })
  })
})
