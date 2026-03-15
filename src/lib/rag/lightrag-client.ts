/**
 * LightRAG GraphRAG 微服務 HTTP Client
 *
 * 提供與 Docker 中的 LightRAG 服務通訊的介面。
 * 當 LightRAG 不可用時，靜默返回失敗，讓呼叫端降級回純向量搜尋。
 */

const LIGHTRAG_URL = process.env.LIGHTRAG_SERVICE_URL || ''
const HEALTH_TIMEOUT_MS = 3000
const INDEX_TIMEOUT_MS = 60000
const QUERY_TIMEOUT_MS = 15000

export interface LightRAGQueryResult {
  success: true
  result: string
  mode: string
  query_time_seconds: number
}

export interface LightRAGGraphNode {
  id: string
  label: string
  type: string
  description: string
}

export interface LightRAGGraphEdge {
  source: string
  target: string
  relation: string
  weight: number
}

interface LightRAGFailure {
  success: false
  error: string
}

/** 檢查 LightRAG 微服務是否在線。 */
export async function isLightRAGAvailable(): Promise<boolean> {
  if (!LIGHTRAG_URL) return false

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
    const res = await fetch(`${LIGHTRAG_URL}/health`, { signal: controller.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

/** 索引文件到 LightRAG 知識圖譜。 */
export async function indexDocument(params: {
  text: string
  docId: string
  userId: string
}): Promise<{ success: boolean; error?: string }> {
  if (!LIGHTRAG_URL) {
    return { success: false, error: 'LIGHTRAG_SERVICE_URL not configured' }
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), INDEX_TIMEOUT_MS)

    const res = await fetch(`${LIGHTRAG_URL}/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: params.text,
        doc_id: params.docId,
        user_id: params.userId,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data = await res.json()
    return { success: data.success ?? false, error: data.error }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[LightRAGClient] Index failed:', msg)
    return { success: false, error: msg }
  }
}

/** 查詢 LightRAG 知識圖譜。 */
export async function queryLightRAG(params: {
  query: string
  userId: string
  mode?: string
}): Promise<LightRAGQueryResult | LightRAGFailure> {
  if (!LIGHTRAG_URL) {
    return { success: false, error: 'LIGHTRAG_SERVICE_URL not configured' }
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS)

    const res = await fetch(`${LIGHTRAG_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: params.query,
        user_id: params.userId,
        mode: params.mode ?? 'hybrid',
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data = await res.json()
    if (!data.success) {
      return { success: false, error: data.error || 'Unknown error' }
    }
    return data as LightRAGQueryResult
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[LightRAGClient] Query failed:', msg)
    return { success: false, error: msg }
  }
}

/** 取得 LightRAG 知識圖譜（實體 + 關係）。 */
export async function getLightRAGGraph(userId: string): Promise<{
  success: boolean
  nodes: LightRAGGraphNode[]
  edges: LightRAGGraphEdge[]
  error?: string
}> {
  if (!LIGHTRAG_URL) {
    return { success: false, nodes: [], edges: [], error: 'LIGHTRAG_SERVICE_URL not configured' }
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS)

    const res = await fetch(`${LIGHTRAG_URL}/graph`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data = await res.json()
    return {
      success: data.success ?? false,
      nodes: data.nodes ?? [],
      edges: data.edges ?? [],
      error: data.error,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, nodes: [], edges: [], error: msg }
  }
}
