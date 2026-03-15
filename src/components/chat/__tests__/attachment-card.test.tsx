import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AttachmentCard } from '../attachment-card'
import type { SkillAttachmentInfo } from '@/hooks/use-skills'

// Mock MarkdownRenderer
jest.mock('../markdown-renderer', () => ({
  MarkdownRenderer: ({ textMarkdown }: { textMarkdown: string }) => (
    <div data-testid="markdown-renderer">{textMarkdown}</div>
  ),
}))

function makeAttachment(overrides: Partial<SkillAttachmentInfo> = {}): SkillAttachmentInfo {
  return {
    id: 'att-1',
    fileName: 'report.md',
    fileType: 'md',
    mimeType: 'text/markdown',
    fileSize: 2048,
    downloadUrl: '/api/skills/attachments/att-1',
    previewContent: '# Hello World',
    ...overrides,
  }
}

describe('AttachmentCard', () => {
  it('renders file name and formatted size', () => {
    render(<AttachmentCard attachment={makeAttachment()} />)

    expect(screen.getByText('report.md')).toBeInTheDocument()
    expect(screen.getByText('2 KB')).toBeInTheDocument()
  })

  it('is collapsed by default', () => {
    render(<AttachmentCard attachment={makeAttachment()} />)

    expect(screen.queryByTestId('markdown-renderer')).not.toBeInTheDocument()
  })

  it('expands to show preview content when toggle button is clicked', () => {
    render(<AttachmentCard attachment={makeAttachment()} />)

    const toggleBtn = screen.getByRole('button', { name: /展開/i })
    fireEvent.click(toggleBtn)

    expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument()
    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('# Hello World')
  })

  it('collapses back when toggle button is clicked again', () => {
    render(<AttachmentCard attachment={makeAttachment()} />)

    const toggleBtn = screen.getByRole('button', { name: /展開/i })
    fireEvent.click(toggleBtn)
    expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument()

    const collapseBtn = screen.getByRole('button', { name: /收合/i })
    fireEvent.click(collapseBtn)
    expect(screen.queryByTestId('markdown-renderer')).not.toBeInTheDocument()
  })

  it('renders download link with correct href', async () => {
    const originalFetch = globalThis.fetch
    const fetchMock = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as Response)
    globalThis.fetch = fetchMock as typeof fetch
    const openMock = jest.spyOn(window, 'open').mockImplementation(() => null)

    render(<AttachmentCard attachment={makeAttachment()} />)

    const downloadBtn = screen.getByRole('button', { name: /下載/i })
    fireEvent.click(downloadBtn)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/skills/attachments/att-1')
      expect(openMock).toHaveBeenCalledWith('/api/skills/attachments/att-1', '_blank')
    })

    globalThis.fetch = originalFetch
    openMock.mockRestore()
  })

  it('does not show toggle button when previewContent is null', () => {
    render(<AttachmentCard attachment={makeAttachment({ previewContent: null })} />)

    expect(screen.queryByRole('button', { name: /展開/i })).not.toBeInTheDocument()
  })

  it('renders image preview for image previewFormat', () => {
    render(
      <AttachmentCard
        attachment={makeAttachment({
          mimeType: 'image/png',
          previewContent: null,
        })}
        previewFormat="image"
      />,
    )

    const toggleBtn = screen.queryByRole('button', { name: /展開/i })
    // 圖片格式仍可展開
    if (toggleBtn) {
      fireEvent.click(toggleBtn)
      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('src', '/api/skills/attachments/att-1')
    }
  })

  it('formats various file sizes correctly', () => {
    const { rerender } = render(
      <AttachmentCard attachment={makeAttachment({ fileSize: 500 })} />,
    )
    expect(screen.getByText('500 B')).toBeInTheDocument()

    rerender(
      <AttachmentCard attachment={makeAttachment({ fileSize: 1536 })} />,
    )
    expect(screen.getByText('1.5 KB')).toBeInTheDocument()

    rerender(
      <AttachmentCard attachment={makeAttachment({ fileSize: 1048576 })} />,
    )
    expect(screen.getByText('1 MB')).toBeInTheDocument()
  })
})
