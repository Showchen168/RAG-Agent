import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// --- Zod Schemas ---

const conversationExtraSchema = z.object({
  presetAssistantId: z.string().uuid(),
  presetName: z.string().max(100),
  enabledSkillIds: z.array(z.string().uuid()).max(50),
  rules: z.array(
    z.object({
      id: z.string().uuid(),
      content: z.string(),
    }),
  ).max(20),
}).strict()

const createConversationSchema = z.object({
  title: z.string().max(200).optional(),
  model: z.string().max(50).optional().default('gemini-flash'),
  extra: conversationExtraSchema.optional(),
})

// GET: 取得使用者的所有對話
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[GET /api/conversations] DB error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

// POST: 建立新對話
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = createConversationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const { title, model, extra } = parsed.data

  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    title: title ?? '新對話',
    model,
  }
  // 只在有 extra 時才寫入（避免覆蓋預設值）
  if (extra) {
    insertPayload.extra = extra
  }

  const { data, error } = await supabase
    .from('conversations')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    console.error('[POST /api/conversations] DB error:', error.message)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
