import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import tippy, { Instance as TippyInstance } from 'tippy.js'
import { CommandList, type Command } from '../command-list'

export interface SlashCommandsOptions {
  onExecuteCommand: (command: string, selectedText: string) => Promise<string>
}

const COMMANDS: Command[] = [
  {
    name: 'expand',
    label: '擴寫',
    description: '擴展當前段落，增加更多細節',
    icon: '📝',
  },
  {
    name: 'shorten',
    label: '精簡',
    description: '精簡當前段落，保留核心內容',
    icon: '✂️',
  },
  {
    name: 'tone_professional',
    label: '專業語氣',
    description: '改寫為專業正式的語氣',
    icon: '💼',
  },
  {
    name: 'tone_casual',
    label: '輕鬆語氣',
    description: '改寫為輕鬆友善的語氣',
    icon: '😊',
  },
  {
    name: 'visualize',
    label: '生成圖表',
    description: '根據數據生成視覺化圖表',
    icon: '📊',
  },
]

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return {
      onExecuteCommand: async () => '',
    }
  },

  addProseMirrorPlugins() {
    const options = this.options
    const editor = this.editor

    return [
      new Plugin({
        key: new PluginKey('slashCommands'),

        props: {
          handleKeyDown(view, event) {
            if (event.key === '/') {
              const { from } = view.state.selection
              const $from = view.state.doc.resolve(from)
              const isAtBlockStart = $from.parentOffset === 0
              const textBefore = from > 0
                ? view.state.doc.textBetween(from - 1, from)
                : ''

              // 在 block 開頭或空格後觸發 slash commands
              if (isAtBlockStart || textBefore === ' ') {
                let component: ReactRenderer
                let popup: TippyInstance[]

                // 記錄觸發時的 "/" 位置（在 "/" 被輸入後，位置會是 from + 1）
                const slashInsertPos = from

                setTimeout(() => {
                  const cleanup = () => {
                    if (popup && popup[0]) {
                      popup[0].destroy()
                    }
                    if (component) {
                      component.destroy()
                    }
                  }

                  component = new ReactRenderer(CommandList, {
                    props: {
                      commands: COMMANDS,
                      command: async (commandName: string) => {
                        // 先關閉選單，避免二次點擊
                        cleanup()

                        try {
                          // 使用 editor 取得最新的 state
                          const currentState = editor.state
                          const { from: curFrom, to: curTo } = currentState.selection
                          const selectedText = currentState.doc.textBetween(curFrom, curTo)

                          // 找到 "/" 的位置：在文件中搜尋最近的 "/"
                          // "/" 應該在 slashInsertPos 位置（因為使用者按下 / 後文字被插入）
                          const slashPos = slashInsertPos
                          const charAtPos = currentState.doc.textBetween(slashPos, slashPos + 1)

                          // 如果沒有選取文字，使用游標前的上下文（排除 "/"）
                          const contextText = selectedText ||
                            currentState.doc.textBetween(
                              Math.max(0, slashPos - 200),
                              slashPos
                            )

                          const result = await options.onExecuteCommand(commandName, contextText)

                          if (result && !editor.isDestroyed) {
                            // 使用 editor.chain() 確保操作在最新的 state 上執行
                            // 刪除 "/" 字元並插入結果
                            if (charAtPos === '/') {
                              const { tr } = editor.state
                              tr.delete(slashPos, slashPos + 1)
                              tr.insertText(result, slashPos)
                              editor.view.dispatch(tr)
                            } else {
                              // fallback：直接在當前游標位置插入
                              editor.commands.insertContent(result)
                            }
                          }
                        } catch (error) {
                          console.error('Command execution error:', error)
                        }
                      },
                    },
                    editor,
                  })

                  popup = tippy('body', {
                    getReferenceClientRect: () => {
                      const coords = view.coordsAtPos(slashInsertPos)
                      return new DOMRect(coords.left, coords.top, 0, 0)
                    },
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                    onHide: () => {
                      component.destroy()
                    },
                  })
                }, 10)
              }
            }

            return false
          },
        },
      }),
    ]
  },
})
