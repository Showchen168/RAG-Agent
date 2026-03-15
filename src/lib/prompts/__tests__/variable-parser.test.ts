import { extractVariables, fillVariables, validateVariables } from '../variable-parser'

describe('variable-parser', () => {
  describe('extractVariables', () => {
    it('should extract simple variables', () => {
      const template = '你好 {{name}}，歡迎來到 {{place}}'
      const vars = extractVariables(template)
      expect(vars).toHaveLength(2)
      expect(vars[0].name).toBe('name')
      expect(vars[1].name).toBe('place')
    })

    it('should extract variables with placeholder', () => {
      const template = '{{name:請輸入姓名}}'
      const vars = extractVariables(template)
      expect(vars).toHaveLength(1)
      expect(vars[0].name).toBe('name')
      expect(vars[0].placeholder).toBe('請輸入姓名')
    })

    it('should use variable name as default placeholder', () => {
      const template = '{{topic}}'
      const vars = extractVariables(template)
      expect(vars[0].placeholder).toBe('topic')
    })

    it('should deduplicate variables', () => {
      const template = '{{name}} 你好 {{name}}'
      const vars = extractVariables(template)
      expect(vars).toHaveLength(1)
    })

    it('should return empty array for no variables', () => {
      const template = '沒有變數的模板'
      const vars = extractVariables(template)
      expect(vars).toEqual([])
    })

    it('should handle multiple variables with placeholders', () => {
      const template = '{{topic:主題}} 和 {{style:風格}} 的結合'
      const vars = extractVariables(template)
      expect(vars).toHaveLength(2)
      expect(vars[0]).toEqual({ name: 'topic', placeholder: '主題' })
      expect(vars[1]).toEqual({ name: 'style', placeholder: '風格' })
    })
  })

  describe('fillVariables', () => {
    it('should fill variables with values', () => {
      const template = '你好 {{name}}，歡迎來到 {{place}}'
      const result = fillVariables(template, { name: '小明', place: '台北' })
      expect(result).toBe('你好 小明，歡迎來到 台北')
    })

    it('should keep unmatched variables as-is', () => {
      const template = '{{name}} 和 {{unknown}}'
      const result = fillVariables(template, { name: '小明' })
      expect(result).toBe('小明 和 {{unknown}}')
    })

    it('should handle variables with placeholders', () => {
      const template = '{{name:姓名}} 的報告'
      const result = fillVariables(template, { name: '小明' })
      expect(result).toBe('小明 的報告')
    })

    it('should handle empty values map', () => {
      const template = '{{name}}'
      const result = fillVariables(template, {})
      expect(result).toBe('{{name}}')
    })

    it('should handle template with no variables', () => {
      const template = '純文字內容'
      const result = fillVariables(template, { name: '小明' })
      expect(result).toBe('純文字內容')
    })

    it('should replace all occurrences of same variable', () => {
      const template = '{{name}} 你好，{{name}} 再見'
      const result = fillVariables(template, { name: '小明' })
      expect(result).toBe('小明 你好，小明 再見')
    })
  })

  describe('validateVariables', () => {
    it('should return empty array when all variables are filled', () => {
      const template = '{{name}} {{age}}'
      const missing = validateVariables(template, { name: '小明', age: '25' })
      expect(missing).toEqual([])
    })

    it('should return missing variable names', () => {
      const template = '{{name}} {{age}} {{email}}'
      const missing = validateVariables(template, { name: '小明' })
      expect(missing).toEqual(['age', 'email'])
    })

    it('should treat empty string as missing', () => {
      const template = '{{name}}'
      const missing = validateVariables(template, { name: '' })
      expect(missing).toEqual(['name'])
    })

    it('should treat whitespace-only as missing', () => {
      const template = '{{name}}'
      const missing = validateVariables(template, { name: '   ' })
      expect(missing).toEqual(['name'])
    })

    it('should return empty array for template with no variables', () => {
      const template = '純文字'
      const missing = validateVariables(template, {})
      expect(missing).toEqual([])
    })

    it('should handle variables with placeholders', () => {
      const template = '{{name:姓名}} {{email:電子郵件}}'
      const missing = validateVariables(template, { name: '小明' })
      expect(missing).toEqual(['email'])
    })
  })
})
