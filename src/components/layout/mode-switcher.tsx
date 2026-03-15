'use client'

import { MessageSquare, PenLine } from 'lucide-react'
import { useModeStore } from '@/stores/mode-store'

export function ModeSwitcher() {
  const { mode, setMode } = useModeStore()

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
      <button
        onClick={() => setMode('chat')}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          mode === 'chat'
            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
      >
        <MessageSquare className="w-4 h-4" />
        <span>對話</span>
      </button>
      <button
        onClick={() => setMode('canvas')}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          mode === 'canvas'
            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
      >
        <PenLine className="w-4 h-4" />
        <span>畫布</span>
      </button>
    </div>
  )
}
