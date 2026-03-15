'use client'

import { MarkdownRenderer as MarkDownRenderer } from '@/components/chat/markdown-renderer'

interface TextTemplateProps {
  content?: string
  text?: string
}

export function TextTemplate({ content, text }: TextTemplateProps) {
  const displayText = content ?? text ?? ''
  return <MarkDownRenderer textMarkdown={displayText} />
}
