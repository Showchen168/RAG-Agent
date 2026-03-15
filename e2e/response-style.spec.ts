import { test, expect } from '@playwright/test'
import { inferResponseStyleMode, buildResponseStylePrompt } from '../src/lib/chat/response-style'

test.describe('Response Style Mode', () => {
  test('風險問題應命中 risk 模式', () => {
    const mode = inferResponseStyleMode('請分析這個專案的人力風險與缺口')
    expect(mode).toBe('risk')
    expect(buildResponseStylePrompt(mode)).toContain('RISK ANALYSIS')
  })

  test('比較問題應命中 comparison 模式', () => {
    const mode = inferResponseStyleMode('方案A跟方案B比較，哪個比較好？')
    expect(mode).toBe('comparison')
    expect(buildResponseStylePrompt(mode)).toContain('COMPARISON')
  })

  test('行動問題應命中 action 模式', () => {
    const mode = inferResponseStyleMode('給我下週可執行的落地步驟與行動計畫')
    expect(mode).toBe('action')
    expect(buildResponseStylePrompt(mode)).toContain('ACTION PLAN')
  })

  test('一般問題回 default 模式', () => {
    const mode = inferResponseStyleMode('這個概念是什麼？')
    expect(mode).toBe('default')
  })
})
