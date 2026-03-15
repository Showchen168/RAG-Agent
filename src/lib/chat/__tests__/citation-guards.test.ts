import { extractFreshnessAnchors, docMatchesFreshnessAnchors } from '../citation-guards'

describe('citation-guards', () => {
  describe('extractFreshnessAnchors', () => {
    it('should extract event keywords from query', () => {
      const anchors = extractFreshnessAnchors('CES 2025 的最新趨勢')
      expect(anchors).toContain('CES')
      expect(anchors).toContain('2025')
    })

    it('should extract multiple event keywords', () => {
      const anchors = extractFreshnessAnchors('COMPUTEX 和 MWC 的亮點')
      expect(anchors).toContain('COMPUTEX')
      expect(anchors).toContain('MWC')
    })

    it('should extract year patterns', () => {
      const anchors = extractFreshnessAnchors('2024 年的 AI 發展')
      expect(anchors).toContain('2024')
    })

    it('should extract multiple years', () => {
      const anchors = extractFreshnessAnchors('從 2023 到 2025 的變化')
      expect(anchors).toContain('2023')
      expect(anchors).toContain('2025')
    })

    it('should return empty array for no matches', () => {
      const anchors = extractFreshnessAnchors('一般的技術問題')
      expect(anchors).toEqual([])
    })

    it('should be case insensitive for event keywords', () => {
      const anchors = extractFreshnessAnchors('ces 展覽')
      expect(anchors).toContain('CES')
    })

    it('should deduplicate results', () => {
      const anchors = extractFreshnessAnchors('CES CES 2025 2025')
      const cesCount = anchors.filter(a => a === 'CES').length
      const yearCount = anchors.filter(a => a === '2025').length
      expect(cesCount).toBe(1)
      expect(yearCount).toBe(1)
    })

    it('should handle all supported event keywords', () => {
      const events = ['CES', 'COMPUTEX', 'MWC', 'GTC', 'WWDC', 'GITEX', 'WEB SUMMIT']
      for (const event of events) {
        const anchors = extractFreshnessAnchors(`${event} 相關`)
        expect(anchors).toContain(event)
      }
    })
  })

  describe('docMatchesFreshnessAnchors', () => {
    it('should return true when no anchors provided', () => {
      const result = docMatchesFreshnessAnchors({
        title: '任何文件',
        tags: [],
        chunks: [],
        anchors: [],
      })
      expect(result).toBe(true)
    })

    it('should match event anchor in title', () => {
      const result = docMatchesFreshnessAnchors({
        title: 'CES 2025 展覽報告',
        tags: [],
        chunks: [],
        anchors: ['CES'],
      })
      expect(result).toBe(true)
    })

    it('should match year anchor in tags', () => {
      const result = docMatchesFreshnessAnchors({
        title: '技術報告',
        tags: ['2024', 'AI'],
        chunks: [],
        anchors: ['2024'],
      })
      expect(result).toBe(true)
    })

    it('should match anchor in chunks', () => {
      const result = docMatchesFreshnessAnchors({
        title: '報告',
        tags: [],
        chunks: ['這是 COMPUTEX 的展覽內容'],
        anchors: ['COMPUTEX'],
      })
      expect(result).toBe(true)
    })

    it('should require both event and year anchors to match', () => {
      const result = docMatchesFreshnessAnchors({
        title: 'CES 報告',
        tags: [],
        chunks: [],
        anchors: ['CES', '2025'],
      })
      // Has CES but no 2025
      expect(result).toBe(false)
    })

    it('should return true when both event and year match', () => {
      const result = docMatchesFreshnessAnchors({
        title: 'CES 2025 報告',
        tags: [],
        chunks: [],
        anchors: ['CES', '2025'],
      })
      expect(result).toBe(true)
    })

    it('should be case insensitive', () => {
      const result = docMatchesFreshnessAnchors({
        title: 'ces 小寫標題',
        tags: [],
        chunks: [],
        anchors: ['CES'],
      })
      expect(result).toBe(true)
    })

    it('should return false when no anchors match', () => {
      const result = docMatchesFreshnessAnchors({
        title: '無關內容',
        tags: ['其他'],
        chunks: ['不相關的文字'],
        anchors: ['CES', '2025'],
      })
      expect(result).toBe(false)
    })
  })
})
