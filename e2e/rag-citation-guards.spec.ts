import { test, expect } from '@playwright/test'
import { extractFreshnessAnchors, docMatchesFreshnessAnchors } from '../src/lib/chat/citation-guards'

test.describe('RAG Citation Guards', () => {
  test('應抽出事件與年份錨點', () => {
    const anchors = extractFreshnessAnchors('請整理 CES 2026 的最新重點')
    expect(anchors).toContain('CES')
    expect(anchors).toContain('2026')
  })

  test('文件同時命中事件與年份才可通過', () => {
    const anchors = ['CES', '2026']
    const pass = docMatchesFreshnessAnchors({
      title: 'CES 2026 展會重點',
      tags: ['internal', 'event'],
      chunks: ['CES 2026 於 1 月舉行'],
      anchors,
    })
    expect(pass).toBe(true)
  })

  test('只有事件沒有年份應擋下', () => {
    const anchors = ['CES', '2026']
    const pass = docMatchesFreshnessAnchors({
      title: 'CES 展會重點',
      tags: ['internal'],
      chunks: ['CES 內容更新'],
      anchors,
    })
    expect(pass).toBe(false)
  })

  test('只有年份沒有事件應擋下', () => {
    const anchors = ['CES', '2026']
    const pass = docMatchesFreshnessAnchors({
      title: '2026 人力規劃',
      tags: ['internal'],
      chunks: ['年度規劃與預算'],
      anchors,
    })
    expect(pass).toBe(false)
  })

  test('無錨點查詢不應誤擋文件', () => {
    const pass = docMatchesFreshnessAnchors({
      title: '一般知識文件',
      tags: ['internal'],
      chunks: ['內容摘要'],
      anchors: [],
    })
    expect(pass).toBe(true)
  })
})
