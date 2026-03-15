# Smart Writing Canvas (AI Copilot) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 實現 Smart Writing Canvas 的 AI Copilot 功能，包含智慧補全、智慧引用、AI 指令、以及改善 Dashboard icon 顯示問題

**Architecture:**
- 基於現有的 TipTap 編輯器，新增 AI Extension 實現 Ghost Text 自動完成
- 建立 `/api/copilot/completion` 端點，整合 RAG 搜尋與 LLM Stream
- 擴充現有的 Mention Extension，支援知識庫文件搜尋與引用
- 實現 Slash Commands (/expand, /shorten, /tone, /visualize)
- 修正 Sidebar Dashboard icon 顯示（已有 LayoutDashboard icon，但需確認是否正確顯示）

**Tech Stack:**
- TipTap (ProseMirror-based editor)
- TipTap Extensions (Mention, Suggestion)
- Vercel AI SDK (LLM streaming)
- Zustand (state management)
- Supabase (authentication & knowledge base)

---

## Phase 1: Dashboard Icon 修復與驗證

### Task 1: 驗證 Dashboard Icon 顯示

**Files:**
- Read: `src/components/chat/sidebar.tsx:219-231`

**Step 1: 檢查當前 Dashboard 按鈕實現**

目前 sidebar.tsx 第 219-231 行已經有 Dashboard 導航按鈕，使用 `LayoutDashboard` icon。

**Step 2: 測試 Dashboard 導航**

```bash
cd "/Users/show/Desktop/Claude code agent/Projects/MVP Demo/nexusmind"
npm run dev
```

在瀏覽器中：
1. 登入應用
2. 檢查 Sidebar 是否顯示 Dashboard icon
3. 點擊 Dashboard 按鈕，驗證導航是否正常

Expected: Dashboard icon 正常顯示且可導航到 /dashboard

**Step 3: 如有問題，檢查並修復**

如果 icon 未顯示：
- 檢查 lucide-react import
- 確認 icon 名稱拼寫
- 檢查 CSS 樣式

**Step 4: Commit**

```bash
git add .
git commit -m "docs: verify dashboard icon display in sidebar"
```

---

## Phase 2: AI Copilot Backend API

### Task 2: 建立 Copilot Completion API Route

**Files:**
- Create: `src/app/api/copilot/completion/route.ts`
- Read: `src/app/api/chat/route.ts` (參考現有 streaming 實現)
- Read: `src/lib/ai/providers.ts` (使用現有 provider)

**Step 1: 寫失敗測試**

Create: `src/app/api/copilot/completion/__tests__/route.test.ts`

```typescript
import { POST } from '../route'

describe('POST /api/copilot/completion', () => {
  it('should return 401 if user is not authenticated', async () => {
    const request = new Request('http://localhost:3000/api/copilot/completion', {
      method: 'POST',
      body: JSON.stringify({
        current_text: 'Hello',
        cursor_position: 5,
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('should return streaming response with AI completion', async () => {
    // Mock authenticated user
    // Test streaming response
  })
})
```

**Step 2: 運行測試確認失敗**

```bash
npm test -- src/app/api/copilot/completion/__tests__/route.test.ts
```

Expected: FAIL - route not implemented

**Step 3: 實現最小 API Route**

Create: `src/app/api/copilot/completion/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { streamText } from 'ai'
import { getProvider } from '@/lib/ai/providers'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface CompletionRequest {
  current_text: string
  cursor_position: number
  project_id?: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const body: CompletionRequest = await request.json()
    const { current_text, cursor_position, project_id } = body

    // Extract context before cursor
    const contextBefore = current_text.substring(0, cursor_position)

    // TODO: RAG search for relevant documents (Phase 2, Task 3)

    // Generate completion prompt
    const prompt = `你是一個智慧寫作助手。根據以下內容，提供自然的續寫建議。只輸出續寫內容，不要重複已有文字。

已有內容：
${contextBefore}

請提供 1-2 句的自然續寫：`

    const model = await getProvider('gemini-2.0-flash')

    const result = streamText({
      model,
      prompt,
      temperature: 0.7,
      maxTokens: 150,
    })

    return result.toDataStreamResponse()
  } catch (error) {
    console.error('Copilot completion error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
```

**Step 4: 運行測試確認通過**

```bash
npm test -- src/app/api/copilot/completion/__tests__/route.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/copilot/completion/
git commit -m "feat: add copilot completion API endpoint with streaming"
```

---

### Task 3: 整合 RAG 搜尋到 Copilot API

**Files:**
- Modify: `src/app/api/copilot/completion/route.ts:28-30`
- Read: `src/app/api/knowledge/search/route.ts` (參考知識庫搜尋)

**Step 1: 寫失敗測試**

Modify: `src/app/api/copilot/completion/__tests__/route.test.ts`

```typescript
it('should include RAG context when project_id is provided', async () => {
  // Mock knowledge base with project documents
  // Verify completion includes relevant context from KB
})
```

**Step 2: 運行測試確認失敗**

```bash
npm test -- src/app/api/copilot/completion/__tests__/route.test.ts
```

Expected: FAIL - RAG not implemented

**Step 3: 實現 RAG 搜尋邏輯**

Modify: `src/app/api/copilot/completion/route.ts`

```typescript
// 在 contextBefore 定義後添加 RAG 搜尋
let ragContext = ''

if (project_id) {
  // 從知識庫搜尋相關文件
  const searchQuery = contextBefore.slice(-200) // 使用最後 200 字元作為搜尋查詢

  const { data: searchResults } = await supabase
    .from('documents')
    .select('id, title, content, summary')
    .eq('user_id', user.id)
    .eq('enabled', true)
    .textSearch('content', searchQuery, {
      type: 'websearch',
      config: 'english',
    })
    .limit(3)

  if (searchResults && searchResults.length > 0) {
    ragContext = '\n\n參考資料：\n' + searchResults
      .map(doc => `- ${doc.title}: ${doc.summary || doc.content?.substring(0, 200)}`)
      .join('\n')
  }
}

// 更新 prompt
const prompt = `你是一個智慧寫作助手。根據以下內容和參考資料，提供自然的續寫建議。只輸出續寫內容，不要重複已有文字。

已有內容：
${contextBefore}${ragContext}

請提供 1-2 句的自然續寫：`
```

**Step 4: 運行測試確認通過**

```bash
npm test -- src/app/api/copilot/completion/__tests__/route.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/copilot/completion/route.ts
git commit -m "feat: integrate RAG search into copilot completion API"
```

---

## Phase 3: AI Auto-Complete Extension (Ghost Text)

### Task 4: 建立 TipTap AI Completion Extension

**Files:**
- Create: `src/components/canvas/extensions/ai-completion.ts`
- Read: `@tiptap/suggestion` documentation

**Step 1: 寫失敗測試**

Create: `src/components/canvas/extensions/__tests__/ai-completion.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals'
import { AICompletion } from '../ai-completion'

describe('AICompletion Extension', () => {
  it('should trigger completion on Cmd+J', () => {
    // Test keyboard shortcut
  })

  it('should show ghost text on idle (500ms)', () => {
    // Test auto-trigger on typing pause
  })

  it('should accept ghost text on Tab key', () => {
    // Test accept completion
  })

  it('should dismiss ghost text on Escape', () => {
    // Test dismiss completion
  })
})
```

**Step 2: 運行測試確認失敗**

```bash
npm test -- src/components/canvas/extensions/__tests__/ai-completion.test.ts
```

Expected: FAIL - extension not implemented

**Step 3: 實現 AI Completion Extension**

Create: `src/components/canvas/extensions/ai-completion.ts`

```typescript
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface AICompletionOptions {
  onFetchCompletion: (text: string, position: number) => Promise<string>
  debounceMs?: number
}

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
        const pluginState = this.editor.state.field(aiCompletionPluginKey)
        if (pluginState.ghostText) {
          this.editor.commands.acceptGhostText()
          return true
        }
        return false
      },
      Escape: () => {
        this.editor.commands.dismissGhostText()
        return true
      },
    }
  },

  addCommands() {
    return {
      triggerAICompletion:
        () =>
        ({ state, dispatch }) => {
          const { from } = state.selection
          const text = state.doc.textBetween(0, from)

          this.options.onFetchCompletion(text, from).then((completion) => {
            if (completion && dispatch) {
              // Show ghost text
              const tr = state.tr.setMeta(aiCompletionPluginKey, {
                type: 'setGhostText',
                ghostText: completion,
                position: from,
              })
              dispatch(tr)
            }
          })

          return true
        },

      acceptGhostText:
        () =>
        ({ state, dispatch }) => {
          const pluginState = state.field(aiCompletionPluginKey)
          if (pluginState.ghostText && dispatch) {
            const tr = state.tr.insertText(pluginState.ghostText, pluginState.position)
            dispatch(tr.setMeta(aiCompletionPluginKey, { type: 'clear' }))
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
    const options = this.options
    let debounceTimer: NodeJS.Timeout | null = null

    return [
      new Plugin({
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
            return value
          },
        },

        props: {
          decorations(state) {
            const pluginState = this.getState(state)
            if (!pluginState.ghostText) return null

            return DecorationSet.create(state.doc, [
              Decoration.inline(pluginState.position, pluginState.position, {
                class: 'ghost-text',
                'data-ghost-text': pluginState.ghostText,
              }),
            ])
          },

          handleTextInput(view) {
            // Auto-trigger on typing pause
            if (debounceTimer) clearTimeout(debounceTimer)

            debounceTimer = setTimeout(() => {
              const { from } = view.state.selection
              const text = view.state.doc.textBetween(0, from)

              options.onFetchCompletion(text, from).then((completion) => {
                if (completion) {
                  const tr = view.state.tr.setMeta(aiCompletionPluginKey, {
                    type: 'setGhostText',
                    ghostText: completion,
                    position: from,
                  })
                  view.dispatch(tr)
                }
              })
            }, options.debounceMs)

            return false
          },
        },
      }),
    ]
  },
})

const aiCompletionPluginKey = new PluginKey('aiCompletion')

// 添加 TypeScript 聲明
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiCompletion: {
      triggerAICompletion: () => ReturnType
      acceptGhostText: () => ReturnType
      dismissGhostText: () => ReturnType
    }
  }
}
```

**Step 4: 運行測試確認通過**

```bash
npm test -- src/components/canvas/extensions/__tests__/ai-completion.test.ts
```

Expected: PASS

**Step 5: 添加 Ghost Text CSS 樣式**

Modify: `src/app/globals.css`

```css
/* Ghost Text 樣式 */
.ghost-text::after {
  content: attr(data-ghost-text);
  color: #9ca3af; /* gray-400 */
  pointer-events: none;
}

.dark .ghost-text::after {
  color: #6b7280; /* dark:gray-500 */
}
```

**Step 6: Commit**

```bash
git add src/components/canvas/extensions/
git add src/app/globals.css
git commit -m "feat: add AI completion extension with ghost text"
```

---

### Task 5: 整合 AI Completion Extension 到 Canvas Editor

**Files:**
- Modify: `src/components/canvas/canvas-editor.tsx:41-68`
- Modify: `src/components/canvas/canvas-editor.tsx:162-167` (更新 AI 完成按鈕)

**Step 1: 寫失敗測試**

Modify: `src/components/canvas/__tests__/canvas-editor.test.tsx`

```typescript
it('should trigger AI completion on Cmd+J', async () => {
  // Test keyboard shortcut triggers API call
})

it('should show ghost text after typing pause', async () => {
  // Test auto-completion after 500ms idle
})

it('should accept ghost text on Tab', async () => {
  // Test Tab key inserts ghost text
})
```

**Step 2: 運行測試確認失敗**

```bash
npm test -- src/components/canvas/__tests__/canvas-editor.test.tsx
```

Expected: FAIL - extension not integrated

**Step 3: 實現 fetchCompletion 函數**

Modify: `src/components/canvas/canvas-editor.tsx`

在文件頂部添加：

```typescript
import { AICompletion } from './extensions/ai-completion'
import { useCallback, useState } from 'react'

// ... existing imports ...

export function CanvasEditor({ onCitationInsert }: CanvasEditorProps) {
  const [isLoadingCompletion, setIsLoadingCompletion] = useState(false)

  const fetchCompletion = useCallback(async (text: string, position: number) => {
    try {
      setIsLoadingCompletion(true)
      const response = await fetch('/api/copilot/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_text: text,
          cursor_position: position,
        }),
      })

      if (!response.ok) return ''

      const reader = response.body?.getReader()
      if (!reader) return ''

      let completion = ''
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        completion += decoder.decode(value, { stream: true })
      }

      return completion.trim()
    } catch (error) {
      console.error('AI completion error:', error)
      return ''
    } finally {
      setIsLoadingCompletion(false)
    }
  }, [])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: false,
      }),
      Underline,
      Typography,
      Link.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: '開始寫作，輸入 @ 引用知識庫文件... (Cmd+J 觸發 AI 完成)',
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded px-1 py-0.5',
        },
      }),
      // 新增 AI Completion Extension
      AICompletion.configure({
        onFetchCompletion: fetchCompletion,
        debounceMs: 500,
      }),
    ],
    // ... rest of config
  })
```

**Step 4: 更新 AI 完成按鈕**

Modify: 更新按鈕 onClick 處理器

```typescript
<button
  onClick={() => editor?.commands.triggerAICompletion()}
  disabled={isLoadingCompletion}
  title="AI 自動完成 (Cmd+J)"
  className="flex items-center gap-1.5 px-3 py-2 text-xs bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 transition-colors disabled:opacity-50"
>
  <Sparkles className={`w-3.5 h-3.5 ${isLoadingCompletion ? 'animate-spin' : ''}`} />
  {isLoadingCompletion ? 'AI 生成中...' : 'AI 完成'}
</button>
```

**Step 5: 運行測試確認通過**

```bash
npm test -- src/components/canvas/__tests__/canvas-editor.test.tsx
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/components/canvas/canvas-editor.tsx
git commit -m "feat: integrate AI completion extension into canvas editor"
```

---

## Phase 4: Smart Citation (@mention) Enhancement

### Task 6: 實現知識庫文件搜尋與引用

**Files:**
- Create: `src/components/canvas/extensions/smart-mention.ts`
- Modify: `src/components/canvas/canvas-editor.tsx:56-60`

**Step 1: 寫失敗測試**

Create: `src/components/canvas/extensions/__tests__/smart-mention.test.ts`

```typescript
describe('SmartMention Extension', () => {
  it('should show knowledge base documents on @ trigger', async () => {
    // Test @ shows document list
  })

  it('should filter documents by search query', async () => {
    // Test fuzzy search
  })

  it('should insert citation on document select', async () => {
    // Test citation insertion
  })
})
```

**Step 2: 運行測試確認失敗**

```bash
npm test -- src/components/canvas/extensions/__tests__/smart-mention.test.ts
```

Expected: FAIL - extension not implemented

**Step 3: 實現 Smart Mention Extension**

Create: `src/components/canvas/extensions/smart-mention.ts`

```typescript
import { mergeAttributes } from '@tiptap/core'
import Mention from '@tiptap/extension-mention'
import { ReactRenderer } from '@tiptap/react'
import tippy, { Instance as TippyInstance } from 'tippy.js'
import { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'
import MentionList from '../mention-list'

export interface SmartMentionOptions {
  onSearch: (query: string) => Promise<Array<{ id: string; title: string; summary?: string }>>
  onSelect: (item: { id: string; title: string }) => void
}

export const SmartMention = Mention.extend<SmartMentionOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      onSearch: async () => [],
      onSelect: () => {},
      suggestion: {
        char: '@',
        pluginKey: 'smartMention',

        items: async ({ query }) => {
          return await this.options.onSearch(query)
        },

        render: () => {
          let component: ReactRenderer
          let popup: TippyInstance[]

          return {
            onStart: (props: SuggestionProps) => {
              component = new ReactRenderer(MentionList, {
                props,
                editor: props.editor,
              })

              if (!props.clientRect) {
                return
              }

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              })
            },

            onUpdate(props: SuggestionProps) {
              component.updateProps(props)

              if (!props.clientRect) {
                return
              }

              popup[0].setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
              })
            },

            onKeyDown(props: { event: KeyboardEvent }) {
              if (props.event.key === 'Escape') {
                popup[0].hide()
                return true
              }

              return (component.ref as any)?.onKeyDown(props)
            },

            onExit() {
              popup[0].destroy()
              component.destroy()
            },
          }
        },
      } as Partial<SuggestionOptions>,
    }
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-id'),
        renderHTML: (attributes) => {
          if (!attributes.id) {
            return {}
          }

          return {
            'data-id': attributes.id,
          }
        },
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-label'),
        renderHTML: (attributes) => {
          if (!attributes.label) {
            return {}
          }

          return {
            'data-label': attributes.label,
          }
        },
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        { class: 'mention' }
      ),
      `[[${HTMLAttributes.label}]]`,
    ]
  },
})
```

**Step 4: 建立 MentionList 組件**

Create: `src/components/canvas/mention-list.tsx`

```typescript
'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { FileText } from 'lucide-react'

interface MentionListProps {
  items: Array<{ id: string; title: string; summary?: string }>
  command: (item: { id: string; label: string }) => void
}

export default forwardRef((props: MentionListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = (index: number) => {
    const item = props.items[index]
    if (item) {
      props.command({ id: item.id, label: item.title })
    }
  }

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
  }

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useEffect(() => setSelectedIndex(0), [props.items])

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
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden max-h-80 overflow-y-auto">
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
                <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">
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
```

**Step 5: 運行測試確認通過**

```bash
npm test -- src/components/canvas/extensions/__tests__/smart-mention.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/components/canvas/extensions/smart-mention.ts
git add src/components/canvas/mention-list.tsx
git commit -m "feat: add smart mention extension for knowledge base citation"
```

---

### Task 7: 整合 Smart Mention 到 Canvas Editor

**Files:**
- Modify: `src/components/canvas/canvas-editor.tsx`

**Step 1: 寫失敗測試**

```typescript
it('should show document list on @ input', async () => {
  // Test @ triggers knowledge base search
})
```

**Step 2: 運行測試確認失敗**

```bash
npm test -- src/components/canvas/__tests__/canvas-editor.test.tsx
```

Expected: FAIL

**Step 3: 實現知識庫搜尋函數**

Modify: `src/components/canvas/canvas-editor.tsx`

```typescript
import { SmartMention } from './extensions/smart-mention'

// 添加搜尋函數
const searchKnowledge = useCallback(async (query: string) => {
  try {
    const response = await fetch(`/api/knowledge/search?q=${encodeURIComponent(query)}&limit=10`)
    if (!response.ok) return []

    const { data } = await response.json()
    return (data || []).map((doc: any) => ({
      id: doc.id,
      title: doc.title,
      summary: doc.summary,
    }))
  } catch (error) {
    console.error('Knowledge search error:', error)
    return []
  }
}, [])

const handleMentionSelect = useCallback((item: { id: string; title: string }) => {
  // Optional: callback when citation is inserted
  console.log('Citation inserted:', item)
}, [])

// 更新 editor extensions
const editor = useEditor({
  // ... existing config
  extensions: [
    // ... existing extensions
    // 替換原有的 Mention 為 SmartMention
    SmartMention.configure({
      HTMLAttributes: {
        class: 'mention bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded px-1 py-0.5',
      },
      onSearch: searchKnowledge,
      onSelect: handleMentionSelect,
    }),
    // ... other extensions
  ],
})
```

**Step 4: 運行測試確認通過**

```bash
npm test -- src/components/canvas/__tests__/canvas-editor.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/canvas/canvas-editor.tsx
git commit -m "feat: integrate smart mention into canvas editor"
```

---

## Phase 5: Slash Commands Implementation

### Task 8: 建立 Slash Commands Extension

**Files:**
- Create: `src/components/canvas/extensions/slash-commands.ts`
- Create: `src/components/canvas/command-list.tsx`

**Step 1: 寫失敗測試**

Create: `src/components/canvas/extensions/__tests__/slash-commands.test.ts`

```typescript
describe('SlashCommands Extension', () => {
  it('should show command list on / trigger', () => {
    // Test / shows commands
  })

  it('should execute /expand command', async () => {
    // Test expand command
  })

  it('should execute /shorten command', async () => {
    // Test shorten command
  })

  it('should execute /tone command', async () => {
    // Test tone change command
  })
})
```

**Step 2: 運行測試確認失敗**

```bash
npm test -- src/components/canvas/extensions/__tests__/slash-commands.test.ts
```

Expected: FAIL

**Step 3: 實現 Slash Commands Extension**

Create: `src/components/canvas/extensions/slash-commands.ts`

```typescript
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import tippy from 'tippy.js'
import CommandList from '../command-list'

export interface SlashCommandsOptions {
  onExecuteCommand: (command: string, selectedText: string) => Promise<string>
}

interface Command {
  name: string
  label: string
  description: string
  icon: string
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
    return [
      new Plugin({
        key: new PluginKey('slashCommands'),

        props: {
          handleKeyDown(view, event) {
            if (event.key === '/') {
              const { from } = view.state.selection
              const textBefore = view.state.doc.textBetween(Math.max(0, from - 1), from)

              // Only trigger if / is at start of line or after space
              if (from === 0 || textBefore === ' ' || textBefore === '\n') {
                // Show command menu
                setTimeout(() => {
                  const component = new ReactRenderer(CommandList, {
                    props: {
                      commands: COMMANDS,
                      command: async (commandName: string) => {
                        const { from, to } = view.state.selection
                        const selectedText = view.state.doc.textBetween(from, to)

                        const result = await this.options.onExecuteCommand(
                          commandName,
                          selectedText || view.state.doc.textBetween(from - 200, from)
                        )

                        if (result) {
                          const tr = view.state.tr.replaceWith(
                            from,
                            to || from,
                            view.state.schema.text(result)
                          )
                          view.dispatch(tr)
                        }

                        popup[0].destroy()
                        component.destroy()
                      },
                    },
                    editor: view,
                  })

                  const popup = tippy('body', {
                    getReferenceClientRect: () => {
                      const coords = view.coordsAtPos(from)
                      return new DOMRect(coords.left, coords.top, 0, 0)
                    },
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
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
```

**Step 4: 建立 CommandList 組件**

Create: `src/components/canvas/command-list.tsx`

```typescript
'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

interface Command {
  name: string
  label: string
  description: string
  icon: string
}

interface CommandListProps {
  commands: Command[]
  command: (commandName: string) => void
}

export default forwardRef((props: CommandListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = (index: number) => {
    const item = props.commands[index]
    if (item) {
      props.command(item.name)
    }
  }

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.commands.length - 1) % props.commands.length)
  }

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.commands.length)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useEffect(() => setSelectedIndex(0), [props.commands])

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
          onClick={() => selectItem(index)}
          className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${
            index === selectedIndex
              ? 'bg-blue-50 dark:bg-blue-900/30'
              : 'hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <span className="text-xl">{command.icon}</span>
          <div className="flex-1">
            <div className="font-medium text-sm text-foreground">
              {command.label}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {command.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
})
```

**Step 5: 運行測試確認通過**

```bash
npm test -- src/components/canvas/extensions/__tests__/slash-commands.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/components/canvas/extensions/slash-commands.ts
git add src/components/canvas/command-list.tsx
git commit -m "feat: add slash commands extension"
```

---

### Task 9: 建立 Slash Commands API Endpoint

**Files:**
- Create: `src/app/api/copilot/command/route.ts`

**Step 1: 寫失敗測試**

Create: `src/app/api/copilot/command/__tests__/route.test.ts`

```typescript
describe('POST /api/copilot/command', () => {
  it('should return 401 if not authenticated', async () => {
    // Test auth
  })

  it('should expand text with /expand command', async () => {
    // Test expand
  })

  it('should shorten text with /shorten command', async () => {
    // Test shorten
  })

  it('should change tone with /tone command', async () => {
    // Test tone change
  })
})
```

**Step 2: 運行測試確認失敗**

```bash
npm test -- src/app/api/copilot/command/__tests__/route.test.ts
```

Expected: FAIL

**Step 3: 實現 Command API**

Create: `src/app/api/copilot/command/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { streamText } from 'ai'
import { getProvider } from '@/lib/ai/providers'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface CommandRequest {
  command: string
  text: string
}

const COMMAND_PROMPTS: Record<string, string> = {
  expand: '請擴展以下內容，增加更多細節和說明，但保持原意：\n\n{text}\n\n擴展版本：',
  shorten: '請精簡以下內容，保留核心要點，移除冗餘部分：\n\n{text}\n\n精簡版本：',
  tone_professional: '請將以下內容改寫為專業正式的語氣：\n\n{text}\n\n專業版本：',
  tone_casual: '請將以下內容改寫為輕鬆友善的語氣：\n\n{text}\n\n輕鬆版本：',
  visualize: '根據以下內容中的數據，建議適合的圖表類型（長條圖、折線圖、圓餅圖等）：\n\n{text}\n\n建議：',
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const body: CommandRequest = await request.json()
    const { command, text } = body

    const promptTemplate = COMMAND_PROMPTS[command]
    if (!promptTemplate) {
      return new Response('Invalid command', { status: 400 })
    }

    const prompt = promptTemplate.replace('{text}', text)
    const model = await getProvider('gemini-2.0-flash')

    const result = streamText({
      model,
      prompt,
      temperature: 0.7,
      maxTokens: 500,
    })

    return result.toDataStreamResponse()
  } catch (error) {
    console.error('Command execution error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
```

**Step 4: 運行測試確認通過**

```bash
npm test -- src/app/api/copilot/command/__tests__/route.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/copilot/command/
git commit -m "feat: add slash commands API endpoint"
```

---

### Task 10: 整合 Slash Commands 到 Canvas Editor

**Files:**
- Modify: `src/components/canvas/canvas-editor.tsx`

**Step 1: 寫失敗測試**

```typescript
it('should execute /expand command', async () => {
  // Test slash command execution
})
```

**Step 2: 運行測試確認失敗**

```bash
npm test -- src/components/canvas/__tests__/canvas-editor.test.tsx
```

Expected: FAIL

**Step 3: 實現 executeCommand 函數**

Modify: `src/components/canvas/canvas-editor.tsx`

```typescript
import { SlashCommands } from './extensions/slash-commands'

const executeCommand = useCallback(async (command: string, text: string) => {
  try {
    const response = await fetch('/api/copilot/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, text }),
    })

    if (!response.ok) return ''

    const reader = response.body?.getReader()
    if (!reader) return ''

    let result = ''
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += decoder.decode(value, { stream: true })
    }

    return result.trim()
  } catch (error) {
    console.error('Command execution error:', error)
    return ''
  }
}, [])

// 添加到 extensions
const editor = useEditor({
  // ... existing config
  extensions: [
    // ... existing extensions
    SlashCommands.configure({
      onExecuteCommand: executeCommand,
    }),
  ],
})
```

**Step 4: 運行測試確認通過**

```bash
npm test -- src/components/canvas/__tests__/canvas-editor.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/canvas/canvas-editor.tsx
git commit -m "feat: integrate slash commands into canvas editor"
```

---

## Phase 6: Testing & Quality Assurance

### Task 11: 執行完整測試套件

**Files:**
- All test files

**Step 1: 運行單元測試**

```bash
npm test
```

Expected: All tests PASS

**Step 2: 運行測試覆蓋率檢查**

```bash
npm run test:coverage
```

Expected: Coverage > 80%

**Step 3: 運行 Lint 檢查**

```bash
npm run lint
```

Expected: No errors

**Step 4: 運行 Build 檢查**

```bash
npm run build
```

Expected: Build successful

**Step 5: 如有問題，修復並重新測試**

修復所有測試失敗、lint 錯誤、build 錯誤。

**Step 6: Commit**

```bash
git add .
git commit -m "test: ensure all tests pass and coverage > 80%"
```

---

### Task 12: End-to-End Testing

**Files:**
- Create: `e2e/canvas-ai-copilot.spec.ts`

**Step 1: 寫 E2E 測試**

Create: `e2e/canvas-ai-copilot.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Smart Writing Canvas - AI Copilot', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')

    // Navigate to Canvas
    await page.goto('/canvas')
  })

  test('should trigger AI completion with Cmd+J', async ({ page }) => {
    const editor = page.locator('.ProseMirror')
    await editor.fill('根據研究報告，')
    await page.keyboard.press('Meta+j')

    // Wait for ghost text to appear
    await page.waitForSelector('.ghost-text', { timeout: 5000 })

    // Accept with Tab
    await page.keyboard.press('Tab')

    // Verify text was inserted
    const content = await editor.textContent()
    expect(content.length).toBeGreaterThan('根據研究報告，'.length)
  })

  test('should show document list on @ input', async ({ page }) => {
    const editor = page.locator('.ProseMirror')
    await editor.fill('參考 @')

    // Wait for mention list
    await page.waitForSelector('[role="listbox"]', { timeout: 5000 })

    // Verify documents are shown
    const items = await page.locator('[role="option"]').count()
    expect(items).toBeGreaterThan(0)
  })

  test('should execute /expand command', async ({ page }) => {
    const editor = page.locator('.ProseMirror')
    await editor.fill('AI 很強大。')
    await editor.press('/')

    // Wait for command list
    await page.waitForSelector('.command-list', { timeout: 2000 })

    // Select expand command
    await page.click('text=擴寫')

    // Wait for expansion
    await page.waitForTimeout(3000)

    // Verify text was expanded
    const content = await editor.textContent()
    expect(content.length).toBeGreaterThan('AI 很強大。'.length)
  })

  test('should show AI completion button', async ({ page }) => {
    const button = page.locator('text=AI 完成')
    await expect(button).toBeVisible()

    // Click and verify loading state
    await button.click()
    await expect(page.locator('text=AI 生成中...')).toBeVisible()
  })
})
```

**Step 2: 運行 E2E 測試**

```bash
npx playwright test e2e/canvas-ai-copilot.spec.ts --project=chromium
```

Expected: All E2E tests PASS

**Step 3: 如有問題，修復並重新測試**

**Step 4: Commit**

```bash
git add e2e/canvas-ai-copilot.spec.ts
git commit -m "test: add E2E tests for AI copilot features"
```

---

## Phase 7: Documentation & Final Review

### Task 13: 更新文檔

**Files:**
- Create: `docs/features/smart-writing-canvas.md`
- Modify: `README.md`

**Step 1: 建立功能文檔**

Create: `docs/features/smart-writing-canvas.md`

```markdown
# Smart Writing Canvas (AI Copilot)

## 概述

Smart Writing Canvas 是 NexusMind 的智慧寫作介面，提供 AI 驅動的寫作輔助功能。

## 核心功能

### 1. 智慧補全 (Ghost Text)
- **觸發方式**:
  - 自動：停止輸入 500ms 後
  - 手動：按下 `Cmd+J` (Mac) 或 `Ctrl+J` (Windows)
- **接受補全**: 按下 `Tab` 鍵
- **取消補全**: 按下 `Esc` 鍵

### 2. 智慧引用 (@mention)
- **觸發方式**: 輸入 `@`
- **功能**: 搜尋並引用知識庫文件
- **格式**: `[[文件標題]]`

### 3. AI 指令 (Slash Commands)
- **觸發方式**: 輸入 `/`
- **可用指令**:
  - `/expand` - 擴寫段落
  - `/shorten` - 精簡段落
  - `/tone professional` - 改為專業語氣
  - `/tone casual` - 改為輕鬆語氣
  - `/visualize` - 生成圖表建議

## 技術架構

### API Endpoints
- `POST /api/copilot/completion` - AI 自動完成
- `POST /api/copilot/command` - 執行 AI 指令
- `GET /api/knowledge/search` - 搜尋知識庫

### TipTap Extensions
- `AICompletion` - Ghost Text 自動完成
- `SmartMention` - 智慧文件引用
- `SlashCommands` - AI 指令

## 使用範例

### 1. 自動完成範例
```
使用者輸入: "根據 2024 年財報，"
AI 補全: "公司營收較去年成長 20%，主要來自企業客戶增加..."
```

### 2. 智慧引用範例
```
使用者輸入: "@財報"
系統顯示: 2024年度財報.pdf
選擇後插入: [[2024年度財報]]
```

### 3. AI 指令範例
```
原文: "AI 很強大。"
執行 /expand 後: "人工智慧技術的發展日新月異，其強大的運算能力和深度學習能力，已經在各個領域展現出驚人的應用潛力..."
```

## 快捷鍵

| 功能 | Mac | Windows |
|------|-----|---------|
| AI 補全 | `Cmd+J` | `Ctrl+J` |
| 接受補全 | `Tab` | `Tab` |
| 取消補全 | `Esc` | `Esc` |
| 智慧引用 | `@` | `@` |
| AI 指令 | `/` | `/` |

## 最佳實踐

1. **利用 RAG 增強補全準確度**: 確保知識庫有相關文件
2. **善用快捷鍵**: 提高寫作效率
3. **組合使用功能**: 先引用資料 (@mention)，再請 AI 擴寫 (/expand)
```

**Step 2: 更新 README**

Modify: `README.md`

在 Features 部分添加：

```markdown
### 🖊️ Smart Writing Canvas (AI Copilot)
- **智慧補全**: Ghost Text 自動完成，按 Tab 接受
- **智慧引用**: @mention 搜尋知識庫文件
- **AI 指令**: /expand, /shorten, /tone 等快速指令
- **RAG 增強**: 基於知識庫的智慧建議
```

**Step 3: Commit**

```bash
git add docs/features/smart-writing-canvas.md README.md
git commit -m "docs: add smart writing canvas documentation"
```

---

### Task 14: 最終驗證與部署準備

**Files:**
- All project files

**Step 1: 完整功能測試**

1. 啟動開發伺服器: `npm run dev`
2. 登入應用
3. 導航到 Canvas 頁面
4. 測試所有功能:
   - AI 自動完成 (Cmd+J 和自動觸發)
   - @ 引用知識庫文件
   - / 執行 AI 指令
   - Dashboard icon 顯示與導航

**Step 2: 性能檢查**

```bash
npm run build
npm run start
```

測試 production build 性能。

**Step 3: 最終 Code Review**

使用 `superpowers:code-reviewer` 檢查代碼品質。

**Step 4: 建立 Pull Request**

如果在功能分支開發，建立 PR 到 main:

```bash
git push origin feature/smart-writing-canvas
gh pr create --title "feat: Smart Writing Canvas (AI Copilot)" --body "$(cat <<'EOF'
## Summary
實現 Smart Writing Canvas 的 AI Copilot 功能，包含：
- ✅ 智慧補全 (Ghost Text) with Cmd+J 觸發
- ✅ 智慧引用 (@mention) 知識庫文件搜尋
- ✅ AI 指令 (/expand, /shorten, /tone, /visualize)
- ✅ RAG 整合增強補全準確度
- ✅ Dashboard icon 修復

## Test Plan
- [x] 單元測試 (80%+ coverage)
- [x] E2E 測試 (Playwright)
- [x] Lint 檢查
- [x] Build 驗證
- [x] 手動功能測試

## 技術細節
- TipTap Extensions: AICompletion, SmartMention, SlashCommands
- API Routes: /api/copilot/completion, /api/copilot/command
- RAG: Supabase text search integration

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 5: Commit**

```bash
git add .
git commit -m "chore: final verification and PR preparation"
```

---

## 驗收標準

### 功能性 ✅
- [ ] Dashboard icon 正確顯示並可導航
- [ ] AI 自動完成在 Cmd+J 觸發
- [ ] AI 自動完成在停止輸入 500ms 後觸發
- [ ] Tab 鍵接受 Ghost Text
- [ ] Esc 鍵取消 Ghost Text
- [ ] @ 輸入顯示知識庫文件列表
- [ ] 選擇文件插入引用 [[文件標題]]
- [ ] / 輸入顯示 AI 指令列表
- [ ] /expand 擴寫段落
- [ ] /shorten 精簡段落
- [ ] /tone 改變語氣

### 品質標準 ✅
- [ ] 單元測試覆蓋率 > 80%
- [ ] E2E 測試通過
- [ ] Lint 無錯誤
- [ ] Build 成功
- [ ] 無 console.log
- [ ] 無硬編碼值
- [ ] 遵循 immutability 原則

### 文檔 ✅
- [ ] 功能文檔完整
- [ ] API 文檔完整
- [ ] README 更新
- [ ] 快捷鍵文檔

### 性能 ✅
- [ ] AI 補全回應時間 < 2s
- [ ] 知識庫搜尋回應時間 < 500ms
- [ ] 無明顯 UI lag
- [ ] Production build 優化

---

## 風險與緩解

| 風險 | 影響 | 緩解措施 |
|------|------|---------|
| AI API 限流 | 高 | 實現請求去抖動 (debounce 500ms) |
| Ghost Text 性能問題 | 中 | 使用 ProseMirror 裝飾器，避免 DOM 操作 |
| 知識庫搜尋慢 | 中 | 實現結果快取，限制搜尋範圍 |
| TipTap Extension 衝突 | 低 | 仔細測試 Extension 順序與互動 |

---

## 後續優化（未來 Phase）

1. **智慧引用自動摘要**: 插入引用時自動附加文件摘要
2. **多語言支援**: 支援英文、日文等其他語言
3. **自訂 Slash Commands**: 允許使用者新增自訂指令
4. **協作編輯**: 多人即時協作
5. **版本控制**: 文件版本歷史與回滾
