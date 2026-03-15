import { NextResponse } from 'next/server'

const MARKER_URL = process.env.MARKER_SERVICE_URL || ''
const LIGHTRAG_URL = process.env.LIGHTRAG_SERVICE_URL || ''
const TIMEOUT_MS = 3000

interface ServiceHealth {
  available: boolean
  latency: number | null
  error?: string
}

async function checkService(baseUrl: string): Promise<ServiceHealth> {
  if (!baseUrl) {
    return { available: false, latency: null, error: 'URL not configured' }
  }

  const start = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal })
    clearTimeout(timer)

    const latency = Date.now() - start
    if (res.ok) {
      return { available: true, latency }
    }
    return { available: false, latency, error: `HTTP ${res.status}` }
  } catch (err) {
    return {
      available: false,
      latency: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function GET() {
  const [marker, lightrag] = await Promise.all([
    checkService(MARKER_URL),
    checkService(LIGHTRAG_URL),
  ])

  return NextResponse.json({ marker, lightrag })
}
