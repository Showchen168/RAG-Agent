import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

const mockDiagramEditor = jest.fn().mockReturnValue(<div data-testid="diagram-editor">Editor</div>)
jest.mock('@/components/canvas/diagram-editor', () => ({
  DiagramEditor: mockDiagramEditor,
}))

jest.mock('@/components/canvas/diagram-ai-panel', () => ({
  DiagramAiPanel: () => <div data-testid="diagram-ai-panel">AI Panel</div>,
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

import { DiagramWorkspace } from '../diagram-workspace'

describe('DiagramWorkspace mobile', () => {
  beforeEach(() => {
    mockIsMobile = false
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })
  })

  it('shows AI panel inline on desktop', () => {
    render(<DiagramWorkspace />)
    expect(screen.getByTestId('diagram-editor')).toBeInTheDocument()
    expect(screen.getByTestId('diagram-ai-panel')).toBeInTheDocument()
  })

  it('hides AI panel on mobile and shows floating button', () => {
    mockIsMobile = true
    render(<DiagramWorkspace />)
    expect(screen.getByTestId('diagram-editor')).toBeInTheDocument()
    expect(screen.queryByTestId('diagram-ai-panel')).not.toBeInTheDocument()
    expect(screen.getByText('AI 助手')).toBeInTheDocument()
  })

  it('opens AI drawer on mobile button click', () => {
    mockIsMobile = true
    render(<DiagramWorkspace />)
    fireEvent.click(screen.getByText('AI 助手'))
    expect(screen.getByTestId('mobile-drawer')).toBeInTheDocument()
    expect(screen.getByTestId('diagram-ai-panel')).toBeInTheDocument()
  })
})
