import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: templateId } = await params

  // 驗證模板存在且為公開
  const { data: template, error: templateError } = await supabase
    .from('prompt_templates')
    .select('id, is_public')
    .eq('id', templateId)
    .single()

  if (templateError || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  if (!template.is_public) {
    return NextResponse.json({ error: 'Cannot favorite private template' }, { status: 400 })
  }

  // 切換收藏狀態
  const { data: existing } = await supabase
    .from('prompt_favorites')
    .select('*')
    .eq('user_id', user.id)
    .eq('template_id', templateId)
    .maybeSingle()

  if (existing) {
    // 取消收藏
    const { error } = await supabase
      .from('prompt_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('template_id', templateId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ favorited: false })
  } else {
    // 新增收藏
    const { error } = await supabase
      .from('prompt_favorites')
      .insert({
        user_id: user.id,
        template_id: templateId,
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ favorited: true })
  }
}
