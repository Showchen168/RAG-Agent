import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  extractAssistantContent,
  generateDocxBuffer,
  generatePdfBuffer,
  generatePptxBuffer,
  sanitizeFilename,
} from '@/lib/export/document-export'

export const runtime = 'nodejs'

type ExportFormat = 'docx' | 'pdf' | 'pptx'

function getMimeType(format: ExportFormat): string {
  if (format === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (format === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  return 'application/pdf'
}

function getFileExt(format: ExportFormat): string {
  return format
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: conversationId } = await params
  const { searchParams } = new URL(req.url)
  const format = (searchParams.get('format') ?? 'docx').toLowerCase() as ExportFormat
  const messageId = searchParams.get('messageId')

  if (!['docx', 'pdf', 'pptx'].includes(format)) {
    return NextResponse.json({ error: 'Unsupported format. Use docx/pdf/pptx.' }, { status: 400 })
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id, title')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (conversationError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  let messageQuery = supabase
    .from('messages')
    .select('id, role, content')
    .eq('conversation_id', conversationId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)

  if (messageId) {
    messageQuery = supabase
      .from('messages')
      .select('id, role, content')
      .eq('conversation_id', conversationId)
      .eq('role', 'assistant')
      .eq('id', messageId)
      .limit(1)
  }

  const { data: messageRows, error: messageError } = await messageQuery

  // messageId 可能是前端暫時 ID（尚未落庫），此時自動回退最新 assistant 訊息
  let selectedRows = messageRows
  if (messageId && (!selectedRows || selectedRows.length === 0) && !messageError) {
    const { data: fallbackRows, error: fallbackError } = await supabase
      .from('messages')
      .select('id, role, content')
      .eq('conversation_id', conversationId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
    if (!fallbackError && fallbackRows && fallbackRows.length > 0) {
      selectedRows = fallbackRows
    }
  }

  if (messageError || !selectedRows || selectedRows.length === 0) {
    return NextResponse.json({ error: 'No assistant message found for export' }, { status: 404 })
  }

  const selectedMessage = selectedRows[0]
  // 改用 extractAssistantContent 取得結構化區塊
  const blocks = extractAssistantContent(selectedMessage.content ?? '')

  if (!blocks || blocks.length === 0) {
    return NextResponse.json({ error: 'Empty message content' }, { status: 400 })
  }

  const title = conversation.title?.trim() || 'NexusMind_Document'
  const safeBaseName = sanitizeFilename(title)
  const timestamp = new Date().toISOString().slice(0, 10)
  const filename = `${safeBaseName}_${timestamp}.${getFileExt(format)}`

  let buffer: Buffer
  if (format === 'docx') {
    buffer = await generateDocxBuffer(title, blocks)
  } else if (format === 'pptx') {
    buffer = await generatePptxBuffer(title, blocks)
  } else {
    buffer = await generatePdfBuffer(title, blocks)
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': getMimeType(format),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  })
}
