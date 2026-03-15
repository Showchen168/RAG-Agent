import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isYouTubeUrl, parseYouTubeUrl } from '@/lib/knowledge/youtube-utils'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 })
  }

  const { url, name, check_interval_hours = 24 } = await req.json() as {
    url: string
    name: string
    check_interval_hours?: number
  }

  if (!url || !name) {
    return NextResponse.json({ error: '請提供頻道 URL 和名稱' }, { status: 400 })
  }

  if (!isYouTubeUrl(url)) {
    return NextResponse.json({ error: '僅支援 YouTube URL' }, { status: 400 })
  }

  const parsed = parseYouTubeUrl(url)
  if (!parsed || parsed.type !== 'channel') {
    return NextResponse.json({ error: '請提供 YouTube 頻道 URL（格式：youtube.com/@頻道名）' }, { status: 400 })
  }

  try {
    const { data: source, error: insertError } = await supabase
      .from('knowledge_sources')
      .insert({
        user_id: user.id,
        source_type: 'youtube',
        url,
        name,
        check_interval_hours,
        is_active: true,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: `建立監控源失敗: ${insertError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: source })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
