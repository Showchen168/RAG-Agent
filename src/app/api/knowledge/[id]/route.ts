import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: 取得單一文件（含完整內容）
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  return NextResponse.json({ success: true, data })
}

// PUT: 更新文件內容（自動建立版本快照）
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json() as { title?: string; content?: string; summary?: string; change_description?: string }

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

  const currentMax = maxVersion?.version_number ?? 0

  // 若為該文件的首次版本，先建立 v1（原始內容）
  if (currentMax === 0) {
    await supabase.from('document_versions').insert({
      document_id: id,
      version_number: 1,
      title: doc.title,
      content: doc.content,
      summary: doc.summary,
      change_description: '初始版本',
    })
  }

  const nextVersion = currentMax === 0 ? 2 : currentMax + 1

  // 建立新版本快照（新內容）
  await supabase.from('document_versions').insert({
    document_id: id,
    version_number: nextVersion,
    title: body.title ?? doc.title,
    content: body.content ?? doc.content,
    summary: body.summary ?? doc.summary,
    change_description: body.change_description ?? '文件更新',
  })

  // 更新文件本體
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) updateData.title = body.title
  if (body.content !== undefined) updateData.content = body.content
  if (body.summary !== undefined) updateData.summary = body.summary

  const { data, error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

// PATCH: 切換文件 enabled 狀態
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json() as { enabled: boolean }

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('documents')
    .update({ enabled: body.enabled })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, enabled')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

// DELETE: 刪除文件（cascade 自動刪除 embeddings）
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
