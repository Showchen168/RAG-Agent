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

  const { id } = await params
  const body = await req.json() as { messageIndex?: number; messageId?: string }

  // 1. 驗證原對話屬於當前使用者
  const { data: originalConv, error: convError } = await supabase
    .from('conversations')
    .select('id, title, model')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (convError || !originalConv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  // 2. 取得該對話的所有訊息（按時間排序）
  const { data: allMessages, error: allMsgsError } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  if (allMsgsError || !allMessages) {
    return NextResponse.json({ error: allMsgsError?.message ?? 'Failed to fetch messages' }, { status: 500 })
  }

  // 3. 根據 messageIndex 或 messageId 決定要複製到哪一條訊息
  let cutoffIndex: number

  if (typeof body.messageIndex === 'number') {
    // 使用前端的訊息索引（0-based）
    cutoffIndex = body.messageIndex
  } else if (body.messageId) {
    // 向後兼容：使用 messageId 查找
    cutoffIndex = allMessages.findIndex(m => m.id === body.messageId)
  } else {
    return NextResponse.json({ error: 'messageIndex or messageId is required' }, { status: 400 })
  }

  if (cutoffIndex < 0 || cutoffIndex >= allMessages.length) {
    return NextResponse.json({ error: 'Message not found at given index' }, { status: 404 })
  }

  // 4. 取得 fork 點之前（含）的所有訊息
  const messagesToCopy = allMessages.slice(0, cutoffIndex + 1)

  // 5. 建立新的分支對話
  const forkTitle = `${originalConv.title} (分支)`
  const { data: newConv, error: createError } = await supabase
    .from('conversations')
    .insert({
      user_id: user.id,
      title: forkTitle,
      model: originalConv.model,
      parent_conversation_id: id,
      fork_from_message_id: allMessages[cutoffIndex].id,
    })
    .select('id')
    .single()

  if (createError || !newConv) {
    return NextResponse.json({ error: createError?.message ?? 'Failed to create fork' }, { status: 500 })
  }

  // 6. 複製訊息到新對話
  if (messagesToCopy.length > 0) {
    const newMessages = messagesToCopy.map((msg) => ({
      conversation_id: newConv.id,
      role: msg.role,
      content: msg.content,
    }))

    const { error: insertError } = await supabase
      .from('messages')
      .insert(newMessages)

    if (insertError) {
      // 回滾：刪除已建立的對話
      await supabase.from('conversations').delete().eq('id', newConv.id)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, conversationId: newConv.id })
}
