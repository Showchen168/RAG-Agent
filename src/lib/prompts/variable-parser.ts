/**
 * 解析 Prompt 模板中的變數（格式: {{variable_name}}）
 */

export interface PromptVariable {
  name: string
  placeholder?: string
  defaultValue?: string
}

/**
 * 從模板字串中提取所有變數
 * @param template - Prompt 模板字串
 * @returns 變數列表
 */
export function extractVariables(template: string): PromptVariable[] {
  const regex = /\{\{(\w+)(?::([^}]+))?\}\}/g
  const variables: PromptVariable[] = []
  const seen = new Set<string>()

  let match: RegExpExecArray | null
  while ((match = regex.exec(template)) !== null) {
    const name = match[1]
    const placeholder = match[2]

    if (!seen.has(name)) {
      variables.push({
        name,
        placeholder: placeholder || name,
      })
      seen.add(name)
    }
  }

  return variables
}

/**
 * 將變數值填入模板
 * @param template - Prompt 模板字串
 * @param values - 變數值 map
 * @returns 填充後的字串
 */
export function fillVariables(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)(?::([^}]+))?\}\}/g, (match, name) => {
    return values[name] || match
  })
}

/**
 * 驗證所有必要變數是否已填入
 * @param template - Prompt 模板字串
 * @param values - 變數值 map
 * @returns 缺少的變數名稱列表
 */
export function validateVariables(template: string, values: Record<string, string>): string[] {
  const variables = extractVariables(template)
  const missing: string[] = []

  for (const variable of variables) {
    if (!values[variable.name] || values[variable.name].trim() === '') {
      missing.push(variable.name)
    }
  }

  return missing
}
