# NexusMind 手機適配實施計畫

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 讓 NexusMind 所有頁面在手機（375px+）上舒適使用，抽屜式輔助面板，知識圖譜改卡片列表。

**Architecture:** 逐頁漸進式修復。新增共用 `useIsMobile` hook 和 `<MobileDrawer>` 元件，再逐頁套用。不重構現有元件架構，只添加響應式條件渲染和 Tailwind 斷點類別。

**Tech Stack:** Next.js 16 + TypeScript + Tailwind CSS v4 + Jest 30 + @testing-library/react

---

## Task 1: Viewport Meta Tag

**Files:**
- Modify: `src/app/layout.tsx:1-21`

**Step 1: Write the failing test**

Create `src/app/__tests__/layout-viewport.test.ts`:

```ts
/**
 * layout-viewport.test.ts
 * Verify viewport export exists with correct properties
 */
import { viewport } from '../layout'

describe('RootLayout viewport', () => {
  it('exports viewport with device-width and initial-scale', () => {
    expect(viewport).toBeDefined()
    expect(viewport.width).toBe('device-width')
    expect(viewport.initialScale).toBe(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/app/__tests__/layout-viewport.test.ts --no-cache`
Expected: FAIL — `viewport` is not exported from `../layout`

**Step 3: Write minimal implementation**

In `src/app/layout.tsx`, add after the existing `metadata` export:

```ts
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/app/__tests__/layout-viewport.test.ts --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/__tests__/layout-viewport.test.ts
git commit -m "feat: add viewport meta tag for mobile devices"
```

---

## Task 2: useIsMobile Hook

**Files:**
- Create: `src/hooks/use-is-mobile.ts`
- Create: `src/hooks/__tests__/use-is-mobile.test.ts`

**Step 1: Write the failing test**

Create `src/hooks/__tests__/use-is-mobile.test.ts`:

```ts
/**
 * use-is-mobile.test.ts
 * Tests for useIsMobile hook: matchMedia, resize, SSR safety
 */
import { renderHook, act } from '@testing-library/react'

// Mock matchMedia
function createMatchMedia(matches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = []
  return jest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
      const idx = listeners.indexOf(cb)
      if (idx > -1) listeners.splice(idx, 1)
    },
    _fire: (newMatches: boolean) => listeners.forEach(cb => cb({ matches: newMatches })),
  }))
}

describe('useIsMobile', () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('returns false when screen is >= 768px (desktop)', () => {
    window.matchMedia = createMatchMedia(false)
    const { useIsMobile } = require('../../hooks/use-is-mobile')
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('returns true when screen is < 768px (mobile)', () => {
    window.matchMedia = createMatchMedia(true)
    jest.resetModules()
    const { useIsMobile } = require('../../hooks/use-is-mobile')
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('updates when media query changes', () => {
    const mock = createMatchMedia(false)
    window.matchMedia = mock
    jest.resetModules()
    const { useIsMobile } = require('../../hooks/use-is-mobile')
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    // Simulate resize to mobile
    act(() => {
      const mql = mock.mock.results[0].value
      mql._fire(true)
    })
    expect(result.current).toBe(true)
  })

  it('cleans up listener on unmount', () => {
    const mock = createMatchMedia(false)
    window.matchMedia = mock
    jest.resetModules()
    const { useIsMobile } = require('../../hooks/use-is-mobile')
    const { result, unmount } = renderHook(() => useIsMobile())
    const mql = mock.mock.results[0].value
    unmount()
    // After unmount, firing should not throw
    expect(() => mql._fire(true)).not.toThrow()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/hooks/__tests__/use-is-mobile.test.ts --no-cache`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/hooks/use-is-mobile.ts`:

```ts
'use client'

import { useState, useEffect } from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    setIsMobile(mql.matches)

    const handler = (e: MediaQueryListEvent | { matches: boolean }) => {
      setIsMobile(e.matches)
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isMobile
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/hooks/__tests__/use-is-mobile.test.ts --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/hooks/use-is-mobile.ts src/hooks/__tests__/use-is-mobile.test.ts
git commit -m "feat: add useIsMobile hook for responsive conditional rendering"
```

---

## Task 3: MobileDrawer 元件

**Files:**
- Create: `src/components/ui/mobile-drawer.tsx`
- Create: `src/components/ui/__tests__/mobile-drawer.test.tsx`

**Step 1: Write the failing test**

Create `src/components/ui/__tests__/mobile-drawer.test.tsx`:

```tsx
/**
 * mobile-drawer.test.tsx
 * Tests for MobileDrawer: open/close, side variants, backdrop click
 */
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Will import after implementation
// import { MobileDrawer } from '../mobile-drawer'

describe('MobileDrawer', () => {
  let MobileDrawer: typeof import('../mobile-drawer').MobileDrawer

  beforeAll(() => {
    MobileDrawer = require('../mobile-drawer').MobileDrawer
  })

  it('renders children when open', () => {
    const onClose = jest.fn()
    render(
      <MobileDrawer open={true} onClose={onClose} side="bottom" title="Test">
        <div>Drawer content</div>
      </MobileDrawer>
    )
    expect(screen.getByText('Drawer content')).toBeInTheDocument()
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    const onClose = jest.fn()
    render(
      <MobileDrawer open={false} onClose={onClose} side="bottom" title="Test">
        <div>Hidden content</div>
      </MobileDrawer>
    )
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = jest.fn()
    render(
      <MobileDrawer open={true} onClose={onClose} side="bottom" title="Test">
        <div>Content</div>
      </MobileDrawer>
    )
    // Click backdrop (the overlay element)
    const backdrop = screen.getByTestId('drawer-backdrop')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders bottom variant with correct classes', () => {
    const onClose = jest.fn()
    render(
      <MobileDrawer open={true} onClose={onClose} side="bottom" title="Bottom">
        <div>Bottom content</div>
      </MobileDrawer>
    )
    const panel = screen.getByTestId('drawer-panel')
    expect(panel.className).toContain('bottom-0')
  })

  it('renders right variant with correct classes', () => {
    const onClose = jest.fn()
    render(
      <MobileDrawer open={true} onClose={onClose} side="right" title="Right">
        <div>Right content</div>
      </MobileDrawer>
    )
    const panel = screen.getByTestId('drawer-panel')
    expect(panel.className).toContain('right-0')
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn()
    render(
      <MobileDrawer open={true} onClose={onClose} side="bottom" title="Test">
        <div>Content</div>
      </MobileDrawer>
    )
    const closeBtn = screen.getByLabelText('關閉')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/components/ui/__tests__/mobile-drawer.test.tsx --no-cache`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/components/ui/mobile-drawer.tsx`:

```tsx
'use client'

import { X } from 'lucide-react'

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
  side: 'bottom' | 'right'
  title: string
  children: React.ReactNode
}

export function MobileDrawer({ open, onClose, side, title, children }: MobileDrawerProps) {
  if (!open) return null

  const isBottom = side === 'bottom'

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        data-testid="drawer-backdrop"
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        data-testid="drawer-panel"
        className={`fixed bg-white dark:bg-gray-900 shadow-xl z-50 flex flex-col ${
          isBottom
            ? 'bottom-0 left-0 right-0 max-h-[80vh] rounded-t-2xl'
            : 'right-0 top-0 bottom-0 w-[85vw] max-w-sm'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/components/ui/__tests__/mobile-drawer.test.tsx --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ui/mobile-drawer.tsx src/components/ui/__tests__/mobile-drawer.test.tsx
git commit -m "feat: add MobileDrawer component for mobile auxiliary panels"
```

---

## Task 4: ResponsiveLayout 微調

**Files:**
- Modify: `src/components/layout/responsive-layout.tsx`

**Step 1: Write the failing test**

Create `src/components/layout/__tests__/responsive-layout.test.tsx`:

```tsx
/**
 * responsive-layout.test.tsx
 * Tests for ResponsiveLayout: sidebar overlay z-index, body overflow cleanup
 */
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock dependencies
jest.mock('@/components/chat/sidebar', () => ({
  Sidebar: ({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) => (
    <div data-testid="sidebar" data-collapsed={collapsed}>
      <button onClick={onToggleCollapse}>Toggle</button>
    </div>
  ),
}))

jest.mock('@/components/chat/chat-session-context', () => ({
  ChatSessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('ResponsiveLayout', () => {
  let ResponsiveLayout: typeof import('../responsive-layout').ResponsiveLayout

  beforeAll(() => {
    ResponsiveLayout = require('../responsive-layout').ResponsiveLayout
  })

  it('renders hamburger button for mobile header', () => {
    render(
      <ResponsiveLayout>
        <div>Content</div>
      </ResponsiveLayout>
    )
    // The md:hidden header should contain hamburger button
    const header = document.querySelector('header')
    expect(header).toBeInTheDocument()
    expect(header?.className).toContain('md:hidden')
  })

  it('opens mobile sidebar overlay on hamburger click', () => {
    render(
      <ResponsiveLayout>
        <div>Content</div>
      </ResponsiveLayout>
    )
    // Click the hamburger button
    const menuBtn = document.querySelector('header button')
    fireEvent.click(menuBtn!)
    // Sidebar overlay should appear
    const overlay = document.querySelector('.fixed.inset-0.z-40')
    expect(overlay).toBeInTheDocument()
  })

  it('closes mobile sidebar when backdrop is clicked', () => {
    render(
      <ResponsiveLayout>
        <div>Content</div>
      </ResponsiveLayout>
    )
    // Open sidebar
    const menuBtn = document.querySelector('header button')
    fireEvent.click(menuBtn!)
    // Click backdrop
    const backdrop = document.querySelector('.fixed.inset-0.bg-black\\/50')
    fireEvent.click(backdrop!)
    // Overlay should be gone
    const overlay = document.querySelector('.fixed.inset-0.z-40')
    expect(overlay).not.toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails (or passes — this tests existing behavior)**

Run: `npx jest src/components/layout/__tests__/responsive-layout.test.tsx --no-cache`
Expected: PASS (this is a characterization test for existing behavior)

**Step 3: Refactor — add body overflow lock**

In `src/components/layout/responsive-layout.tsx`, add body overflow management:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Menu } from 'lucide-react'
import { Sidebar } from '@/components/chat/sidebar'
import { ChatSessionProvider } from '@/components/chat/chat-session-context'

interface ResponsiveLayoutProps {
  children: React.ReactNode
}

export function ResponsiveLayout({ children }: ResponsiveLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  return (
    <ChatSessionProvider>
      <div className="flex h-screen bg-background">
        {/* Desktop sidebar */}
        <div className={`hidden md:flex flex-col flex-shrink-0 overflow-hidden transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
          <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 w-64 shadow-xl">
              <Sidebar collapsed={false} onToggleCollapse={() => setSidebarOpen(false)} />
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <header className="h-14 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 md:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <Menu className="w-5 h-5 text-foreground" />
            </button>
          </header>
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        </main>
      </div>
    </ChatSessionProvider>
  )
}
```

Key changes:
- Added `useEffect` for body overflow lock/unlock
- Added `backdrop-blur-sm` to overlay
- Added `shadow-xl` to mobile sidebar
- Added `min-h-[44px] min-w-[44px]` to hamburger button for touch target

**Step 4: Run tests to verify they still pass**

Run: `npx jest src/components/layout/__tests__/responsive-layout.test.tsx --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/layout/responsive-layout.tsx src/components/layout/__tests__/responsive-layout.test.tsx
git commit -m "fix: improve mobile sidebar with body scroll lock and touch targets"
```

---

## Task 5: 深度研究頁面手機適配

**Files:**
- Modify: `src/components/research/deep-research-page.tsx`
- Create: `src/components/research/__tests__/deep-research-page.test.tsx`

**Step 1: Write the failing test**

Create `src/components/research/__tests__/deep-research-page.test.tsx`:

```tsx
/**
 * deep-research-page.test.tsx
 * Tests for mobile responsive layout
 */
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock child components
jest.mock('../research-workflow', () => ({
  ResearchWorkflow: ({ onReportReady }: { onReportReady: (r: unknown) => void }) => (
    <div data-testid="research-workflow">Workflow</div>
  ),
}))

jest.mock('../research-report-view', () => ({
  ResearchReportView: (props: Record<string, unknown>) => (
    <div data-testid="research-report-view">Report</div>
  ),
}))

jest.mock('@/hooks/use-deep-research', () => ({
  persistReport: jest.fn(),
}))

// Mock useIsMobile
let mockIsMobile = false
jest.mock('@/hooks/use-is-mobile', () => ({
  useIsMobile: () => mockIsMobile,
}))

jest.mock('@/components/ui/mobile-drawer', () => ({
  MobileDrawer: ({ open, onClose, title, children }: {
    open: boolean; onClose: () => void; title: string; children: React.ReactNode
  }) => open ? (
    <div data-testid="mobile-drawer">
      <span>{title}</span>
      <button onClick={onClose}>Close</button>
      {children}
    </div>
  ) : null,
}))

describe('DeepResearchPage', () => {
  let DeepResearchPage: typeof import('../deep-research-page').DeepResearchPage

  beforeEach(() => {
    jest.resetModules()
    mockIsMobile = false
    DeepResearchPage = require('../deep-research-page').DeepResearchPage
  })

  it('renders two-column grid on desktop', () => {
    render(<DeepResearchPage />)
    expect(screen.getByTestId('research-workflow')).toBeInTheDocument()
    expect(screen.getByTestId('research-report-view')).toBeInTheDocument()
    // Both should be visible simultaneously (grid-cols-2)
    const container = screen.getByTestId('research-workflow').closest('[class*="grid"]')
    expect(container?.className).toContain('md:grid-cols-2')
  })

  it('renders single column on mobile with drawer button', () => {
    mockIsMobile = true
    jest.resetModules()
    DeepResearchPage = require('../deep-research-page').DeepResearchPage
    render(<DeepResearchPage />)
    expect(screen.getByTestId('research-workflow')).toBeInTheDocument()
    // Report should be accessible via drawer, not directly visible in grid
    expect(screen.getByText('查看報告')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/components/research/__tests__/deep-research-page.test.tsx --no-cache`
Expected: FAIL — no `md:grid-cols-2` class, no `查看報告` button

**Step 3: Write implementation**

Modify `src/components/research/deep-research-page.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { FileText } from "lucide-react";
import { ResearchWorkflow } from "./research-workflow";
import { ResearchReportView } from "./research-report-view";
import { persistReport, type ResearchReport } from "@/hooks/use-deep-research";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { MobileDrawer } from "@/components/ui/mobile-drawer";

interface DeepResearchPageProps {
  onSaveToKnowledge?: (report: ResearchReport) => void;
  savingResearch?: boolean;
}

export function DeepResearchPage({
  onSaveToKnowledge,
  savingResearch,
}: DeepResearchPageProps) {
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useIsMobile();

  const handleClearReport = useCallback(() => {
    setReport(null);
    persistReport(null);
  }, []);

  const handleReportReady = useCallback((r: ResearchReport) => {
    setReport(r);
    if (isMobile) setDrawerOpen(true);
  }, [isMobile]);

  if (isMobile) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
        <ResearchWorkflow onReportReady={handleReportReady} />

        {/* Floating button to view report */}
        {report && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-colors min-h-[44px]"
          >
            <FileText className="w-4 h-4" />
            查看報告
          </button>
        )}

        <MobileDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          side="right"
          title="研究報告"
        >
          <ResearchReportView
            report={report}
            onSaveToKnowledge={onSaveToKnowledge}
            savingResearch={savingResearch}
            onClearReport={handleClearReport}
          />
        </MobileDrawer>
      </div>
    );
  }

  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-2 bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
      <div className="border-r border-gray-200 dark:border-gray-700 min-h-0 overflow-hidden">
        <ResearchWorkflow onReportReady={setReport} />
      </div>
      <div className="min-h-0 overflow-hidden">
        <ResearchReportView
          report={report}
          onSaveToKnowledge={onSaveToKnowledge}
          savingResearch={savingResearch}
          onClearReport={handleClearReport}
        />
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/components/research/__tests__/deep-research-page.test.tsx --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/research/deep-research-page.tsx src/components/research/__tests__/deep-research-page.test.tsx
git commit -m "feat: add mobile responsive layout to deep research page"
```

---

## Task 6: Canvas 頁面手機適配

**Files:**
- Modify: `src/components/canvas/canvas-layout.tsx`
- Create: `src/components/canvas/__tests__/canvas-layout-mobile.test.tsx`

**Step 1: Write the failing test**

Create `src/components/canvas/__tests__/canvas-layout-mobile.test.tsx`:

```tsx
/**
 * canvas-layout-mobile.test.tsx
 * Tests for Canvas mobile: tab switching between editor and preview
 */
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

jest.mock('@/stores/mode-store', () => ({
  useModeStore: () => ({
    canvasSettings: { showKnowledgePanel: true, editorWidth: 60 },
  }),
}))

jest.mock('../knowledge-panel', () => ({
  KnowledgePanel: () => <div data-testid="knowledge-panel">KnowledgePanel</div>,
}))

jest.mock('../canvas-editor', () => ({
  CanvasEditor: () => <div data-testid="canvas-editor">CanvasEditor</div>,
}))

let mockIsMobile = false
jest.mock('@/hooks/use-is-mobile', () => ({
  useIsMobile: () => mockIsMobile,
}))

jest.mock('@/components/ui/mobile-drawer', () => ({
  MobileDrawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="mobile-drawer">{children}</div> : null,
}))

describe('CanvasLayout mobile', () => {
  let CanvasLayout: typeof import('../canvas-layout').CanvasLayout

  beforeEach(() => {
    jest.resetModules()
    mockIsMobile = false
    CanvasLayout = require('../canvas-layout').CanvasLayout
  })

  it('shows both panels on desktop', () => {
    render(<CanvasLayout />)
    expect(screen.getByTestId('knowledge-panel')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-editor')).toBeInTheDocument()
  })

  it('shows only editor on mobile with knowledge drawer button', () => {
    mockIsMobile = true
    jest.resetModules()
    CanvasLayout = require('../canvas-layout').CanvasLayout
    render(<CanvasLayout />)
    expect(screen.getByTestId('canvas-editor')).toBeInTheDocument()
    expect(screen.getByText('知識庫')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/components/canvas/__tests__/canvas-layout-mobile.test.tsx --no-cache`
Expected: FAIL

**Step 3: Write implementation**

Modify `src/components/canvas/canvas-layout.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { useModeStore } from '@/stores/mode-store'
import { KnowledgePanel } from './knowledge-panel'
import { CanvasEditor } from './canvas-editor'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { MobileDrawer } from '@/components/ui/mobile-drawer'

export function CanvasLayout() {
  const { canvasSettings } = useModeStore()
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)

  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
        <CanvasEditor />

        {canvasSettings.showKnowledgePanel && (
          <>
            <button
              onClick={() => setDrawerOpen(true)}
              className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-full shadow-lg transition-colors min-h-[44px]"
            >
              <BookOpen className="w-4 h-4" />
              知識庫
            </button>
            <MobileDrawer
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              side="right"
              title="知識庫參考"
            >
              <KnowledgePanel />
            </MobileDrawer>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900">
      {canvasSettings.showKnowledgePanel && (
        <div
          className="border-r border-gray-200 dark:border-gray-700 overflow-auto"
          style={{ width: `${100 - canvasSettings.editorWidth}%` }}
        >
          <KnowledgePanel />
        </div>
      )}
      <div
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

**Step 4: Run test to verify it passes**

Run: `npx jest src/components/canvas/__tests__/canvas-layout-mobile.test.tsx --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/canvas/canvas-layout.tsx src/components/canvas/__tests__/canvas-layout-mobile.test.tsx
git commit -m "feat: add mobile responsive layout to canvas page"
```

---

## Task 7: 圖表工作區手機適配

**Files:**
- Modify: `src/components/diagram/diagram-workspace.tsx`
- Create: `src/components/diagram/__tests__/diagram-workspace-mobile.test.tsx`

**Step 1: Write the failing test**

Create `src/components/diagram/__tests__/diagram-workspace-mobile.test.tsx`:

```tsx
/**
 * diagram-workspace-mobile.test.tsx
 * Tests for Diagram mobile: AI panel moves to drawer
 */
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

jest.mock('@/components/canvas/diagram-editor', () => ({
  DiagramEditor: jest.fn().mockReturnValue(<div data-testid="diagram-editor">Editor</div>),
}))

jest.mock('@/components/canvas/diagram-ai-panel', () => ({
  DiagramAiPanel: () => <div data-testid="diagram-ai-panel">AI Panel</div>,
}))

let mockIsMobile = false
jest.mock('@/hooks/use-is-mobile', () => ({
  useIsMobile: () => mockIsMobile,
}))

jest.mock('@/components/ui/mobile-drawer', () => ({
  MobileDrawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="mobile-drawer">{children}</div> : null,
}))

describe('DiagramWorkspace mobile', () => {
  let DiagramWorkspace: typeof import('../diagram-workspace').DiagramWorkspace

  beforeEach(() => {
    jest.resetModules()
    mockIsMobile = false
    DiagramWorkspace = require('../diagram-workspace').DiagramWorkspace
  })

  it('shows AI panel inline on desktop', () => {
    render(<DiagramWorkspace />)
    expect(screen.getByTestId('diagram-editor')).toBeInTheDocument()
    expect(screen.getByTestId('diagram-ai-panel')).toBeInTheDocument()
  })

  it('hides AI panel on mobile and shows floating button', () => {
    mockIsMobile = true
    jest.resetModules()
    DiagramWorkspace = require('../diagram-workspace').DiagramWorkspace
    render(<DiagramWorkspace />)
    expect(screen.getByTestId('diagram-editor')).toBeInTheDocument()
    expect(screen.queryByTestId('diagram-ai-panel')).not.toBeInTheDocument()
    expect(screen.getByText('AI 助手')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/components/diagram/__tests__/diagram-workspace-mobile.test.tsx --no-cache`
Expected: FAIL

**Step 3: Write implementation**

In `src/components/diagram/diagram-workspace.tsx`, add mobile handling:

At the top of the file, add imports:
```tsx
import { useIsMobile } from "@/hooks/use-is-mobile";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Sparkles } from "lucide-react";
```

Add inside the `DiagramWorkspace` component, after existing state:
```tsx
const isMobile = useIsMobile();
const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
```

Replace the `{/* Main area */}` section (lines 250-263):
```tsx
{/* Main area: DiagramEditor + AI Panel */}
<div className="flex-1 flex overflow-hidden">
  <div className="flex-1">
    <DiagramEditor
      ref={diagramRef}
      onSave={handleSave}
      darkMode={isDark}
    />
  </div>
  {isMobile ? (
    <>
      <button
        onClick={() => setAiDrawerOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-colors min-h-[44px]"
      >
        <Sparkles className="w-4 h-4" />
        AI 助手
      </button>
      <MobileDrawer
        open={aiDrawerOpen}
        onClose={() => setAiDrawerOpen(false)}
        side="right"
        title="AI 圖表助手"
      >
        <DiagramAiPanel
          onApplyXml={handleAiApplyXml}
          onGetCurrentXml={handleGetCurrentXml}
        />
      </MobileDrawer>
    </>
  ) : (
    <DiagramAiPanel
      onApplyXml={handleAiApplyXml}
      onGetCurrentXml={handleGetCurrentXml}
    />
  )}
</div>
```

Also update header buttons for mobile — wrap `lastSaved` text in `hidden md:inline`:
```tsx
{lastSaved && (
  <span className="text-xs text-gray-400 mr-2 hidden md:inline">
    已儲存 {lastSaved}
  </span>
)}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/components/diagram/__tests__/diagram-workspace-mobile.test.tsx --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/diagram/diagram-workspace.tsx src/components/diagram/__tests__/diagram-workspace-mobile.test.tsx
git commit -m "feat: add mobile responsive layout to diagram workspace"
```

---

## Task 8: 設定頁面手機適配

**Files:**
- Modify: `src/app/(protected)/settings/page.tsx`

**Step 1: Write the failing test**

Create `src/app/(protected)/settings/__tests__/settings-mobile.test.tsx`:

```tsx
/**
 * settings-mobile.test.tsx
 * Tests for Settings mobile: tab scrollability, form spacing
 */
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock supabase
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null }),
        }),
      }),
    }),
  }),
}))

jest.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: jest.fn() }),
}))

jest.mock('@/components/settings/telegram-integration', () => ({
  __esModule: true,
  default: () => <div data-testid="telegram-integration">Telegram</div>,
}))

jest.mock('@/components/settings/telegram-bot-config', () => ({
  __esModule: true,
  default: () => <div data-testid="telegram-bot-config">Bot Config</div>,
}))

describe('SettingsPage mobile', () => {
  let SettingsPage: () => JSX.Element

  beforeAll(() => {
    SettingsPage = require('../page').default
  })

  it('renders tabs with overflow-x-auto for mobile scrollability', () => {
    render(<SettingsPage />)
    const tabContainer = screen.getByText('個人設定').closest('[class*="flex"]')
    expect(tabContainer?.className).toContain('overflow-x-auto')
  })

  it('renders page container with responsive padding', () => {
    render(<SettingsPage />)
    const container = screen.getByText('設定').closest('[class*="max-w"]')
    expect(container?.className).toContain('px-4')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/app/\\(protected\\)/settings/__tests__/settings-mobile.test.tsx --no-cache`
Expected: FAIL — no `overflow-x-auto` or `px-4`

**Step 3: Write implementation**

In `src/app/(protected)/settings/page.tsx`, make the following changes:

1. **Container padding** (line ~676): Change `p-6` to `px-4 py-6 md:px-6`
2. **Tab row** (line ~680): Add `overflow-x-auto` to tab flex container
3. **Form grid** (line ~398): Change `grid-cols-2` to `grid-cols-1 md:grid-cols-2`
4. **Modal** (line ~356): Already has `mx-4` — good for mobile

**Step 4: Run test to verify it passes**

Run: `npx jest src/app/\\(protected\\)/settings/__tests__/settings-mobile.test.tsx --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add "src/app/(protected)/settings/page.tsx" "src/app/(protected)/settings/__tests__/settings-mobile.test.tsx"
git commit -m "feat: add mobile responsive improvements to settings page"
```

---

## Task 9: 全站響應式修正掃描

**Files:**
- Multiple files — targeted Tailwind class updates

This task does NOT need TDD — it's pure CSS class adjustments.

**Step 1: Chat interface padding**

In `src/components/chat/chat-interface.tsx`:
- Message bubble padding: add `px-3 md:px-4` where applicable
- Ensure input area is full-width on mobile

**Step 2: Modals/Dialogs**

Search all components for `max-w-2xl` or `max-w-lg` in modals and ensure they also have `w-full mx-4` for mobile.

**Step 3: Tables**

Search for `<table` elements and wrap parent with `overflow-x-auto`.

**Step 4: Run full test suite**

Run: `npx jest --no-cache`
Expected: All tests PASS

**Step 5: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: global responsive CSS adjustments for mobile"
```

---

## Task 10: 知識庫頁面手機適配

**Files:**
- Modify: `src/app/(protected)/knowledge/page.tsx`
- This is the most complex page (73KB). Approach cautiously.

**Step 1: Analyze current structure**

Read the knowledge page to understand the layout sections:
- Knowledge graph (Cytoscape)
- Document list
- Upload area
- Document detail viewer

**Step 2: Write the failing test**

Create `src/app/(protected)/knowledge/__tests__/knowledge-mobile.test.tsx`:

Test that when `useIsMobile()` returns true:
- Cytoscape graph container is NOT rendered
- A card list component IS rendered instead
- Document details open in MobileDrawer

**Step 3: Implement mobile conditional rendering**

Use `useIsMobile()` to:
- Hide the Cytoscape graph div
- Replace with a simple card list showing node names + relationship counts
- Wrap document detail panel in `<MobileDrawer side="bottom">`
- Make upload button full-width

**Step 4: Run tests**

Run: `npx jest --no-cache`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add mobile card list layout to knowledge page"
```

---

## Task 11: 最終驗證

**Step 1: Run full test suite**

Run: `npx jest --no-cache`
Expected: All tests PASS

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Manual verification checklist**

Open Chrome DevTools → Device Toolbar → iPhone SE (375px):
- [ ] All pages load without horizontal scroll
- [ ] Hamburger menu opens/closes correctly
- [ ] Body scroll locks when drawer is open
- [ ] Deep Research: single column + report drawer works
- [ ] Canvas: full-width editor + knowledge drawer works
- [ ] Diagram: full-width editor + AI drawer works
- [ ] Settings: tabs scrollable, form readable
- [ ] Knowledge: card list shows instead of graph
- [ ] Buttons have ≥ 44px touch targets

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: mobile adaptation polish and final adjustments"
```

---

## Execution Order & Dependencies

```
Task 1 (viewport) ─── independent
Task 2 (useIsMobile) ─── independent
Task 3 (MobileDrawer) ─── independent
                          │
Task 4 (ResponsiveLayout) ─── depends on nothing
                          │
Task 5 (Research) ────────┤── depends on Task 2 + 3
Task 6 (Canvas) ──────────┤── depends on Task 2 + 3
Task 7 (Diagram) ─────────┤── depends on Task 2 + 3
Task 8 (Settings) ────────┤── no dependency
                          │
Task 9 (Global CSS) ──────┤── after pages done
Task 10 (Knowledge) ──────┤── depends on Task 2 + 3
                          │
Task 11 (Final verify) ───── after all tasks
```

**Tasks 1-3 可平行執行。Tasks 5-8 可平行執行。**
