import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface AICompletionOptions {
  onFetchCompletion: (text: string, position: number) => Promise<string>
  debounceMs?: number
}

interface PluginState {
  ghostText: string | null
  position: number | null
}

const aiCompletionPluginKey = new PluginKey<PluginState>('aiCompletion')

export const AICompletion = Extension.create<AICompletionOptions>({
  name: 'aiCompletion',

  addOptions() {
    return {
      onFetchCompletion: async () => '',
      debounceMs: 500,
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-j': () => {
        this.editor.commands.triggerAICompletion()
        return true
      },
      Tab: () => {
        const pluginState = aiCompletionPluginKey.getState(this.editor.state)
        if (pluginState?.ghostText) {
          this.editor.commands.acceptGhostText()
          return true
        }
        return false
      },
      Escape: () => {
        const pluginState = aiCompletionPluginKey.getState(this.editor.state)
        if (pluginState?.ghostText) {
          this.editor.commands.dismissGhostText()
          return true
        }
        return false
      },
    }
  },

  addCommands() {
    return {
      triggerAICompletion:
        () =>
        ({ state }) => {
          const { from } = state.selection
          const text = state.doc.textBetween(0, from)

          // 使用 text.length 作為 cursor_position（而非 ProseMirror 的 from）
          // 因為 from 包含 block 邊界計數，會大於純文字長度
          const editor = this.editor
          this.options.onFetchCompletion(text, text.length).then((completion) => {
            if (completion && editor && !editor.isDestroyed) {
              // 使用回呼時的最新游標位置，確保 ghost text 出現在正確位置
              const currentPos = editor.state.selection.from
              const { tr } = editor.state
              tr.setMeta(aiCompletionPluginKey, {
                type: 'setGhostText',
                ghostText: completion,
                position: currentPos,
              })
              editor.view.dispatch(tr)
            }
          }).catch((error) => {
            console.error('AI completion error:', error)
          })

          return true
        },

      acceptGhostText:
        () =>
        ({ state, dispatch }) => {
          const pluginState = aiCompletionPluginKey.getState(state)
          if (pluginState?.ghostText && pluginState.position !== null && dispatch) {
            const insertPos = pluginState.position
            const ghostText = pluginState.ghostText
            const tr = state.tr
              .insertText(ghostText, insertPos)
              .setMeta(aiCompletionPluginKey, { type: 'clear' })
            // 將游標移動到插入文字的結尾
            const endPos = insertPos + ghostText.length
            tr.setSelection(TextSelection.create(tr.doc, endPos))
            dispatch(tr)
            return true
          }
          return false
        },

      dismissGhostText:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) {
            const tr = state.tr.setMeta(aiCompletionPluginKey, { type: 'clear' })
            dispatch(tr)
            return true
          }
          return false
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<PluginState>({
        key: aiCompletionPluginKey,

        state: {
          init() {
            return { ghostText: null, position: null }
          },
          apply(tr, value) {
            const meta = tr.getMeta(aiCompletionPluginKey)
            if (meta?.type === 'setGhostText') {
              return { ghostText: meta.ghostText, position: meta.position }
            }
            if (meta?.type === 'clear') {
              return { ghostText: null, position: null }
            }
            // 如果有文字變更，清除 ghost text
            if (tr.docChanged) {
              return { ghostText: null, position: null }
            }
            return value
          },
        },

        props: {
          decorations(state) {
            const pluginState = this.getState(state)
            if (!pluginState?.ghostText || pluginState.position === null) {
              return null
            }

            return DecorationSet.create(state.doc, [
              Decoration.widget(pluginState.position, () => {
                const span = document.createElement('span')
                span.className = 'ghost-text'
                span.textContent = pluginState.ghostText || ''
                return span
              }),
            ])
          },

          // 移除 handleTextInput 自動觸發邏輯
          // AI 完成只透過手動操作觸發：Cmd+J 或 UI 按鈕
        },
      }),
    ]
  },
})

// TypeScript 宣告擴充
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiCompletion: {
      triggerAICompletion: () => ReturnType
      acceptGhostText: () => ReturnType
      dismissGhostText: () => ReturnType
    }
  }
}
