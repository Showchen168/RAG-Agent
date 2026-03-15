import { verifyWebhookSecret } from '../auth'

// Mock supabase - 回傳無 DB 設定（fallback to env var）
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(() => ({
            data: null,
            error: null,
          })),
        })),
      })),
    })),
  })),
}));

describe('verifyWebhookSecret', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should return true for valid secret', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-123'
    expect(await verifyWebhookSecret('test-secret-123')).toBe(true)
  })

  it('should return false for invalid secret', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-123'
    expect(await verifyWebhookSecret('wrong-secret')).toBe(false)
  })

  it('should return false for missing header when secret is configured', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-123'
    expect(await verifyWebhookSecret(undefined)).toBe(false)
  })

  it('should return false for null header when secret is configured', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-123'
    expect(await verifyWebhookSecret(null)).toBe(false)
  })

  it('should return true when no secret configured (dev mode)', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    expect(await verifyWebhookSecret(undefined)).toBe(true)
  })

  it('should return true when secret is empty string (dev mode)', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = ''
    expect(await verifyWebhookSecret(undefined)).toBe(true)
  })
})
