'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Typography from '@tiptap/extension-typography'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import {
  Bold, Italic, Underline as UnderlineIcon,
  Heading1, Heading2, List, ListOrdered, Quote, Code,
  Link as LinkIcon, Save, ArrowLeft, Loader2, Trash2,
  Download,
} from 'lucide-react'
import { marked } from 'marked'
import { FloatingAIChat } from '@/components/reports/floating-ai-chat'
import { useIsMobile } from '@/hooks/use-is-mobile'

interface ReportData {
  id: string
  title: string
  markdown_content: string
  canvas_content: Record<string, unknown>
  plain_text: string
  tags: string[]
  created_at: string
  updated_at: string
}

interface ToolbarBtnProps {
  onClick: () => void
  active?: boolean
  title: string
  icon: React.ElementType
}

function ToolbarBtn({ onClick, active, title, icon: Icon }: ToolbarBtnProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg transition-colors ${
        active
          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}

/** 使用 marked 將 Markdown 轉換為 TipTap 可用的 HTML */
function markdownToHtml(md: string): string {
  marked.setOptions({ gfm: true, breaks: true })
  return marked.parse(md) as string
}

export default function ReportCanvasPage() {
  const params = useParams()
  const router = useRouter()
  const reportId = params.id as string

  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [deleting, setDeleting] = useState(false)
  const isMobile = useIsMobile()

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false }),
      Typography,
      Underline,
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: true, allowBase64: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: '開始編輯報告...',
      }),
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] sm:min-h-[500px] px-4 sm:px-8 py-4 sm:py-6',
      },
    },
    content: '',
    onUpdate: () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = setTimeout(() => {
        handleSave()
      }, 3000)
    },
  })

  // 載入報告資料
  useEffect(() => {
    async function loadReport() {
      try {
        const res = await fetch(`/api/reports/${reportId}`, { credentials: 'include' })
        if (!res.ok) {
          router.push('/knowledge')
          return
        }
        const { data } = await res.json()
        setReport(data)
        setTitle(data.title)
      } catch {
        router.push('/knowledge')
      } finally {
        setLoading(false)
      }
    }
    if (reportId) loadReport()
  }, [reportId, router])

  // 報告載入後填入編輯器
  useEffect(() => {
    if (!editor || !report) return

    // 優先使用 canvas_content（TipTap JSON，編輯器原生格式，最可靠）
    const hasCanvas = report.canvas_content && Object.keys(report.canvas_content).length > 0
    if (hasCanvas) {
      editor.commands.setContent(report.canvas_content)
      return
    }

    // 沒有 canvas_content 時，從 markdown_content 轉換
    if (report.markdown_content) {
      const content = report.markdown_content.trim()
      // 偵測是否為 HTML
      const isHtml = /^<[a-z][\s\S]*>/i.test(content)

      if (isHtml) {
        // 檢查是否為「壞 HTML」— HTML 裡仍包含 Markdown 語法
        // 這種情況來自之前 auto-save 寫回了未正確轉換的內容
        const hasMarkdownInHtml = /(?:^|\n)#{1,6}\s|(?:^|\n)-\s+\[|\*\*[^*]+\*\*/.test(
          content.replace(/<[^>]+>/g, '') // 去掉 HTML 標籤後檢查
        )
        if (hasMarkdownInHtml) {
          // 提取純文字（去掉 HTML 標籤），用 marked 重新解析
          const plainMarkdown = content
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .trim()
          const htmlContent = markdownToHtml(plainMarkdown)
          editor.commands.setContent(htmlContent)
        } else {
          // 乾淨的 HTML，直接載入
          editor.commands.setContent(content)
        }
      } else {
        // 純 Markdown（由 formatReportAsMarkdown 存入），用 marked 轉換
        const htmlContent = markdownToHtml(content)
        editor.commands.setContent(htmlContent)
      }
    }
  }, [editor, report, reportId])

  // 儲存報告
  const handleSave = useCallback(async () => {
    if (!editor || !reportId) return
    setIsSaving(true)
    try {
      const canvasContent = editor.getJSON()
      const plainText = editor.getText()

      // 只存 canvas_content（TipTap JSON）和 plain_text
      // 不覆寫 markdown_content，保留原始 Markdown（來自 Deep Research）
      const res = await fetch(`/api/reports/${reportId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          canvas_content: canvasContent,
          plain_text: plainText,
        }),
      })
      if (res.ok) {
        // 通知知識庫「專業報告」頁面刷新
        window.dispatchEvent(new CustomEvent('reports-updated'))
      }
      setLastSaved(new Date().toLocaleTimeString())
    } catch {
      // 靜默失敗
    } finally {
      setIsSaving(false)
    }
  }, [editor, reportId, title])

  // 刪除報告
  const handleDelete = useCallback(async () => {
    if (!reportId || deleting) return
    const confirmed = window.confirm('確定要刪除這份報告嗎？此操作無法復原。')
    if (!confirmed) return

    setDeleting(true)
    try {
      await fetch(`/api/reports/${reportId}`, { method: 'DELETE', credentials: 'include' })
      window.dispatchEvent(new CustomEvent('reports-updated'))
      router.push('/knowledge')
    } catch {
      alert('刪除失敗')
    } finally {
      setDeleting(false)
    }
  }, [reportId, deleting, router])

  // 匯出 Markdown
  const exportMarkdown = useCallback(() => {
    if (!editor) return
    const text = editor.getText()
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [editor, title])

  // 取得 Canvas 全文 — 給 FloatingAIChat 使用
  const getCanvasContent = useCallback(() => {
    if (!editor) return ''
    return editor.getText()
  }, [editor])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <p>找不到報告</p>
        <button onClick={() => router.push('/knowledge')} className="mt-4 text-blue-500 hover:underline text-sm">
          返回知識庫
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <button
          onClick={() => router.push('/knowledge')}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="返回知識庫"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 font-medium">
            報告
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 text-sm font-medium bg-transparent border-none outline-none text-foreground"
            placeholder="報告標題..."
          />
        </div>

        <div className="flex items-center gap-1">
          {lastSaved && (
            <span className="text-xs text-gray-400 mr-2">已儲存 {lastSaved}</span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            title="儲存"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <Save className={`w-4 h-4 ${isSaving ? 'animate-pulse' : ''}`} />
          </button>
          <button
            onClick={exportMarkdown}
            title="匯出 Markdown"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="刪除報告"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      {editor && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 sm:px-3 py-1 sm:py-1.5 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
          <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="粗體" icon={Bold} />
          <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜體" icon={Italic} />
          <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="底線" icon={UnderlineIcon} />
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
          <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="標題 1" icon={Heading1} />
          <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="標題 2" icon={Heading2} />
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
          <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="項目清單" icon={List} />
          <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="編號清單" icon={ListOrdered} />
          <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用" icon={Quote} />
          <ToolbarBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="程式碼區塊" icon={Code} />
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
          <button
            onClick={() => {
              const url = window.prompt('輸入連結網址:')
              if (url) editor.chain().focus().setLink({ href: url }).run()
            }}
            title="插入連結"
            className={`p-2 rounded-lg transition-colors ${
              editor.isActive('link')
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* 懸浮 AI 問答 */}
      <FloatingAIChat getCanvasContent={getCanvasContent} />
    </div>
  )
}
