import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/knowledge/:id/related
 * 查詢與指定文件有關聯的其他文件 ID
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { data: relations, error } = await supabase
    .from('document_relations')
    .select('source_document_id, target_document_id')
    .or(`source_document_id.eq.${id},target_document_id.eq.${id}`)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const relatedDocIds = (relations ?? [])
    .map((r) =>
      r.source_document_id === id ? r.target_document_id : r.source_document_id,
    )
    .filter((docId, idx, arr) => arr.indexOf(docId) === idx) // dedupe

  return NextResponse.json({ relatedDocIds })
}
