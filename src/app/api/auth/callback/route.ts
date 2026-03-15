import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

/**
 * 取得正確的 base URL（支援反向代理 / Docker 環境）
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

  const url = new URL(reqUrl)
  return url.origin
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/chat'
  const baseUrl = await getBaseUrl(request.url)

  // 安全性：防止 Open Redirect 攻擊
  // 確保 next 是相對路徑且不以 // 開頭（避免 protocol-relative URL）
  const safeNext = (next.startsWith('/') && !next.startsWith('//'))
    ? next
    : '/chat'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, baseUrl))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_callback_error', baseUrl))
}
