import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUrl } from '@/lib/gdrive/auth'
import { isConnected, deleteTokens } from '@/lib/gdrive/tokens'

/**
 * GET /api/gdrive/connect
 *
 * 檢查 Google Drive 連接狀態
 * - 如果已連接（token 存在）：返回 { connected: true }
 * - 如果未連接：返回 { connected: false, authUrl: "..." }
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const connected = await isConnected(user.id)

    if (connected) {
      return NextResponse.json({
        success: true,
        data: {
          connected: true,
        },
      })
    }

    // 未連接 → 生成授權 URL
    const authUrl = getAuthUrl(user.id)

    return NextResponse.json({
      success: true,
      data: {
        connected: false,
        authUrl,
        message: '請先連接 Google Drive',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Google Drive 連接檢查失敗：${message}` },
      { status: 500 }
    )
  }
}

/**
 * POST /api/gdrive/connect
 *
 * 生成 Google OAuth 授權 URL
 * 前端用此 URL 跳轉到 Google 授權頁面
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const authUrl = getAuthUrl(user.id)

    return NextResponse.json({
      success: true,
      data: { authUrl },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `生成授權 URL 失敗：${message}` },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/gdrive/connect
 *
 * 撤銷 Google Drive 連接
 * 刪除該用戶的 access token 和 refresh token
 */
export async function DELETE() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await deleteTokens(user.id)

    return NextResponse.json({
      success: true,
      data: { message: 'Google Drive 連接已撤銷' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `撤銷連接失敗：${message}` },
      { status: 500 }
    )
  }
}
