'use client'

import { ListOrdered } from 'lucide-react'

interface StepItem {
  title: string
  description?: string
}

interface StepsTemplateProps {
  title: string
  steps: StepItem[]
}

export function StepsTemplate({ title, steps }: StepsTemplateProps) {
  // 防禦性檢查：確保 steps 是有效陣列
  const validSteps = Array.isArray(steps) ? steps : []

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <ListOrdered size={16} className="text-amber-500" />
        <span className="font-semibold text-sm text-foreground">{title}</span>
      </div>

      {/* Steps */}
      <div className="p-4">
        {validSteps.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">無步驟資料</p>
        ) : (
          validSteps.map((step, idx) => (
          <div key={`step-${idx}`} className="flex gap-3">
            {/* 左側：數字圓圈 + 連接線 */}
            <div className="flex flex-col items-center">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                {idx + 1}
              </div>
              {idx < validSteps.length - 1 && (
                <div className="w-0.5 flex-1 bg-gray-200 dark:bg-gray-700 my-1" />
              )}
            </div>

            {/* 右側：標題 + 描述 */}
            <div className={`flex-1 ${idx < validSteps.length - 1 ? 'pb-4' : 'pb-1'}`}>
              <h4 className="font-medium text-sm text-foreground">{step.title}</h4>
              {step.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{step.description}</p>
              )}
            </div>
          </div>
          ))
        )}
      </div>
    </div>
  )
}
