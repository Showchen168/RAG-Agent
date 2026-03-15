import { test, expect } from '@playwright/test'
import { extractInlineCitationSources, mergeSources } from '../src/lib/chat/source-extraction'

test.describe('Source Extraction', () => {
  test('應能從 inline citation 抽出來源', () => {
    const text = '重點如下 [[Citation: Aivres 2026 資源規劃]]，並補充說明。'
    const sources = extractInlineCitationSources(text)
    expect(sources).toEqual([
      { title: 'Aivres 2026 資源規劃', type: '引用文件' },
    ])
  })

  test('重複 citation 應去重', () => {
    const text = '[[Citation: Doc A]] 內容 [[Citation: Doc A]]'
    const sources = extractInlineCitationSources(text)
    expect(sources).toEqual([{ title: 'Doc A', type: '引用文件' }])
  })

  test('顯式來源與 citation 來源合併時應去重並保序', () => {
    const merged = mergeSources(
      [{ title: 'Doc A', type: '內部' }, { title: 'Doc B', type: '內部' }],
      [{ title: 'Doc B', type: '引用文件' }, { title: 'Doc C', type: '引用文件' }]
    )

    expect(merged).toEqual([
      { title: 'Doc A', type: '內部' },
      { title: 'Doc B', type: '內部' },
      { title: 'Doc C', type: '引用文件' },
    ])
  })
})
