import type { SupabaseClient } from '@supabase/supabase-js'

export interface RssSourceMatch {
  documentId: string
  sourceName: string
  sourceType: string
}

const MIN_SOURCE_NAME_LENGTH = 3

/**
 * 檢查用戶查詢是否提及已監控的知識源名稱（RSS / URL）
 *
 * 匹配策略：
 * - 英文名稱：word boundary regex（避免子字串誤匹配）
 * - 中文名稱：大小寫不敏感的 includes（中文無 word boundary）
 * - 名稱長度 < 3 → 跳過（避免短名稱如 "AI" 的誤匹配）
 *
 * 邊界處理：
 * - 多個源匹配 → 取 name 最長者（最具體）
 * - 停用源（is_active=false）→ 排除
 * - document_id 為 null 或 document 已停用 → 排除
 */
export async function matchRssSource(
  query: string,
  userId: string,
  supabase: SupabaseClient
): Promise<RssSourceMatch | null> {
  const { data: sources, error } = await supabase
    .from('knowledge_sources')
    .select('name, document_id, source_type')
    .eq('user_id', userId)
    .eq('is_active', true)
    .not('document_id', 'is', null)

  if (error || !sources || sources.length === 0) {
    return null
  }

  const queryLower = query.toLowerCase()
  const matched = sources.filter((s) => {
    if (!s.name || s.name.length < MIN_SOURCE_NAME_LENGTH) return false
    const nameLower = s.name.toLowerCase()

    // 英文名稱：使用 word boundary 避免誤匹配
    // 中文名稱：直接 includes（中文無 word boundary）
    const hasLatinChars = /[a-z]/i.test(s.name)
    if (hasLatinChars) {
      const escaped = nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`\\b${escaped}\\b`, 'i')
      return regex.test(query)
    }
    return queryLower.includes(nameLower)
  })

  if (matched.length === 0) {
    return null
  }

  // 多個匹配 → 取 name 最長者（最具體）
  const best = matched.reduce((a, b) =>
    (a.name?.length ?? 0) >= (b.name?.length ?? 0) ? a : b
  )

  // 驗證關聯的 document 是否存在且啟用
  const { data: doc } = await supabase
    .from('documents')
    .select('id')
    .eq('id', best.document_id)
    .eq('enabled', true)
    .single()

  if (!doc) {
    return null
  }

  return {
    documentId: best.document_id,
    sourceName: best.name,
    sourceType: best.source_type,
  }
}
