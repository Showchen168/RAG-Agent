/**
 * Langfuse 數據查詢 API 端點（內部管理用）
 *
 * GET /api/admin/langfuse?hours=24&limit=50
 * GET /api/admin/langfuse?traceId=xxx
 *
 * 此端點僅限已登入使用者存取，用於讓 Claude Code
 * 透過 curl 快速取得 LLM trace 數據進行互動分析
 */

import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

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
  level?: string
}

interface LangfuseObservation {
  id: string
  traceId: string
  type: string
  name?: string
  model?: string
  input?: unknown
  output?: unknown
  startTime: string
  endTime?: string
  usage?: {
    input?: number
    output?: number
    total?: number
    totalCost?: number
  }
  level?: string
  metadata?: Record<string, unknown>
}

async function langfuseGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const baseUrl = (process.env.LANGFUSE_BASEURL ?? '').replace(/\/$/, '')
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY ?? ''
  const secretKey = process.env.LANGFUSE_SECRET_KEY ?? ''

  if (!baseUrl || !publicKey || !secretKey) {
    throw new Error('Langfuse 環境變數未設定')
  }

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
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Langfuse API ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
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
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

export async function GET(request: Request) {
  try {
    // 1. 驗證使用者身份
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. 解析查詢參數
    const url = new URL(request.url)
    const hours = parseInt(url.searchParams.get('hours') ?? '24', 10)
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)
    const traceId = url.searchParams.get('traceId')

    const now = new Date()
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000)

    // 3. 拉取 traces
    let traces: LangfuseTrace[] = []

    if (traceId) {
      const trace = await langfuseGet<LangfuseTrace>(`/traces/${traceId}`)
      traces = [trace]
    } else {
      const result = await langfuseGet<{ data: LangfuseTrace[] }>('/traces', {
        limit: String(limit),
        fromTimestamp: from.toISOString(),
        toTimestamp: now.toISOString(),
        orderBy: 'timestamp.desc',
      })
      traces = result.data ?? []
    }

    // 4. 取前 10 筆 trace 的 observations
    const detailedTraceIds = traces.slice(0, 10).map(t => t.id)
    const allObservations: LangfuseObservation[] = []

    for (const tid of detailedTraceIds) {
      try {
        const result = await langfuseGet<{ data: LangfuseObservation[] }>(
          '/observations', { traceId: tid, limit: '20' }
        )
        allObservations.push(...(result.data ?? []))
      } catch {
        // 忽略個別失敗
      }
    }

    // 5. 建立 observation 映射
    const obsMap = new Map<string, LangfuseObservation[]>()
    for (const obs of allObservations) {
      const existing = obsMap.get(obs.traceId) ?? []
      existing.push(obs)
      obsMap.set(obs.traceId, existing)
    }

    // 6. 統計分析
    const latencies: number[] = []
    const modelBreakdown: Record<string, { count: number; totalLatency: number; totalTokens: number; totalCost: number }> = {}
    const featureBreakdown: Record<string, { count: number; totalLatency: number }> = {}
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalTokens = 0
    let totalCost = 0
    const errorTraces: Array<{ traceId: string; name?: string }> = []

    const traceRows = traces.map(trace => {
      const latencyMs = trace.latency ? trace.latency * 1000 : 0
      if (latencyMs > 0) latencies.push(latencyMs)

      const obs = obsMap.get(trace.id) ?? []
      const generation = obs.find(o => o.type === 'GENERATION')

      const usage = trace.usage ?? generation?.usage
      const inTokens = usage?.input ?? 0
      const outTokens = usage?.output ?? 0
      const tTokens = usage?.total ?? (inTokens + outTokens)
      const cost = usage?.totalCost ?? trace.totalCost ?? 0

      totalInputTokens += inTokens
      totalOutputTokens += outTokens
      totalTokens += tTokens
      totalCost += cost

      const model = generation?.model ?? (trace.metadata as Record<string, string>)?.model ?? 'unknown'
      if (!modelBreakdown[model]) {
        modelBreakdown[model] = { count: 0, totalLatency: 0, totalTokens: 0, totalCost: 0 }
      }
      modelBreakdown[model].count++
      modelBreakdown[model].totalLatency += latencyMs
      modelBreakdown[model].totalTokens += tTokens
      modelBreakdown[model].totalCost += cost

      const feature = trace.name ?? (trace.metadata as Record<string, string>)?.feature ?? 'unknown'
      if (!featureBreakdown[feature]) {
        featureBreakdown[feature] = { count: 0, totalLatency: 0 }
      }
      featureBreakdown[feature].count++
      featureBreakdown[feature].totalLatency += latencyMs

      if (trace.level === 'ERROR' || trace.level === 'WARNING') {
        errorTraces.push({ traceId: trace.id, name: trace.name })
      }

      return {
        id: trace.id,
        name: trace.name,
        userId: trace.userId,
        timestamp: trace.timestamp,
        latencyMs,
        model,
        inputTokens: inTokens,
        outputTokens: outTokens,
        totalTokens: tTokens,
        inputPreview: truncateStr(trace.input, 150),
        outputPreview: truncateStr(trace.output, 200),
        level: trace.level,
      }
    })

    // 7. 彙整結果
    const modelStats: Record<string, { count: number; avgLatencyMs: number; totalTokens: number; estimatedCostUsd: number }> = {}
    for (const [model, stats] of Object.entries(modelBreakdown)) {
      modelStats[model] = {
        count: stats.count,
        avgLatencyMs: stats.count > 0 ? Math.round(stats.totalLatency / stats.count) : 0,
        totalTokens: stats.totalTokens,
        estimatedCostUsd: stats.totalCost,
      }
    }

    const featureStats: Record<string, { count: number; avgLatencyMs: number }> = {}
    for (const [feature, stats] of Object.entries(featureBreakdown)) {
      featureStats[feature] = {
        count: stats.count,
        avgLatencyMs: stats.count > 0 ? Math.round(stats.totalLatency / stats.count) : 0,
      }
    }

    return Response.json({
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
    })
  } catch (error) {
    console.error('Langfuse admin API error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
