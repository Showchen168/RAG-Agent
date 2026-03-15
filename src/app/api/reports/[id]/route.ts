import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: 取得單一報告
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
    .from('reports')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  return NextResponse.json({ success: true, data })
}

// PUT: 更新報告（Canvas 編輯後儲存）
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    title?: string
    markdown_content?: string
    canvas_content?: Record<string, unknown>
    plain_text?: string
    tags?: string[]
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) updateData.title = body.title
  if (body.markdown_content !== undefined) updateData.markdown_content = body.markdown_content
  if (body.canvas_content !== undefined) updateData.canvas_content = body.canvas_content
  if (body.plain_text !== undefined) {
    updateData.plain_text = body.plain_text
    // 自動重新生成 summary（取前 150 字）
    const plainStr = String(body.plain_text).trim()
    if (plainStr) {
      updateData.summary = plainStr.slice(0, 150) + (plainStr.length > 150 ? '...' : '')
    }
  }
  if (body.tags !== undefined) updateData.tags = body.tags

  const { data, error } = await supabase
    .from('reports')
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

// DELETE: 刪除報告
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('reports')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
