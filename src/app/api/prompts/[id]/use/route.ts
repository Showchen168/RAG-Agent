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

  // 增加使用次數（先取得目前計數，再加 1）
  const { data: template } = await supabase
    .from('prompt_templates')
    .select('usage_count')
    .eq('id', templateId)
    .single()

  if (template) {
    await supabase
      .from('prompt_templates')
      .update({
        usage_count: template.usage_count + 1,
      })
      .eq('id', templateId)
  }

  return NextResponse.json({ success: true })
}
