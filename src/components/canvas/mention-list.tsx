'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { FileText } from 'lucide-react'

interface MentionListProps {
  items: Array<{ id: string; title: string; summary?: string }>
  command: (item: { id: string; label: string }) => void
}

export const MentionList = forwardRef((props: MentionListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = (index: number) => {
    const item = props.items[index]
    if (item) {
      props.command({ id: item.id, label: item.title })
    }
  }

  const upHandler = () => {
    const newIndex = (selectedIndex + props.items.length - 1) % props.items.length
    setSelectedIndex(newIndex)
  }

  const downHandler = () => {
    const newIndex = (selectedIndex + 1) % props.items.length
    setSelectedIndex(newIndex)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useEffect(() => {
    // Reset selected index when items change
    const timer = setTimeout(() => {
      if (props.items.length > 0) {
        setSelectedIndex(0)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [props.items])

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
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden max-h-80 overflow-y-auto min-w-[300px]">
      {props.items.length ? (
        props.items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => selectItem(index)}
            className={`w-full text-left px-4 py-2 flex items-start gap-2 transition-colors ${
              index === selectedIndex
                ? 'bg-blue-50 dark:bg-blue-900/30'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <FileText className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-foreground truncate">
                {item.title}
              </div>
              {item.summary && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                  {item.summary}
                </div>
              )}
            </div>
          </button>
        ))
      ) : (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          未找到相關文件
        </div>
      )}
    </div>
  )
})

MentionList.displayName = 'MentionList'
