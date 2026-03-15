import { renderHook, act } from '@testing-library/react'
import { useThreadList } from '../use-thread-list'
import type { NMThread } from '@/types/chat'

// Mock fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

const mockNavigate = jest.fn()

describe('useThreadList', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('fetches thread list on mount', async () => {
    const threads = [
      { id: '1', title: 'Thread 1', created_at: '2026-01-01T00:00:00Z' },
    ]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: threads }),
    })

    const { result } = renderHook(() =>
      useThreadList({ onNavigate: mockNavigate })
    )

    await act(async () => {})

    expect(result.current.threads).toHaveLength(1)
    expect(result.current.threads[0].title).toBe('Thread 1')
  })

  it('creates a new thread', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { id: 'new-1', title: 'New', created_at: '2026-01-01' },
        }),
      })

    const { result } = renderHook(() =>
      useThreadList({ onNavigate: mockNavigate })
    )
    await act(async () => {})

    let created: NMThread | undefined
    await act(async () => {
      created = await result.current.createThread('Hello')
    })

    expect(created?.id).toBe('new-1')
  })

  it('selects a thread and navigates', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })

    const { result } = renderHook(() =>
      useThreadList({ onNavigate: mockNavigate })
    )
    await act(async () => {})

    act(() => {
      result.current.selectThread('thread-1')
    })

    expect(result.current.selectedThreadId).toBe('thread-1')
    expect(mockNavigate).toHaveBeenCalledWith('/chat/thread-1')
  })

  it('deletes a thread', async () => {
    const threads = [
      { id: '1', title: 'T1', created_at: '2026-01-01' },
      { id: '2', title: 'T2', created_at: '2026-01-02' },
    ]
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: threads }) })
      .mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() =>
      useThreadList({ onNavigate: mockNavigate })
    )
    await act(async () => {})

    await act(async () => {
      await result.current.deleteThread('1')
    })

    expect(result.current.threads).toHaveLength(1)
    expect(result.current.threads[0].id).toBe('2')
  })

  it('switches to new chat', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })

    const { result } = renderHook(() =>
      useThreadList({ onNavigate: mockNavigate })
    )
    await act(async () => {})

    act(() => {
      result.current.switchToNew()
    })

    expect(result.current.selectedThreadId).toBeNull()
    expect(mockNavigate).toHaveBeenCalledWith('/chat')
  })
})
