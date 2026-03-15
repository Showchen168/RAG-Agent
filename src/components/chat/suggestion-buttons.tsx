import { Lightbulb } from 'lucide-react'

interface SuggestionButtonsProps {
    suggestions: string[]
    onSelect: (suggestion: string) => void
}

export function SuggestionButtons({ suggestions, onSelect }: SuggestionButtonsProps) {
    if (!suggestions.length) return null

    return (
        <div className="flex flex-col gap-2 mt-4 ml-1">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                <Lightbulb className="w-3.5 h-3.5" />
                <span>相關建議問題</span>
            </div>
            <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion, index) => (
                    <button
                        key={index}
                        onClick={() => onSelect(suggestion)}
                        className="
              text-left px-4 py-2 text-sm
              bg-gray-50 dark:bg-gray-800/50
              hover:bg-blue-50 dark:hover:bg-blue-900/20
              border border-gray-200 dark:border-gray-700
              hover:border-blue-200 dark:hover:border-blue-700/50
              text-gray-700 dark:text-gray-300
              rounded-full transition-all duration-200
              active:scale-95
            "
                    >
                        {suggestion}
                    </button>
                ))}
            </div>
        </div>
    )
}
