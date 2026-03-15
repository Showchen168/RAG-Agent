import { render, screen, waitFor } from '@testing-library/react'

const mockRender = jest.fn().mockResolvedValue({ svg: '<svg>mocked diagram</svg>' })

jest.mock('mermaid', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    render: (...args: unknown[]) => mockRender(...args),
  },
}))

import { MermaidBlock } from '../mermaid-block'

describe('MermaidBlock', () => {
  beforeEach(() => {
    mockRender.mockClear()
    mockRender.mockResolvedValue({ svg: '<svg>mocked diagram</svg>' })
  })

  it('renders a container for the mermaid diagram', () => {
    const { container } = render(<MermaidBlock code="graph TD\nA-->B" />)
    expect(container.querySelector('[data-testid="mermaid-block"]')).toBeInTheDocument()
  })

  it('shows fallback code block when mermaid syntax is invalid', async () => {
    mockRender.mockRejectedValueOnce(new Error('Parse error'))

    render(<MermaidBlock code="invalid mermaid" />)

    // Should show the raw code as fallback
    expect(await screen.findByText(/invalid mermaid/)).toBeInTheDocument()
  })

  it('renders SVG output from mermaid', async () => {
    mockRender.mockResolvedValueOnce({
      svg: '<svg class="mermaid-svg"><text>Hello</text></svg>',
    })

    const { container } = render(<MermaidBlock code="graph TD\nA-->B" />)

    await waitFor(() => {
      const block = container.querySelector('[data-testid="mermaid-block"]')
      expect(block?.innerHTML).toContain('mermaid-svg')
    })
  })
})
