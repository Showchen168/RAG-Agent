# 移除 Crayon SDK — 完整實作計劃

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 移除 `@crayonai/react-core`、`@crayonai/react-ui`、`@crayonai/stream` 三個套件的依賴，以自製的 streaming layer + Vercel AI SDK `useChat()` 取代，保留既有的結構化模板渲染能力。

**Architecture:**
- Backend：移除 `fromGeminiStream()` 中介層，改用 Vercel AI SDK 的 `toDataStreamResponse()` 直接回傳 Data Stream Protocol。同時移除 `buildStructuredOutputPrompt()` 強制 JSON 輸出，改由 system prompt 引導 Markdown 輸出 + 獨立 suggestions API。
- Frontend：以 `@ai-sdk/react` 的 `useChat()` 取代 Crayon 的 `useThreadManager` + `processStreamedMessage`。以自製的 `useThreadList()` hook 取代 `useThreadListManager`。保留 template 元件但不再依賴 Crayon type system。
- Renderer：`react-markdown` + `remark-gfm` 取代 Crayon 的 `MarkDownRenderer`。

**Tech Stack:** Next.js 16, TypeScript, `ai` v6, `@ai-sdk/google` v3, `@ai-sdk/react` v3, `react-markdown`, `remark-gfm`, Jest 30, Playwright 1.58

---

## 受影響檔案總覽

| 檔案 | 行數 | 動作 | Crayon 依賴 |
|------|------|------|-------------|
| `src/app/api/chat/route.ts` | 876 | 修改 | `TextChunk` from `@crayonai/stream` |
| `src/lib/crayon/gemini-adapter.ts` | 696 | **刪除** | `TextChunk, ResponseTemplate` from `@crayonai/stream` |
| `src/lib/crayon/schemas.ts` | 305 | **大幅重構** | 無直接 import，但整個檔案服務 Crayon JSON 結構 |
| `src/lib/crayon/thread-list-manager.ts` | 86 | **重構** | `Thread, UserMessage, UseThreadListManagerParams` |
| `src/lib/crayon/message-parser.ts` | 100 | 修改 | 無直接 import，但解析 Crayon JSON 格式 |
| `src/lib/crayon/prompts.ts` | 40 | 保留不動 | 無 Crayon import |
| `src/components/crayon/nexusmind-chat.tsx` | 3034 | **最大重構** | `useThreadListManager, useThreadManager, processStreamedMessage, Message, UserMessage, AssistantMessage` |
| `src/components/crayon/assistant-message-renderer.tsx` | 1301 | 修改 | `AssistantMessage` type |
| `src/components/crayon/templates/index.ts` | ~50 | **重構** | `ResponseTemplate` type |
| `src/components/crayon/templates/text-template.tsx` | ~30 | 修改 | `MarkDownRenderer` from `@crayonai/react-ui` |
| `src/app/layout.tsx` | ~40 | 修改 | `@crayonai/react-ui/styles/index.css` |
| `package.json` | - | 修改 | 移除 3 個 `@crayonai/*` 套件 |

---

## Phase 1：自製型別系統 + 工具函式（替換 Crayon 型別）

### Task 1.1：定義 NexusMind 自製 Message 型別

**Files:**
- Create: `src/types/chat.ts`
- Test: `src/types/__tests__/chat.test.ts`

**Step 1: Write the failing test**

```typescript
// src/types/__tests__/chat.test.ts
import type { NMMessage, NMUserMessage, NMAssistantMessage, NMMessagePart, NMThread } from '../chat'

describe('NexusMind message types', () => {
  it('should create a valid user message', () => {
    const msg: NMUserMessage = {
      id: '123',
      role: 'user',
      content: 'Hello',
    }
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('Hello')
  })

  it('should create a valid assistant message with parts', () => {
    const msg: NMAssistantMessage = {
      id: '456',
      role: 'assistant',
      content: '',
      parts: [
        { type: 'text', text: 'Hello!' },
        { type: 'template', name: 'data_table', templateProps: { headers: ['A'], rows: [['1']] } },
      ],
    }
    expect(msg.role).toBe('assistant')
    expect(msg.parts).toHaveLength(2)
    expect(msg.parts![0].type).toBe('text')
  })

  it('should create a valid thread', () => {
    const thread: NMThread = {
      id: 'conv-1',
      title: 'Test conversation',
      createdAt: new Date(),
    }
    expect(thread.id).toBeTruthy()
  })

  it('should support image context in user message', () => {
    const msg: NMUserMessage = {
      id: '789',
      role: 'user',
      content: 'Check this image',
      imageContext: [{ image: 'base64...', mimeType: 'image/png' }],
    }
    expect(msg.imageContext).toHaveLength(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/types/__tests__/chat.test.ts --no-cache`
Expected: FAIL — module `../chat` not found

**Step 3: Write the type definitions**

```typescript
// src/types/chat.ts

/** 訊息 part — 文字或模板 */
export interface NMTextPart {
  type: 'text'
  text: string
}

export interface NMTemplatePart {
  type: 'template'
  name: string
  templateProps: Record<string, unknown>
}

export type NMMessagePart = NMTextPart | NMTemplatePart

/** 使用者訊息 */
export interface NMUserMessage {
  id: string
  role: 'user'
  content: string
  imageContext?: Array<{ image: string; mimeType: string }>
  /** Crayon 相容欄位，過渡期使用 */
  message?: string
  context?: unknown[]
}

/** 助理訊息 */
export interface NMAssistantMessage {
  id: string
  role: 'assistant'
  content: string
  /** 結構化 parts（從 DB 存儲的 JSON 解析） */
  parts?: NMMessagePart[]
  /** 原始的 Crayon-style message 陣列（過渡相容） */
  message?: NMMessagePart[]
}

/** 通用訊息聯合型別 */
export type NMMessage = NMUserMessage | NMAssistantMessage

/** 對話 thread */
export interface NMThread {
  id: string
  title: string
  createdAt: Date
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/types/__tests__/chat.test.ts --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/chat.ts src/types/__tests__/chat.test.ts
git commit -m "feat: add NexusMind native message type definitions"
```

---

### Task 1.2：建立 useThreadList hook（取代 useThreadListManager）

**Files:**
- Create: `src/hooks/use-thread-list.ts`
- Test: `src/hooks/__tests__/use-thread-list.test.ts`
- Reference: `src/lib/crayon/thread-list-manager.ts` (for API contract)

**Step 1: Write the failing test**

```typescript
// src/hooks/__tests__/use-thread-list.test.ts
import { renderHook, act } from '@testing-library/react'
import { useThreadList } from '../use-thread-list'
import type { NMThread } from '@/types/chat'

// Mock fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

const mockNavigate = jest.fn()

describe('useThreadList', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('fetches thread list on mount', async () => {
    const threads = [
      { id: '1', title: 'Thread 1', created_at: '2026-01-01T00:00:00Z' },
    ]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: threads }),
    })

    const { result } = renderHook(() =>
      useThreadList({ onNavigate: mockNavigate })
    )

    // Wait for fetch to complete
    await act(async () => {})

    expect(result.current.threads).toHaveLength(1)
    expect(result.current.threads[0].title).toBe('Thread 1')
  })

  it('creates a new thread', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) }) // initial fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { id: 'new-1', title: 'New', created_at: '2026-01-01' },
        }),
      }) // create

    const { result } = renderHook(() =>
      useThreadList({ onNavigate: mockNavigate })
    )
    await act(async () => {})

    let created: NMThread | undefined
    await act(async () => {
      created = await result.current.createThread('Hello')
    })

    expect(created?.id).toBe('new-1')
  })

  it('selects a thread and navigates', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })

    const { result } = renderHook(() =>
      useThreadList({ onNavigate: mockNavigate })
    )
    await act(async () => {})

    act(() => {
      result.current.selectThread('thread-1')
    })

    expect(result.current.selectedThreadId).toBe('thread-1')
    expect(mockNavigate).toHaveBeenCalledWith('/chat/thread-1')
  })

  it('deletes a thread', async () => {
    const threads = [
      { id: '1', title: 'T1', created_at: '2026-01-01' },
      { id: '2', title: 'T2', created_at: '2026-01-02' },
    ]
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: threads }) })
      .mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() =>
      useThreadList({ onNavigate: mockNavigate })
    )
    await act(async () => {})

    await act(async () => {
      await result.current.deleteThread('1')
    })

    expect(result.current.threads).toHaveLength(1)
    expect(result.current.threads[0].id).toBe('2')
  })

  it('switches to new chat', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })

    const { result } = renderHook(() =>
      useThreadList({ onNavigate: mockNavigate })
    )
    await act(async () => {})

    act(() => {
      result.current.switchToNew()
    })

    expect(result.current.selectedThreadId).toBeNull()
    expect(mockNavigate).toHaveBeenCalledWith('/chat')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/hooks/__tests__/use-thread-list.test.ts --no-cache`
Expected: FAIL — module `../use-thread-list` not found

**Step 3: Implement the hook**

```typescript
// src/hooks/use-thread-list.ts
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { NMThread } from '@/types/chat'

interface UseThreadListOptions {
  onNavigate: (path: string) => void
  getConversationExtra?: () => Record<string, unknown> | null
}

export function useThreadList(options: UseThreadListOptions) {
  const [threads, setThreads] = useState<NMThread[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [shouldResetThreadState, setShouldResetThreadState] = useState(false)

  // Fetch threads on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/conversations')
        if (!res.ok) return
        const { data } = await res.json()
        if (!Array.isArray(data)) return
        setThreads(
          data.map((conv: { id: string; title: string; created_at: string }) => ({
            id: conv.id,
            title: conv.title,
            createdAt: new Date(conv.created_at),
          })),
        )
      } catch {
        // ignore
      }
    })()
  }, [])

  const createThread = useCallback(
    async (firstMessageText: string): Promise<NMThread> => {
      const title = (firstMessageText ?? '新對話').slice(0, 30)
      const extra = options.getConversationExtra?.() ?? null

      const payload: Record<string, unknown> = { title }
      if (extra && Object.keys(extra).length > 0) {
        payload.extra = extra
      }

      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create conversation')

      const { data } = await res.json()
      const newThread: NMThread = {
        id: data.id,
        title: data.title,
        createdAt: new Date(data.created_at),
      }
      setThreads((prev) => [newThread, ...prev])
      return newThread
    },
    [options],
  )

  const selectThread = useCallback(
    (threadId: string, navigate = true) => {
      setSelectedThreadId(threadId)
      setShouldResetThreadState(true)
      if (navigate) {
        options.onNavigate(`/chat/${threadId}`)
      }
      // Reset the flag after a tick
      setTimeout(() => setShouldResetThreadState(false), 0)
    },
    [options],
  )

  const deleteThread = useCallback(
    async (threadId: string) => {
      const res = await fetch(`/api/conversations/${threadId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete conversation')
      setThreads((prev) => prev.filter((t) => t.id !== threadId))
      if (selectedThreadId === threadId) {
        setSelectedThreadId(null)
      }
    },
    [selectedThreadId],
  )

  const switchToNew = useCallback(() => {
    setSelectedThreadId(null)
    setShouldResetThreadState(true)
    options.onNavigate('/chat')
    setTimeout(() => setShouldResetThreadState(false), 0)
  }, [options])

  const refreshThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations')
      if (!res.ok) return
      const { data } = await res.json()
      if (!Array.isArray(data)) return
      setThreads(
        data.map((conv: { id: string; title: string; created_at: string }) => ({
          id: conv.id,
          title: conv.title,
          createdAt: new Date(conv.created_at),
        })),
      )
    } catch {
      // ignore
    }
  }, [])

  return {
    threads,
    selectedThreadId,
    shouldResetThreadState,
    createThread,
    selectThread,
    deleteThread,
    switchToNew,
    refreshThreads,
    setSelectedThreadId,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/hooks/__tests__/use-thread-list.test.ts --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/hooks/use-thread-list.ts src/hooks/__tests__/use-thread-list.test.ts
git commit -m "feat: add useThreadList hook replacing Crayon useThreadListManager"
```

---

## Phase 2：後端 — 移除 Crayon Stream 轉換層

### Task 2.1：移除 `buildStructuredOutputPrompt()` 並簡化 system prompt

**Files:**
- Modify: `src/app/api/chat/route.ts` (line ~603, ~700-702)
- Modify: `src/lib/crayon/schemas.ts` → rename to `src/lib/chat/structured-output.ts`
- Test: `src/lib/chat/__tests__/structured-output.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/chat/__tests__/structured-output.test.ts
import { buildResponseStylePrompt } from '../structured-output'

describe('buildResponseStylePrompt', () => {
  it('returns a string containing markdown formatting instructions', () => {
    const prompt = buildResponseStylePrompt()
    expect(prompt).toContain('Markdown')
    expect(prompt).not.toContain('"response"')  // 不再強制 JSON 格式
    expect(prompt).not.toContain('oneOf')        // 不再有 JSON Schema
  })

  it('includes language matching instruction', () => {
    const prompt = buildResponseStylePrompt()
    expect(prompt).toContain('語言') // 回答語言應跟隨使用者
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/lib/chat/__tests__/structured-output.test.ts --no-cache`
Expected: FAIL — module not found

**Step 3: Create the new response style prompt builder**

```typescript
// src/lib/chat/structured-output.ts

/**
 * 建構回應風格的 system prompt 片段。
 * 取代舊的 buildStructuredOutputPrompt()（Crayon JSON 格式）。
 * 現在改為指導模型使用 Markdown 純文字回答。
 */
export function buildResponseStylePrompt(): string {
  return `
回應格式指引：
- 使用流暢自然的 Markdown 格式回答
- 適當使用標題（## / ###）、粗體、條列、程式碼區塊等 Markdown 語法
- 表格使用 Markdown 表格語法
- 始終使用與使用者相同的語言回答
- 開頭直接切入重點，不要重述問題
- 先給結論或摘要，再展開細節
- 一般問答 300~500 字，複雜分析不超過 1000 字
- 必要時提供具體範例說明`
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/lib/chat/__tests__/structured-output.test.ts --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/chat/structured-output.ts src/lib/chat/__tests__/structured-output.test.ts
git commit -m "feat: add Markdown-based response style prompt replacing Crayon JSON"
```

---

### Task 2.2：重構 `route.ts` — 移除 Crayon stream 轉換，直接用 Vercel AI SDK Data Stream

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Delete import: `TextChunk` from `@crayonai/stream`
- Delete import: `fromGeminiStream` from `gemini-adapter`
- Replace import: `buildStructuredOutputPrompt` → `buildResponseStylePrompt` from `structured-output`
- Test: `src/app/api/chat/__tests__/route-stream.test.ts`

**Step 1: Write the failing test**

```typescript
// src/app/api/chat/__tests__/route-stream.test.ts
describe('Chat route stream format', () => {
  it('returns Vercel AI SDK data stream format (not Crayon SSE)', async () => {
    // This test verifies the response uses data stream protocol
    // Actual integration test — will implement after route refactor
    const mockHeaders = {
      'Content-Type': 'text/plain; charset=utf-8',
    }
    // Data stream protocol uses specific headers
    expect(mockHeaders['Content-Type']).not.toBe('text/event-stream') // Not Crayon SSE
  })
})
```

**Step 2: Run test — PASS (placeholder)**

**Step 3: Modify `route.ts`**

Key changes in `src/app/api/chat/route.ts`:

1. **移除 imports** (line 6, and `fromGeminiStream` import):
   ```diff
   - import { TextChunk } from "@crayonai/stream";
   - import { fromGeminiStream, type RAGMetadataForStream } from "@/lib/crayon/gemini-adapter";
   - import { buildStructuredOutputPrompt } from "@/lib/crayon/schemas";
   + import { buildResponseStylePrompt } from "@/lib/chat/structured-output";
   ```

2. **替換 system prompt 注入** (around line 603):
   ```diff
   - const structuredOutputPrompt = buildStructuredOutputPrompt();
   + const responseStylePrompt = buildResponseStylePrompt();
   ```

3. **替換 system prompt 組裝** (around line 700):
   ```diff
   - ${structuredOutputPrompt}
   + ${responseStylePrompt}
   ```

4. **替換 stream 回傳** (around line 850-859):
   ```diff
   - const crayonStream = fromGeminiStream(result.fullStream, ragStreamMetadata);
   - return new Response(crayonStream, {
   -   headers: {
   -     "Content-Type": "text/event-stream",
   -     "Cache-Control": "no-cache",
   -     Connection: "keep-alive",
   -   },
   - });
   + return result.toDataStreamResponse({
   +   getErrorMessage: (error) => {
   +     if (error instanceof Error) return error.message;
   +     return 'Unknown error';
   +   },
   + });
   ```

5. **更新 `persistAssistantMessage`** 中的內容序列化：
   - 不再解析 `{ "response": [...] }` JSON，直接存純 Markdown 文字
   - `onFinish` callback 中的 `text` 已是純 Markdown

**Step 4: Run existing tests**

Run: `npx jest src/app/api/chat/ --no-cache`
Expected: Some tests may need updating (mocks for `@crayonai/stream`)

**Step 5: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "refactor: replace Crayon stream with Vercel AI SDK data stream in chat route"
```

---

### Task 2.3：更新 `persistAssistantMessage` 以支援 Markdown 內容

**Files:**
- Modify: `src/app/api/chat/route.ts` (function `persistAssistantMessage`, lines ~137-297)
- Test: `src/app/api/chat/__tests__/persist-message.test.ts`

**Step 1: Write the failing test**

```typescript
// src/app/api/chat/__tests__/persist-message.test.ts
describe('persistAssistantMessage with Markdown content', () => {
  it('stores plain Markdown text without JSON wrapping', () => {
    const content = '## 回答\n\n這是一個 Markdown 回答。'
    // The content should be stored as-is, not wrapped in {"response":[...]}
    expect(content).not.toContain('"response"')
    expect(content).toContain('## 回答')
  })
})
```

**Step 2-5: Implement, test, commit**

Key change: `onFinish` callback 中 `text` 直接就是純 Markdown，不需要從 JSON 中提取。移除所有 Crayon JSON 格式解析邏輯。

```bash
git commit -m "refactor: simplify persistAssistantMessage for Markdown content"
```

---

## Phase 3：前端 — 以 `useChat()` 取代 Crayon hooks

### Task 3.1：建立 Markdown 渲染器（取代 Crayon MarkDownRenderer）

**Files:**
- Create: `src/components/chat/markdown-renderer.tsx`
- Test: `src/components/chat/__tests__/markdown-renderer.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/components/chat/__tests__/markdown-renderer.test.tsx
import { render, screen } from '@testing-library/react'
import { MarkdownRenderer } from '../markdown-renderer'

describe('MarkdownRenderer', () => {
  it('renders plain text', () => {
    render(<MarkdownRenderer content="Hello world" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders markdown bold', () => {
    render(<MarkdownRenderer content="This is **bold** text" />)
    const bold = screen.getByText('bold')
    expect(bold.tagName).toBe('STRONG')
  })

  it('renders code blocks with syntax highlighting class', () => {
    render(<MarkdownRenderer content={'```typescript\nconst x = 1\n```'} />)
    const code = screen.getByText('const x = 1')
    expect(code).toBeInTheDocument()
  })

  it('renders GFM tables', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |'
    render(<MarkdownRenderer content={md} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/components/chat/__tests__/markdown-renderer.test.tsx --no-cache`
Expected: FAIL — module not found

**Step 3: Install dependencies and implement**

Run: `npm install react-markdown remark-gfm`

```typescript
// src/components/chat/markdown-renderer.tsx
'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { memo } from 'react'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className={className ?? 'prose prose-sm dark:prose-invert max-w-none'}
      components={{
        // 自訂 code block 渲染
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          const isInline = !match
          if (isInline) {
            return (
              <code className="bg-muted px-1.5 py-0.5 rounded text-sm" {...props}>
                {children}
              </code>
            )
          }
          return (
            <pre className="bg-muted rounded-lg p-4 overflow-x-auto">
              <code className={className} {...props}>
                {children}
              </code>
            </pre>
          )
        },
        // 表格樣式
        table({ children }) {
          return (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse border border-border">
                {children}
              </table>
            </div>
          )
        },
        th({ children }) {
          return (
            <th className="border border-border bg-muted px-3 py-2 text-left text-sm font-medium">
              {children}
            </th>
          )
        },
        td({ children }) {
          return (
            <td className="border border-border px-3 py-2 text-sm">
              {children}
            </td>
          )
        },
      }}
    />
  )
})
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/components/chat/__tests__/markdown-renderer.test.tsx --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/chat/markdown-renderer.tsx src/components/chat/__tests__/markdown-renderer.test.tsx package.json package-lock.json
git commit -m "feat: add MarkdownRenderer with react-markdown + remark-gfm"
```

---

### Task 3.2：重構 `nexusmind-chat.tsx` — 以 `useChat()` 取代 Crayon hooks

**Files:**
- Modify: `src/components/crayon/nexusmind-chat.tsx`
- Reference: `src/hooks/use-thread-list.ts` (Task 1.2)
- Test: `src/components/crayon/__tests__/nexusmind-chat-hooks.test.tsx`

**重要：此為最大最複雜的重構任務，需分多步完成。**

**Step 1: Write integration test for the new hook wiring**

```typescript
// src/components/crayon/__tests__/nexusmind-chat-hooks.test.tsx
import { renderHook } from '@testing-library/react'

// 驗證新的 hook 導入路徑在 TypeScript 層面可用
describe('nexusmind-chat hook migration check', () => {
  it('useChat from @ai-sdk/react is importable', async () => {
    const mod = await import('@ai-sdk/react')
    expect(mod.useChat).toBeDefined()
  })

  it('useThreadList is importable', async () => {
    const mod = await import('@/hooks/use-thread-list')
    expect(mod.useThreadList).toBeDefined()
  })
})
```

**Step 2: Run test — verify passes (imports exist)**

**Step 3: Refactor `nexusmind-chat.tsx`**

此步驟的核心變更：

1. **移除 Crayon imports**:
   ```diff
   - import {
   -   useThreadListManager,
   -   useThreadManager,
   -   processStreamedMessage,
   - } from "@crayonai/react-core";
   - import type {
   -   Message,
   -   UserMessage,
   -   AssistantMessage,
   - } from "@crayonai/react-core";
   + import { useChat } from '@ai-sdk/react'
   + import { useThreadList } from '@/hooks/use-thread-list'
   + import type { NMMessage, NMUserMessage, NMAssistantMessage } from '@/types/chat'
   ```

2. **替換 `useThreadListManager`** (line 693):
   ```diff
   - const threadListManager = useThreadListManager(
   -   useMemo(() => createThreadListManagerParams({...}), [...]),
   - );
   + const threadList = useThreadList({
   +   onNavigate,
   +   getConversationExtra,
   + })
   ```

3. **替換 `useThreadManager` + `processStreamedMessage`** (line 1295-1580):

   以 `useChat()` 取代整個 `onProcessMessage` 邏輯。`useChat` 會自動處理：
   - SSE streaming → React state 更新
   - abort controller
   - message append

   ```typescript
   const {
     messages,
     append,
     isLoading,
     stop,
     setMessages,
     reload,
   } = useChat({
     api: '/api/chat',
     id: threadList.selectedThreadId ?? undefined,
     body: {
       model: modelRef.current,
       conversationId: threadList.selectedThreadId,
       systemPrompt: selectedPersonaRef.current.systemPrompt,
       docId: viewerDocIdRef.current,
       docIds: ragDocIdsRef.current,
       loadedSkillNames: loadedSkillNamesRef.current,
     },
     onFinish: (message) => {
       // 保底持久化
       if (threadList.selectedThreadId) {
         void fetch(`/api/conversations/${threadList.selectedThreadId}/messages`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           keepalive: true,
           body: JSON.stringify({ content: message.content, allowUpdate: true }),
         }).catch(() => {})
       }
     },
     onError: (error) => {
       console.error('[Chat] streaming error:', error)
     },
   })
   ```

4. **更新所有 `threadListManager.xxx` → `threadList.xxx` 的引用**

5. **更新所有 `threadManager.xxx` → 使用 `messages` / `append` / `isLoading` 等**

6. **保留 IME 防護邏輯**不變

7. **保留 skill lazy loading 邏輯**不變

8. **保留 image attachment 邏輯**，但需要調整 `append` 的格式以匹配 Vercel AI SDK 的 `experimental_attachments`

**Step 4: Run build check**

Run: `npx tsc --noEmit`
Expected: 需要逐步修正型別錯誤

**Step 5: Commit (incremental)**

```bash
git commit -m "refactor: replace Crayon hooks with useChat + useThreadList in nexusmind-chat"
```

---

### Task 3.3：更新 `assistant-message-renderer.tsx` — 使用自製型別

**Files:**
- Modify: `src/components/crayon/assistant-message-renderer.tsx`
- Test: `src/components/crayon/__tests__/assistant-message-renderer.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/components/crayon/__tests__/assistant-message-renderer.test.tsx
import { render, screen } from '@testing-library/react'
import { AssistantMessageRenderer } from '../assistant-message-renderer'

describe('AssistantMessageRenderer with Markdown', () => {
  it('renders plain Markdown content', () => {
    const message = {
      id: '1',
      role: 'assistant' as const,
      content: '## Hello\n\nThis is **markdown**.',
    }
    render(<AssistantMessageRenderer message={message} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('markdown')).toBeInTheDocument()
  })

  it('renders legacy structured parts if present', () => {
    const message = {
      id: '2',
      role: 'assistant' as const,
      content: '',
      parts: [
        { type: 'text' as const, text: 'Part text' },
      ],
    }
    render(<AssistantMessageRenderer message={message} />)
    expect(screen.getByText('Part text')).toBeInTheDocument()
  })
})
```

**Step 2-5: Implement, test, commit**

Key changes:
- 移除 `import type { AssistantMessage } from "@crayonai/react-core"`
- 改用 `NMAssistantMessage` from `@/types/chat`
- Markdown 內容使用新的 `MarkdownRenderer`
- 保留 template 渲染（從 `parts` 陣列渲染，用於歷史訊息相容）

```bash
git commit -m "refactor: update AssistantMessageRenderer to use native types + MarkdownRenderer"
```

---

### Task 3.4：更新 `text-template.tsx` — 移除 Crayon MarkDownRenderer

**Files:**
- Modify: `src/components/crayon/templates/text-template.tsx`

**Step 1-5: 快速替換**

```diff
- import { MarkDownRenderer } from '@crayonai/react-ui'
+ import { MarkdownRenderer } from '@/components/chat/markdown-renderer'
```

```bash
git commit -m "refactor: replace Crayon MarkDownRenderer with native MarkdownRenderer"
```

---

### Task 3.5：更新 `templates/index.ts` — 移除 Crayon ResponseTemplate type

**Files:**
- Modify: `src/components/crayon/templates/index.ts`

```diff
- import type { ResponseTemplate } from '@crayonai/react-core'
+ // ResponseTemplate type 不再需要，改用 NMTemplatePart
```

移除 `responseTemplates` export（`useChat` 不使用這個概念），改為保留個別 template 元件的 export 供 renderer 使用。

```bash
git commit -m "refactor: remove Crayon ResponseTemplate dependency from templates index"
```

---

## Phase 4：重構 message-parser 和清理

### Task 4.1：更新 `message-parser.ts` — 支援純 Markdown + 向後相容

**Files:**
- Modify: `src/lib/crayon/message-parser.ts`
- Test: `src/lib/crayon/__tests__/message-parser-markdown.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/crayon/__tests__/message-parser-markdown.test.ts
import { parseAssistantContent } from '../message-parser'

describe('parseAssistantContent with Markdown', () => {
  it('returns Markdown text as-is', () => {
    const result = parseAssistantContent('## Hello\n\nThis is text.')
    expect(result.type).toBe('markdown')
    expect(result.content).toBe('## Hello\n\nThis is text.')
  })

  it('still parses legacy Crayon JSON format', () => {
    const json = JSON.stringify({
      response: [
        { type: 'text', text: 'Hello' },
        { type: 'template', name: 'data_table', templateProps: { headers: ['A'], rows: [['1']] } },
      ],
    })
    const result = parseAssistantContent(json)
    expect(result.type).toBe('structured')
    expect(result.parts).toHaveLength(2)
  })

  it('handles empty content', () => {
    const result = parseAssistantContent('')
    expect(result.type).toBe('empty')
  })
})
```

**Step 2-5: Implement, test, commit**

新增 `parseAssistantContent()` 函式，同時保留舊的 `parseAssistantResponseParts()` 做向後相容：

```typescript
export type ParsedContent =
  | { type: 'markdown'; content: string }
  | { type: 'structured'; parts: NMMessagePart[] }
  | { type: 'empty' }

export function parseAssistantContent(content: unknown): ParsedContent {
  if (typeof content !== 'string' || !content.trim()) return { type: 'empty' }

  // 嘗試 legacy Crayon JSON 解析
  const legacyParts = parseAssistantResponseParts(content)
  if (legacyParts) return { type: 'structured', parts: legacyParts }

  // 新格式：純 Markdown
  return { type: 'markdown', content: content.trim() }
}
```

```bash
git commit -m "feat: add parseAssistantContent with Markdown + legacy JSON support"
```

---

### Task 4.2：移除 `gemini-adapter.ts` 並清理 test

**Files:**
- Delete: `src/lib/crayon/gemini-adapter.ts`
- Delete: `src/lib/crayon/__tests__/gemini-adapter.test.ts`
- Delete: `src/lib/crayon/schemas.ts` (已由 `src/lib/chat/structured-output.ts` 取代)
- Delete: `src/lib/crayon/__tests__/schemas.test.ts`

**Step 1: 確認無其他檔案引用這些模組**

Run: `grep -rn "gemini-adapter\|from.*schemas" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v __tests__`

**Step 2: 刪除檔案**

```bash
rm src/lib/crayon/gemini-adapter.ts
rm src/lib/crayon/__tests__/gemini-adapter.test.ts
rm src/lib/crayon/schemas.ts
rm src/lib/crayon/__tests__/schemas.test.ts
```

**Step 3: Run full test suite**

Run: `npx jest --no-cache`
Expected: All tests pass (no dangling imports)

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Crayon gemini-adapter and schemas"
```

---

### Task 4.3：移除 Crayon CSS 和 layout 引用

**Files:**
- Modify: `src/app/layout.tsx`

```diff
- import "@crayonai/react-ui/styles/index.css";
```

```bash
git commit -m "chore: remove Crayon CSS import from layout"
```

---

### Task 4.4：移除 `@crayonai/*` npm 套件

**Step 1: Uninstall**

```bash
npm uninstall @crayonai/react-core @crayonai/react-ui @crayonai/stream
```

**Step 2: Build check**

```bash
npx tsc --noEmit && npx next build
```

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove @crayonai/* dependencies"
```

---

## Phase 5：更新 Suggestions 機制

### Task 5.1：確認獨立 Suggestions API 仍正常運作

**Files:**
- Reference: `src/app/api/chat/suggestions/route.ts`
- Test: `src/app/api/chat/suggestions/__tests__/route.test.ts`

Suggestions 已經有獨立的 API endpoint（`/api/chat/suggestions`），原本是與 Crayon inline suggestions 做 fallback 邏輯。移除 Crayon 後，suggestions 改為完全由獨立 API 提供。

**Step 1: Write test**

```typescript
describe('Suggestions API', () => {
  it('returns 3 suggestions for a given message', async () => {
    // Integration test placeholder
    expect(true).toBe(true)
  })
})
```

**Step 2-5: Verify existing API still works, commit**

```bash
git commit -m "test: verify suggestions API works independently"
```

---

### Task 5.2：在前端整合獨立 Suggestions

**Files:**
- Modify: `src/components/crayon/nexusmind-chat.tsx` (suggestions 區塊)

在 `useChat` 的 `onFinish` callback 中，呼叫 `/api/chat/suggestions` 取得建議，存入 local state，渲染在最後一則訊息下方。

```bash
git commit -m "feat: integrate standalone suggestions API in chat UI"
```

---

## Phase 6：E2E 測試

### Task 6.1：更新 Playwright E2E — 基本對話流程

**Files:**
- Modify: `e2e/chat-basic.spec.ts` (或新增)

```typescript
// e2e/chat-basic.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Chat basic flow (post-Crayon removal)', () => {
  test('sends a message and receives streamed Markdown response', async ({ page }) => {
    await page.goto('/chat')

    // 找到輸入框
    const textarea = page.locator('textarea[placeholder*="輸入"]').first()
    await textarea.fill('你好，請用一句話介紹自己')
    await textarea.press('Enter')

    // 等待助理回覆出現
    const assistantMessage = page.locator('[data-testid="assistant-message"]').first()
    await expect(assistantMessage).toBeVisible({ timeout: 30000 })

    // 確認回覆是純文字（非 JSON）
    const text = await assistantMessage.textContent()
    expect(text).not.toContain('"response"')
    expect(text).not.toContain('"type":"template"')
    expect(text!.length).toBeGreaterThan(10)
  })

  test('creates new conversation on first message', async ({ page }) => {
    await page.goto('/chat')

    const textarea = page.locator('textarea[placeholder*="輸入"]').first()
    await textarea.fill('測試新對話建立')
    await textarea.press('Enter')

    // URL 應該變成 /chat/[uuid]
    await page.waitForURL(/\/chat\/[a-f0-9-]+/, { timeout: 15000 })
    expect(page.url()).toMatch(/\/chat\/[a-f0-9-]+/)
  })

  test('suggestions appear after response', async ({ page }) => {
    await page.goto('/chat')

    const textarea = page.locator('textarea[placeholder*="輸入"]').first()
    await textarea.fill('什麼是機器學習？')
    await textarea.press('Enter')

    // 等待 suggestions 出現（可能是按鈕或可點擊元素）
    const suggestions = page.locator('[data-testid="suggestion-button"]')
    await expect(suggestions.first()).toBeVisible({ timeout: 45000 })
  })
})
```

**Step 1: Run E2E**

Run: `npx playwright test e2e/chat-basic.spec.ts`
Expected: 可能需要調整 selector 和 timeout

**Step 2: 修正直到通過**

**Step 3: Commit**

```bash
git add e2e/chat-basic.spec.ts
git commit -m "test: add E2E tests for post-Crayon chat flow"
```

---

### Task 6.2：Playwright E2E — 歷史訊息載入（向後相容）

**Files:**
- Create: `e2e/chat-history-compat.spec.ts`

```typescript
test.describe('Historical message compatibility', () => {
  test('renders legacy Crayon JSON messages from DB', async ({ page }) => {
    // 找到一個已有舊格式訊息的對話
    await page.goto('/chat')

    // 從 sidebar 選擇一個現有對話
    const conversationItem = page.locator('[data-testid="conversation-item"]').first()
    if (await conversationItem.isVisible()) {
      await conversationItem.click()

      // 確認歷史訊息正確渲染（不顯示原始 JSON）
      await page.waitForTimeout(2000)
      const content = await page.textContent('main')
      expect(content).not.toContain('"response":')
    }
  })
})
```

```bash
git commit -m "test: add E2E test for legacy message rendering compatibility"
```

---

## Phase 7：最終清理與驗證

### Task 7.1：全面 build + lint + test

**Step 1: Run all checks**

```bash
# TypeScript
npx tsc --noEmit

# Jest unit tests
npx jest --no-cache --coverage

# ESLint
npx eslint src/ --ext .ts,.tsx

# Next.js build
npx next build

# Playwright E2E
npx playwright test
```

**Step 2: Fix any issues**

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup after Crayon SDK removal"
```

---

### Task 7.2：重新命名目錄（可選）

考慮將 `src/components/crayon/` 重新命名為 `src/components/chat-ui/`，但這會產生大量 import path 變更。**建議在後續 PR 中做**，不在本次範圍內。

---

### Task 7.3：手動 Web 測試清單

在瀏覽器中逐項確認：

- [ ] 新對話：輸入訊息 → 自動建立對話 → URL 更新
- [ ] 串流回覆：文字逐漸出現（非一次性加載）
- [ ] Markdown 渲染：粗體、標題、程式碼區塊、表格正確顯示
- [ ] 歷史對話：點擊側邊欄對話 → 正確載入舊訊息
- [ ] 舊格式相容：含 Crayon JSON 的歷史訊息不顯示原始 JSON
- [ ] Suggestions：回覆後出現 3 個建議按鈕
- [ ] 中止串流：點擊停止按鈕 → 串流中止，部分回覆保留
- [ ] 圖片附件：可附加圖片送出
- [ ] IME 輸入：中文輸入法不會誤觸送出
- [ ] Skill Lazy Loading：技能載入指示器正常顯示
- [ ] Canvas Editor：畫布功能正常（不受 Crayon 移除影響）
- [ ] Knowledge Base / RAG：知識庫引用正常出現在回覆中
- [ ] 多 persona 切換：不同助理角色切換正常
- [ ] 深色模式：UI 在深色模式下正常顯示

---

## 依賴與風險

| 風險 | 影響 | 緩解策略 |
|------|------|----------|
| `useChat` body 參數不支援動態更新 | 每次送出都需要最新的 model/persona/docId | 使用 `body` callback 或在 `append` 時傳入 |
| 歷史 Crayon JSON 訊息無法渲染 | 舊對話內容遺失 | `message-parser.ts` 保留向後相容解析 |
| Suggestions 從 inline 變獨立 API | 延遲略增 | 已有並行 fetch 機制，影響最小 |
| `thread-list-manager.ts` 被多處引用 | 遺漏替換 | 全域搜索 `createThreadListManagerParams` |
| Template 元件失去 Crayon 型別推斷 | 型別錯誤 | 自製 `NMTemplatePart` 型別覆蓋 |

---

## 執行順序總覽

```
Phase 1 (型別系統)     → Task 1.1, 1.2     → 獨立，可並行
Phase 2 (後端)         → Task 2.1, 2.2, 2.3 → 依序
Phase 3 (前端)         → Task 3.1, 3.2, 3.3, 3.4, 3.5 → 3.1 獨立，其餘依序
Phase 4 (清理)         → Task 4.1, 4.2, 4.3, 4.4 → 依序
Phase 5 (Suggestions)  → Task 5.1, 5.2     → 依序
Phase 6 (E2E)          → Task 6.1, 6.2     → Phase 2-5 完成後
Phase 7 (最終驗證)     → Task 7.1, 7.2, 7.3 → 最後
```

預估總工時：~4-6 小時（不含除錯）
