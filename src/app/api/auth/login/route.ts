import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loginRateLimiter, getClientIp } from '@/lib/auth/rate-limiter'
import { writeAuditLog } from '@/lib/auth/audit-log'
import { z } from 'zod'

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// 登入失敗一律回傳此訊息，防止帳號列舉攻擊
const LOGIN_FAILED_MESSAGE = '電子郵件或密碼不正確'

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rateResult = loginRateLimiter.check(ip)

  if (!rateResult.allowed) {
    const retryAfterSec = Math.ceil((rateResult.resetAt - Date.now()) / 1000)
    writeAuditLog({
      event: 'login_rate_limited',
      ip,
      metadata: { email: 'redacted' },
    })
    return NextResponse.json(
      { error: `登入嘗試次數過多，請 ${Math.ceil(retryAfterSec / 60)} 分鐘後再試` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '請填寫完整的登入資訊' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    writeAuditLog({
      event: 'login_failed',
      ip,
      metadata: { email: parsed.data.email, reason: error.message },
    })
    return NextResponse.json(
      { error: LOGIN_FAILED_MESSAGE },
      { status: 401 }
    )
  }

  writeAuditLog({
    event: 'login_success',
    userId: data.user?.id,
    ip,
    metadata: { email: parsed.data.email },
  })

  return NextResponse.json({ success: true })
}
