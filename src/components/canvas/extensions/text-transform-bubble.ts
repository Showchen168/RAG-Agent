import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import tippy, { Instance as TippyInstance } from 'tippy.js'
import { TextTransformMenu } from '../text-transform-menu'

export interface TextTransformBubbleOptions {
  onExecuteCommand: (command: string, selectedText: string) => Promise<string>
}

export const TextTransformBubble = Extension.create<TextTransformBubbleOptions>({
  name: 'textTransformBubble',

  addOptions() {
    return {
      onExecuteCommand: async () => '',
    }
  },

  addProseMirrorPlugins() {
    const options = this.options
    const editor = this.editor

    let component: ReactRenderer | null = null
    let popup: TippyInstance[] | null = null
    let isExecuting = false
    let isMouseDown = false
    let showTimer: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (showTimer) {
        clearTimeout(showTimer)
        showTimer = null
      }
      if (popup?.[0]) {
        popup[0].destroy()
        popup = null
      }
      if (component) {
        component.destroy()
        component = null
      }
    }

    const createPopup = (view: ReturnType<typeof editor.view['constructor']['prototype']['constructor']>) => {
      const { state } = view
      const { from, to, empty } = state.selection

      if (empty || from === to) return
      const selectedText = state.doc.textBetween(from, to)
      if (!selectedText.trim()) return
      if (popup?.[0]) return

      component = new ReactRenderer(TextTransformMenu, {
        props: {
          onCommand: async (commandName: string) => {
            try {
              isExecuting = true

              const currentState = editor.state
              const { from: selFrom, to: selTo } = currentState.selection
              const text = currentState.doc.textBetween(selFrom, selTo)

              if (!text.trim()) return

              const result = await options.onExecuteCommand(commandName, text)

              if (result && !editor.isDestroyed) {
                const { tr } = editor.state
                tr.insertText(result, selFrom, selTo)
                editor.view.dispatch(tr)
              }
            } catch (error) {
              console.error('[TextTransform] Command execution error:', error)
            } finally {
              isExecuting = false
              cleanup()
            }
          },
        },
        editor,
      })

      popup = tippy('body', {
        getReferenceClientRect: () => {
          const coords = view.coordsAtPos(from)
          return new DOMRect(coords.left, coords.top, 0, 0)
        },
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'top-start',
        offset: [0, 8],
        arrow: false,
        theme: 'none',
        maxWidth: 'none',
        onHide: () => {
          if (!isExecuting) {
            component?.destroy()
            component = null
          }
        },
      })
    }

    // 監聽 mousedown / mouseup 判斷選取是否完成
    const handleMouseDown = () => {
      isMouseDown = true
    }

    const handleMouseUp = () => {
      isMouseDown = false
      // 延遲一點讓 selection 更新完畢後再顯示
      if (showTimer) clearTimeout(showTimer)
      showTimer = setTimeout(() => {
        if (!isExecuting && !isMouseDown && editor.view) {
          createPopup(editor.view)
        }
      }, 150)
    }

    return [
      new Plugin({
        key: new PluginKey('textTransformBubble'),

        view() {
          document.addEventListener('mousedown', handleMouseDown)
          document.addEventListener('mouseup', handleMouseUp)

          return {
            update(view) {
              const { state } = view
              const { from, to, empty } = state.selection

              // 命令執行中不關閉
              if (isExecuting) return

              // 無選取或選取為空 → 關閉
              if (empty || from === to) {
                cleanup()
                return
              }

              // 檢查是否有實際文字（非僅格式標記）
              const selectedText = state.doc.textBetween(from, to)
              if (!selectedText.trim()) {
                cleanup()
                return
              }

              // 拖曳選取中 → 不顯示，等 mouseup
              if (isMouseDown) return

              // 已顯示 → 更新位置
              if (popup?.[0]) {
                popup[0].setProps({
                  getReferenceClientRect: () => {
                    const coords = view.coordsAtPos(from)
                    return new DOMRect(coords.left, coords.top, 0, 0)
                  },
                })
                return
              }
            },

            destroy() {
              document.removeEventListener('mousedown', handleMouseDown)
              document.removeEventListener('mouseup', handleMouseUp)
              cleanup()
            },
          }
        },
      }),
    ]
  },
})
