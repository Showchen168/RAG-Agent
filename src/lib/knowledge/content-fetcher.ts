export interface RssItem {
  title: string
  link: string
  description: string
  pubDate: string
  /** 從 item.link 抓取的完整頁面內容（enrichRssItems 後填入） */
  fullContent?: string
}

/**
 * 抓取 URL 內容並去除 HTML 標籤，取得純文字
 */
export async function fetchUrlContent(url: string): Promise<{ content: string; hash: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'NexusMind/1.0 Knowledge Bot' },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch URL: ${res.status}`)
  }

  const html = await res.text()

  // 去除 script、style 等標籤
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

  const hash = await computeHash(cleaned)

  return { content: cleaned, hash }
}

/**
 * 抓取 RSS feed 並解析
 */
export async function fetchRssContent(url: string): Promise<{ items: RssItem[]; hash: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'NexusMind/1.0 Knowledge Bot' },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch RSS: ${res.status}`)
  }

  const xml = await res.text()
  const items = parseRssXml(xml)
  const combined = items.map((i) => `${i.title}: ${i.description}`).join('\n')
  const hash = await computeHash(combined)

  return { items, hash }
}

/**
 * 簡易 RSS / Atom XML 解析（無外部依賴）
 * 支援 RSS 2.0（<item>）和 Atom 1.0（<entry>）兩種格式
 */
export function parseRssXml(xml: string): RssItem[] {
  const isAtom = /<feed[\s>]/i.test(xml)

  if (isAtom) {
    return parseAtomEntries(xml)
  }

  const items: RssItem[] = []

  // RSS 2.0: 匹配 <item>...</item> 區塊
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi
  let itemMatch

  while ((itemMatch = itemPattern.exec(xml)) !== null) {
    const block = itemMatch[1]

    const title = extractTag(block, 'title')
    const link = extractTag(block, 'link')
    const description = extractTag(block, 'description')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .trim()
    const pubDate = extractTag(block, 'pubDate')

    items.push({ title, link, description, pubDate })
  }

  return items
}

/**
 * Atom 1.0 格式解析：<entry> 區塊
 */
function parseAtomEntries(xml: string): RssItem[] {
  const items: RssItem[] = []

  const entryPattern = /<entry>([\s\S]*?)<\/entry>/gi
  let entryMatch

  while ((entryMatch = entryPattern.exec(xml)) !== null) {
    const block = entryMatch[1]

    const title = extractTag(block, 'title')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .trim()

    // Atom 用 <link rel="alternate" href="..."/> 自閉合標籤
    const linkMatch = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i)
      ?? block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i)
    const link = linkMatch ? linkMatch[1] : ''

    // Atom 用 <content> 或 <summary> 而非 <description>
    const contentRaw = extractTag(block, 'content') || extractTag(block, 'summary')
    const description = contentRaw
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .trim()

    // Atom 用 <updated> 或 <published> 而非 <pubDate>
    const pubDate = extractTag(block, 'published') || extractTag(block, 'updated')

    items.push({ title, link, description, pubDate })
  }

  return items
}

export function extractTag(xml: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tagName}>`, 'i')
  const match = pattern.exec(xml)
  return match ? match[1].trim() : ''
}

/**
 * 使用 SHA-256 計算內容 hash
 */
export async function computeHash(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 單次抓取頁面的逾時時間（毫秒） */
const FETCH_TIMEOUT_MS = 8000
/** 每個 RSS item 抓取的最大內容長度 */
const MAX_CONTENT_PER_ITEM = 6000
/** 最多並行抓取幾個 item */
const MAX_ENRICH_ITEMS = 10

/**
 * 對 RSS items 進行內容增強：並行抓取每個 item.link 的完整頁面內容
 * GitHub 頁面會額外嘗試提取 README 區塊
 */
export async function enrichRssItems(items: RssItem[]): Promise<RssItem[]> {
  const toEnrich = items.slice(0, MAX_ENRICH_ITEMS)

  const enriched = await Promise.allSettled(
    toEnrich.map(async (item) => {
      if (!item.link) return item

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        const res = await fetch(item.link, {
          headers: { 'User-Agent': 'NexusMind/1.0 Knowledge Bot' },
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (!res.ok) return item

        const html = await res.text()
        const content = extractPageContent(html, item.link)

        return {
          ...item,
          fullContent: content.slice(0, MAX_CONTENT_PER_ITEM),
        }
      } catch {
        // 逾時或網路錯誤：靜默跳過，保留原始 description
        return item
      }
    })
  )

  const results = enriched.map((result, idx) =>
    result.status === 'fulfilled' ? result.value : toEnrich[idx]
  )

  // 把未被 enrich 的剩餘 items 也加回來
  return [...results, ...items.slice(MAX_ENRICH_ITEMS)]
}

/**
 * 從 HTML 提取主要文字內容
 * GitHub 頁面優先提取 README 區塊
 */
export function extractPageContent(html: string, url: string): string {
  const isGitHub = /github\.com/i.test(url)

  if (isGitHub) {
    // GitHub: 嘗試提取 article.markdown-body（README 區塊）
    const readmeMatch = html.match(/<article[^>]*class="[^"]*markdown-body[^"]*"[^>]*>([\s\S]*?)<\/article>/i)
    if (readmeMatch) {
      return cleanHtml(readmeMatch[1])
    }

    // fallback: 提取 <main> 區塊
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
    if (mainMatch) {
      return cleanHtml(mainMatch[1])
    }
  }

  // 通用：提取 <article> 或 <main>，否則取整個 body
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  if (articleMatch) return cleanHtml(articleMatch[1])

  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
  if (mainMatch) return cleanHtml(mainMatch[1])

  return cleanHtml(html)
}

/**
 * 清理 HTML → 純文字
 */
export function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
