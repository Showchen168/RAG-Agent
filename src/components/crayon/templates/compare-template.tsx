'use client'

import { GitCompareArrows, ThumbsUp, ThumbsDown } from 'lucide-react'

interface CompareItem {
  name: string
  pros?: string[]
  cons?: string[]
}

interface CompareTemplateProps {
  title: string
  items: CompareItem[]
}

export function CompareTemplate({ title, items }: CompareTemplateProps) {
  // 防禦性檢查：確保 items 是有效陣列
  const validItems = Array.isArray(items) ? items : []

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <GitCompareArrows size={16} className="text-violet-500" />
        <span className="font-semibold text-sm text-foreground">{title}</span>
      </div>

      {/* Items — 橫向排列比較項目 */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${Math.min(validItems.length, 3)}, 1fr)` }}
      >
        {validItems.map((item, idx) => (
          <div
            key={item.name}
            className={`flex flex-col p-4 ${idx > 0 ? 'border-l border-gray-200 dark:border-gray-700' : ''}`}
          >
            {/* Item name */}
            <h4 className="font-semibold text-sm text-foreground mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
              {item.name}
            </h4>

            {/* Pros */}
            {item.pros && item.pros.length > 0 && (
              <div className="mb-2">
                {item.pros.map((pro, proIdx) => (
                  <div key={`pro-${proIdx}`} className="flex items-start gap-2 py-1">
                    <ThumbsUp size={13} className="text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-foreground">{pro}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Cons */}
            {item.cons && item.cons.length > 0 && (
              <div className="mt-1">
                {item.cons.map((con, conIdx) => (
                  <div key={`con-${conIdx}`} className="flex items-start gap-2 py-1">
                    <ThumbsDown size={13} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-foreground">{con}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
