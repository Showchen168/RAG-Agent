import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText } from 'ai'
import { getProvider } from '@/lib/ai/providers'

// POST: 從網址抓取內容並建立知識庫文件
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { url } = await req.json() as { url: string }

  if (!url) {
    return NextResponse.json({ error: '請提供網址' }, { status: 400 })
  }

  // 驗證 URL 格式
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`)
  } catch {
    return NextResponse.json({ error: '網址格式不正確' }, { status: 400 })
  }

  // 安全性：防止 SSRF 攻擊 — 禁止存取內部網路位址
  const hostname = parsedUrl.hostname.toLowerCase()
  const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', 'metadata.google.internal']
  const BLOCKED_PREFIXES = ['10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.', '169.254.']
  if (
    BLOCKED_HOSTS.includes(hostname) ||
    BLOCKED_PREFIXES.some(prefix => hostname.startsWith(prefix)) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    parsedUrl.protocol === 'file:'
  ) {
    return NextResponse.json({ error: '不允許存取內部網路位址' }, { status: 403 })
  }

  try {
    // 1. 抓取網頁內容
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000) // 30 秒超時

    const response = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NexusMind/1.0; +https://nexusmind.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      },
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return NextResponse.json(
        { error: `無法存取該網頁（HTTP ${response.status}）` },
        { status: 400 }
      )
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/json')) {
      return NextResponse.json(
        { error: '不支援的內容類型，僅支援 HTML、純文字和 JSON 網頁' },
        { status: 400 }
      )
    }

    const rawHtml = await response.text()

    if (!rawHtml.trim()) {
      return NextResponse.json({ error: '網頁內容為空' }, { status: 400 })
    }

    // 2. 提取純文字內容（移除 HTML 標籤、腳本、樣式等）
    const cleanText = extractTextFromHtml(rawHtml)

    if (cleanText.length < 50) {
      return NextResponse.json(
        { error: '網頁內容過少，無法建立有效的知識庫文件' },
        { status: 400 }
      )
    }

    // 3. 使用 AI 整理並萃取有價值的內容
    const pageTitle = extractTitle(rawHtml) || parsedUrl.hostname
    const truncatedText = cleanText.length > 15000
      ? cleanText.slice(0, 15000) + '\n\n[...內容過長，已截斷]'
      : cleanText

    const model = getProvider('gemini-flash')

    const { text: structuredContent } = await generateText({
      model,
      prompt: `你是一位專業的知識萃取專家。請將以下從網頁「${pageTitle}」（${parsedUrl.toString()}）抓取的原始文字內容，整理成結構化的知識文件。

要求：
- 使用繁體中文
- 保留所有重要資訊，不要遺漏關鍵內容
- 移除廣告、導航列、頁尾等無關內容
- 使用 Markdown 格式整理（標題、段落、列表等）
- 保持原文的資訊完整性
- 如果內容是英文，請保留原文並在必要時提供中文說明

原始網頁內容：
${truncatedText}`,
      temperature: 0.2,
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'knowledge-url-extract',
        metadata: { feature: 'knowledge-url' },
      },
    })

    const finalContent = structuredContent?.trim() || cleanText

    // 4. 儲存到 documents 表
    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        title: pageTitle,
        content: finalContent,
        tags: ['URL', new URL(parsedUrl).hostname.replace('www.', '').toUpperCase()],
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data,
      meta: {
        sourceUrl: parsedUrl.toString(),
        originalLength: cleanText.length,
        processedLength: finalContent.length,
      },
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: '網頁載入超時（超過 30 秒）' }, { status: 408 })
    }
    console.error('[URL Import] Error:', err)
    return NextResponse.json(
      { error: `匯入失敗：${err instanceof Error ? err.message : '未知錯誤'}` },
      { status: 500 }
    )
  }
}

/** 從 HTML 提取標題 */
export function extractTitle(html: string): string {
  // 嘗試 <title> 標籤
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch?.[1]) {
    return decodeHtmlEntities(titleMatch[1].trim())
  }

  // 嘗試 og:title
  const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
  if (ogMatch?.[1]) {
    return decodeHtmlEntities(ogMatch[1].trim())
  }

  return ''
}

/** 從 HTML 提取純文字 */
export function extractTextFromHtml(html: string): string {
  let text = html

  // 移除 script 和 style 標籤及其內容
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')

  // 移除 HTML 註解
  text = text.replace(/<!--[\s\S]*?-->/g, ' ')

  // 將常見塊級元素轉為換行
  text = text.replace(/<\/?(?:div|p|br|hr|h[1-6]|ul|ol|li|table|tr|td|th|blockquote|pre|article|section|header|footer|nav|aside|main|figure|figcaption)[^>]*>/gi, '\n')

  // 移除所有其他 HTML 標籤
  text = text.replace(/<[^>]+>/g, ' ')

  // 解碼 HTML entities
  text = decodeHtmlEntities(text)

  // 清理空白
  text = text
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n')

  return text.trim()
}

/** 解碼常見 HTML entities */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
}
