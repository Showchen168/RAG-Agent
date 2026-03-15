import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope') || 'mine' // mine | public | featured

  let query = supabase.from('prompt_templates').select('*')

  switch (scope) {
    case 'mine':
      query = query.eq('user_id', user.id)
      break
    case 'public':
      query = query.eq('is_public', true).order('likes_count', { ascending: false })
      break
    case 'featured':
      query = query.eq('is_featured', true).order('usage_count', { ascending: false })
      break
    case 'chat':
      // 聊天選單用：所有公開角色 + 自己的角色
      query = query.or(`is_public.eq.true,user_id.eq.${user.id}`).order('created_at', { ascending: true })
      break
    default:
      query = query.eq('user_id', user.id)
  }

  const { data: templates, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 取得使用者收藏列表
  const { data: favorites } = await supabase
    .from('prompt_favorites')
    .select('template_id')
    .eq('user_id', user.id)

  const favoriteIds = new Set(favorites?.map((f) => f.template_id) || [])

  const templatesWithFavorite = templates?.map((t) => ({
    ...t,
    isFavorited: favoriteIds.has(t.id),
  }))

  return NextResponse.json({ templates: templatesWithFavorite })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    name: string
    description?: string
    icon?: string
    category: string
    system_prompt: string
    is_public?: boolean
    tags?: string[]
    variables?: Array<{ name: string; placeholder?: string }>
  }

  const { data: template, error } = await supabase
    .from('prompt_templates')
    .insert({
      user_id: user.id,
      name: body.name,
      description: body.description,
      icon: body.icon || 'Sparkles',
      category: body.category,
      system_prompt: body.system_prompt,
      is_public: body.is_public || false,
      tags: body.tags || [],
      variables: body.variables || [],
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ template })
}
