import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: 列出文件所有版本（按 version_number DESC）
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // 確認文件屬於此使用者
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (docError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const { data: versions, error } = await supabase
    .from('document_versions')
    .select('id, document_id, version_number, title, summary, change_description, created_at')
    .eq('document_id', id)
    .order('version_number', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: versions })
}

// POST: 手動建立版本快照
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({})) as { change_description?: string }

  // 取得文件當前內容
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id, title, content, summary')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (docError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // 計算下一個版本號
  const { data: maxVersion } = await supabase
    .from('document_versions')
    .select('version_number')
    .eq('document_id', id)
    .order('version_number', { ascending: false })
    .limit(1)
    .single()

  const nextVersion = (maxVersion?.version_number ?? 0) + 1

  const { data: version, error: insertError } = await supabase
    .from('document_versions')
    .insert({
      document_id: id,
      version_number: nextVersion,
      title: doc.title,
      content: doc.content,
      summary: doc.summary,
      change_description: body.change_description ?? '手動快照',
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: version })
}
