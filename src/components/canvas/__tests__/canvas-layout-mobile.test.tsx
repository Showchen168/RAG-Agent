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

import { CanvasLayout } from '../canvas-layout'

describe('CanvasLayout mobile', () => {
  beforeEach(() => {
    mockIsMobile = false
  })

  it('shows both panels on desktop', () => {
    render(<CanvasLayout />)
    expect(screen.getByTestId('knowledge-panel')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-editor')).toBeInTheDocument()
  })

  it('shows only editor on mobile with knowledge drawer button', () => {
    mockIsMobile = true
    render(<CanvasLayout />)
    expect(screen.getByTestId('canvas-editor')).toBeInTheDocument()
    expect(screen.queryByTestId('knowledge-panel')).not.toBeInTheDocument()
    expect(screen.getByText('知識庫')).toBeInTheDocument()
  })

  it('opens knowledge drawer on mobile button click', () => {
    mockIsMobile = true
    render(<CanvasLayout />)
    fireEvent.click(screen.getByText('知識庫'))
    expect(screen.getByTestId('mobile-drawer')).toBeInTheDocument()
    expect(screen.getByTestId('knowledge-panel')).toBeInTheDocument()
  })
})
