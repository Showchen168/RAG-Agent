import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Client-side 的 Supabase URL（build-time inline），用於推算 cookie storage key
// 確保 server-side 和 client-side 使用相同的 cookie name
const clientSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const clientHostname = (() => {
  try {
    return new URL(clientSupabaseUrl).hostname.split('.')[0]
  } catch {
    return ''
  }
})()

export async function createClient() {
  const cookieStore = await cookies()

  // Server-side 優先使用 SUPABASE_SERVER_URL（runtime env，HTTP LAN），
  // 避免 Docker 容器內用 build-time 的 HTTPS Tailscale URL 連線失敗
  const supabaseUrl = process.env.SUPABASE_SERVER_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVER_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // 當 server URL 和 client URL 不同時，需要明確指定 cookie name
  // 否則 Supabase 會根據 server URL 推算出不同的 cookie key
  const serverHostname = (() => {
    try {
      return new URL(supabaseUrl).hostname.split('.')[0]
    } catch {
      return ''
    }
  })()
  const needsCookieOverride = clientHostname && serverHostname !== clientHostname
  const cookieName = needsCookieOverride ? `sb-${clientHostname}-auth-token` : undefined

  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component 中無法設定 cookie，忽略即可
          }
        },
      },
    }
  )
}

/**
 * Creates a Supabase client with the Service Role Key.
 * Bypasses Row Level Security (RLS).
 * Use ONLY in server-side out-of-band operations (like AI stream onFinish) where the user session is unavailable.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.SUPABASE_SERVER_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  return createServerClient(
    supabaseUrl,
    supabaseServiceKey,
    {
      cookies: {
        getAll() { return [] },
        setAll() { },
      },
    }
  )
}
