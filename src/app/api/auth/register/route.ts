import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registerRateLimiter, getClientIp } from '@/lib/auth/rate-limiter'
import { sanitizeAuthError } from '@/lib/auth/error-messages'
import { validatePassword } from '@/lib/auth/password-validation'
import { writeAuditLog } from '@/lib/auth/audit-log'
import { z } from 'zod'

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(50),
})

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rateResult = registerRateLimiter.check(ip)

  if (!rateResult.allowed) {
    const retryAfterSec = Math.ceil((rateResult.resetAt - Date.now()) / 1000)
    writeAuditLog({
      event: 'register_rate_limited',
      ip,
      metadata: { email: 'redacted' },
    })
    return NextResponse.json(
      { error: `註冊嘗試次數過多，請 ${Math.ceil(retryAfterSec / 60)} 分鐘後再試` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = RegisterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '請填寫完整的註冊資訊' }, { status: 400 })
  }

  const passwordResult = validatePassword(parsed.data.password)
  if (!passwordResult.isValid) {
    return NextResponse.json(
      { error: passwordResult.errors[0] },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.displayName } },
  })

  if (error) {
    writeAuditLog({
      event: 'register_failed',
      ip,
      metadata: { email: parsed.data.email, reason: error.message },
    })
    return NextResponse.json(
      { error: sanitizeAuthError(error.message) },
      { status: 400 }
    )
  }

  writeAuditLog({
    event: 'register_success',
    userId: data.user?.id,
    ip,
    metadata: { email: parsed.data.email },
  })

  return NextResponse.json({ success: true })
}
