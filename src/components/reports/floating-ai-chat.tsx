'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Loader2, ChevronDown } from 'lucide-react'
import { MarkdownRenderer } from '@/components/chat/markdown-renderer'
import { generateUUID } from '@/lib/uuid'

interface FloatingAIChatProps {
  /** 取得當前 Canvas 全文的回呼函式 */
  getCanvasContent: () => string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export function FloatingAIChat({ getCanvasContent }: FloatingAIChatProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 自動聚焦
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // 自動捲到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const q = input.trim()
    if (!q || isLoading) return

    // 取得 Canvas 內容
    const canvasContent = getCanvasContent()

    const userMessage: ChatMessage = {
      id: generateUUID(),
      role: 'user',
      content: q,
    }

    setInput('')
    setMessages((prev) => [...prev, userMessage])
    setIsLoading(true)

    const assistantId = generateUUID()

    try {
      // 組合 context：Canvas 全文 + 使用者問題
      const contextPrompt = canvasContent
        ? `以下是報告的完整內容：\n\n${canvasContent}\n\n---\n\n使用者的問題：${q}`
        : q

      const response = await fetch('/api/copilot/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'canvas_ask',
          text: contextPrompt,
        }),
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
    } catch {
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '發生錯誤，請稍後重試。' }])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, getCanvasContent])

  return (
    <>
      {/* 懸浮按鈕 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-4 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 transition-all flex items-center justify-center group"
          title="AI 問答助手"
        >
          <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
        </button>
      )}

      {/* 問答面板 */}
      {isOpen && (
        <div className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-4 z-50 w-[calc(100vw-2rem)] sm:w-[400px] h-[70vh] max-h-[520px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="text-sm font-semibold text-foreground">AI 報告助手</span>
                <p className="text-[10px] text-gray-400">可讀取報告內容回答問題</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setIsOpen(false); setMessages([]) }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="關閉並清除對話"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <MessageCircle className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">問我任何關於這份報告的問題</p>
                <p className="text-[10px] mt-1 opacity-70">AI 會根據報告內容給出回答</p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-violet-600 to-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-foreground'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1">
                      <MarkdownRenderer
                        textMarkdown={msg.content}
                        isStreaming={isLoading && msg === messages[messages.length - 1]}
                      />
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-gray-200 dark:border-gray-700">
            <div className="relative flex items-end bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500/20 transition-shadow">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    e.currentTarget.form?.requestSubmit()
                  }
                }}
                placeholder="輸入問題..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-foreground focus:outline-none placeholder:text-gray-400 resize-none overflow-y-auto leading-6 max-h-[80px]"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="ml-2 p-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex-shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
