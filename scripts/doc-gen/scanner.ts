import { resolve, relative } from 'path'
import { readdirSync, statSync } from 'fs'

/**
 * 遞迴掃描 src/app/api/ 下所有 route.ts 檔案
 * 回傳 { filePath, apiPath, group } 陣列
 */
export function scanApiRoutes(projectRoot: string): Array<{
  filePath: string
  apiPath: string
  group: string
}> {
  const apiDir = resolve(projectRoot, 'src/app/api')
  const routes: Array<{ filePath: string; apiPath: string; group: string }> = []

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const fullPath = resolve(dir, entry)
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath)
      } else if (entry === 'route.ts') {
        const rel = relative(apiDir, dir)
        const apiPath = '/api/' + rel.replace(/\[(\w+)\]/g, ':$1')
        const group = rel.split('/')[0]
        routes.push({ filePath: fullPath, apiPath, group })
      }
    }
  }

  walk(apiDir)
  return routes.sort((a, b) => a.apiPath.localeCompare(b.apiPath))
}
