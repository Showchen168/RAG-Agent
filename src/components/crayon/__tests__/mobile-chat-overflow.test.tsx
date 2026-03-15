import { render } from '@testing-library/react'
import '@testing-library/jest-dom'

/**
 * 手機端表格溢出修復測試
 *
 * Bug: iPhone 上 AI 回應中的表格（DataTableTemplate 和 Markdown 表格）
 * 會超出訊息氣泡右邊界，內容被截斷。
 *
 * 根因：
 * 1. DataTableTemplate 的 td 有 min-w-[120px]，3 欄以上（360px+）超過 iPhone 375px
 * 2. DataTableTemplate 的 th 有 whitespace-nowrap，表頭無法換行
 * 3. MarkdownRenderer 的 th 有 whitespace-nowrap，同理
 *
 * 修復預期：
 * - 移除 td 上的固定最小寬度（或改為更小的值）
 * - 允許表頭在窄螢幕換行
 * - 確保 overflow-x-auto 仍然存在
 */

// ─── DataTableTemplate 測試 ───
import { DataTableTemplate } from '../templates/data-table-template'

describe('DataTableTemplate mobile overflow', () => {
  const wideTableProps = {
    title: '星盤四大元素與代表星座解析',
    headers: ['元素分類', '包含星座', '核心能量特質'],
    rows: [
      ['火象元素', '牡羊座、獅子座、射手座', '行動力強、熱情奔放、勇於挑戰'],
      ['土象元素', '金牛座、處女座、摩羯座', '踏實穩重、注重細節、追求安全感'],
      ['風象元素', '雙子座、天秤座、水瓶座', '思維靈活、溝通力強、追求自由'],
      ['水象元素', '巨蟹座、天蠍座、雙魚座', '情感豐富、直覺敏銳、富同理心'],
    ],
  }

  it('renders with overflow-x-auto wrapper for horizontal scrolling', () => {
    const { container } = render(<DataTableTemplate {...wideTableProps} />)
    const scrollWrapper = container.querySelector('.overflow-x-auto')
    expect(scrollWrapper).toBeInTheDocument()
    expect(scrollWrapper?.querySelector('table')).toBeInTheDocument()
  })

  it('table cells do NOT have min-w-[120px] that causes overflow on mobile', () => {
    const { container } = render(<DataTableTemplate {...wideTableProps} />)
    const cells = container.querySelectorAll('td')
    expect(cells.length).toBeGreaterThan(0)
    cells.forEach(cell => {
      // min-w-[120px] = 3 columns × 120px = 360px, exceeds iPhone 375px viewport
      expect(cell.className).not.toContain('min-w-[120px]')
    })
  })

  it('table cells have break-words for proper text wrapping', () => {
    const { container } = render(<DataTableTemplate {...wideTableProps} />)
    const cells = container.querySelectorAll('td')
    expect(cells.length).toBeGreaterThan(0)
    cells.forEach(cell => {
      expect(cell.className).toContain('break-words')
    })
  })

  it('table headers allow text wrapping on narrow screens', () => {
    const { container } = render(<DataTableTemplate {...wideTableProps} />)
    const headers = container.querySelectorAll('th')
    expect(headers.length).toBeGreaterThan(0)
    headers.forEach(th => {
      // whitespace-nowrap prevents headers from wrapping on mobile
      // Should NOT have whitespace-nowrap (or should use responsive class)
      expect(th.className).not.toContain('whitespace-nowrap')
    })
  })
})
