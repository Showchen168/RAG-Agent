import { TelegramUpdateSchema } from '@/lib/telegram/types'

describe('Telegram Webhook Route - Input Validation', () => {
  it('should validate a proper Telegram text message payload', () => {
    const payload = {
      update_id: 100,
      message: {
        message_id: 1,
        date: 1709000000,
        chat: { id: 12345, type: 'private', first_name: 'Test' },
        from: { id: 12345, is_bot: false, first_name: 'Test' },
        text: '你好',
      },
    }
    const result = TelegramUpdateSchema.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message?.text).toBe('你好')
      expect(result.data.message?.chat.type).toBe('private')
    }
  })

  it('should accept update without message (non-text event)', () => {
    const payload = { update_id: 101 }
    const result = TelegramUpdateSchema.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message).toBeUndefined()
    }
  })

  it('should identify non-text messages (stickers, photos)', () => {
    const payload = {
      update_id: 102,
      message: {
        message_id: 2,
        date: 1709000000,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Test' },
        // no text field — sticker or photo
      },
    }
    const result = TelegramUpdateSchema.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message?.text).toBeUndefined()
    }
  })

  it('should identify non-private chats for filtering', () => {
    const payload = {
      update_id: 103,
      message: {
        message_id: 3,
        date: 1709000000,
        chat: { id: -100123, type: 'group', title: 'Test Group' },
        from: { id: 12345, is_bot: false, first_name: 'Test' },
        text: 'hello',
      },
    }
    const result = TelegramUpdateSchema.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      // Webhook handler should filter this out
      expect(result.data.message?.chat.type).not.toBe('private')
    }
  })

  it('should detect /start command', () => {
    const payload = {
      update_id: 104,
      message: {
        message_id: 4,
        date: 1709000000,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Test' },
        text: '/start',
      },
    }
    const result = TelegramUpdateSchema.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message?.text).toBe('/start')
    }
  })

  it('should detect /newchat command', () => {
    const payload = {
      update_id: 105,
      message: {
        message_id: 5,
        date: 1709000000,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Test' },
        text: '/newchat',
      },
    }
    const result = TelegramUpdateSchema.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message?.text).toBe('/newchat')
    }
  })

  it('should reject completely invalid payloads', () => {
    const result = TelegramUpdateSchema.safeParse({ invalid: true })
    expect(result.success).toBe(false)
  })
})
