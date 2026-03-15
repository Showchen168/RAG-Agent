import { FileText } from 'lucide-react'

interface CitationCardProps {
    title: string
    onClick?: () => void
}

export function CitationCard({ title, onClick }: CitationCardProps) {
    return (
        <div
            className="
        inline-flex items-center gap-2 px-3 py-1.5 
        bg-amber-50 dark:bg-amber-900/20 
        border border-amber-200 dark:border-amber-800/50 
        rounded-md transform transition-all duration-200 
        hover:scale-105 hover:bg-amber-100 dark:hover:bg-amber-900/40
        cursor-pointer group select-none
        mr-1 mb-1 align-middle
      "
            onClick={onClick}
            title="點擊查看來源文件"
        >
            <div className="p-0.5 bg-amber-200 dark:bg-amber-800 rounded-sm">
                <FileText className="w-3 h-3 text-amber-700 dark:text-amber-300" />
            </div>
            <span className="text-xs font-medium text-amber-800 dark:text-amber-200 max-w-[150px] truncate">
                {title}
            </span>
        </div>
    )
}
