// Mock 外部依賴（必須在 import 前）
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, opts) => ({ body, status: opts?.status ?? 200 })),
  },
}))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('ai', () => ({ generateText: jest.fn() }))
jest.mock('@/lib/ai/providers', () => ({ getProvider: jest.fn() }))

import { extractTitle, extractTextFromHtml, decodeHtmlEntities } from '../route'

describe('decodeHtmlEntities', () => {
  it('should decode &amp; to &', () => {
    expect(decodeHtmlEntities('&amp;')).toBe('&')
  })

  it('should decode &lt; to <', () => {
    expect(decodeHtmlEntities('&lt;')).toBe('<')
  })

  it('should decode &gt; to >', () => {
    expect(decodeHtmlEntities('&gt;')).toBe('>')
  })

  it('should decode &quot; to "', () => {
    expect(decodeHtmlEntities('&quot;')).toBe('"')
  })

  it('should decode &#039; to apostrophe', () => {
    expect(decodeHtmlEntities('&#039;')).toBe("'")
  })

  it('should decode &apos; to apostrophe', () => {
    expect(decodeHtmlEntities('&apos;')).toBe("'")
  })

  it('should decode hex character references &#x41; to A', () => {
    expect(decodeHtmlEntities('&#x41;')).toBe('A')
  })

  it('should decode decimal character references &#65; to A', () => {
    expect(decodeHtmlEntities('&#65;')).toBe('A')
  })

  it('should decode &nbsp; to space', () => {
    expect(decodeHtmlEntities('&nbsp;')).toBe(' ')
  })

  it('should decode multiple entities in combination', () => {
    const input = '5 &gt; 3 &amp;&amp; 2 &lt; 4'
    expect(decodeHtmlEntities(input)).toBe('5 > 3 && 2 < 4')
  })

  it('should handle text without entities', () => {
    expect(decodeHtmlEntities('Hello World')).toBe('Hello World')
  })

  it('should handle empty string', () => {
    expect(decodeHtmlEntities('')).toBe('')
  })
})

describe('extractTextFromHtml', () => {
  it('should remove script tags and their content', () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>'
    const result = extractTextFromHtml(html)
    expect(result).not.toContain('alert')
    expect(result).toContain('Hello')
    expect(result).toContain('World')
  })

  it('should remove style tags and their content', () => {
    const html = '<p>Hello</p><style>body { color: red; }</style><p>World</p>'
    const result = extractTextFromHtml(html)
    expect(result).not.toContain('color')
    expect(result).toContain('Hello')
    expect(result).toContain('World')
  })

  it('should remove noscript tags and their content', () => {
    const html = '<p>Hello</p><noscript>Enable JS</noscript><p>World</p>'
    const result = extractTextFromHtml(html)
    expect(result).not.toContain('Enable JS')
    expect(result).toContain('Hello')
  })

  it('should remove HTML comments', () => {
    const html = '<p>Hello</p><!-- this is a comment --><p>World</p>'
    const result = extractTextFromHtml(html)
    expect(result).not.toContain('comment')
    expect(result).toContain('Hello')
  })

  it('should remove all HTML tags and preserve text', () => {
    const html = '<div><span>Hello</span> <strong>World</strong></div>'
    const result = extractTextFromHtml(html)
    expect(result).toContain('Hello')
    expect(result).toContain('World')
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
  })

  it('should decode HTML entities in extracted text', () => {
    const html = '<p>5 &gt; 3 &amp;&amp; true</p>'
    const result = extractTextFromHtml(html)
    expect(result).toContain('5 > 3 && true')
  })

  it('should handle empty HTML', () => {
    expect(extractTextFromHtml('')).toBe('')
  })

  it('should handle HTML with only whitespace', () => {
    expect(extractTextFromHtml('   \n\n   ')).toBe('')
  })

  it('should collapse multiple whitespace into single spaces', () => {
    const html = '<p>Hello    World</p>'
    const result = extractTextFromHtml(html)
    expect(result).toBe('Hello World')
  })

  it('should convert block-level elements to newlines', () => {
    const html = '<h1>Title</h1><p>Paragraph</p>'
    const result = extractTextFromHtml(html)
    expect(result).toContain('Title')
    expect(result).toContain('Paragraph')
    // Block elements should create separate lines
    const lines = result.split('\n').filter((l: string) => l.trim().length > 0)
    expect(lines.length).toBeGreaterThanOrEqual(2)
  })
})

describe('extractTitle', () => {
  it('should extract title from <title> tag', () => {
    const html = '<html><head><title>My Page Title</title></head><body></body></html>'
    expect(extractTitle(html)).toBe('My Page Title')
  })

  it('should extract title from og:title meta tag', () => {
    const html = '<html><head><meta property="og:title" content="OG Title" /></head><body></body></html>'
    expect(extractTitle(html)).toBe('OG Title')
  })

  it('should prefer <title> over og:title', () => {
    const html = '<html><head><title>Title Tag</title><meta property="og:title" content="OG Title" /></head></html>'
    expect(extractTitle(html)).toBe('Title Tag')
  })

  it('should return empty string when no title found', () => {
    const html = '<html><head></head><body><p>No title here</p></body></html>'
    expect(extractTitle(html)).toBe('')
  })

  it('should decode HTML entities in title', () => {
    const html = '<html><head><title>Tom &amp; Jerry&apos;s Adventure</title></head></html>'
    expect(extractTitle(html)).toBe("Tom & Jerry's Adventure")
  })

  it('should handle title with extra whitespace', () => {
    const html = '<html><head><title>  Spaced Title  </title></head></html>'
    expect(extractTitle(html)).toBe('Spaced Title')
  })

  it('should handle empty title tag', () => {
    const html = '<html><head><title></title></head></html>'
    expect(extractTitle(html)).toBe('')
  })

  it('should handle og:title with single quotes', () => {
    const html = "<html><head><meta property='og:title' content='Single Quote Title' /></head></html>"
    expect(extractTitle(html)).toBe('Single Quote Title')
  })
})
