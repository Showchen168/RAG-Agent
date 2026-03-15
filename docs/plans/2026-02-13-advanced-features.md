# NexusMind 進階功能實施計劃

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目標:** 將 NexusMind 從「對話式搜尋工具」進化為「智慧生產力平台」,整合四大進階功能:智慧寫作畫布、雙模式切換、動態儀表板生成、網頁擷取代理。

**架構:** 採用模組化設計,每個功能獨立但可互操作。寫作畫布使用 TipTap 編輯器(已在專案中),儀表板基於現有 Chart/Timeline 模板擴展,網頁擷取整合 Supabase 知識庫 API。雙模式切換透過 Zustand 全域狀態管理。

**技術棧:**
- **前端框架:** Next.js 16 (App Router), React 19, TypeScript
- **編輯器:** TipTap (已安裝 @tiptap/react, @tiptap/starter-kit, @tiptap/extension-mention)
- **狀態管理:** Zustand (已安裝)
- **視覺化:** 現有 ChartTemplate 元件 + Recharts (新增)
- **AI 整合:** @crayonai/stream, Vercel AI SDK
- **資料庫:** Supabase (conversations, knowledge, embeddings)
- **測試:** Jest, Playwright

---

## Phase 1: 雙模式切換架構 (Mode Switcher)

### Task 1: 建立模式管理 Store

**目標:** 使用 Zustand 建立全域模式狀態管理 (Chat vs Canvas)

**檔案:**
- Create: `src/stores/mode-store.ts`
- Test: `src/stores/__tests__/mode-store.test.ts`

**Step 1: 寫失敗測試**

```typescript
// src/stores/__tests__/mode-store.test.ts
import { renderHook, act } from '@testing-library/react'
import { useModeStore } from '../mode-store'

describe('useModeStore', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useModeStore())
    act(() => {
      result.current.reset()
    })
  })

  it('should initialize with chat mode', () => {
    const { result } = renderHook(() => useModeStore())
    expect(result.current.mode).toBe('chat')
  })

  it('should toggle to canvas mode', () => {
    const { result } = renderHook(() => useModeStore())
    act(() => {
      result.current.setMode('canvas')
    })
    expect(result.current.mode).toBe('canvas')
  })

  it('should persist canvas settings', () => {
    const { result } = renderHook(() => useModeStore())
    act(() => {
      result.current.setCanvasSettings({
        showKnowledgePanel: true,
        editorWidth: 60
      })
    })
    expect(result.current.canvasSettings.showKnowledgePanel).toBe(true)
    expect(result.current.canvasSettings.editorWidth).toBe(60)
  })
})
```

**Step 2: 執行測試確認失敗**

Run: `npm test -- mode-store.test.ts`
Expected: FAIL with "Cannot find module '../mode-store'"

**Step 3: 實作 Mode Store**

```typescript
// src/stores/mode-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppMode = 'chat' | 'canvas'

interface CanvasSettings {
  showKnowledgePanel: boolean
  editorWidth: number // percentage
  autoComplete: boolean
  smartCitation: boolean
}

interface ModeStore {
  mode: AppMode
  canvasSettings: CanvasSettings
  setMode: (mode: AppMode) => void
  setCanvasSettings: (settings: Partial<CanvasSettings>) => void
  reset: () => void
}

const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  showKnowledgePanel: true,
  editorWidth: 60,
  autoComplete: true,
  smartCitation: true,
}

export const useModeStore = create<ModeStore>()(
  persist(
    (set) => ({
      mode: 'chat',
      canvasSettings: DEFAULT_CANVAS_SETTINGS,
      setMode: (mode) => set({ mode }),
      setCanvasSettings: (settings) =>
        set((state) => ({
          canvasSettings: { ...state.canvasSettings, ...settings },
        })),
      reset: () =>
        set({
          mode: 'chat',
          canvasSettings: DEFAULT_CANVAS_SETTINGS,
        }),
    }),
    {
      name: 'nexusmind-mode-storage',
    }
  )
)
```

**Step 4: 執行測試確認通過**

Run: `npm test -- mode-store.test.ts`
Expected: PASS ✓ (3 tests)

**Step 5: Commit**

```bash
git add src/stores/mode-store.ts src/stores/__tests__/mode-store.test.ts
git commit -m "feat: add mode store for chat/canvas switching"
```

---

### Task 2: 建立模式切換 UI 元件

**目標:** 在頂部導航列建立 Chat ↔ Canvas 切換按鈕

**檔案:**
- Create: `src/components/layout/mode-switcher.tsx`
- Modify: `src/app/(protected)/layout.tsx`
- Test: `src/components/layout/__tests__/mode-switcher.test.tsx`

**Step 1: 寫失敗測試**

```typescript
// src/components/layout/__tests__/mode-switcher.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ModeSwitcher } from '../mode-switcher'
import { useModeStore } from '@/stores/mode-store'

jest.mock('@/stores/mode-store')

describe('ModeSwitcher', () => {
  it('should render chat and canvas buttons', () => {
    ;(useModeStore as unknown as jest.Mock).mockReturnValue({
      mode: 'chat',
      setMode: jest.fn(),
    })

    render(<ModeSwitcher />)
    expect(screen.getByText('對話')).toBeInTheDocument()
    expect(screen.getByText('畫布')).toBeInTheDocument()
  })

  it('should highlight active mode', () => {
    ;(useModeStore as unknown as jest.Mock).mockReturnValue({
      mode: 'canvas',
      setMode: jest.fn(),
    })

    render(<ModeSwitcher />)
    const canvasButton = screen.getByText('畫布').closest('button')
    expect(canvasButton).toHaveClass('bg-blue-50')
  })

  it('should call setMode on button click', () => {
    const setMode = jest.fn()
    ;(useModeStore as unknown as jest.Mock).mockReturnValue({
      mode: 'chat',
      setMode,
    })

    render(<ModeSwitcher />)
    fireEvent.click(screen.getByText('畫布'))
    expect(setMode).toHaveBeenCalledWith('canvas')
  })
})
```

**Step 2: 執行測試確認失敗**

Run: `npm test -- mode-switcher.test.tsx`
Expected: FAIL with "Cannot find module '../mode-switcher'"

**Step 3: 實作模式切換元件**

```typescript
// src/components/layout/mode-switcher.tsx
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
```

**Step 4: 整合到 Layout**

```typescript
// src/app/(protected)/layout.tsx (修改)
import { ModeSwitcher } from '@/components/layout/mode-switcher'

// 在 Sidebar 和 main content 之間插入頂部導航列
<div className="flex-1 flex flex-col overflow-hidden">
  {/* 頂部導航列 */}
  <header className="h-14 border-b border-gray-200 dark:border-gray-700 flex items-center justify-center px-4">
    <ModeSwitcher />
  </header>
  {/* 原本的 children */}
  <main className="flex-1 overflow-auto">
    {children}
  </main>
</div>
```

**Step 5: 執行測試確認通過**

Run: `npm test -- mode-switcher.test.tsx`
Expected: PASS ✓ (3 tests)

**Step 6: Commit**

```bash
git add src/components/layout/mode-switcher.tsx src/components/layout/__tests__/mode-switcher.test.tsx src/app/(protected)/layout.tsx
git commit -m "feat: add mode switcher UI component"
```

---

## Phase 2: 智慧寫作畫布 (AI Copilot Canvas)

### Task 3: 建立 Canvas 佈局元件

**目標:** 建立左右分欄佈局 (左側知識庫參考,右側編輯器)

**檔案:**
- Create: `src/components/canvas/canvas-layout.tsx`
- Create: `src/app/(protected)/canvas/page.tsx`
- Test: `src/components/canvas/__tests__/canvas-layout.test.tsx`

**Step 1: 寫失敗測試**

```typescript
// src/components/canvas/__tests__/canvas-layout.test.tsx
import { render, screen } from '@testing-library/react'
import { CanvasLayout } from '../canvas-layout'

describe('CanvasLayout', () => {
  it('should render knowledge panel and editor', () => {
    render(<CanvasLayout />)
    expect(screen.getByTestId('knowledge-panel')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-editor')).toBeInTheDocument()
  })

  it('should apply correct width ratio', () => {
    render(<CanvasLayout />)
    const editor = screen.getByTestId('canvas-editor')
    // Default width is 60%
    expect(editor.style.width).toMatch(/60%/)
  })
})
```

**Step 2: 執行測試確認失敗**

Run: `npm test -- canvas-layout.test.tsx`
Expected: FAIL

**Step 3: 實作 Canvas Layout**

```typescript
// src/components/canvas/canvas-layout.tsx
'use client'

import { useModeStore } from '@/stores/mode-store'
import { KnowledgePanel } from './knowledge-panel'
import { CanvasEditor } from './canvas-editor'

export function CanvasLayout() {
  const { canvasSettings } = useModeStore()

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900">
      {/* 左側: 知識庫參考面板 */}
      {canvasSettings.showKnowledgePanel && (
        <div
          data-testid="knowledge-panel"
          className="border-r border-gray-200 dark:border-gray-700 overflow-auto"
          style={{ width: `${100 - canvasSettings.editorWidth}%` }}
        >
          <KnowledgePanel />
        </div>
      )}

      {/* 右側: Markdown 編輯器 */}
      <div
        data-testid="canvas-editor"
        className="flex-1 overflow-auto"
        style={{
          width: canvasSettings.showKnowledgePanel
            ? `${canvasSettings.editorWidth}%`
            : '100%',
        }}
      >
        <CanvasEditor />
      </div>
    </div>
  )
}
```

**Step 4: 建立 Canvas Page**

```typescript
// src/app/(protected)/canvas/page.tsx
import { Suspense } from 'react'
import { CanvasLayout } from '@/components/canvas/canvas-layout'
import { Loader2 } from 'lucide-react'

export default function CanvasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="animate-spin text-gray-400" />
        </div>
      }
    >
      <CanvasLayout />
    </Suspense>
  )
}
```

**Step 5: 執行測試確認通過**

Run: `npm test -- canvas-layout.test.tsx`
Expected: PASS ✓ (2 tests)

**Step 6: Commit**

```bash
git add src/components/canvas/canvas-layout.tsx src/app/(protected)/canvas/page.tsx src/components/canvas/__tests__/canvas-layout.test.tsx
git commit -m "feat: add canvas layout with split view"
```

---

### Task 4: 實作知識庫參考面板

**目標:** 顯示相關文件和引用來源,支援點擊引用

**檔案:**
- Create: `src/components/canvas/knowledge-panel.tsx`
- Test: `src/components/canvas/__tests__/knowledge-panel.test.tsx`

**Step 1: 寫失敗測試**

```typescript
// src/components/canvas/__tests__/knowledge-panel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { KnowledgePanel } from '../knowledge-panel'

describe('KnowledgePanel', () => {
  it('should render search input', () => {
    render(<KnowledgePanel />)
    expect(screen.getByPlaceholderText(/搜尋知識庫/i)).toBeInTheDocument()
  })

  it('should display knowledge items', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { id: '1', title: 'Document 1', content: 'Content 1' },
          { id: '2', title: 'Document 2', content: 'Content 2' },
        ],
      }),
    })

    render(<KnowledgePanel />)
    const items = await screen.findAllByTestId('knowledge-item')
    expect(items).toHaveLength(2)
  })

  it('should call onInsertCitation when citation button clicked', async () => {
    const mockInsert = jest.fn()
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ id: '1', title: 'Doc', content: 'Content' }],
      }),
    })

    render(<KnowledgePanel onInsertCitation={mockInsert} />)
    const citationButton = await screen.findByTitle(/引用/i)
    fireEvent.click(citationButton)
    expect(mockInsert).toHaveBeenCalled()
  })
})
```

**Step 2: 執行測試確認失敗**

Run: `npm test -- knowledge-panel.test.tsx`
Expected: FAIL

**Step 3: 實作知識庫面板**

```typescript
// src/components/canvas/knowledge-panel.tsx
'use client'

import { useState, useEffect } from 'react'
import { Search, FileText, Quote } from 'lucide-react'

interface KnowledgeItem {
  id: string
  title: string
  content: string
  source?: string
}

interface KnowledgePanelProps {
  onInsertCitation?: (item: KnowledgeItem) => void
}

export function KnowledgePanel({ onInsertCitation }: KnowledgePanelProps) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      // 載入最近的知識項目
      loadRecentKnowledge()
      return
    }

    const timer = setTimeout(() => {
      searchKnowledge(query)
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  async function loadRecentKnowledge() {
    setLoading(true)
    try {
      const res = await fetch('/api/knowledge?limit=10')
      const data = await res.json()
      setItems(data.results || [])
    } catch (error) {
      console.error('載入知識失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  async function searchKnowledge(q: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setItems(data.results || [])
    } catch (error) {
      console.error('搜尋知識失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 搜尋列 */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋知識庫..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 知識列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && (
          <p className="text-sm text-gray-400 text-center">載入中...</p>
        )}
        {!loading && items.length === 0 && (
          <p className="text-sm text-gray-400 text-center">無相關知識</p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            data-testid="knowledge-item"
            className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors group"
          >
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground mb-1 truncate">
                  {item.title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                  {item.content}
                </p>
              </div>
              {onInsertCitation && (
                <button
                  onClick={() => onInsertCitation(item)}
                  title="引用此文件"
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-opacity"
                >
                  <Quote className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 4: 執行測試確認通過**

Run: `npm test -- knowledge-panel.test.tsx`
Expected: PASS ✓ (3 tests)

**Step 5: Commit**

```bash
git add src/components/canvas/knowledge-panel.tsx src/components/canvas/__tests__/knowledge-panel.test.tsx
git commit -m "feat: add knowledge panel with search and citation"
```

---

### Task 5: 實作 TipTap 編輯器與 Auto-Complete

**目標:** 建立 Markdown 編輯器,支援 AI 自動補全和 @ 引用

**檔案:**
- Create: `src/components/canvas/canvas-editor.tsx`
- Create: `src/components/canvas/editor-extensions.ts`
- Create: `src/app/api/canvas/autocomplete/route.ts`
- Test: `src/components/canvas/__tests__/canvas-editor.test.tsx`

**Step 1: 寫失敗測試**

```typescript
// src/components/canvas/__tests__/canvas-editor.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CanvasEditor } from '../canvas-editor'

describe('CanvasEditor', () => {
  it('should render tiptap editor', () => {
    render(<CanvasEditor />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('should trigger autocomplete on typing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ suggestion: 'AI suggested text' }),
    })

    render(<CanvasEditor />)
    const editor = screen.getByRole('textbox')

    fireEvent.input(editor, { target: { textContent: 'Hello' } })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/canvas/autocomplete'),
        expect.any(Object)
      )
    })
  })

  it('should show mention dropdown on @ character', async () => {
    render(<CanvasEditor />)
    const editor = screen.getByRole('textbox')

    fireEvent.input(editor, { target: { textContent: '@' } })

    await waitFor(() => {
      expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument()
    })
  })
})
```

**Step 2: 執行測試確認失敗**

Run: `npm test -- canvas-editor.test.tsx`
Expected: FAIL

**Step 3: 建立編輯器擴展配置**

```typescript
// src/components/canvas/editor-extensions.ts
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Typography from '@tiptap/extension-typography'
import Link from '@tiptap/extension-link'
import Mention from '@tiptap/extension-mention'
import { ReactRenderer } from '@tiptap/react'
import tippy from 'tippy.js'
import { MentionList } from './mention-list'

export function getEditorExtensions() {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
      code: {
        HTMLAttributes: {
          class: 'bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 text-sm font-mono',
        },
      },
      codeBlock: {
        HTMLAttributes: {
          class: 'bg-gray-100 dark:bg-gray-800 rounded-lg p-4 my-4 font-mono text-sm',
        },
      },
    }),
    Placeholder.configure({
      placeholder: '開始寫作...',
    }),
    Underline,
    Typography,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'text-blue-600 dark:text-blue-400 underline cursor-pointer',
      },
    }),
    Mention.configure({
      HTMLAttributes: {
        class: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1 rounded',
      },
      suggestion: {
        items: async ({ query }) => {
          // 從知識庫搜尋
          const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(query)}`)
          const data = await res.json()
          return data.results || []
        },
        render: () => {
          let component: ReactRenderer
          let popup: any

          return {
            onStart: (props) => {
              component = new ReactRenderer(MentionList, {
                props,
                editor: props.editor,
              })

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              })
            },
            onUpdate(props) {
              component.updateProps(props)
              popup[0].setProps({
                getReferenceClientRect: props.clientRect,
              })
            },
            onKeyDown(props) {
              if (props.event.key === 'Escape') {
                popup[0].hide()
                return true
              }
              return component.ref?.onKeyDown(props)
            },
            onExit() {
              popup[0].destroy()
              component.destroy()
            },
          }
        },
      },
    }),
  ]
}
```

**Step 4: 實作 Mention List 元件**

```typescript
// src/components/canvas/mention-list.tsx
'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { FileText } from 'lucide-react'

interface MentionListProps {
  items: Array<{ id: string; title: string }>
  command: (item: { id: string; label: string }) => void
}

export const MentionList = forwardRef((props: MentionListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    setSelectedIndex(0)
  }, [props.items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev + props.items.length - 1) % props.items.length)
        return true
      }

      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % props.items.length)
        return true
      }

      if (event.key === 'Enter') {
        const item = props.items[selectedIndex]
        if (item) {
          props.command({ id: item.id, label: item.title })
        }
        return true
      }

      return false
    },
  }))

  return (
    <div
      data-testid="mention-dropdown"
      className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2 max-h-64 overflow-y-auto"
    >
      {props.items.length === 0 && (
        <div className="text-sm text-gray-400 px-3 py-2">無相關文件</div>
      )}
      {props.items.map((item, index) => (
        <button
          key={item.id}
          onClick={() => props.command({ id: item.id, label: item.title })}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-left ${
            index === selectedIndex
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'text-foreground hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <FileText className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{item.title}</span>
        </button>
      ))}
    </div>
  )
})

MentionList.displayName = 'MentionList'
```

**Step 5: 實作 Canvas Editor**

```typescript
// src/components/canvas/canvas-editor.tsx
'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { useEffect, useState } from 'use'
import { Sparkles, Bold, Italic, Code, List, ListOrdered, Link as LinkIcon } from 'lucide-react'
import { getEditorExtensions } from './editor-extensions'
import { useModeStore } from '@/stores/mode-store'

export function CanvasEditor() {
  const { canvasSettings } = useModeStore()
  const [autoCompleting, setAutoCompleting] = useState(false)

  const editor = useEditor({
    extensions: getEditorExtensions(),
    content: '',
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert max-w-none focus:outline-none min-h-full p-8',
      },
    },
    onUpdate: ({ editor }) => {
      if (!canvasSettings.autoComplete) return

      // Debounce autocomplete
      const content = editor.getText()
      if (content.length < 10) return

      const timer = setTimeout(() => {
        fetchAutoComplete(content)
      }, 1000)

      return () => clearTimeout(timer)
    },
  })

  async function fetchAutoComplete(content: string) {
    setAutoCompleting(true)
    try {
      const res = await fetch('/api/canvas/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await res.json()

      if (data.suggestion && editor) {
        // 顯示提示 (可用 toast 或 inline suggestion)
        console.log('AI 建議:', data.suggestion)
      }
    } catch (error) {
      console.error('Auto-complete 失敗:', error)
    } finally {
      setAutoCompleting(false)
    }
  }

  if (!editor) return null

  return (
    <div className="flex flex-col h-full">
      {/* 工具列 */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-2 flex items-center gap-1 flex-wrap">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
            editor.isActive('bold') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : ''
          }`}
          title="粗體"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
            editor.isActive('italic') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : ''
          }`}
          title="斜體"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
            editor.isActive('code') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : ''
          }`}
          title="程式碼"
        >
          <Code className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
            editor.isActive('bulletList') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : ''
          }`}
          title="無序列表"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
            editor.isActive('orderedList') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : ''
          }`}
          title="有序列表"
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        {autoCompleting && (
          <div className="ml-auto flex items-center gap-2 text-sm text-gray-500">
            <Sparkles className="w-4 h-4 animate-pulse text-purple-500" />
            <span>AI 建議中...</span>
          </div>
        )}
      </div>

      {/* 編輯器內容 */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
```

**Step 6: 建立 Auto-Complete API**

```typescript
// src/app/api/canvas/autocomplete/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { streamText } from 'ai'
import { getProviderWithOAuth } from '@/lib/ai/providers'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { content } = await req.json()

  if (!content || content.length < 10) {
    return NextResponse.json({ suggestion: '' })
  }

  try {
    // 使用 AI 生成補全建議
    const provider = await getProviderWithOAuth('gemini-flash')
    const result = await streamText({
      model: provider,
      prompt: `你是一個智慧寫作助手。根據以下內容,提供一個簡短的續寫建議(最多 50 字):\n\n${content}`,
      maxTokens: 100,
    })

    let suggestion = ''
    for await (const chunk of result.textStream) {
      suggestion += chunk
    }

    return NextResponse.json({ suggestion: suggestion.trim() })
  } catch (error) {
    console.error('Auto-complete error:', error)
    return NextResponse.json({ suggestion: '' })
  }
}
```

**Step 7: 執行測試確認通過**

Run: `npm test -- canvas-editor.test.tsx`
Expected: PASS ✓ (3 tests)

**Step 8: Commit**

```bash
git add src/components/canvas/ src/app/api/canvas/
git commit -m "feat: add canvas editor with autocomplete and mention"
```

---

## Phase 3: 動態儀表板生成 (Generative Dashboard)

### Task 6: 安裝 Recharts 圖表庫

**目標:** 新增更強大的互動式圖表庫

**Step 1: 安裝依賴**

Run: `npm install recharts`
Expected: 成功安裝

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts for interactive charts"
```

---

### Task 7: 建立儀表板生成 API

**目標:** AI 根據資料生成圖表配置

**檔案:**
- Create: `src/app/api/dashboard/generate/route.ts`
- Test: `src/app/api/dashboard/__tests__/generate.test.ts`

**Step 1: 寫失敗測試**

```typescript
// src/app/api/dashboard/__tests__/generate.test.ts
import { POST } from '../generate/route'

describe('POST /api/dashboard/generate', () => {
  it('should return chart configuration', async () => {
    const req = new Request('http://localhost/api/dashboard/generate', {
      method: 'POST',
      body: JSON.stringify({
        query: '分析 Q1-Q4 營收趨勢',
        data: [
          { quarter: 'Q1', revenue: 100 },
          { quarter: 'Q2', revenue: 150 },
          { quarter: 'Q3', revenue: 130 },
          { quarter: 'Q4', revenue: 180 },
        ],
      }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(data.charts).toHaveLength(1)
    expect(data.charts[0].type).toBe('line')
    expect(data.charts[0].data).toHaveLength(4)
  })

  it('should handle multiple chart types', async () => {
    const req = new Request('http://localhost/api/dashboard/generate', {
      method: 'POST',
      body: JSON.stringify({
        query: '顯示營收趨勢和占比',
        data: [
          { category: 'A', value: 100 },
          { category: 'B', value: 200 },
        ],
      }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(data.charts.length).toBeGreaterThan(1)
  })
})
```

**Step 2: 執行測試確認失敗**

Run: `npm test -- generate.test.ts`
Expected: FAIL

**Step 3: 實作儀表板生成 API**

```typescript
// src/app/api/dashboard/generate/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { getProviderWithOAuth } from '@/lib/ai/providers'
import { z } from 'zod'

const ChartConfigSchema = z.object({
  type: z.enum(['bar', 'line', 'pie', 'area', 'scatter']),
  title: z.string(),
  xAxisKey: z.string().optional(),
  yAxisKey: z.string().optional(),
  data: z.array(z.record(z.any())),
  description: z.string().optional(),
})

const DashboardSchema = z.object({
  charts: z.array(ChartConfigSchema),
  summary: z.string(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { query, data } = await req.json()

  if (!query || !data) {
    return NextResponse.json({ error: 'Missing query or data' }, { status: 400 })
  }

  try {
    const provider = await getProviderWithOAuth('gemini-flash')

    const result = await generateObject({
      model: provider,
      schema: DashboardSchema,
      prompt: `你是一個數據視覺化專家。根據使用者的需求和資料,生成最合適的圖表配置。

使用者需求: ${query}

資料:
${JSON.stringify(data, null, 2)}

請分析資料特性,選擇最合適的圖表類型(bar/line/pie/area/scatter),並生成完整的圖表配置。如果需要,可以生成多個圖表來完整呈現資料洞察。`,
    })

    return NextResponse.json(result.object)
  } catch (error) {
    console.error('Dashboard generation error:', error)
    return NextResponse.json({ error: 'Failed to generate dashboard' }, { status: 500 })
  }
}
```

**Step 4: 執行測試確認通過**

Run: `npm test -- generate.test.ts`
Expected: PASS ✓ (2 tests)

**Step 5: Commit**

```bash
git add src/app/api/dashboard/
git commit -m "feat: add dashboard generation API with AI"
```

---

### Task 8: 建立互動式儀表板元件

**目標:** 使用 Recharts 渲染 AI 生成的圖表

**檔案:**
- Create: `src/components/dashboard/dynamic-chart.tsx`
- Create: `src/components/dashboard/dashboard-renderer.tsx`
- Test: `src/components/dashboard/__tests__/dynamic-chart.test.tsx`

**Step 1: 寫失敗測試**

```typescript
// src/components/dashboard/__tests__/dynamic-chart.test.tsx
import { render, screen } from '@testing-library/react'
import { DynamicChart } from '../dynamic-chart'

describe('DynamicChart', () => {
  it('should render bar chart', () => {
    const config = {
      type: 'bar' as const,
      title: 'Revenue',
      xAxisKey: 'quarter',
      yAxisKey: 'value',
      data: [
        { quarter: 'Q1', value: 100 },
        { quarter: 'Q2', value: 150 },
      ],
    }

    render(<DynamicChart config={config} />)
    expect(screen.getByText('Revenue')).toBeInTheDocument()
  })

  it('should render line chart', () => {
    const config = {
      type: 'line' as const,
      title: 'Trend',
      data: [{ x: 1, y: 10 }, { x: 2, y: 20 }],
    }

    render(<DynamicChart config={config} />)
    expect(screen.getByText('Trend')).toBeInTheDocument()
  })
})
```

**Step 2: 執行測試確認失敗**

Run: `npm test -- dynamic-chart.test.tsx`
Expected: FAIL

**Step 3: 實作 Dynamic Chart**

```typescript
// src/components/dashboard/dynamic-chart.tsx
'use client'

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { BarChart3 } from 'lucide-react'

interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'area' | 'scatter'
  title: string
  xAxisKey?: string
  yAxisKey?: string
  data: Record<string, any>[]
  description?: string
}

const COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#14b8a6',
]

export function DynamicChart({ config }: { config: ChartConfig }) {
  const renderChart = () => {
    switch (config.type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={config.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.xAxisKey || 'name'} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey={config.yAxisKey || 'value'} fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        )

      case 'line':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={config.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.xAxisKey || 'name'} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey={config.yAxisKey || 'value'}
                stroke="#8b5cf6"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        )

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={config.data}
                dataKey={config.yAxisKey || 'value'}
                nameKey={config.xAxisKey || 'name'}
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {config.data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={config.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.xAxisKey || 'name'} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey={config.yAxisKey || 'value'}
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        )

      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.xAxisKey || 'x'} />
              <YAxis dataKey={config.yAxisKey || 'y'} />
              <Tooltip />
              <Legend />
              <Scatter data={config.data} fill="#ec4899" />
            </ScatterChart>
          </ResponsiveContainer>
        )

      default:
        return <div>Unsupported chart type</div>
    }
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <BarChart3 size={16} className="text-blue-500" />
        <span className="font-semibold text-sm text-foreground">{config.title}</span>
      </div>
      <div className="p-4">
        {renderChart()}
        {config.description && (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{config.description}</p>
        )}
      </div>
    </div>
  )
}
```

**Step 4: 實作 Dashboard Renderer**

```typescript
// src/components/dashboard/dashboard-renderer.tsx
'use client'

import { DynamicChart } from './dynamic-chart'

interface DashboardConfig {
  charts: Array<{
    type: 'bar' | 'line' | 'pie' | 'area' | 'scatter'
    title: string
    xAxisKey?: string
    yAxisKey?: string
    data: Record<string, any>[]
    description?: string
  }>
  summary: string
}

export function DashboardRenderer({ config }: { config: DashboardConfig }) {
  return (
    <div className="space-y-6">
      {/* 摘要 */}
      {config.summary && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            資料洞察
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300">{config.summary}</p>
        </div>
      )}

      {/* 圖表網格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {config.charts.map((chart, index) => (
          <DynamicChart key={index} config={chart} />
        ))}
      </div>
    </div>
  )
}
```

**Step 5: 執行測試確認通過**

Run: `npm test -- dynamic-chart.test.tsx`
Expected: PASS ✓ (2 tests)

**Step 6: Commit**

```bash
git add src/components/dashboard/
git commit -m "feat: add dynamic chart and dashboard renderer"
```

---

## Phase 4: 網頁擷取代理 (Web Research Agent)

### Task 9: 建立網頁內容擷取 API

**目標:** 輸入 URL,自動提取正文並儲存到知識庫

**檔案:**
- Create: `src/app/api/web-capture/route.ts`
- Create: `src/lib/web-scraper.ts`
- Test: `src/app/api/web-capture/__tests__/route.test.ts`

**Step 1: 安裝依賴**

Run: `npm install cheerio node-html-parser`
Expected: 成功安裝

**Step 2: 寫失敗測試**

```typescript
// src/app/api/web-capture/__tests__/route.test.ts
import { POST } from '../route'

describe('POST /api/web-capture', () => {
  it('should extract web content', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><body><article>Test content</article></body></html>',
    })

    const req = new Request('http://localhost/api/web-capture', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/article' }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(data.knowledgeId).toBeDefined()
  })

  it('should reject invalid URLs', async () => {
    const req = new Request('http://localhost/api/web-capture', {
      method: 'POST',
      body: JSON.stringify({ url: 'not-a-url' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

**Step 3: 執行測試確認失敗**

Run: `npm test -- route.test.ts`
Expected: FAIL

**Step 4: 實作 Web Scraper**

```typescript
// src/lib/web-scraper.ts
import { parse } from 'node-html-parser'

interface ScrapedContent {
  title: string
  content: string
  url: string
  publishDate?: string
}

export async function scrapeWebPage(url: string): Promise<ScrapedContent> {
  // 驗證 URL
  try {
    new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }

  // 抓取網頁
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NexusMind/1.0; +https://nexusmind.app)',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`)
  }

  const html = await response.text()
  const root = parse(html)

  // 提取標題
  let title = root.querySelector('title')?.text || ''
  const ogTitle = root.querySelector('meta[property="og:title"]')?.getAttribute('content')
  if (ogTitle) title = ogTitle

  // 提取主要內容
  let content = ''

  // 優先順序: article > main > body
  const article = root.querySelector('article')
  const main = root.querySelector('main')
  const body = root.querySelector('body')

  const contentRoot = article || main || body

  if (contentRoot) {
    // 移除 script, style, nav, footer
    contentRoot.querySelectorAll('script, style, nav, footer, aside, .ad, .advertisement').forEach((el) => {
      el.remove()
    })

    // 提取文字
    content = contentRoot.text
      .replace(/\s+/g, ' ')
      .trim()
  }

  // 提取發布日期
  let publishDate: string | undefined
  const timeElement = root.querySelector('time')
  if (timeElement) {
    publishDate = timeElement.getAttribute('datetime') || timeElement.text
  }

  return {
    title: title.trim(),
    content: content.slice(0, 50000), // 限制 50k 字元
    url,
    publishDate,
  }
}
```

**Step 5: 實作 Web Capture API**

```typescript
// src/app/api/web-capture/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scrapeWebPage } from '@/lib/web-scraper'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { url } = await req.json()

  if (!url) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 })
  }

  try {
    // 擷取網頁內容
    const scraped = await scrapeWebPage(url)

    // 儲存到知識庫
    const { data: knowledge, error: insertError } = await supabase
      .from('knowledge')
      .insert({
        user_id: user.id,
        title: scraped.title,
        content: scraped.content,
        source: scraped.url,
        type: 'web',
        metadata: {
          publish_date: scraped.publishDate,
          captured_at: new Date().toISOString(),
        },
      })
      .select()
      .single()

    if (insertError) throw insertError

    // 生成 embedding (觸發知識庫 API)
    await fetch(`${req.headers.get('origin')}/api/knowledge/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledgeId: knowledge.id }),
    })

    return NextResponse.json({
      success: true,
      knowledgeId: knowledge.id,
      title: scraped.title,
    })
  } catch (error: any) {
    console.error('Web capture error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to capture web page' },
      { status: 500 }
    )
  }
}
```

**Step 6: 執行測試確認通過**

Run: `npm test -- route.test.ts`
Expected: PASS ✓ (2 tests)

**Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/web-scraper.ts src/app/api/web-capture/
git commit -m "feat: add web page scraper and capture API"
```

---

### Task 10: 建立網頁擷取 UI

**目標:** 在知識庫頁面新增「網頁剪藏」功能

**檔案:**
- Create: `src/components/knowledge/web-capture-dialog.tsx`
- Modify: `src/app/(protected)/knowledge/page.tsx`
- Test: `src/components/knowledge/__tests__/web-capture-dialog.test.tsx`

**Step 1: 寫失敗測試**

```typescript
// src/components/knowledge/__tests__/web-capture-dialog.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WebCaptureDialog } from '../web-capture-dialog'

describe('WebCaptureDialog', () => {
  it('should render trigger button', () => {
    render(<WebCaptureDialog />)
    expect(screen.getByText(/網頁剪藏/i)).toBeInTheDocument()
  })

  it('should open dialog on button click', () => {
    render(<WebCaptureDialog />)
    fireEvent.click(screen.getByText(/網頁剪藏/i))
    expect(screen.getByPlaceholderText(/輸入網址/i)).toBeInTheDocument()
  })

  it('should submit URL and show success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, title: 'Test Article' }),
    })

    render(<WebCaptureDialog />)
    fireEvent.click(screen.getByText(/網頁剪藏/i))

    const input = screen.getByPlaceholderText(/輸入網址/i)
    fireEvent.change(input, { target: { value: 'https://example.com' } })

    const submitButton = screen.getByText(/開始擷取/i)
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/成功剪藏/i)).toBeInTheDocument()
    })
  })
})
```

**Step 2: 執行測試確認失敗**

Run: `npm test -- web-capture-dialog.test.tsx`
Expected: FAIL

**Step 3: 實作 Web Capture Dialog**

```typescript
// src/components/knowledge/web-capture-dialog.tsx
'use client'

import { useState } from 'react'
import { Globe, Loader2, Check, X } from 'lucide-react'

export function WebCaptureDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/web-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      const data = await res.json()

      if (res.ok) {
        setResult({
          success: true,
          message: `成功剪藏「${data.title}」`,
        })
        setUrl('')
        // 3 秒後關閉
        setTimeout(() => {
          setIsOpen(false)
          setResult(null)
        }, 3000)
      } else {
        setResult({
          success: false,
          message: data.error || '擷取失敗',
        })
      }
    } catch (error) {
      setResult({
        success: false,
        message: '網路錯誤',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* 觸發按鈕 */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <Globe className="w-4 h-4" />
        <span>網頁剪藏</span>
      </button>

      {/* 對話框 */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">網頁剪藏</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  網址
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {result && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg ${
                    result.success
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                  }`}
                >
                  {result.success ? (
                    <Check className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <X className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span className="text-sm">{result.message}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !url}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>擷取中...</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4" />
                    <span>開始擷取</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
```

**Step 4: 整合到知識庫頁面**

```typescript
// src/app/(protected)/knowledge/page.tsx (在上傳按鈕旁新增)
import { WebCaptureDialog } from '@/components/knowledge/web-capture-dialog'

// 在上傳按鈕旁加入
<div className="flex items-center gap-3">
  <WebCaptureDialog />
  {/* 原本的上傳按鈕 */}
</div>
```

**Step 5: 執行測試確認通過**

Run: `npm test -- web-capture-dialog.test.tsx`
Expected: PASS ✓ (3 tests)

**Step 6: Commit**

```bash
git add src/components/knowledge/web-capture-dialog.tsx src/app/(protected)/knowledge/page.tsx src/components/knowledge/__tests__/web-capture-dialog.test.tsx
git commit -m "feat: add web capture dialog to knowledge page"
```

---

## Phase 5: 整合與路由調整

### Task 11: 動態路由切換

**目標:** 根據模式自動切換 /chat 和 /canvas 路由

**檔案:**
- Modify: `src/app/(protected)/layout.tsx`
- Create: `src/components/layout/mode-aware-layout.tsx`

**Step 1: 實作 Mode-Aware Layout**

```typescript
// src/components/layout/mode-aware-layout.tsx
'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useModeStore } from '@/stores/mode-store'

export function ModeAwareLayout({ children }: { children: React.ReactNode }) {
  const { mode } = useModeStore()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // 當模式切換時,導向對應路由
    if (mode === 'chat' && pathname === '/canvas') {
      router.push('/chat')
    } else if (mode === 'canvas' && pathname.startsWith('/chat')) {
      router.push('/canvas')
    }
  }, [mode, pathname, router])

  return <>{children}</>
}
```

**Step 2: 整合到 Layout**

```typescript
// src/app/(protected)/layout.tsx
import { ModeAwareLayout } from '@/components/layout/mode-aware-layout'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModeAwareLayout>
      {/* 原本的 layout 內容 */}
    </ModeAwareLayout>
  )
}
```

**Step 3: Commit**

```bash
git add src/components/layout/mode-aware-layout.tsx src/app/(protected)/layout.tsx
git commit -m "feat: add mode-aware routing"
```

---

## Phase 6: E2E 測試

### Task 12: Playwright E2E 測試

**目標:** 測試完整的使用者流程

**檔案:**
- Create: `tests/e2e/canvas-mode.spec.ts`
- Create: `tests/e2e/web-capture.spec.ts`
- Create: `tests/e2e/dashboard-generation.spec.ts`

**Step 1: 寫 Canvas Mode E2E 測試**

```typescript
// tests/e2e/canvas-mode.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Canvas Mode', () => {
  test('should switch to canvas mode and show editor', async ({ page }) => {
    await page.goto('http://localhost:3000/chat')
    await page.click('button:has-text("畫布")')

    await expect(page).toHaveURL('/canvas')
    await expect(page.locator('[data-testid="canvas-editor"]')).toBeVisible()
  })

  test('should insert citation from knowledge panel', async ({ page }) => {
    await page.goto('http://localhost:3000/canvas')

    // 點擊引用按鈕
    await page.click('[title="引用此文件"]')

    // 驗證編輯器中出現引用
    const editorContent = await page.locator('.ProseMirror').textContent()
    expect(editorContent).toContain('@')
  })
})
```

**Step 2: 寫 Web Capture E2E 測試**

```typescript
// tests/e2e/web-capture.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Web Capture', () => {
  test('should capture web page to knowledge base', async ({ page }) => {
    await page.goto('http://localhost:3000/knowledge')

    await page.click('button:has-text("網頁剪藏")')
    await page.fill('input[type="url"]', 'https://example.com')
    await page.click('button:has-text("開始擷取")')

    await expect(page.locator('text=成功剪藏')).toBeVisible({ timeout: 10000 })
  })
})
```

**Step 3: 寫 Dashboard E2E 測試**

```typescript
// tests/e2e/dashboard-generation.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Dashboard Generation', () => {
  test('should generate dashboard from query', async ({ page }) => {
    await page.goto('http://localhost:3000/chat')

    await page.fill('textarea', '分析這份資料的營收趨勢: Q1=100, Q2=150, Q3=130, Q4=180')
    await page.click('button[type="submit"]')

    // 等待 AI 回應並生成圖表
    await expect(page.locator('text=營收趨勢')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('[class*="recharts"]')).toBeVisible()
  })
})
```

**Step 4: 執行 E2E 測試**

Run: `npx playwright test --project=chromium`
Expected: PASS ✓ (所有測試)

**Step 5: Commit**

```bash
git add tests/e2e/
git commit -m "test: add e2e tests for advanced features"
```

---

## 驗證清單

### 功能驗證
- [ ] 模式切換按鈕正常運作
- [ ] Canvas 佈局正確顯示左右分欄
- [ ] 知識庫面板可搜尋並引用
- [ ] TipTap 編輯器工具列正常
- [ ] @ 符號觸發引用下拉選單
- [ ] Auto-complete 在輸入時觸發
- [ ] 儀表板 API 正確生成圖表配置
- [ ] Recharts 圖表正確渲染
- [ ] 網頁擷取 API 正常運作
- [ ] 網頁剪藏對話框正常開啟/關閉

### 測試驗證
- [ ] `npm test` 全部通過
- [ ] `npm run test:coverage` > 80%
- [ ] `npx playwright test` 全部通過

### 建置驗證
- [ ] `npm run build` 成功無錯誤
- [ ] `npm run lint` 無錯誤

---

## 風險與注意事項

**風險 1: TipTap 效能問題**
- **描述:** 大型文件可能造成編輯器卡頓
- **緩解:** 實作虛擬滾動或分頁載入

**風險 2: Web Scraping 被封鎖**
- **描述:** 部分網站可能阻擋爬蟲
- **緩解:** 提供 Chrome Extension 作為替代方案

**風險 3: AI 生成圖表配置不準確**
- **描述:** AI 可能選擇不適合的圖表類型
- **緩解:** 允許使用者手動調整圖表類型

**風險 4: Canvas 和 Chat 模式狀態衝突**
- **描述:** 切換模式時可能丟失未儲存內容
- **緩解:** 實作自動儲存草稿功能

---

## 後續優化

1. **Chrome Extension** - 一鍵剪藏當前網頁
2. **協作編輯** - 多人即時共編 Canvas
3. **版本控制** - Canvas 文件版本歷史
4. **匯出功能** - 匯出為 PDF/Word/Markdown
5. **模板系統** - 預設寫作模板(報告/論文/簡報)

---

**計劃完成並儲存至** `docs/plans/2026-02-13-advanced-features.md`

**兩種執行選項:**

**1. Subagent-Driven (本次對話)** - 我在本次對話中逐任務派發新代理,每個任務完成後進行代碼審查,快速迭代

**2. Parallel Session (獨立對話)** - 開啟新對話使用 executing-plans 技能,批次執行所有任務並設置檢查點

**選擇哪種方式?**
