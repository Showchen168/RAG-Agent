'use client'

import { useState, useEffect, useCallback } from 'react'
import type { NMThread } from '@/types/chat'

interface UseThreadListOptions {
  onNavigate: (path: string) => void
  getConversationExtra?: () => Record<string, unknown> | null
}

export function useThreadList(options: UseThreadListOptions) {
  const [threads, setThreads] = useState<NMThread[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [shouldResetThreadState, setShouldResetThreadState] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/conversations')
        if (!res.ok) return
        const { data } = await res.json()
        if (!Array.isArray(data)) return
        setThreads(
          data.map((conv: { id: string; title: string; created_at: string }) => ({
            id: conv.id,
            title: conv.title,
            createdAt: new Date(conv.created_at),
          })),
        )
      } catch {
        // ignore
      }
    })()
  }, [])

  const createThread = useCallback(
    async (firstMessageText: string, model?: string): Promise<NMThread> => {
      const title = (firstMessageText ?? '新對話').slice(0, 30)
      const extra = options.getConversationExtra?.() ?? null

      const payload: Record<string, unknown> = { title }
      if (model) {
        payload.model = model
      }
      if (extra && Object.keys(extra).length > 0) {
        payload.extra = extra
      }

      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create conversation')

      const { data } = await res.json()
      const newThread: NMThread = {
        id: data.id,
        title: data.title,
        createdAt: new Date(data.created_at),
      }
      setThreads((prev) => [newThread, ...prev])
      return newThread
    },
    [options],
  )

  const selectThread = useCallback(
    (threadId: string, navigate = true, skipReset = false) => {
      setSelectedThreadId(threadId)
      if (!skipReset) {
        setShouldResetThreadState(true)
        setTimeout(() => setShouldResetThreadState(false), 0)
      }
      if (navigate) {
        options.onNavigate(`/chat/${threadId}`)
      }
    },
    [options],
  )

  const deleteThread = useCallback(
    async (threadId: string) => {
      const res = await fetch(`/api/conversations/${threadId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete conversation')
      setThreads((prev) => prev.filter((t) => t.id !== threadId))
      if (selectedThreadId === threadId) {
        setSelectedThreadId(null)
      }
    },
    [selectedThreadId],
  )

  const switchToNew = useCallback(() => {
    setSelectedThreadId(null)
    setShouldResetThreadState(true)
    options.onNavigate('/chat')
    setTimeout(() => setShouldResetThreadState(false), 0)
  }, [options])

  const refreshThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations')
      if (!res.ok) return
      const { data } = await res.json()
      if (!Array.isArray(data)) return
      setThreads(
        data.map((conv: { id: string; title: string; created_at: string }) => ({
          id: conv.id,
          title: conv.title,
          createdAt: new Date(conv.created_at),
        })),
      )
    } catch {
      // ignore
    }
  }, [])

  return {
    threads,
    selectedThreadId,
    shouldResetThreadState,
    createThread,
    selectThread,
    deleteThread,
    switchToNew,
    refreshThreads,
    setSelectedThreadId,
  }
}
