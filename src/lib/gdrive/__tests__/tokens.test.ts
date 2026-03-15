process.env.K_MASTER_KEY = 'a'.repeat(64)
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

import { createClient } from '@supabase/supabase-js'
import * as cryptoModule from '../../telegram/crypto'
import { getOAuth2Client } from '../auth'
import {
  saveTokens,
  getTokens,
  deleteTokens,
  isConnected,
  getValidToken,
} from '../tokens'

type TokenRow = {
  access_token: string
  refresh_token: string
  token_expiry: string | number
  email: string | null
}

type DbResult<T> = Promise<{ data: T; error: { message: string } | null }>

type SupabaseChain = {
  select: jest.MockedFunction<() => SupabaseChain>
  eq: jest.MockedFunction<(field: string, value: string) => SupabaseChain>
  upsert: jest.MockedFunction<(payload: object) => DbResult<null>>
  single: jest.MockedFunction<() => DbResult<TokenRow | null>>
  delete: jest.MockedFunction<() => { eq: jest.MockedFunction<(field: string, value: string) => DbResult<null>> }>
}

const mockFrom = jest.fn()
const mockSupabaseClient = { from: mockFrom }

const mockSetCredentials = jest.fn()
const mockRefreshAccessToken = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}))

jest.mock('../../telegram/crypto', () => ({
  encryptToken: jest.fn((value: string) => `enc:${value}`),
  decryptToken: jest.fn((value: string) => value.replace(/^enc:/, '')),
}))

jest.mock('../auth', () => ({
  getOAuth2Client: jest.fn(() => ({
    setCredentials: mockSetCredentials,
    refreshAccessToken: mockRefreshAccessToken,
  })),
}))

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>
const mockEncryptToken = cryptoModule.encryptToken as jest.MockedFunction<typeof cryptoModule.encryptToken>
const mockDecryptToken = cryptoModule.decryptToken as jest.MockedFunction<typeof cryptoModule.decryptToken>
const mockGetOAuth2Client = getOAuth2Client as jest.MockedFunction<typeof getOAuth2Client>

const userId = 'user-123'
const accessToken = 'ya29.valid_access_token'
const refreshToken = '1//refresh_token_secret'
const userEmail = 'test@example.com'

function createChain(): SupabaseChain {
  const chain: SupabaseChain = {
    select: jest.fn(),
    eq: jest.fn(),
    upsert: jest.fn(),
    single: jest.fn(),
    delete: jest.fn(),
  }

  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.delete.mockReturnValue({
    eq: jest.fn(),
  })

  return chain
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateClient.mockReturnValue(mockSupabaseClient as never)
})

describe('gdrive/tokens', () => {
  describe('saveTokens', () => {
    it('should encrypt and upsert tokens', async () => {
      const chain = createChain()
      chain.upsert.mockResolvedValue({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      await saveTokens(userId, {
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: Date.now() + 3600000,
        email: userEmail,
      })

      expect(mockEncryptToken).toHaveBeenCalledTimes(2)
      expect(mockFrom).toHaveBeenCalledWith('gdrive_user_tokens')
      expect(chain.upsert).toHaveBeenCalled()
    })

    it('should throw when upsert fails', async () => {
      const chain = createChain()
      chain.upsert.mockResolvedValue({
        data: null,
        error: { message: 'DB error' },
      })
      mockFrom.mockReturnValue(chain)

      await expect(
        saveTokens(userId, {
          access_token: accessToken,
          refresh_token: refreshToken,
          expiry_date: Date.now() + 3600000,
        })
      ).rejects.toThrow('Failed to save Google Drive tokens')
    })
  })

  describe('getTokens', () => {
    it('should retrieve and decrypt tokens', async () => {
      const chain = createChain()
      chain.single.mockResolvedValue({
        data: {
          access_token: `enc:${accessToken}`,
          refresh_token: `enc:${refreshToken}`,
          token_expiry: new Date(Date.now() + 3600000).toISOString(),
          email: userEmail,
        },
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const result = await getTokens(userId)
      expect(mockDecryptToken).toHaveBeenCalledTimes(2)
      expect(result.access_token).toBe(accessToken)
      expect(result.refresh_token).toBe(refreshToken)
      expect(result.email).toBe(userEmail)
    })

    it('should throw when no token data', async () => {
      const chain = createChain()
      chain.single.mockResolvedValue({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      await expect(getTokens(userId)).rejects.toThrow('User not connected to Google Drive')
    })
  })

  describe('deleteTokens', () => {
    it('should delete by user id', async () => {
      const chain = createChain()
      const mockDeleteEq = jest.fn().mockResolvedValue({ data: null, error: null })
      chain.delete.mockReturnValue({ eq: mockDeleteEq })
      mockFrom.mockReturnValue(chain)

      await deleteTokens(userId)

      expect(mockFrom).toHaveBeenCalledWith('gdrive_user_tokens')
      expect(mockDeleteEq).toHaveBeenCalledWith('user_id', userId)
    })

    it('should throw when delete fails', async () => {
      const chain = createChain()
      const mockDeleteEq = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Delete failed' },
      })
      chain.delete.mockReturnValue({ eq: mockDeleteEq })
      mockFrom.mockReturnValue(chain)

      await expect(deleteTokens(userId)).rejects.toThrow('Failed to delete Google Drive tokens')
    })
  })

  describe('isConnected', () => {
    it('returns true when token exists', async () => {
      const chain = createChain()
      chain.single.mockResolvedValue({
        data: {
          access_token: `enc:${accessToken}`,
          refresh_token: `enc:${refreshToken}`,
          token_expiry: new Date(Date.now() + 3600000).toISOString(),
          email: userEmail,
        },
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      await expect(isConnected(userId)).resolves.toBe(true)
    })

    it('returns false when token not found', async () => {
      const chain = createChain()
      chain.single.mockResolvedValue({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      await expect(isConnected(userId)).resolves.toBe(false)
    })
  })

  describe('getValidToken', () => {
    it('returns current access token when not expiring soon', async () => {
      const chain = createChain()
      chain.single.mockResolvedValue({
        data: {
          access_token: `enc:${accessToken}`,
          refresh_token: `enc:${refreshToken}`,
          token_expiry: new Date(Date.now() + 3600000).toISOString(),
          email: userEmail,
        },
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      await expect(getValidToken(userId)).resolves.toBe(accessToken)
      expect(mockGetOAuth2Client).not.toHaveBeenCalled()
    })

    it('refreshes token when near expiry and persists new token', async () => {
      const chain = createChain()
      chain.single.mockResolvedValue({
        data: {
          access_token: `enc:${accessToken}`,
          refresh_token: `enc:${refreshToken}`,
          token_expiry: new Date(Date.now() + 60_000).toISOString(),
          email: userEmail,
        },
        error: null,
      })
      chain.upsert.mockResolvedValue({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'new_access',
          refresh_token: 'new_refresh',
          expiry_date: Date.now() + 3600000,
        },
      })

      await expect(getValidToken(userId)).resolves.toBe('new_access')
      expect(mockGetOAuth2Client).toHaveBeenCalledTimes(1)
      expect(mockSetCredentials).toHaveBeenCalledWith({ refresh_token: refreshToken })
      expect(chain.upsert).toHaveBeenCalled()
    })
  })
})
