import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { handleCallback } from '@/lib/gdrive/auth'
import { saveTokens } from '@/lib/gdrive/tokens'

/**
 * 取得正確的 base URL（支援反向代理）
 * 優先順序：x-forwarded-host header > NEXT_PUBLIC_APP_URL > req.url
 */
async function getBaseUrl(reqUrl: string): Promise<string> {
  const hdrs = await headers()
  const forwardedHost = hdrs.get('x-forwarded-host')
  const forwardedProto = hdrs.get('x-forwarded-proto') || 'https'

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  // fallback: 從 req.url 提取
  const url = new URL(reqUrl)
  return url.origin
}

/**
 * GET /api/gdrive/callback
 *
 * Google OAuth callback 路由
 * 前端從 Google 授權頁面重定向回此路由，攜帶 code 和 state
 *
 * 流程：
 * 1. 從 state 提取 userId（用戶身份）
 * 2. 用 code 交換 Google token（access_token, refresh_token, expiry）
 * 3. 儲存 token 到 DB（加密）
 * 4. 重定向回前端（帶 success=true）
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const baseUrl = await getBaseUrl(req.url)

    // Google 授權被拒絕
    if (error) {
      const errorDesc = searchParams.get('error_description') || 'Unknown error'
      console.error(`Google OAuth error: ${error} - ${errorDesc}`)
      return NextResponse.redirect(
        new URL(`/knowledge?error=google_auth_failed&message=${encodeURIComponent(errorDesc)}`, baseUrl)
      )
    }

    // 缺少必要參數
    if (!code || !state) {
      console.error('Missing code or state in callback')
      return NextResponse.redirect(
        new URL('/knowledge?error=missing_code_or_state', baseUrl)
      )
    }

    // state 包含 userId（用於多用戶環境）
    const userId = state

    // 交換 code 取得 token
    const tokens = await handleCallback(code)

    // 儲存 token（加密）
    await saveTokens(userId, tokens)

    // 重定向回前端，帶 success 標誌
    return NextResponse.redirect(
      new URL('/knowledge?gdrive_connected=true', baseUrl)
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`OAuth callback error: ${message}`)
    const baseUrl = await getBaseUrl(req.url)

    return NextResponse.redirect(
      new URL(`/knowledge?error=oauth_callback_failed&message=${encodeURIComponent(message)}`, baseUrl)
    )
  }
}
