import type { NMMessage, NMUserMessage, NMAssistantMessage, NMMessagePart, NMThread } from '../chat'

describe('NexusMind message types', () => {
  it('should create a valid user message', () => {
    const msg: NMUserMessage = {
      id: '123',
      role: 'user',
      content: 'Hello',
    }
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('Hello')
  })

  it('should create a valid assistant message with parts', () => {
    const msg: NMAssistantMessage = {
      id: '456',
      role: 'assistant',
      content: '',
      parts: [
        { type: 'text', text: 'Hello!' },
        { type: 'template', name: 'data_table', templateProps: { headers: ['A'], rows: [['1']] } },
      ],
    }
    expect(msg.role).toBe('assistant')
    expect(msg.parts).toHaveLength(2)
    expect(msg.parts![0].type).toBe('text')
  })

  it('should create a valid thread', () => {
    const thread: NMThread = {
      id: 'conv-1',
      title: 'Test conversation',
      createdAt: new Date(),
    }
    expect(thread.id).toBeTruthy()
  })

  it('should support image context in user message', () => {
    const msg: NMUserMessage = {
      id: '789',
      role: 'user',
      content: 'Check this image',
      imageContext: [{ image: 'base64...', mimeType: 'image/png' }],
    }
    expect(msg.imageContext).toHaveLength(1)
  })
})
