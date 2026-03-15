'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { memo, useMemo, isValidElement, Children } from 'react'
import dynamic from 'next/dynamic'

const MermaidBlock = dynamic(
  () => import('./mermaid-block').then((m) => ({ default: m.MermaidBlock })),
  {
    ssr: false,
    loading: () => (
      <div className="my-4 flex justify-center">
        <div className="animate-pulse bg-muted rounded-lg w-full h-32 flex items-center justify-center text-muted-foreground text-sm">
          圖表載入中...
        </div>
      </div>
    ),
  },
)

export interface MarkdownRendererProps {
  /** 主要 prop：Markdown 文字內容 */
  content?: string
  /** 向後相容 alias（舊元件使用 textMarkdown） */
  textMarkdown?: string
  className?: string
  /** 是否正在串流生成（目前保留但未使用） */
  isStreaming?: boolean
}

/**
 * Preprocess markdown text to handle incomplete mermaid code blocks during streaming.
 *
 * Problem: When AI streams "```mermaid\ngraph TD\n..." without closing "```",
 * react-markdown renders it as plain text, causing a flash of raw mermaid syntax.
 *
 * Solution: Detect unclosed mermaid fences and replace with a placeholder.
 * Also strips any partially typed mermaid fence markers (e.g., "```merma").
 */
function preprocessMermaid(rawText: string): string {
  // 1. Check for fully formed but unclosed mermaid fence: ```mermaid\n...
  const mermaidOpenIdx = rawText.lastIndexOf('```mermaid')
  if (mermaidOpenIdx !== -1) {
    const afterOpen = rawText.slice(mermaidOpenIdx + '```mermaid'.length)
    if (!afterOpen.includes('```')) {
      // Unclosed mermaid block — hide it with placeholder
      return rawText.slice(0, mermaidOpenIdx).trimEnd()
    }
  }

  // 2. Check for partially typed fence that looks like it's becoming mermaid
  // e.g., "```mer", "```merm", "```mermai" at the very end of text
  const partialFenceMatch = rawText.match(/```m(?:e(?:r(?:m(?:a(?:i(?:d?)?)?)?)?)?)?$/)
  if (partialFenceMatch) {
    return rawText.slice(0, partialFenceMatch.index).trimEnd()
  }

  return rawText
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  textMarkdown,
  className,
}: MarkdownRendererProps) {
  const rawText = content ?? textMarkdown ?? ''

  const text = useMemo(() => preprocessMermaid(rawText), [rawText])

  return (
    <div data-testid="markdown-renderer" className={className ?? 'prose prose-sm dark:prose-invert max-w-none'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            const child = Children.toArray(children)[0]
            if (
              isValidElement(child) &&
              typeof child.props === 'object' &&
              child.props !== null &&
              'className' in child.props &&
              typeof child.props.className === 'string' &&
              child.props.className.includes('language-mermaid')
            ) {
              const code = String(
                (child.props as { children?: unknown }).children ?? '',
              ).replace(/\n$/, '')
              return <MermaidBlock code={code} />
            }
            return <pre>{children}</pre>
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !match
            if (isInline) {
              return (
                <code className="bg-muted px-1.5 py-0.5 rounded text-sm" {...props}>
                  {children}
                </code>
              )
            }
            return (
              <pre className="bg-muted rounded-lg p-4 overflow-x-auto">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            )
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border-collapse border border-border">
                  {children}
                </table>
              </div>
            )
          },
          th({ children }) {
            return (
              <th className="border border-border bg-muted px-3 py-2 text-left text-sm font-medium">
                {children}
              </th>
            )
          },
          td({ children }) {
            return (
              <td className="border border-border px-3 py-2 text-sm">
                {children}
              </td>
            )
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
