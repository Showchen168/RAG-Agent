import { TelegramUpdateSchema } from '../types'

describe('TelegramUpdateSchema', () => {
  it('should parse a valid text message update', () => {
    const update = {
      update_id: 123456,
      message: {
        message_id: 1,
        date: 1709000000,
        chat: { id: 987654321, type: 'private', first_name: 'Show' },
        from: { id: 987654321, is_bot: false, first_name: 'Show' },
        text: '你好，NexusMind',
      },
    }
    const result = TelegramUpdateSchema.safeParse(update)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message?.text).toBe('你好，NexusMind')
      expect(result.data.message?.chat.id).toBe(987654321)
    }
  })

  it('should parse update without message (e.g. callback_query)', () => {
    const update = { update_id: 123456 }
    const result = TelegramUpdateSchema.safeParse(update)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message).toBeUndefined()
    }
  })

  it('should parse group chat message (filtering happens in handler)', () => {
    const update = {
      update_id: 123456,
      message: {
        message_id: 1,
        date: 1709000000,
        chat: { id: -100123, type: 'group', title: 'Test Group' },
        from: { id: 987654321, is_bot: false, first_name: 'Show' },
        text: 'hello',
      },
    }
    const result = TelegramUpdateSchema.safeParse(update)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message?.chat.type).toBe('group')
    }
  })

  it('should parse message without text (e.g. sticker)', () => {
    const update = {
      update_id: 123456,
      message: {
        message_id: 1,
        date: 1709000000,
        chat: { id: 12345, type: 'private', first_name: 'Test' },
        from: { id: 12345, is_bot: false, first_name: 'Test' },
      },
    }
    const result = TelegramUpdateSchema.safeParse(update)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message?.text).toBeUndefined()
    }
  })

  it('should reject invalid update_id type', () => {
    const update = { update_id: 'not-a-number' }
    const result = TelegramUpdateSchema.safeParse(update)
    expect(result.success).toBe(false)
  })

  it('should parse message with optional user fields', () => {
    const update = {
      update_id: 100,
      message: {
        message_id: 1,
        date: 1709000000,
        chat: { id: 12345, type: 'private', first_name: 'Test', username: 'testuser', last_name: 'User' },
        from: { id: 12345, is_bot: false, first_name: 'Test', username: 'testuser', last_name: 'User' },
        text: 'hello',
      },
    }
    const result = TelegramUpdateSchema.safeParse(update)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message?.from?.username).toBe('testuser')
      expect(result.data.message?.chat.last_name).toBe('User')
    }
  })
})
