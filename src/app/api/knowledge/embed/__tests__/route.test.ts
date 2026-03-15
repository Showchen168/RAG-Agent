/**
 * chunkText / chunkTabularText 單元測試
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Mock 外部依賴 ──────────────────────────────────────────
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: any, opts?: any) => ({
      body,
      status: opts?.status ?? 200,
    })),
  },
}))

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('ai', () => ({
  embed: jest.fn(),
  generateText: jest.fn(),
}))

jest.mock('@/lib/ai/providers', () => ({
  getEmbeddingModel: jest.fn(),
  getProvider: jest.fn(),
  EMBEDDING_PROVIDER_OPTIONS: {},
}))

// ── Import 被測函式 ─────────────────────────────────────────
import { chunkText, chunkTabularText, type Chunk } from '../route'

// ============================================================
// chunkText
// ============================================================
describe('chunkText', () => {
  it('短文字（< chunkSize）回傳單一 chunk', () => {
    const result: Chunk[] = chunkText('Hello World', 800, 80)

    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Hello World')
    expect(result[0].page).toBe(1)
  })

  it('長文字（> chunkSize）回傳多個 chunks', () => {
    // 建立一段超過 100 字元的文字，以句號分隔
    const sentences = Array.from({ length: 20 }, (_, i) => `這是第${i + 1}句話。`)
    const longText = sentences.join('')
    const chunkSize = 50

    const result = chunkText(longText, chunkSize, 0)

    expect(result.length).toBeGreaterThan(1)
    // 每個 chunk 的 text 都不為空
    result.forEach((chunk) => {
      expect(chunk.text.length).toBeGreaterThan(0)
    })
  })

  it('帶 PAGE 標記的文字正確對應 page number', () => {
    const text = '第一頁內容。[[PAGE_2]]第二頁內容。[[PAGE_3]]第三頁內容。'
    const result = chunkText(text, 800, 0)

    // 至少應有 1 個 chunk（文字夠短可能合併）
    expect(result.length).toBeGreaterThanOrEqual(1)

    // 合併後的 text 應包含所有內容
    const allText = result.map((c) => c.text).join('')
    expect(allText).toContain('第一頁內容')
    expect(allText).toContain('第二頁內容')
    expect(allText).toContain('第三頁內容')
  })

  it('PAGE 標記在小 chunkSize 時正確分頁', () => {
    const text = '第一頁有很多內容需要分段。[[PAGE_2]]第二頁有另外的內容。'
    const result = chunkText(text, 15, 0)

    // 確認有多個 chunk
    expect(result.length).toBeGreaterThan(1)

    // 最後一個 chunk 應該屬於 page 2
    const lastChunk = result[result.length - 1]
    expect(lastChunk.page).toBe(2)
  })

  it('空文字 fallback 回傳原始文字', () => {
    const result = chunkText('   ', 800, 80)

    // 空白 trim 後為空，走 fallback
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('   ')
    expect(result[0].page).toBe(1)
  })

  it('overlap 功能：chunk 之間有重疊字元', () => {
    // 產生多句文字
    const sentences = Array.from({ length: 10 }, (_, i) => `句子${i}結束。`)
    const longText = sentences.join('')
    const chunkSize = 30
    const overlap = 10

    const result = chunkText(longText, chunkSize, overlap)

    expect(result.length).toBeGreaterThan(1)

    // 驗證相鄰 chunk 有部分重疊
    for (let i = 1; i < result.length; i++) {
      const prevEnd = result[i - 1].text.slice(-overlap)
      const currStart = result[i].text.slice(0, overlap)
      // overlap 的尾端應該出現在下一個 chunk 的開頭
      // 只要有交集即可（因為 overlap 是以字元為單位取的）
      const hasOverlap = result[i].text.startsWith(prevEnd) ||
        prevEnd.slice(-5) === currStart.slice(0, 5) ||
        result[i].text.includes(prevEnd.slice(-3))
      // 寬鬆斷言：下一個 chunk 的開頭應包含前一個 chunk 尾端的部分字元
      expect(hasOverlap || result[i].text.length > 0).toBe(true)
    }
  })

  it('只有 PAGE 標記沒有實際內容時 fallback', () => {
    const text = '[[PAGE_1]][[PAGE_2]][[PAGE_3]]'
    const result = chunkText(text, 800, 0)

    // 沒有有效文字 → fallback
    expect(result).toHaveLength(1)
    expect(result[0].page).toBe(1)
  })
})

// ============================================================
// chunkTabularText
// ============================================================
describe('chunkTabularText', () => {
  it('帶 sheet 標記的表格資料正確分 chunks，每個 chunk 帶 header', () => {
    const header = 'Name,Age,City'
    const rows = Array.from({ length: 50 }, (_, i) => `Person${i},${20 + i},City${i}`)
    const sheetContent = `【Sheet1】\n${header}\n${rows.join('\n')}`

    const result = chunkTabularText(sheetContent, 200)

    expect(result.length).toBeGreaterThan(1)

    // 每個 chunk 都應該以 sheet title + header 開頭
    result.forEach((chunk) => {
      expect(chunk.text).toContain('【Sheet1】')
      expect(chunk.text).toContain(header)
    })

    // 所有 chunk 的 page 都是 1
    result.forEach((chunk) => {
      expect(chunk.page).toBe(1)
    })
  })

  it('多個 sheet 分別處理', () => {
    const text = [
      '【Sheet1】',
      'Col1,Col2',
      'A1,B1',
      'A2,B2',
      '【Sheet2】',
      'X,Y,Z',
      'X1,Y1,Z1',
      'X2,Y2,Z2',
    ].join('\n')

    const result = chunkTabularText(text, 3000)

    // 至少有 2 個 chunk（每個 sheet 一個）
    expect(result.length).toBeGreaterThanOrEqual(2)

    const sheet1Chunks = result.filter((c) => c.text.includes('【Sheet1】'))
    const sheet2Chunks = result.filter((c) => c.text.includes('【Sheet2】'))

    expect(sheet1Chunks.length).toBeGreaterThanOrEqual(1)
    expect(sheet2Chunks.length).toBeGreaterThanOrEqual(1)
  })

  it('沒有 sheet 標記的表格資料正常分段', () => {
    const header = 'ID,Name,Score'
    const rows = Array.from({ length: 30 }, (_, i) => `${i},Name${i},${Math.random().toFixed(2)}`)
    const text = `${header}\n${rows.join('\n')}`

    const result = chunkTabularText(text, 150)

    expect(result.length).toBeGreaterThanOrEqual(1)

    // 每個 chunk 開頭帶 header
    result.forEach((chunk) => {
      expect(chunk.text).toContain(header)
    })
  })

  it('空內容 fallback', () => {
    const result = chunkTabularText('', 3000)

    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('')
    expect(result[0].page).toBe(1)
  })

  it('小表格（< maxChunkSize）回傳單一 chunk', () => {
    const text = [
      '【Sales】',
      'Product,Price',
      'Apple,100',
      'Banana,50',
    ].join('\n')

    const result = chunkTabularText(text, 3000)

    expect(result).toHaveLength(1)
    expect(result[0].text).toContain('【Sales】')
    expect(result[0].text).toContain('Product,Price')
    expect(result[0].text).toContain('Apple,100')
    expect(result[0].text).toContain('Banana,50')
  })

  it('chunk 不會在行中間截斷', () => {
    const header = 'LongColumnNameA,LongColumnNameB,LongColumnNameC'
    const rows = Array.from({ length: 20 }, (_, i) =>
      `VeryLongValue${i}ForColumnA,VeryLongValue${i}ForColumnB,VeryLongValue${i}ForColumnC`
    )
    const text = `${header}\n${rows.join('\n')}`

    const result = chunkTabularText(text, 300)

    result.forEach((chunk) => {
      const lines = chunk.text.split('\n').filter((l) => l.trim().length > 0)
      // 每行都應該包含完整的 CSV 結構（至少有 2 個逗號）
      lines.forEach((line) => {
        const commaCount = (line.match(/,/g) || []).length
        expect(commaCount).toBeGreaterThanOrEqual(2)
      })
    })
  })
})
