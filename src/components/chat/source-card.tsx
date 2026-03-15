
import { FileText, Globe, ExternalLink } from 'lucide-react'

interface SourceCardProps {
    title: string
    type?: string
}

export function SourceCard({ title, type }: SourceCardProps) {
    const isInternal = type?.includes('內部') || type === '引用文件' || !type

    // Parse "Title, Page: 5" or "Title (Page 5)"
    const pageMatch = title.match(/(?:, Page: | \(Page )(\d+)\)?$/i)
    const displayTitle = pageMatch ? title.replace(pageMatch[0], '') : title
    const page = pageMatch ? parseInt(pageMatch[1]) : undefined

    const handleClick = () => {
        // Only dispatch event for internal documents (PDFs)
        if (isInternal) {
            window.dispatchEvent(new CustomEvent('citation-clicked', {
                detail: { title: displayTitle, page }
            }))
        }
    }

    return (
        <div
            onClick={handleClick}
            className={`group flex items-center gap-3 p-3 my-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-900 transition-all duration-300 ${isInternal ? 'cursor-pointer' : ''}`}
        >
            <div className={`shrink-0 p-2 rounded-md transition-colors ${isInternal
                ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/30'
                : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30'
                }`}>
                {isInternal ? <FileText className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
            </div>

            <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {type ? type.replace(/[（()）]/g, '') : '參考來源'}
                    </span>
                    {!isInternal && <ExternalLink className="w-3 h-3 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 transition-colors" />}
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate pr-2" title={title}>
                    {displayTitle} {page && <span className="text-xs text-gray-400 ml-1">p.{page}</span>}
                </span>
            </div>
        </div>
    )
}
