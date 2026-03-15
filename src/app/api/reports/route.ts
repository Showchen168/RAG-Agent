import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: 列出使用者的所有報告
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('reports')
    .select('id, title, summary, tags, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

// POST: 建立新報告（從對話儲存）
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    title?: string
    markdown_content: string
    canvas_content?: Record<string, unknown>
    plain_text?: string
    conversation_id?: string
    tags?: string[]
  }

  if (!body.markdown_content) {
    return NextResponse.json({ error: 'markdown_content is required' }, { status: 400 })
  }

  // 優先使用前端傳來的 plain_text，否則從 markdown 擷取
  const plainText = body.plain_text
    ? String(body.plain_text).trim()
    : body.markdown_content
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[#>*`_~|-]/g, ' ')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()

  // 取前 150 字作為摘要
  const summary = plainText.slice(0, 150) + (plainText.length > 150 ? '...' : '')

  const insertData: Record<string, unknown> = {
    user_id: user.id,
    title: body.title || '未命名報告',
    markdown_content: body.markdown_content,
    plain_text: plainText,
    summary,
    conversation_id: body.conversation_id || null,
    tags: body.tags || [],
  }

  // 如果前端傳來 TipTap JSON，一併儲存（載入時優先使用）
  if (body.canvas_content && Object.keys(body.canvas_content).length > 0) {
    insertData.canvas_content = body.canvas_content
  }

  const { data, error } = await supabase
    .from('reports')
    .insert(insertData)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
