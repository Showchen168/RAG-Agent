import { extractInlineCitationSources, mergeSources } from '../source-extraction'
import type { SourceRef } from '../source-extraction'

describe('source-extraction', () => {
  describe('extractInlineCitationSources', () => {
    it('should extract citation sources from text', () => {
      const text = '根據 [[Citation: AI 技術白皮書]] 的說法...'
      const sources = extractInlineCitationSources(text)
      expect(sources).toHaveLength(1)
      expect(sources[0]).toEqual({
        title: 'AI 技術白皮書',
        type: '引用文件',
      })
    })

    it('should extract multiple citations', () => {
      const text = '根據 [[Citation: 文件A]] 和 [[Citation: 文件B]] 的內容'
      const sources = extractInlineCitationSources(text)
      expect(sources).toHaveLength(2)
      expect(sources[0].title).toBe('文件A')
      expect(sources[1].title).toBe('文件B')
    })

    it('should deduplicate citations (case insensitive)', () => {
      const text = '[[Citation: 文件A]] 再次引用 [[Citation: 文件a]]'
      const sources = extractInlineCitationSources(text)
      expect(sources).toHaveLength(1)
    })

    it('should return empty array for no citations', () => {
      const text = '這段文字沒有任何引用'
      const sources = extractInlineCitationSources(text)
      expect(sources).toEqual([])
    })

    it('should skip empty citation content', () => {
      const text = '[[Citation: ]] 空引用'
      const sources = extractInlineCitationSources(text)
      expect(sources).toEqual([])
    })

    it('should trim whitespace from citation names', () => {
      const text = '[[Citation:   有空格的文件   ]]'
      const sources = extractInlineCitationSources(text)
      expect(sources).toHaveLength(1)
      expect(sources[0].title).toBe('有空格的文件')
    })
  })

  describe('mergeSources', () => {
    it('should merge explicit and citation sources', () => {
      const explicit: SourceRef[] = [{ title: '來源A', type: '知識庫' }]
      const citation: SourceRef[] = [{ title: '來源B', type: '引用文件' }]
      const merged = mergeSources(explicit, citation)
      expect(merged).toHaveLength(2)
    })

    it('should deduplicate by title (case insensitive)', () => {
      const explicit: SourceRef[] = [{ title: '來源A', type: '知識庫' }]
      const citation: SourceRef[] = [{ title: '來源a', type: '引用文件' }]
      const merged = mergeSources(explicit, citation)
      expect(merged).toHaveLength(1)
      // Should keep the first occurrence (explicit)
      expect(merged[0].type).toBe('知識庫')
    })

    it('should handle empty arrays', () => {
      expect(mergeSources([], [])).toEqual([])
    })

    it('should handle one empty array', () => {
      const sources: SourceRef[] = [{ title: '來源A' }]
      expect(mergeSources(sources, [])).toHaveLength(1)
      expect(mergeSources([], sources)).toHaveLength(1)
    })

    it('should skip sources with empty title', () => {
      const sources: SourceRef[] = [
        { title: '有效來源' },
        { title: '' },
        { title: '  ' },
      ]
      const merged = mergeSources(sources, [])
      expect(merged).toHaveLength(1)
      expect(merged[0].title).toBe('有效來源')
    })

    it('should preserve order: explicit first, then citation', () => {
      const explicit: SourceRef[] = [{ title: '第一', type: 'A' }]
      const citation: SourceRef[] = [{ title: '第二', type: 'B' }]
      const merged = mergeSources(explicit, citation)
      expect(merged[0].title).toBe('第一')
      expect(merged[1].title).toBe('第二')
    })
  })
})
