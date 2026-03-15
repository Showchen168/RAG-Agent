import { render, screen } from '@testing-library/react'
import React from 'react'

jest.mock('next/dynamic', () => {
  return function mockDynamic(loader: () => Promise<any>) {
    // 同步載入 mock 的 MermaidBlock
    const MockMermaidBlock = ({ code }: { code: string }) => (
      <div data-testid="mermaid-block">{code}</div>
    )
    MockMermaidBlock.displayName = 'DynamicMermaidBlock'
    return MockMermaidBlock
  }
})

import { MarkdownRenderer } from '../markdown-renderer'

// 直接取得 MarkdownRenderer 傳給 ReactMarkdown 的 components
// 因為 react-markdown 被 mock 了，無法測完整流程
// 改為單獨測 code/pre 元件邏輯
function getCodeComponent() {
  let capturedComponents: Record<string, any> = {}

  // 暫時替換 mock 來捕獲 components prop
  const origMock = jest.requireMock('react-markdown').default
  const spy = jest.fn(({ components, children }: any) => {
    capturedComponents = components || {}
    return origMock({ children })
  })
  jest.spyOn(require('react-markdown'), 'default').mockImplementation(spy)

  render(<MarkdownRenderer content="test" />)

  // 還原
  spy.mockRestore()

  return capturedComponents
}

describe('MarkdownRenderer', () => {
  it('renders plain text', () => {
    render(<MarkdownRenderer content="Hello world" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders markdown content with wrapper', () => {
    const { container } = render(<MarkdownRenderer content="This is **bold** text" />)
    const wrapper = container.querySelector('[data-testid="markdown-renderer"]')
    expect(wrapper).toBeInTheDocument()
    expect(wrapper?.textContent).toContain('bold')
  })

  it('renders code blocks', () => {
    const { container } = render(
      <MarkdownRenderer content={'```typescript\nconst x = 1\n```'} />
    )
    const wrapper = container.querySelector('[data-testid="markdown-renderer"]')
    expect(wrapper).toBeInTheDocument()
    expect(wrapper?.textContent).toContain('const x = 1')
  })

  it('renders GFM table content', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |'
    const { container } = render(<MarkdownRenderer content={md} />)
    const wrapper = container.querySelector('[data-testid="markdown-renderer"]')
    expect(wrapper).toBeInTheDocument()
    // GFM tables may render as text or table in JSDOM
    expect(wrapper?.textContent).toContain('A')
    expect(wrapper?.textContent).toContain('1')
  })

  it('applies custom className', () => {
    const customClass = 'custom-markdown'
    const { container } = render(
      <MarkdownRenderer content="Test" className={customClass} />
    )
    const element = container.querySelector(`.${customClass}`)
    expect(element).toBeInTheDocument()
  })

  it('renders with default className when not provided', () => {
    const { container } = render(<MarkdownRenderer content="Test" />)
    const element = container.querySelector('[data-testid="markdown-renderer"]')
    expect(element).toHaveClass('prose')
  })
})

describe('MarkdownRenderer code/pre components', () => {
  it('pre component renders MermaidBlock for mermaid language', () => {
    // 直接測 pre 元件邏輯
    const { pre } = getCodeComponent()
    expect(pre).toBeDefined()

    const codeChild = React.createElement('code', {
      className: 'language-mermaid',
      children: 'graph TD\nA-->B\n',
    })
    const { container } = render(pre({ children: [codeChild] }))
    expect(container.querySelector('[data-testid="mermaid-block"]')).toBeInTheDocument()
    expect(container.textContent).toContain('graph TD')
  })

  it('pre component renders normal pre for non-mermaid code', () => {
    const { pre } = getCodeComponent()
    expect(pre).toBeDefined()

    const codeChild = React.createElement('code', {
      className: 'language-javascript',
      children: 'const x = 1',
    })
    const { container } = render(pre({ children: [codeChild] }))
    expect(container.querySelector('pre')).toBeInTheDocument()
    expect(container.querySelector('[data-testid="mermaid-block"]')).not.toBeInTheDocument()
  })
})
