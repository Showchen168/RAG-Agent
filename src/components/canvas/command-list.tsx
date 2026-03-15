'use client'

import { forwardRef, useEffect, useImperativeHandle, useState, useCallback } from 'react'

export interface Command {
  name: string
  label: string
  description: string
  icon: string
}

interface CommandListProps {
  commands: Command[]
  command: (commandName: string) => void
}

export const CommandList = forwardRef((props: CommandListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)

  const selectItem = useCallback((index: number) => {
    if (isExecuting) return
    const item = props.commands[index]
    if (item) {
      setIsExecuting(true)
      props.command(item.name)
    }
  }, [props, isExecuting])

  const upHandler = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev === null) return props.commands.length - 1
      return (prev + props.commands.length - 1) % props.commands.length
    })
  }, [props.commands.length])

  const downHandler = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev === null) return 0
      return (prev + 1) % props.commands.length
    })
  }, [props.commands.length])

  const enterHandler = useCallback(() => {
    if (selectedIndex !== null) {
      selectItem(selectedIndex)
    }
  }, [selectItem, selectedIndex])

  useEffect(() => {
    setSelectedIndex(null)
  }, [props.commands])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        upHandler()
        return true
      }

      if (event.key === 'ArrowDown') {
        downHandler()
        return true
      }

      if (event.key === 'Enter') {
        enterHandler()
        return true
      }

      return false
    },
  }))

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden w-72">
      {props.commands.map((command, index) => (
        <button
          key={command.name}
          onMouseDown={(e) => {
            // 防止 mousedown 造成 editor 失焦，確保 click 正確觸發
            e.preventDefault()
          }}
          onMouseEnter={() => {
            if (!isExecuting) setSelectedIndex(index)
          }}
          onMouseLeave={() => {
            if (!isExecuting) setSelectedIndex(null)
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            selectItem(index)
          }}
          className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${
            index === selectedIndex
              ? 'bg-blue-50 dark:bg-blue-900/30'
              : 'hover:bg-gray-50 dark:hover:bg-gray-700'
          } ${isExecuting ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={isExecuting}
        >
          <span className="text-xl flex-shrink-0">{command.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-foreground">
              {command.label}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {command.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
})

CommandList.displayName = 'CommandList'
