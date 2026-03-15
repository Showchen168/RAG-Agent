interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimiterConfig {
  maxAttempts: number
  windowMs: number
}

export function createRateLimiter(config: RateLimiterConfig) {
  const store = new Map<string, RateLimitEntry>()
  const CLEANUP_INTERVAL = 5 * 60 * 1000
  let lastCleanup = Date.now()

  function cleanup() {
    const now = Date.now()
    if (now - lastCleanup < CLEANUP_INTERVAL) return
    lastCleanup = now
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key)
      }
    }
  }

  return {
    check(key: string): { allowed: boolean; remainingAttempts: number; resetAt: number } {
      cleanup()
      const now = Date.now()
      const entry = store.get(key)

      if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + config.windowMs })
        return { allowed: true, remainingAttempts: config.maxAttempts - 1, resetAt: now + config.windowMs }
      }

      if (entry.count >= config.maxAttempts) {
        return { allowed: false, remainingAttempts: 0, resetAt: entry.resetAt }
      }

      store.set(key, { ...entry, count: entry.count + 1 })
      return {
        allowed: true,
        remainingAttempts: config.maxAttempts - entry.count - 1,
        resetAt: entry.resetAt,
      }
    },
  }
}

export const loginRateLimiter = createRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
})

export const registerRateLimiter = createRateLimiter({
  maxAttempts: 3,
  windowMs: 15 * 60 * 1000,
})

export function getClientIp(request: Request): string {
  const headers = request.headers
  const cfIp = headers.get('cf-connecting-ip')
  if (cfIp) return cfIp

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()

  const realIp = headers.get('x-real-ip')
  if (realIp) return realIp

  return 'unknown'
}
