/**
 * content-fetcher.test.ts
 * 完整測試 content-fetcher 所有 exported 函數
 */

// ── polyfills（必須在 import 之前設定）──────────────────────────

// TextEncoder polyfill（jsdom 可能缺少）
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util')
  Object.assign(globalThis, { TextEncoder, TextDecoder })
}

// crypto.subtle polyfill（jsdom 不提供 Web Crypto）
const { webcrypto } = require('crypto')
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, writable: true })

// fetch mock
const mockFetch = jest.fn()
global.fetch = mockFetch

// AbortController polyfill（jsdom 應該有，但確保一致）
if (typeof global.AbortController === 'undefined') {
  global.AbortController = require('abort-controller').AbortController
}

// ── imports ─────────────────────────────────────────────────────

import {
  parseRssXml,
  extractTag,
  computeHash,
  extractPageContent,
  cleanHtml,
  fetchUrlContent,
  fetchRssContent,
  enrichRssItems,
  type RssItem,
} from '../content-fetcher'

// ── helpers ─────────────────────────────────────────────────────

function makeResponse(body: string, ok = true, status = 200): Partial<Response> {
  return {
    ok,
    status,
    text: () => Promise.resolve(body),
  }
}

// ── tests ───────────────────────────────────────────────────────

describe('content-fetcher', () => {
  afterEach(() => {
    mockFetch.mockReset()
  })

  // ============================================================
  // extractTag
  // ============================================================
  describe('extractTag', () => {
    it('should extract simple tag content', () => {
      expect(extractTag('<title>Hello World</title>', 'title')).toBe('Hello World')
    })

    it('should return empty string when tag not found', () => {
      expect(extractTag('<title>Hello</title>', 'link')).toBe('')
    })

    it('should extract CDATA-wrapped content', () => {
      const xml = '<description><![CDATA[Some <b>rich</b> content]]></description>'
      expect(extractTag(xml, 'description')).toBe('Some <b>rich</b> content')
    })

    it('should extract empty tag content', () => {
      expect(extractTag('<title></title>', 'title')).toBe('')
    })

    it('should handle tag with attributes', () => {
      expect(extractTag('<title lang="en">English Title</title>', 'title')).toBe('English Title')
    })

    it('should trim whitespace', () => {
      expect(extractTag('<title>  padded  </title>', 'title')).toBe('padded')
    })

    it('should be case-insensitive for tag matching', () => {
      expect(extractTag('<Title>Mixed Case</Title>', 'Title')).toBe('Mixed Case')
    })
  })

  // ============================================================
  // parseRssXml
  // ============================================================
  describe('parseRssXml', () => {
    it('should return empty array for XML without items', () => {
      expect(parseRssXml('<rss><channel></channel></rss>')).toEqual([])
    })

    it('should return empty array for empty string', () => {
      expect(parseRssXml('')).toEqual([])
    })

    it('should parse single item', () => {
      const xml = `
        <rss><channel>
          <item>
            <title>Article One</title>
            <link>https://example.com/1</link>
            <description>Desc one</description>
            <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
          </item>
        </channel></rss>
      `
      const items = parseRssXml(xml)
      expect(items).toHaveLength(1)
      expect(items[0]).toEqual({
        title: 'Article One',
        link: 'https://example.com/1',
        description: 'Desc one',
        pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
      })
    })

    it('should parse multiple items', () => {
      const xml = `
        <rss><channel>
          <item>
            <title>First</title>
            <link>https://a.com</link>
            <description>Desc A</description>
            <pubDate>2024-01-01</pubDate>
          </item>
          <item>
            <title>Second</title>
            <link>https://b.com</link>
            <description>Desc B</description>
            <pubDate>2024-01-02</pubDate>
          </item>
          <item>
            <title>Third</title>
            <link>https://c.com</link>
            <description>Desc C</description>
            <pubDate>2024-01-03</pubDate>
          </item>
        </channel></rss>
      `
      const items = parseRssXml(xml)
      expect(items).toHaveLength(3)
      expect(items[0].title).toBe('First')
      expect(items[1].title).toBe('Second')
      expect(items[2].title).toBe('Third')
    })

    it('should strip CDATA from description', () => {
      const xml = `
        <item>
          <title>Post</title>
          <link>https://x.com</link>
          <description><![CDATA[<p>Hello <b>world</b></p>]]></description>
          <pubDate>2024-01-01</pubDate>
        </item>
      `
      const items = parseRssXml(xml)
      expect(items[0].description).toBe('Hello world')
    })

    it('should strip HTML tags from description', () => {
      const xml = `
        <item>
          <title>Post</title>
          <link>https://x.com</link>
          <description><p>Para <a href="#">link</a> text</p></description>
          <pubDate>2024-01-01</pubDate>
        </item>
      `
      const items = parseRssXml(xml)
      expect(items[0].description).not.toContain('<p>')
      expect(items[0].description).not.toContain('<a')
    })

    it('should handle missing fields gracefully', () => {
      const xml = `
        <item>
          <title>Only Title</title>
        </item>
      `
      const items = parseRssXml(xml)
      expect(items).toHaveLength(1)
      expect(items[0].title).toBe('Only Title')
      expect(items[0].link).toBe('')
      expect(items[0].description).toBe('')
      expect(items[0].pubDate).toBe('')
    })

    it('should parse Atom 1.0 feed with <entry> tags', () => {
      const xml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Product Hunt</title>
          <entry>
            <title>Cool Product</title>
            <link rel="alternate" type="text/html" href="https://producthunt.com/posts/cool"/>
            <content type="html">A cool new product for developers</content>
            <published>2026-03-04T10:00:00Z</published>
          </entry>
          <entry>
            <title>Another Tool</title>
            <link rel="alternate" href="https://producthunt.com/posts/another"/>
            <summary>Summary of another tool</summary>
            <updated>2026-03-03T08:00:00Z</updated>
          </entry>
        </feed>
      `
      const items = parseRssXml(xml)
      expect(items).toHaveLength(2)
      expect(items[0]).toEqual({
        title: 'Cool Product',
        link: 'https://producthunt.com/posts/cool',
        description: 'A cool new product for developers',
        pubDate: '2026-03-04T10:00:00Z',
      })
      expect(items[1]).toEqual({
        title: 'Another Tool',
        link: 'https://producthunt.com/posts/another',
        description: 'Summary of another tool',
        pubDate: '2026-03-03T08:00:00Z',
      })
    })

    it('should parse Atom feed with CDATA and HTML in content', () => {
      const xml = `
        <feed>
          <entry>
            <title><![CDATA[<b>Bold Title</b>]]></title>
            <link href="https://example.com/post"/>
            <content type="html"><![CDATA[<p>Rich <b>content</b> here</p>]]></content>
            <published>2026-01-01T00:00:00Z</published>
          </entry>
        </feed>
      `
      const items = parseRssXml(xml)
      expect(items).toHaveLength(1)
      expect(items[0].title).toBe('Bold Title')
      expect(items[0].link).toBe('https://example.com/post')
      expect(items[0].description).toBe('Rich content here')
    })

    it('should return empty array for Atom feed without entries', () => {
      const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Empty</title></feed>`
      expect(parseRssXml(xml)).toEqual([])
    })
  })

  // ============================================================
  // computeHash
  // ============================================================
  describe('computeHash', () => {
    it('should return a hex string', async () => {
      const hash = await computeHash('hello')
      expect(hash).toMatch(/^[0-9a-f]+$/)
    })

    it('should return 64-char SHA-256 hex', async () => {
      const hash = await computeHash('test')
      expect(hash).toHaveLength(64)
    })

    it('should produce same hash for same content', async () => {
      const hash1 = await computeHash('identical content')
      const hash2 = await computeHash('identical content')
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different content', async () => {
      const hash1 = await computeHash('content A')
      const hash2 = await computeHash('content B')
      expect(hash1).not.toBe(hash2)
    })

    it('should handle empty string', async () => {
      const hash = await computeHash('')
      expect(hash).toHaveLength(64)
    })

    it('should handle unicode content', async () => {
      const hash = await computeHash('繁體中文測試')
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]+$/)
    })
  })

  // ============================================================
  // cleanHtml
  // ============================================================
  describe('cleanHtml', () => {
    it('should remove script tags', () => {
      expect(cleanHtml('<script>alert("xss")</script>Content')).toBe('Content')
    })

    it('should remove style tags', () => {
      expect(cleanHtml('<style>body{color:red}</style>Content')).toBe('Content')
    })

    it('should remove nav tags', () => {
      expect(cleanHtml('<nav><a href="/">Home</a></nav>Content')).toBe('Content')
    })

    it('should remove footer tags', () => {
      expect(cleanHtml('<footer>Copyright 2024</footer>Content')).toBe('Content')
    })

    it('should remove header tags', () => {
      expect(cleanHtml('<header><h1>Title</h1></header>Content')).toBe('Content')
    })

    it('should remove svg tags', () => {
      expect(cleanHtml('<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>Content')).toBe('Content')
    })

    it('should strip all HTML tags', () => {
      expect(cleanHtml('<p>Hello <b>bold</b> world</p>')).toBe('Hello bold world')
    })

    it('should decode &nbsp;', () => {
      expect(cleanHtml('Hello&nbsp;World')).toBe('Hello World')
    })

    it('should decode &amp;', () => {
      expect(cleanHtml('A&amp;B')).toBe('A&B')
    })

    it('should decode &lt; and &gt;', () => {
      expect(cleanHtml('&lt;tag&gt;')).toBe('<tag>')
    })

    it('should decode &quot;', () => {
      expect(cleanHtml('&quot;quoted&quot;')).toBe('"quoted"')
    })

    it('should decode &#39;', () => {
      expect(cleanHtml('it&#39;s')).toBe("it's")
    })

    it('should collapse whitespace', () => {
      expect(cleanHtml('  lots   of    spaces  ')).toBe('lots of spaces')
    })

    it('should handle multiple removable elements', () => {
      const html = '<script>x</script><style>y</style><nav>n</nav><footer>f</footer><header>h</header><svg>s</svg><p>Keep</p>'
      expect(cleanHtml(html)).toBe('Keep')
    })

    it('should return empty string for only removable content', () => {
      expect(cleanHtml('<script>only script</script>')).toBe('')
    })
  })

  // ============================================================
  // extractPageContent
  // ============================================================
  describe('extractPageContent', () => {
    it('should extract markdown-body article for GitHub URLs', () => {
      const html = `
        <html><body>
          <div>Other stuff</div>
          <article class="markdown-body entry-content" itemprop="text">
            <h1>README</h1><p>Project description</p>
          </article>
        </body></html>
      `
      const result = extractPageContent(html, 'https://github.com/owner/repo')
      expect(result).toContain('README')
      expect(result).toContain('Project description')
      expect(result).not.toContain('Other stuff')
    })

    it('should fallback to main tag for GitHub when no markdown-body', () => {
      const html = `
        <html><body>
          <div>Sidebar</div>
          <main><p>Main GitHub content</p></main>
        </body></html>
      `
      const result = extractPageContent(html, 'https://github.com/owner/repo')
      expect(result).toContain('Main GitHub content')
      expect(result).not.toContain('Sidebar')
    })

    it('should fallback to full body clean for GitHub when no markdown-body or main', () => {
      const html = '<html><body><div>GitHub fallback content</div></body></html>'
      const result = extractPageContent(html, 'https://github.com/owner/repo')
      expect(result).toContain('GitHub fallback content')
    })

    it('should extract article tag for non-GitHub URLs', () => {
      const html = `
        <html><body>
          <div>Sidebar</div>
          <article><p>Blog post content</p></article>
        </body></html>
      `
      const result = extractPageContent(html, 'https://blog.example.com/post')
      expect(result).toContain('Blog post content')
      expect(result).not.toContain('Sidebar')
    })

    it('should fallback to main tag for non-GitHub URLs', () => {
      const html = `
        <html><body>
          <div>Sidebar</div>
          <main><p>Main content area</p></main>
        </body></html>
      `
      const result = extractPageContent(html, 'https://example.com/page')
      expect(result).toContain('Main content area')
    })

    it('should fallback to full body for non-GitHub when no article/main', () => {
      const html = '<html><body><div>Just a div</div></body></html>'
      const result = extractPageContent(html, 'https://example.com')
      expect(result).toContain('Just a div')
    })

    it('should be case-insensitive for GitHub domain check', () => {
      const html = '<article class="markdown-body"><p>GH content</p></article>'
      const result = extractPageContent(html, 'https://GITHUB.COM/owner/repo')
      expect(result).toContain('GH content')
    })
  })

  // ============================================================
  // fetchUrlContent
  // ============================================================
  describe('fetchUrlContent', () => {
    it('should fetch and clean HTML content', async () => {
      const html = '<html><head><script>x</script></head><body><nav>Nav</nav><main><p>Main content here</p></main><footer>Foot</footer></body></html>'
      mockFetch.mockResolvedValueOnce(makeResponse(html))

      const result = await fetchUrlContent('https://example.com')
      expect(result.content).toContain('Main content here')
      expect(result.content).not.toContain('Nav')
      expect(result.content).not.toContain('Foot')
      expect(result.hash).toHaveLength(64)
    })

    it('should throw on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('', false, 404))
      await expect(fetchUrlContent('https://example.com/404')).rejects.toThrow('Failed to fetch URL: 404')
    })

    it('should throw on 500 error', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('', false, 500))
      await expect(fetchUrlContent('https://example.com/500')).rejects.toThrow('Failed to fetch URL: 500')
    })

    it('should send correct User-Agent header', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('<p>test</p>'))
      await fetchUrlContent('https://example.com')
      expect(mockFetch).toHaveBeenCalledWith('https://example.com', {
        headers: { 'User-Agent': 'NexusMind/1.0 Knowledge Bot' },
      })
    })

    it('should decode HTML entities in fetched content', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('<p>A &amp; B &lt; C &gt; D &quot;E&quot; F&#39;s</p>'))
      const result = await fetchUrlContent('https://example.com')
      expect(result.content).toContain('A & B')
      expect(result.content).toContain("F's")
    })

    it('should collapse whitespace', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('<p>Multiple   &nbsp;  spaces</p>'))
      const result = await fetchUrlContent('https://example.com')
      expect(result.content).not.toMatch(/\s{2,}/)
    })
  })

  // ============================================================
  // fetchRssContent
  // ============================================================
  describe('fetchRssContent', () => {
    it('should fetch and parse RSS', async () => {
      const xml = `
        <rss><channel>
          <item>
            <title>Post 1</title>
            <link>https://blog.com/1</link>
            <description>Summary 1</description>
            <pubDate>2024-01-01</pubDate>
          </item>
        </channel></rss>
      `
      mockFetch.mockResolvedValueOnce(makeResponse(xml))

      const result = await fetchRssContent('https://blog.com/feed')
      expect(result.items).toHaveLength(1)
      expect(result.items[0].title).toBe('Post 1')
      expect(result.hash).toHaveLength(64)
    })

    it('should throw on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('', false, 403))
      await expect(fetchRssContent('https://blog.com/feed')).rejects.toThrow('Failed to fetch RSS: 403')
    })

    it('should send correct User-Agent header', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('<rss><channel></channel></rss>'))
      await fetchRssContent('https://blog.com/feed')
      expect(mockFetch).toHaveBeenCalledWith('https://blog.com/feed', {
        headers: { 'User-Agent': 'NexusMind/1.0 Knowledge Bot' },
      })
    })

    it('should return empty items for empty feed', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('<rss><channel></channel></rss>'))
      const result = await fetchRssContent('https://blog.com/feed')
      expect(result.items).toEqual([])
      expect(result.hash).toHaveLength(64)
    })

    it('should compute hash from combined title:description', async () => {
      const xml = `
        <item>
          <title>A</title>
          <link>https://a.com</link>
          <description>D1</description>
          <pubDate>2024-01-01</pubDate>
        </item>
        <item>
          <title>B</title>
          <link>https://b.com</link>
          <description>D2</description>
          <pubDate>2024-01-02</pubDate>
        </item>
      `
      mockFetch.mockResolvedValueOnce(makeResponse(xml))
      const result = await fetchRssContent('https://blog.com/feed')

      // hash 應基於 "A: D1\nB: D2"
      const expectedHash = await computeHash('A: D1\nB: D2')
      expect(result.hash).toBe(expectedHash)
    })
  })

  // ============================================================
  // enrichRssItems
  // ============================================================
  describe('enrichRssItems', () => {
    it('should enrich items with full page content', async () => {
      const items: RssItem[] = [
        { title: 'Post', link: 'https://blog.com/1', description: 'Short', pubDate: '2024-01-01' },
      ]

      mockFetch.mockResolvedValueOnce(makeResponse('<html><body><article><p>Full article content here</p></article></body></html>'))

      const result = await enrichRssItems(items)
      expect(result).toHaveLength(1)
      expect(result[0].fullContent).toContain('Full article content here')
    })

    it('should skip items with empty link', async () => {
      const items: RssItem[] = [
        { title: 'No Link', link: '', description: 'Desc', pubDate: '2024-01-01' },
      ]

      const result = await enrichRssItems(items)
      expect(result).toHaveLength(1)
      expect(result[0].fullContent).toBeUndefined()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should handle fetch failure silently', async () => {
      const items: RssItem[] = [
        { title: 'Post', link: 'https://fail.com/1', description: 'Desc', pubDate: '2024-01-01' },
      ]

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await enrichRssItems(items)
      expect(result).toHaveLength(1)
      expect(result[0].fullContent).toBeUndefined()
      expect(result[0].title).toBe('Post')
    })

    it('should handle non-ok response gracefully', async () => {
      const items: RssItem[] = [
        { title: 'Post', link: 'https://blog.com/1', description: 'Desc', pubDate: '2024-01-01' },
      ]

      mockFetch.mockResolvedValueOnce(makeResponse('', false, 500))

      const result = await enrichRssItems(items)
      expect(result).toHaveLength(1)
      expect(result[0].fullContent).toBeUndefined()
    })

    it('should truncate content to MAX_CONTENT_PER_ITEM (6000 chars)', async () => {
      const longContent = 'A'.repeat(10000)
      const items: RssItem[] = [
        { title: 'Post', link: 'https://blog.com/1', description: 'Desc', pubDate: '2024-01-01' },
      ]

      mockFetch.mockResolvedValueOnce(makeResponse(`<article>${longContent}</article>`))

      const result = await enrichRssItems(items)
      expect(result[0].fullContent).toBeDefined()
      expect(result[0].fullContent!.length).toBeLessThanOrEqual(6000)
    })

    it('should limit enrichment to MAX_ENRICH_ITEMS (10) and append rest', async () => {
      // 建立 12 個 items
      const items: RssItem[] = Array.from({ length: 12 }, (_, i) => ({
        title: `Post ${i}`,
        link: `https://blog.com/${i}`,
        description: `Desc ${i}`,
        pubDate: '2024-01-01',
      }))

      // 只有前 10 個應該觸發 fetch
      for (let i = 0; i < 10; i++) {
        mockFetch.mockResolvedValueOnce(makeResponse(`<article>Content ${i}</article>`))
      }

      const result = await enrichRssItems(items)
      expect(result).toHaveLength(12)
      expect(mockFetch).toHaveBeenCalledTimes(10)

      // 前 10 個應該有 fullContent
      for (let i = 0; i < 10; i++) {
        expect(result[i].fullContent).toContain(`Content ${i}`)
      }

      // 第 11、12 個不應該有 fullContent
      expect(result[10].fullContent).toBeUndefined()
      expect(result[11].fullContent).toBeUndefined()
      expect(result[10].title).toBe('Post 10')
      expect(result[11].title).toBe('Post 11')
    })

    it('should handle mixed success and failure', async () => {
      const items: RssItem[] = [
        { title: 'OK', link: 'https://a.com', description: 'D1', pubDate: '2024-01-01' },
        { title: 'Fail', link: 'https://b.com', description: 'D2', pubDate: '2024-01-02' },
        { title: 'OK2', link: 'https://c.com', description: 'D3', pubDate: '2024-01-03' },
      ]

      mockFetch
        .mockResolvedValueOnce(makeResponse('<article>Success 1</article>'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(makeResponse('<article>Success 3</article>'))

      const result = await enrichRssItems(items)
      expect(result).toHaveLength(3)
      expect(result[0].fullContent).toContain('Success 1')
      expect(result[1].fullContent).toBeUndefined()
      expect(result[2].fullContent).toContain('Success 3')
    })

    it('should pass AbortSignal to fetch', async () => {
      const items: RssItem[] = [
        { title: 'Post', link: 'https://blog.com/1', description: 'Desc', pubDate: '2024-01-01' },
      ]

      mockFetch.mockResolvedValueOnce(makeResponse('<article>Content</article>'))

      await enrichRssItems(items)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://blog.com/1',
        expect.objectContaining({
          headers: { 'User-Agent': 'NexusMind/1.0 Knowledge Bot' },
          signal: expect.any(AbortSignal),
        })
      )
    })

    it('should return empty array for empty input', async () => {
      const result = await enrichRssItems([])
      expect(result).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
