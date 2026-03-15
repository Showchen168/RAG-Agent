'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { X, Send, Loader2, ChevronDown, BookOpen, FileBarChart, Replace, ClipboardPaste, Check, Wand2, Square, Trash2 } from 'lucide-react'
import { MarkdownRenderer } from '@/components/chat/markdown-renderer'
import { generateUUID } from '@/lib/uuid'

interface FloatingKnowledgeChatProps {
  /** 模式：knowledge = 知識庫助手, reports = 報告庫助手 */
  mode?: 'knowledge' | 'reports'
  /** 當前正在編輯的報告 ID（報告模式下使用） */
  reportId?: string
  /** 當前正在編輯的知識庫文件 ID（知識庫模式下使用） */
  documentId?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const THEME = {
  knowledge: {
    name: '知識庫 AI 助手',
    subtitle: '根據你的知識庫內容回答問題',
    emptyTitle: '問我任何關於知識庫的問題',
    emptySubtitle: 'AI 會搜尋知識庫並提供回答',
    buttonTitle: '知識庫 AI 問答',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-teal-500',
    shadowColor: 'shadow-emerald-500/30',
    shadowHover: 'hover:shadow-emerald-500/40',
    headerBg: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30',
    userBubble: 'from-emerald-600 to-teal-600',
    sendBtn: 'bg-emerald-600 hover:bg-emerald-700',
    focusRing: 'focus-within:ring-emerald-500/20',
    insertBtn: 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
  },
  reports: {
    name: '報告庫助手',
    subtitle: '根據你的專業報告內容回答問題',
    emptyTitle: '問我任何關於報告的問題',
    emptySubtitle: 'AI 會搜尋報告庫並提供回答',
    buttonTitle: '報告庫 AI 問答',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-blue-500',
    shadowColor: 'shadow-violet-500/30',
    shadowHover: 'hover:shadow-violet-500/40',
    headerBg: 'from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30',
    userBubble: 'from-violet-600 to-blue-600',
    sendBtn: 'bg-violet-600 hover:bg-violet-700',
    focusRing: 'focus-within:ring-violet-500/20',
    insertBtn: 'text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20',
  },
} as const

export function FloatingKnowledgeChat({ mode = 'knowledge', reportId, documentId }: FloatingKnowledgeChatProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const [currentDocContent, setCurrentDocContent] = useState<string>('')
  const [insertedMsgId, setInsertedMsgId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const t = THEME[mode]
  const Icon = mode === 'reports' ? FileBarChart : BookOpen

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // 載入當前正在編輯的文件內容作為 AI 上下文
  useEffect(() => {
    let ignore = false
    async function loadContent() {
      try {
        if (reportId) {
          const res = await fetch(`/api/reports/${reportId}`)
          if (res.ok && !ignore) {
            const { data } = await res.json()
            const text = data.plain_text || data.markdown_content || ''
            setCurrentDocContent(text)
          }
        } else if (documentId) {
          const res = await fetch(`/api/knowledge/${documentId}`)
          if (res.ok && !ignore) {
            const { data } = await res.json()
            setCurrentDocContent(data.content || '')
          }
        } else {
          setCurrentDocContent('')
        }
      } catch {
        // 靜默失敗
      }
    }
    loadContent()
    return () => { ignore = true }
  }, [reportId, documentId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 替換 Canvas 編輯器整篇內容
  const handleReplaceCanvas = useCallback((content: string, msgId: string) => {
    window.dispatchEvent(new CustomEvent('canvas-replace-content', {
      detail: { content },
    }))
    // 同步更新本地文件內容快取，確保後續快速指令能讀到最新版本
    setCurrentDocContent(content)
    setInsertedMsgId(msgId)
    setTimeout(() => setInsertedMsgId(null), 2000)
  }, [])

  // 追加插入到 Canvas 編輯器游標位置
  const handleAppendCanvas = useCallback((content: string, msgId: string) => {
    window.dispatchEvent(new CustomEvent('canvas-insert-content', {
      detail: { content },
    }))
    // 追加模式：更新快取為「原有內容 + 新內容」
    setCurrentDocContent((prev) => prev ? `${prev}\n\n---\n\n${content}` : content)
    setInsertedMsgId(msgId)
    setTimeout(() => setInsertedMsgId(null), 2000)
  }, [])

  // 中止串流
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsLoading(false)
  }, [])

  // 快速指令：直接對文件內容執行 AI 變換，結果串流顯示並可套用
  const QUICK_COMMANDS = [
    { command: 'expand', label: '豐富內容' },
    { command: 'shorten', label: '精簡' },
    { command: 'tone_professional', label: '專業化' },
    { command: 'tone_casual', label: '口語化' },
    { command: 'bilingual', label: '中英雙語' },
  ] as const

  // 從 Canvas 編輯器即時讀取最新內容
  const getLatestCanvasContent = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      let resolved = false
      const handler = (text: string) => {
        resolved = true
        resolve(text)
      }
      window.dispatchEvent(new CustomEvent('canvas-get-content', {
        detail: { callback: handler },
      }))
      // 如果 Canvas 未掛載或未回應，fallback 到 currentDocContent
      setTimeout(() => {
        if (!resolved) resolve(currentDocContent)
      }, 100)
    })
  }, [currentDocContent])

  const executeQuickCommand = useCallback(async (command: string, label: string) => {
    if (isLoading) return

    // 先從 Canvas 讀取最新內容（而非初始載入的 currentDocContent）
    const latestContent = await getLatestCanvasContent()

    if (!latestContent.trim()) {
      setMessages((prev) => [...prev, {
        id: generateUUID(),
        role: 'assistant',
        content: '目前沒有載入文件內容，請先開啟一份文件再使用快速指令。',
      }])
      return
    }

    const userMsg: ChatMessage = {
      id: generateUUID(),
      role: 'user',
      content: `📝 ${label}`,
    }
    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)

    const controller = new AbortController()
    abortControllerRef.current = controller
    const assistantId = generateUUID()

    try {
      const response = await fetch('/api/copilot/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, text: latestContent }),
        signal: controller.signal,
      })

      if (!response.ok) {
        setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '指令執行失敗，請稍後重試。' }])
        return
      }

      const reader = response.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let accumulated = ''
      let inserted = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        const current = accumulated

        if (!inserted) {
          setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: current }])
          inserted = true
        } else {
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, content: current } : m)
          )
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '發生錯誤，請稍後重試。' }])
    } finally {
      abortControllerRef.current = null
      setIsLoading(false)
    }
  }, [isLoading, getLatestCanvasContent])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const q = input.trim()
    if (!q || isLoading) return

    const userMessage: ChatMessage = {
      id: generateUUID(),
      role: 'user',
      content: q,
    }

    setInput('')
    setMessages((prev) => [...prev, userMessage])
    setIsLoading(true)

    const controller = new AbortController()
    abortControllerRef.current = controller
    const assistantId = generateUUID()

    try {
      // 先取得 Canvas 最新內容（而非初始載入的 currentDocContent）
      const latestDoc = await getLatestCanvasContent()

      // Step 1: 語義搜尋知識庫取得相關片段
      const searchRes = await fetch('/api/knowledge/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, matchCount: 5, threshold: 0.3 }),
        signal: controller.signal,
      })

      let contextChunks = ''
      if (searchRes.ok) {
        const { data } = await searchRes.json()
        if (data && data.length > 0) {
          contextChunks = data
            .map((r: { chunk_text: string; similarity: number }, i: number) =>
              `[片段 ${i + 1}] (相似度: ${(r.similarity * 100).toFixed(0)}%)\n${r.chunk_text}`
            )
            .join('\n\n')
        }
      }

      // Step 2: 帶文件內容 + 知識庫上下文詢問 AI
      const sourceLabel = mode === 'reports' ? '報告' : '知識庫文件'
      const docSection = latestDoc.trim()
        ? `以下是你正在閱讀的${sourceLabel}完整內容：\n\n${latestDoc}\n\n---\n\n`
        : ''
      const ragSection = contextChunks
        ? `以下是從知識庫中檢索到的相關片段（可作為補充參考）：\n\n${contextChunks}\n\n---\n\n`
        : ''
      const contextPrompt = docSection || ragSection
        ? `${docSection}${ragSection}使用者的問題：${q}\n\n請優先根據上述${sourceLabel}內容回答問題。如果內容不足以回答，請說明並提供你所知道的資訊。`
        : `使用者的問題：${q}\n\n（目前未載入文件內容，也未從知識庫中找到相關內容，請根據通用知識回答，並提醒使用者可以上傳相關文件到知識庫。）`

      const response = await fetch('/api/copilot/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'canvas_ask',
          text: contextPrompt,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: 'AI 回覆失敗，請稍後重試。' }])
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '無法讀取回覆串流。' }])
        return
      }

      const decoder = new TextDecoder()
      let accumulated = ''
      let inserted = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        const current = accumulated

        if (!inserted) {
          setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: current }])
          inserted = true
        } else {
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, content: current } : m)
          )
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '發生錯誤，請稍後重試。' }])
    } finally {
      abortControllerRef.current = null
      setIsLoading(false)
    }
  }, [input, isLoading, mode, getLatestCanvasContent])

  const isLastAssistantStreaming = useCallback((msg: ChatMessage) => {
    return isLoading && msg.role === 'assistant' && msg === messages[messages.length - 1]
  }, [isLoading, messages])

  return (
    <>
      {/* 懸浮按鈕 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-6 right-6 z-[60] w-14 h-14 rounded-full bg-gradient-to-br ${t.gradientFrom} ${t.gradientTo} text-white shadow-lg ${t.shadowColor} hover:shadow-xl ${t.shadowHover} hover:scale-105 transition-all flex items-center justify-center group`}
          title={t.buttonTitle}
        >
          <Icon className="w-6 h-6 group-hover:scale-110 transition-transform" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
        </button>
      )}

      {/* 問答面板 */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-[60] w-[400px] h-[680px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r ${t.headerBg}`}>
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${t.gradientFrom} ${t.gradientTo} flex items-center justify-center`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="text-sm font-semibold text-foreground">{t.name}</span>
                <p className="text-[10px] text-gray-400">{t.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="清除對話記錄"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="收起（保留對話）"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Icon className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">{t.emptyTitle}</p>
                <p className="text-[10px] mt-1 opacity-70">{t.emptySubtitle}</p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? `bg-gradient-to-r ${t.userBubble} text-white`
                      : 'bg-gray-100 dark:bg-gray-800 text-foreground'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1">
                      <MarkdownRenderer
                        textMarkdown={msg.content}
                        isStreaming={isLastAssistantStreaming(msg)}
                      />
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {/* 套用/追加到文件按鈕（僅 assistant 非串流中時顯示） */}
                {msg.role === 'assistant' && !isLastAssistantStreaming(msg) && (
                  <div className="mt-1 flex items-center gap-1">
                    {insertedMsgId === msg.id ? (
                      <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 ${t.insertBtn}`}>
                        <Check className="w-3 h-3" />
                        已套用
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => handleReplaceCanvas(msg.content, msg.id)}
                          className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md transition-colors ${t.insertBtn}`}
                          title="替換文件內容"
                        >
                          <Replace className="w-3 h-3" />
                          套用到文件
                        </button>
                        <button
                          onClick={() => handleAppendCanvas(msg.content, msg.id)}
                          className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md transition-colors ${t.insertBtn}`}
                          title="追加到文件末尾"
                        >
                          <ClipboardPaste className="w-3 h-3" />
                          追加
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* AI 思考中提示 */}
            {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
              <div className="flex items-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                    <span className="text-xs">正在思考...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 快速指令列 */}
          {currentDocContent && (
            <div className="px-3 pt-2 pb-1 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1 flex-wrap">
              <Wand2 className="w-3 h-3 text-gray-400 flex-shrink-0" />
              {QUICK_COMMANDS.map((cmd) => (
                <button
                  key={cmd.command}
                  onClick={() => executeQuickCommand(cmd.command, cmd.label)}
                  disabled={isLoading}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-30"
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          )}

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-gray-200 dark:border-gray-700">
            <div className={`relative flex items-end bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 ${t.focusRing} transition-shadow`}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                    e.preventDefault()
                    e.currentTarget.form?.requestSubmit()
                  }
                }}
                placeholder="輸入問題..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-foreground focus:outline-none placeholder:text-gray-400 resize-none overflow-y-auto leading-6 max-h-[80px]"
              />
              {isLoading ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="ml-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex-shrink-0"
                  title="停止生成"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className={`ml-2 p-1.5 ${t.sendBtn} disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex-shrink-0`}
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  )
}
