import { ComponentProps } from 'react'
import { MarkdownRenderer } from '@/components/chat/markdown-renderer'

interface CodeEditorTemplateProps {
    title?: string
    language?: string
    code: string
}

export function CodeEditorTemplate({ title, language, code }: CodeEditorTemplateProps) {
    // Construct a markdown code block manually to leverage the existing MarkdownRenderer's syntax highlighting
    const markdownContent = `\`\`\`${language || ''}\n${code}\n\`\`\``

    return (
        <div className="my-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 overflow-hidden shadow-sm">
            {title && (
                <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-950 font-medium text-sm text-gray-700 dark:text-gray-300">
                    {title}
                </div>
            )}
            <div className="p-0">
                <MarkdownRenderer textMarkdown={markdownContent} />
            </div>
        </div>
    )
}
