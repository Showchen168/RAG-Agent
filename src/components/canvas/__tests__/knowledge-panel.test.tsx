'use client'

import { render, screen, waitFor } from '@testing-library/react'
import { KnowledgePanel } from '../knowledge-panel'

// Mock fetch
global.fetch = jest.fn()

describe('KnowledgePanel', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
  })

  it('顯示搜尋輸入框', () => {
    render(<KnowledgePanel />)
    expect(screen.getByPlaceholderText(/搜尋知識庫/i)).toBeInTheDocument()
  })

  it('載入並顯示知識庫文件', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: '1', title: '測試文件 1', summary: '摘要 1', enabled: true },
          { id: '2', title: '測試文件 2', summary: '摘要 2', enabled: true },
        ],
      }),
    })

    render(<KnowledgePanel />)

    await waitFor(() => {
      expect(screen.getByText('測試文件 1')).toBeInTheDocument()
      expect(screen.getByText('測試文件 2')).toBeInTheDocument()
    })
  })

  it('每個文件都有「插入引用」按鈕', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: '1', title: '測試文件 1', summary: '摘要 1', enabled: true },
        ],
      }),
    })

    render(<KnowledgePanel />)

    await waitFor(() => {
      const insertButton = screen.getByTitle(/插入引用/i)
      expect(insertButton).toBeInTheDocument()
    })
  })
})
