'use client'

import { forwardRef, useState } from 'react'

interface TransformCommand {
  name: string
  label: string
  icon: string
}

const TRANSFORM_COMMANDS: TransformCommand[] = [
  { name: 'expand', label: '豐富', icon: '✨' },
  { name: 'shorten', label: '精簡', icon: '✂️' },
  { name: 'tone_professional', label: '專業化', icon: '💼' },
  { name: 'tone_casual', label: '口語化', icon: '😊' },
  { name: 'bilingual', label: '雙語', icon: '🌐' },
]

interface TextTransformMenuProps {
  onCommand: (commandName: string) => void
}

export const TextTransformMenu = forwardRef<HTMLDivElement, TextTransformMenuProps>(
  (props, ref) => {
    const [activeCommand, setActiveCommand] = useState<string | null>(null)

    return (
      <div
        ref={ref}
        className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-1.5 py-1"
      >
        {TRANSFORM_COMMANDS.map((cmd) => {
          const isActive = activeCommand === cmd.name
          return (
            <button
              key={cmd.name}
              onMouseDown={(e) => {
                // 防止 mousedown 造成 editor 失焦
                e.preventDefault()
              }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (activeCommand) return
                setActiveCommand(cmd.name)
                props.onCommand(cmd.name)
              }}
              disabled={activeCommand !== null}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  : activeCommand
                    ? 'opacity-40 cursor-not-allowed text-gray-400 dark:text-gray-500'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-sm">{cmd.icon}</span>
              <span>{cmd.label}</span>
              {isActive && (
                <span className="ml-0.5 inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
            </button>
          )
        })}
      </div>
    )
  }
)

TextTransformMenu.displayName = 'TextTransformMenu'
