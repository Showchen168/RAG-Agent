import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { embed } from 'ai'
import { getEmbeddingModel, EMBEDDING_PROVIDER_OPTIONS } from '@/lib/ai/providers'

// POST: 語意搜尋文件
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { query, matchCount = 5, threshold = 0.7 } = await req.json() as {
    query: string
    matchCount?: number
    threshold?: number
  }

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 })
  }

  // 1. 將查詢轉為向量
  const { embedding } = await embed({
    model: getEmbeddingModel(),
    value: query,
    providerOptions: EMBEDDING_PROVIDER_OPTIONS,
  })

  // 2. 呼叫 Supabase RPC 進行語意搜尋
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: threshold,
    match_count: matchCount,
    p_user_id: user.id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
