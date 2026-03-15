import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST: 還原文件到指定版本
export async function POST(
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
    .select('id, title, content, summary')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // 取得要還原的版本
  const { data: version } = await supabase
    .from('document_versions')
    .select('id, version_number, title, content, summary')
    .eq('id', versionId)
    .eq('document_id', id)
    .single()

  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  // 先建立當前狀態的版本快照
  const { data: maxVersion } = await supabase
    .from('document_versions')
    .select('version_number')
    .eq('document_id', id)
    .order('version_number', { ascending: false })
    .limit(1)
    .single()

  const nextVersion = (maxVersion?.version_number ?? 0) + 1

  await supabase.from('document_versions').insert({
    document_id: id,
    version_number: nextVersion,
    title: doc.title,
    content: doc.content,
    summary: doc.summary,
    change_description: `還原前自動備份（將還原至 v${version.version_number}）`,
  })

  // 還原文件內容
  const { error: updateError } = await supabase
    .from('documents')
    .update({
      title: version.title,
      content: version.content,
      summary: version.summary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // 建立還原後的版本紀錄
  await supabase.from('document_versions').insert({
    document_id: id,
    version_number: nextVersion + 1,
    title: version.title,
    content: version.content,
    summary: version.summary,
    change_description: `還原至 v${version.version_number}`,
  })

  return NextResponse.json({ success: true })
}
