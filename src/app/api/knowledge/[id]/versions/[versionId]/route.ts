import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: 取得版本完整內容（用於 diff 對比）
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, versionId } = await params

  // 確認文件屬於此使用者
  const { data: doc } = await supabase
    .from('documents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const { data: version, error } = await supabase
    .from('document_versions')
    .select('id, document_id, version_number, title, content, summary, change_description, created_at')
    .eq('id', versionId)
    .eq('document_id', id)
    .single()

  if (error || !version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true, data: version })
}
