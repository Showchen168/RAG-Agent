import type { ApiGroup, ParsedRoute, ParsedMethod } from './types'

/** 轉義 MDX 中的大括號，避免被解析為 JSX 表達式 */
function escapeMdx(text: string): string {
  return text.replace(/\{/g, '\\{').replace(/\}/g, '\\}')
}

/**
 * 渲染單一群組的 MDX 內容
 */
export function renderGroupMdx(group: ApiGroup): string {
  const lines: string[] = []

  lines.push('---')
  lines.push(`title: ${group.name.charAt(0).toUpperCase() + group.name.slice(1)} API`)
  lines.push(`description: ${group.description}`)
  lines.push('---')
  lines.push('')
  lines.push(`# ${group.name.charAt(0).toUpperCase() + group.name.slice(1)} API`)
  lines.push('')
  lines.push(`> ${group.description}`)
  lines.push('')

  // 端點摘要表
  lines.push('## 端點一覽')
  lines.push('')
  lines.push('| 方法 | 路徑 | 說明 | 認證 |')
  lines.push('|------|------|------|------|')

  for (const route of group.routes) {
    for (const method of route.methods) {
      const authBadge = method.auth ? '需要' : '-'
      const desc = escapeMdx(method.description || '-')
      lines.push(`| \`${method.method}\` | \`${route.apiPath}\` | ${desc} | ${authBadge} |`)
    }
  }

  lines.push('')

  // 逐一渲染每個 route 的詳細資訊
  for (const route of group.routes) {
    lines.push(...renderRoute(route))
  }

  return lines.join('\n')
}

/** 渲染單一 route 的詳細區塊 */
function renderRoute(route: ParsedRoute): string[] {
  const lines: string[] = []

  lines.push(`## \`${route.apiPath}\``)
  lines.push('')

  for (const method of route.methods) {
    lines.push(...renderMethod(route.apiPath, method))
  }

  return lines
}

/** 渲染單一 HTTP method 區塊 */
function renderMethod(apiPath: string, method: ParsedMethod): string[] {
  const lines: string[] = []
  const badges: string[] = []

  if (method.auth) badges.push('需要認證')
  if (method.streaming) badges.push('串流回應')
  if (method.maxDuration) badges.push(`maxDuration: ${method.maxDuration}s`)

  lines.push(`### ${method.method}`)
  lines.push('')

  if (badges.length > 0) {
    lines.push(badges.map((b) => `\`${b}\``).join(' '))
    lines.push('')
  }

  if (method.description) {
    lines.push(escapeMdx(method.description))
    lines.push('')
  }

  // URL 參數
  if (method.params.length > 0) {
    lines.push('**Query 參數**')
    lines.push('')
    lines.push('| 參數 | 類型 | 必填 | 說明 |')
    lines.push('|------|------|------|------|')
    for (const p of method.params) {
      lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.required ? '是' : '否'} | ${p.description || '-'} |`)
    }
    lines.push('')
  }

  // Request body
  if (method.requestBody.length > 0) {
    lines.push('**Request Body**')
    lines.push('')
    lines.push('| 欄位 | 類型 | 必填 | 說明 |')
    lines.push('|------|------|------|------|')
    for (const p of method.requestBody) {
      lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.required ? '是' : '否'} | ${p.description || '-'} |`)
    }
    lines.push('')
  }

  // 請求範例
  lines.push('**請求範例**')
  lines.push('')
  lines.push('```bash')
  if (method.method === 'GET') {
    const qs = method.params.map((p) => `${p.name}=value`).join('&')
    const url = qs ? `${apiPath}?${qs}` : apiPath
    lines.push(`curl ${url}`)
  } else {
    const bodyFields = method.requestBody
      .filter((p) => p.name !== '(Zod schema)')
      .reduce<Record<string, string>>((acc, p) => {
        acc[p.name] = p.type === 'string' ? '...' : 'value'
        return acc
      }, {})
    const hasBody = Object.keys(bodyFields).length > 0
    if (hasBody) {
      lines.push(`curl -X ${method.method} ${apiPath} \\`)
      lines.push(`  -H "Content-Type: application/json" \\`)
      lines.push(`  -d '${JSON.stringify(bodyFields)}'`)
    } else {
      lines.push(`curl -X ${method.method} ${apiPath}`)
    }
  }
  lines.push('```')
  lines.push('')

  return lines
}

/**
 * 渲染 API 總覽 index.mdx
 */
export function renderIndexMdx(groups: ApiGroup[]): string {
  const lines: string[] = []

  lines.push('---')
  lines.push('title: API 參考')
  lines.push('description: NexusMind API 端點完整參考文件')
  lines.push('---')
  lines.push('')
  lines.push('# API 參考')
  lines.push('')
  lines.push('NexusMind 提供以下 API 群組：')
  lines.push('')
  lines.push('| 群組 | 端點數 | 說明 |')
  lines.push('|------|--------|------|')

  let totalRoutes = 0
  for (const group of groups) {
    const routeCount = group.routes.reduce((sum, r) => sum + r.methods.length, 0)
    totalRoutes += routeCount
    lines.push(`| [${group.name}](/docs/api/${group.name}) | ${routeCount} | ${group.description} |`)
  }

  lines.push('')
  lines.push(`> 共 ${groups.length} 個群組、${totalRoutes} 個端點`)
  lines.push('')

  return lines.join('\n')
}

/**
 * 渲染 meta.json（API 子目錄導航）
 */
export function renderApiMetaJson(groups: ApiGroup[]): string {
  const pages = ['index', ...groups.map((g) => g.name)]
  return JSON.stringify({ pages }, null, 2)
}
