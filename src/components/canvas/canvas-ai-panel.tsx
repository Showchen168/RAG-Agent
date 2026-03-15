'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { X, Send, Loader2, Pin } from 'lucide-react'
import { MarkdownRenderer } from '@/components/chat/markdown-renderer'

interface CanvasAIPanelProps {
  isOpen: boolean
  onClose: () => void
  selectedText: string
  onInsertText: (text: string, mode: 'replace' | 'append') => void
}

export function CanvasAIPanel({ isOpen, onClose, selectedText, onInsertText }: CanvasAIPanelProps) {
  const [question, setQuestion] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const responseRef = useRef<HTMLDivElement>(null)

  // 自動聚焦輸入框
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // 新的選中文字時清除舊回覆
  useEffect(() => {
    setAiResponse('')
    setQuestion('')
  }, [selectedText])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const q = question.trim()
    if (!q || isLoading) return

    setIsLoading(true)
    setAiResponse('')

    try {
      const combinedText = selectedText
        ? `選中文字：\n${selectedText}\n\n問題：${q}`
        : q

      const response = await fetch('/api/copilot/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'canvas_ask',
          text: combinedText,
        }),
      })

      if (!response.ok) {
        setAiResponse('AI 回覆失敗，請稍後重試。')
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        setAiResponse('無法讀取回覆串流。')
        return
      }

      const decoder = new TextDecoder()
      let result = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        result += decoder.decode(value, { stream: true })
        setAiResponse(result)
      }
    } catch {
      setAiResponse('發生錯誤，請稍後重試。')
    } finally {
      setIsLoading(false)
    }
  }, [question, selectedText, isLoading])

  const handleInsertReplace = useCallback(() => {
    if (aiResponse) {
      onInsertText(aiResponse, 'replace')
    }
  }, [aiResponse, onInsertText])

  const handleInsertAppend = useCallback(() => {
    if (aiResponse) {
      onInsertText(aiResponse, 'append')
    }
  }, [aiResponse, onInsertText])

  if (!isOpen) return null

  return (
    <div className="absolute right-0 top-0 z-20 w-[420px] h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col shadow-xl animate-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8V4H8" /><rect x="4" y="8" width="16" height="12" rx="2" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-foreground">AI 問答</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Selected Text Preview */}
      {selectedText && (
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-xs text-gray-400 mb-1">選中文字</p>
          <p className="text-sm text-foreground line-clamp-3 leading-relaxed">
            {selectedText}
          </p>
        </div>
      )}

      {/* AI Response Area */}
      <div ref={responseRef} className="flex-1 overflow-y-auto px-5 py-4">
        {aiResponse ? (
          <div className="space-y-4">
            <div className="prose prose-sm dark:prose-invert max-w-none [&>ol]:space-y-3 [&>ul]:space-y-2 [&>h3]:text-base [&>h4]:text-sm">
              <MarkdownRenderer textMarkdown={aiResponse} isStreaming={isLoading} />
            </div>
            {/* Insert Buttons */}
            {!isLoading && (
              <div className="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                {selectedText && (
                  <button
                    onClick={handleInsertReplace}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-gradient-to-r from-violet-500 to-blue-500 text-white rounded-lg hover:from-violet-600 hover:to-blue-600 transition-colors shadow-sm"
                  >
                    <Pin className="w-4 h-4" />
                    替換選中文字
                  </button>
                )}
                <button
                  onClick={handleInsertAppend}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 text-foreground rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Pin className="w-4 h-4" />
                  插入到游標位置
                </button>
              </div>
            )}
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mb-2" />
            <p className="text-xs">AI 思考中...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <p className="text-xs">輸入問題開始對話</p>
            {selectedText && (
              <p className="text-xs mt-1 opacity-70">AI 會根據選中文字回答</p>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="relative flex items-end bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-blue-500/20 transition-shadow">
          <textarea
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder="問 AI 任何問題..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-foreground focus:outline-none placeholder:text-gray-400 resize-none overflow-y-auto leading-6 max-h-[120px]"
          />
          <button
            type="submit"
            disabled={isLoading || !question.trim()}
            className="ml-2 p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Shift + Enter 換行，Enter 送出</p>
      </form>
    </div>
  )
}
