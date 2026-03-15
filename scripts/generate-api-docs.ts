#!/usr/bin/env npx tsx
/**
 * generate-api-docs.ts
 * 自動掃描 src/app/api/ 下所有 route.ts，
 * 用 ts-morph AST 解析後生成 Fumadocs MDX 文件
 *
 * 用法：npx tsx scripts/generate-api-docs.ts [--out <dir>]
 */
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync, writeFileSync } from 'fs'
import { execFileSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

import { scanApiRoutes } from './doc-gen/scanner'
import { parseRouteFile } from './doc-gen/parser'
import { groupRoutes } from './doc-gen/grouper'
import { renderGroupMdx, renderIndexMdx, renderApiMetaJson } from './doc-gen/mdx-renderer'
import type { ParsedRoute } from './doc-gen/types'

// ── CLI 參數 ──
const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const projectRoot = resolve(__dirname, '..')
const defaultOut = resolve(projectRoot, '../nexusmind-docs/content/docs/api')
const outDir = outIdx !== -1 && args[outIdx + 1]
  ? resolve(args[outIdx + 1])
  : defaultOut

// ── 主流程 ──
function main() {
  console.log('🔍 掃描 API routes...')
  const rawRoutes = scanApiRoutes(projectRoot)
  console.log(`   找到 ${rawRoutes.length} 個 route.ts 檔案`)

  console.log('🧠 AST 解析中...')
  const parsedRoutes: ParsedRoute[] = []
  let errorCount = 0

  for (const raw of rawRoutes) {
    try {
      const methods = parseRouteFile(raw.filePath)
      if (methods.length > 0) {
        parsedRoutes.push({
          filePath: raw.filePath,
          apiPath: raw.apiPath,
          group: raw.group,
          methods,
        })
      }
    } catch (err) {
      errorCount++
      console.warn(`   ⚠️  解析失敗: ${raw.apiPath} — ${(err as Error).message}`)
    }
  }

  console.log(`   成功解析 ${parsedRoutes.length} 個 routes（${errorCount} 個失敗）`)

  console.log('📂 分組中...')
  const groups = groupRoutes(parsedRoutes)
  console.log(`   分為 ${groups.length} 個群組`)

  // 確保輸出目錄存在
  mkdirSync(outDir, { recursive: true })

  console.log(`📝 生成 MDX 到 ${outDir}`)

  // 1. 各群組 MDX
  for (const group of groups) {
    const content = renderGroupMdx(group)
    const filePath = resolve(outDir, `${group.name}.mdx`)
    writeFileSync(filePath, content, 'utf-8')
    console.log(`   ✅ ${group.name}.mdx (${group.routes.length} routes)`)
  }

  // 2. 總覽 index.mdx
  const indexContent = renderIndexMdx(groups)
  writeFileSync(resolve(outDir, 'index.mdx'), indexContent, 'utf-8')
  console.log('   ✅ index.mdx')

  // 3. meta.json（導航用）
  const metaContent = renderApiMetaJson(groups)
  writeFileSync(resolve(outDir, 'meta.json'), metaContent, 'utf-8')
  console.log('   ✅ meta.json')

  // 4. _generated.json（時間戳 + commit hash）
  const commitHash = getCommitHash()
  const generated = {
    generatedAt: new Date().toISOString(),
    commitHash,
    routeCount: parsedRoutes.length,
    groupCount: groups.length,
    errorCount,
  }
  writeFileSync(resolve(outDir, '_generated.json'), JSON.stringify(generated, null, 2), 'utf-8')
  console.log('   ✅ _generated.json')

  console.log('')
  console.log(`🎉 完成！共生成 ${groups.length + 2} 個檔案`)
}

function getCommitHash(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

main()
