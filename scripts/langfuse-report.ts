/**
 * Langfuse 數據拉取腳本
 *
 * 用途：從 Langfuse API 拉取 LLM trace 數據，產出分析報告 JSON
 * 讓 Claude Code 能讀取並與使用者互動分析、改善 prompt 品質
 *
 * 使用方式：
 *   npx tsx scripts/langfuse-report.ts                     # 預設拉取最近 24 小時
 *   npx tsx scripts/langfuse-report.ts --hours 48          # 最近 48 小時
 *   npx tsx scripts/langfuse-report.ts --trace-id xxx      # 查詢特定 trace
 *   npx tsx scripts/langfuse-report.ts --limit 50          # 限制筆數
 *
 * 輸出：scripts/langfuse-report.json
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ---------- 型別定義 ----------

interface LangfuseTrace {
  id: string
  name?: string
  userId?: string
  sessionId?: string
  metadata?: Record<string, unknown>
  input?: unknown
  output?: unknown
  tags?: string[]
  timestamp: string
  latency?: number
  totalCost?: number
  usage?: {
    input?: number
    output?: number
    total?: number
    inputCost?: number
    outputCost?: number
    totalCost?: number
  }
  observations?: string[]
  scores?: Array<{
    name: string
    value: number
  }>
  level?: string
}

interface LangfuseObservation {
  id: string
  traceId: string
  type: string
  name?: string
  model?: string
  modelParameters?: Record<string, unknown>
  input?: unknown
  output?: unknown
  startTime: string
  endTime?: string
  completionStartTime?: string
  usage?: {
    input?: number
    output?: number
    total?: number
    inputCost?: number
    outputCost?: number
    totalCost?: number
  }
  level?: string
  metadata?: Record<string, unknown>
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

interface AnalysisReport {
  generatedAt: string
  timeRange: { from: string; to: string }
  summary: {
    totalTraces: number
    totalObservations: number
    avgLatencyMs: number
    medianLatencyMs: number
    p95LatencyMs: number
    totalInputTokens: number
    totalOutputTokens: number
    totalTokens: number
    estimatedCostUsd: number
    modelBreakdown: Record<string, {
      count: number
      avgLatencyMs: number
      totalTokens: number
      estimatedCostUsd: number
    }>
    featureBreakdown: Record<string, {
      count: number
      avgLatencyMs: number
    }>
    errorRate: number
    errorTraces: Array<{ traceId: string; name?: string; error?: string }>
  }
  traces: Array<{
    id: string
    name?: string
    userId?: string
    timestamp: string
    latencyMs: number
    model?: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    metadata?: Record<string, unknown>
    inputPreview?: string
    outputPreview?: string
    level?: string
  }>
  recommendations: string[]
}

// ---------- 工具函式 ----------

function loadEnv(): Record<string, string> {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(__dirname, '..', '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    env[key] = value
  }
  return env
}

function parseArgs(): { hours: number; traceId?: string; limit: number } {
  const args = process.argv.slice(2)
  let hours = 24
  let traceId: string | undefined
  let limit = 100

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--hours' && args[i + 1]) {
      hours = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--trace-id' && args[i + 1]) {
      traceId = args[i + 1]
      i++
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10)
      i++
    }
  }

  return { hours, traceId, limit }
}

function truncateStr(s: unknown, maxLen: number): string {
  if (s == null) return ''
  const str = typeof s === 'string' ? s : JSON.stringify(s)
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

// ---------- API 呼叫 ----------

async function langfuseGet<T>(
  baseUrl: string,
  publicKey: string,
  secretKey: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${baseUrl}/api/public${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v)
    }
  }

  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64')

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Langfuse API ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

async function fetchTraces(
  baseUrl: string,
  publicKey: string,
  secretKey: string,
  fromTimestamp: string,
  toTimestamp: string,
  limit: number
): Promise<LangfuseTrace[]> {
  const result = await langfuseGet<{ data: LangfuseTrace[] }>(
    baseUrl, publicKey, secretKey,
    '/traces',
    {
      limit: String(limit),
      fromTimestamp,
      toTimestamp,
      orderBy: 'timestamp.desc',
    }
  )
  return result.data ?? []
}

async function fetchTraceById(
  baseUrl: string,
  publicKey: string,
  secretKey: string,
  traceId: string
): Promise<LangfuseTrace> {
  return langfuseGet<LangfuseTrace>(
    baseUrl, publicKey, secretKey,
    `/traces/${traceId}`
  )
}

async function fetchObservationsForTrace(
  baseUrl: string,
  publicKey: string,
  secretKey: string,
  traceId: string
): Promise<LangfuseObservation[]> {
  const result = await langfuseGet<{ data: LangfuseObservation[] }>(
    baseUrl, publicKey, secretKey,
    '/observations',
    { traceId, limit: '50' }
  )
  return result.data ?? []
}

// ---------- 分析邏輯 ----------

function generateRecommendations(report: AnalysisReport): string[] {
  const recs: string[] = []

  // 延遲分析
  if (report.summary.avgLatencyMs > 5000) {
    recs.push(`[效能] 平均延遲 ${(report.summary.avgLatencyMs / 1000).toFixed(1)}s 偏高，建議：1) 檢查 prompt 長度是否過長 2) 考慮使用更快的模型 3) 加入 prompt cache`)
  }
  if (report.summary.p95LatencyMs > 10000) {
    recs.push(`[效能] P95 延遲達 ${(report.summary.p95LatencyMs / 1000).toFixed(1)}s，存在慢查詢，建議檢查這些 trace 的 RAG 搜尋是否耗時`)
  }

  // Token 用量分析
  const avgTokens = report.summary.totalTraces > 0
    ? report.summary.totalTokens / report.summary.totalTraces
    : 0
  if (avgTokens > 3000) {
    recs.push(`[成本] 平均每次請求 ${Math.round(avgTokens)} tokens，建議精簡 system prompt 或減少 RAG context 注入量`)
  }

  // 錯誤率
  if (report.summary.errorRate > 0.05) {
    recs.push(`[穩定性] 錯誤率 ${(report.summary.errorRate * 100).toFixed(1)}%，需要排查失敗原因`)
  }

  // 模型使用建議
  const models = Object.entries(report.summary.modelBreakdown)
  for (const [model, stats] of models) {
    if (model.includes('pro') && stats.avgLatencyMs > 8000) {
      recs.push(`[模型] ${model} 平均延遲 ${(stats.avgLatencyMs / 1000).toFixed(1)}s，對於非複雜任務可改用 flash 模型`)
    }
  }

  if (recs.length === 0) {
    recs.push('[良好] 目前 LLM 呼叫指標正常，持續監控')
  }

  return recs
}

// ---------- 主程式 ----------

async function main() {
  console.log('🔍 Langfuse 數據拉取報告生成器\n')

  // 1. 載入環境變數
  const env = loadEnv()
  const baseUrl = (env.LANGFUSE_BASEURL || env.LANGFUSE_BASE_URL || '').replace(/\/$/, '')
  const publicKey = env.LANGFUSE_PUBLIC_KEY || ''
  const secretKey = env.LANGFUSE_SECRET_KEY || ''

  if (!baseUrl || !publicKey || !secretKey) {
    console.error('❌ 缺少 Langfuse 環境變數（LANGFUSE_BASEURL, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY）')
    process.exit(1)
  }

  // 2. 解析參數
  const { hours, traceId, limit } = parseArgs()

  const now = new Date()
  const from = new Date(now.getTime() - hours * 60 * 60 * 1000)

  console.log(`📊 時間範圍：${from.toISOString()} ~ ${now.toISOString()}`)
  console.log(`📝 最大筆數：${limit}`)
  if (traceId) console.log(`🔎 指定 Trace: ${traceId}`)
  console.log('')

  // 3. 拉取 traces
  let traces: LangfuseTrace[] = []

  if (traceId) {
    try {
      const trace = await fetchTraceById(baseUrl, publicKey, secretKey, traceId)
      traces = [trace]
    } catch (err) {
      console.error(`❌ 找不到 Trace ${traceId}:`, err)
      process.exit(1)
    }
  } else {
    traces = await fetchTraces(
      baseUrl, publicKey, secretKey,
      from.toISOString(), now.toISOString(), limit
    )
  }

  console.log(`✅ 取得 ${traces.length} 筆 traces`)

  // 4. 拉取 observations（前 20 筆 trace 的詳細資訊）
  const detailedTraceIds = traces.slice(0, 20).map(t => t.id)
  const allObservations: LangfuseObservation[] = []

  for (const tid of detailedTraceIds) {
    try {
      const obs = await fetchObservationsForTrace(baseUrl, publicKey, secretKey, tid)
      allObservations.push(...obs)
    } catch {
      // 忽略個別 observation 拉取失敗
    }
  }

  console.log(`✅ 取得 ${allObservations.length} 筆 observations`)

  // 5. 建立模型→observation 映射
  const obsMap = new Map<string, LangfuseObservation[]>()
  for (const obs of allObservations) {
    const existing = obsMap.get(obs.traceId) ?? []
    existing.push(obs)
    obsMap.set(obs.traceId, existing)
  }

  // 6. 計算統計
  const latencies: number[] = []
  const modelBreakdown: Record<string, { count: number; totalLatency: number; totalTokens: number; totalCost: number }> = {}
  const featureBreakdown: Record<string, { count: number; totalLatency: number }> = {}
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalTokens = 0
  let totalCost = 0
  const errorTraces: Array<{ traceId: string; name?: string; error?: string }> = []

  const traceRows: AnalysisReport['traces'] = []

  for (const trace of traces) {
    // 計算延遲
    const latencyMs = trace.latency ? trace.latency * 1000 : 0
    if (latencyMs > 0) latencies.push(latencyMs)

    // 取得相關 observations
    const obs = obsMap.get(trace.id) ?? []
    const generation = obs.find(o => o.type === 'GENERATION')

    // Token 統計
    const usage = trace.usage ?? generation?.usage
    const inTokens = usage?.input ?? 0
    const outTokens = usage?.output ?? 0
    const tTokens = usage?.total ?? (inTokens + outTokens)
    const cost = usage?.totalCost ?? trace.totalCost ?? 0

    totalInputTokens += inTokens
    totalOutputTokens += outTokens
    totalTokens += tTokens
    totalCost += cost

    // 模型統計
    const model = generation?.model ?? (trace.metadata as Record<string, string>)?.model ?? 'unknown'
    if (!modelBreakdown[model]) {
      modelBreakdown[model] = { count: 0, totalLatency: 0, totalTokens: 0, totalCost: 0 }
    }
    modelBreakdown[model].count++
    modelBreakdown[model].totalLatency += latencyMs
    modelBreakdown[model].totalTokens += tTokens
    modelBreakdown[model].totalCost += cost

    // 功能統計（從 metadata 或 name 推斷）
    const feature = trace.name
      ?? (trace.metadata as Record<string, string>)?.feature
      ?? 'unknown'
    if (!featureBreakdown[feature]) {
      featureBreakdown[feature] = { count: 0, totalLatency: 0 }
    }
    featureBreakdown[feature].count++
    featureBreakdown[feature].totalLatency += latencyMs

    // 錯誤檢測
    if (trace.level === 'ERROR' || trace.level === 'WARNING') {
      errorTraces.push({
        traceId: trace.id,
        name: trace.name,
        error: truncateStr(trace.output, 200),
      })
    }

    // 每筆 trace 摘要
    traceRows.push({
      id: trace.id,
      name: trace.name,
      userId: trace.userId,
      timestamp: trace.timestamp,
      latencyMs,
      model,
      inputTokens: inTokens,
      outputTokens: outTokens,
      totalTokens: tTokens,
      metadata: trace.metadata,
      inputPreview: truncateStr(trace.input, 200),
      outputPreview: truncateStr(trace.output, 300),
      level: trace.level,
    })
  }

  // 7. 彙整模型統計
  const modelStats: AnalysisReport['summary']['modelBreakdown'] = {}
  for (const [model, stats] of Object.entries(modelBreakdown)) {
    modelStats[model] = {
      count: stats.count,
      avgLatencyMs: stats.count > 0 ? Math.round(stats.totalLatency / stats.count) : 0,
      totalTokens: stats.totalTokens,
      estimatedCostUsd: stats.totalCost,
    }
  }

  const featureStats: AnalysisReport['summary']['featureBreakdown'] = {}
  for (const [feature, stats] of Object.entries(featureBreakdown)) {
    featureStats[feature] = {
      count: stats.count,
      avgLatencyMs: stats.count > 0 ? Math.round(stats.totalLatency / stats.count) : 0,
    }
  }

  // 8. 組裝報告
  const report: AnalysisReport = {
    generatedAt: now.toISOString(),
    timeRange: { from: from.toISOString(), to: now.toISOString() },
    summary: {
      totalTraces: traces.length,
      totalObservations: allObservations.length,
      avgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      medianLatencyMs: Math.round(median(latencies)),
      p95LatencyMs: Math.round(percentile(latencies, 95)),
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      estimatedCostUsd: totalCost,
      modelBreakdown: modelStats,
      featureBreakdown: featureStats,
      errorRate: traces.length > 0 ? errorTraces.length / traces.length : 0,
      errorTraces,
    },
    traces: traceRows,
    recommendations: [],
  }

  // 9. 產出建議
  report.recommendations = generateRecommendations(report)

  // 10. 寫入報告
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const outputPath = resolve(__dirname, 'langfuse-report.json')
  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8')

  console.log(`\n📄 報告已寫入：${outputPath}`)
  console.log('\n===== 摘要 =====')
  console.log(`  Traces: ${report.summary.totalTraces}`)
  console.log(`  Observations: ${report.summary.totalObservations}`)
  console.log(`  平均延遲: ${report.summary.avgLatencyMs}ms`)
  console.log(`  P95 延遲: ${report.summary.p95LatencyMs}ms`)
  console.log(`  總 Tokens: ${report.summary.totalTokens}`)
  console.log(`  預估成本: $${report.summary.estimatedCostUsd.toFixed(4)}`)
  console.log(`  錯誤率: ${(report.summary.errorRate * 100).toFixed(1)}%`)
  console.log('\n===== 模型統計 =====')
  for (const [model, stats] of Object.entries(report.summary.modelBreakdown)) {
    console.log(`  ${model}: ${stats.count} 次, 平均 ${stats.avgLatencyMs}ms, ${stats.totalTokens} tokens`)
  }
  console.log('\n===== 功能統計 =====')
  for (const [feature, stats] of Object.entries(report.summary.featureBreakdown)) {
    console.log(`  ${feature}: ${stats.count} 次, 平均 ${stats.avgLatencyMs}ms`)
  }
  console.log('\n===== 改善建議 =====')
  for (const rec of report.recommendations) {
    console.log(`  ${rec}`)
  }
}

main().catch((err) => {
  console.error('❌ 報告生成失敗:', err)
  process.exit(1)
})
