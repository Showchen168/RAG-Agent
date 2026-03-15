import { inferResponseStyleMode, buildResponseStylePrompt } from '../response-style'
import type { ResponseStyleMode } from '../response-style'

describe('response-style', () => {
  describe('inferResponseStyleMode', () => {
    it('should return "default" for empty string', () => {
      expect(inferResponseStyleMode('')).toBe('default')
    })

    it('should return "default" for whitespace-only string', () => {
      expect(inferResponseStyleMode('   ')).toBe('default')
    })

    it('should detect risk mode keywords', () => {
      const riskQueries = [
        '這個專案有什麼風險？',
        '分析一下 risk 因素',
        '目前的危機是什麼',
        '這裡有阻塞問題',
        '什麼是瓶頸',
        '有什麼缺口',
        '這是高風險的',
        '失敗機率有多高',
      ]
      for (const q of riskQueries) {
        expect(inferResponseStyleMode(q)).toBe('risk')
      }
    })

    it('should detect comparison mode keywords', () => {
      const comparisonQueries = [
        '比較 React 和 Vue',
        '兩者的對比',
        '差異在哪裡',
        '選哪個比較好',
        '哪個比較好用',
        'trade-off 是什麼',
        '優缺點分析',
        '方案A 和方案B',
        '有什麼選項',
      ]
      for (const q of comparisonQueries) {
        expect(inferResponseStyleMode(q)).toBe('comparison')
      }
    })

    it('should detect action mode keywords', () => {
      const actionQueries = [
        '怎麼做這件事',
        '下一步該怎樣',
        '行動方案',
        '制定計畫',
        '如何落地',
        '執行策略',
        '給我 roadmap',
        '待辦事項',
        '步驟是什麼',
      ]
      for (const q of actionQueries) {
        expect(inferResponseStyleMode(q)).toBe('action')
      }
    })

    it('should return "default" for generic queries', () => {
      expect(inferResponseStyleMode('今天天氣如何')).toBe('default')
      expect(inferResponseStyleMode('解釋一下 JavaScript')).toBe('default')
    })

    it('should prioritize risk over comparison and action', () => {
      // "風險" triggers risk mode first
      expect(inferResponseStyleMode('比較風險')).toBe('risk')
    })
  })

  describe('buildResponseStylePrompt', () => {
    it('should return risk analysis prompt', () => {
      const prompt = buildResponseStylePrompt('risk')
      expect(prompt).toContain('RISK ANALYSIS')
      expect(prompt).toContain('最高風險')
    })

    it('should return comparison prompt', () => {
      const prompt = buildResponseStylePrompt('comparison')
      expect(prompt).toContain('COMPARISON')
      expect(prompt).toContain('比較表')
    })

    it('should return action plan prompt', () => {
      const prompt = buildResponseStylePrompt('action')
      expect(prompt).toContain('ACTION PLAN')
      expect(prompt).toContain('步驟')
    })

    it('should return default prompt', () => {
      const prompt = buildResponseStylePrompt('default')
      expect(prompt).toContain('DEFAULT')
    })

    it('should return non-empty string for all modes', () => {
      const modes: ResponseStyleMode[] = ['risk', 'comparison', 'action', 'default']
      for (const mode of modes) {
        const prompt = buildResponseStylePrompt(mode)
        expect(prompt.length).toBeGreaterThan(0)
      }
    })
  })
})
