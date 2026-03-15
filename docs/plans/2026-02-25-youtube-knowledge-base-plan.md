# YouTube 知識庫整合 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 將 YouTube 影片內容（字幕/語音轉錄）整合進 NexusMind 知識庫系統，支援單片匯入、播放清單批次匯入、頻道監控。

**Architecture:** 混合架構 — YouTube UI 獨立元件，後端 API 獨立路由，但資料儲存與嵌入管道完全複用現有 documents + document_embeddings 管道。三層回退策略：L1 字幕擷取 → L2 Gemini 音訊轉錄 → L3 錯誤訊息。

**Tech Stack:** Next.js 16 App Router, youtube-transcript-plus, @google/generative-ai (Gemini API), Supabase, existing embed pipeline

---

## Task 1: 安裝依賴 + YouTube URL 工具函式

**Files:**
- Modify: `package.json` (新增 youtube-transcript-plus)
- Create: `src/lib/knowledge/youtube-utils.ts`
- Test: `src/lib/knowledge/__tests__/youtube-utils.test.ts`

**Step 1: 安裝 youtube-transcript-plus**

Run: `pnpm add youtube-transcript-plus`

**Step 2: 寫測試（RED）**

```typescript
// src/lib/knowledge/__tests__/youtube-utils.test.ts
import { parseYouTubeUrl, isYouTubeUrl, extractVideoId } from '../youtube-utils'

describe('parseYouTubeUrl', () => {
  it('parses standard watch URL', () => {
    const result = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(result).toEqual({ type: 'video', videoId: 'dQw4w9WgXcQ' })
  })

  it('parses short youtu.be URL', () => {
    const result = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')
    expect(result).toEqual({ type: 'video', videoId: 'dQw4w9WgXcQ' })
  })

  it('parses playlist URL', () => {
    const result = parseYouTubeUrl('https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')
    expect(result).toEqual({ type: 'playlist', playlistId: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf' })
  })

  it('parses channel URL', () => {
    const result = parseYouTubeUrl('https://www.youtube.com/@channelname')
    expect(result).toEqual({ type: 'channel', channelHandle: 'channelname' })
  })

  it('parses video with playlist context', () => {
    const result = parseYouTubeUrl('https://www.youtube.com/watch?v=abc123&list=PLxyz')
    expect(result).toEqual({ type: 'video', videoId: 'abc123', playlistId: 'PLxyz' })
  })

  it('returns null for non-YouTube URL', () => {
    expect(parseYouTubeUrl('https://vimeo.com/123')).toBeNull()
  })

  it('returns null for invalid URL', () => {
    expect(parseYouTubeUrl('not a url')).toBeNull()
  })
})

describe('isYouTubeUrl', () => {
  it('returns true for youtube.com', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=abc')).toBe(true)
  })

  it('returns true for youtu.be', () => {
    expect(isYouTubeUrl('https://youtu.be/abc')).toBe(true)
  })

  it('returns false for other domains', () => {
    expect(isYouTubeUrl('https://google.com')).toBe(false)
  })
})

describe('extractVideoId', () => {
  it('extracts from standard URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts from short URL', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('returns null for non-video URL', () => {
    expect(extractVideoId('https://www.youtube.com/playlist?list=PLxyz')).toBeNull()
  })
})
```

**Step 3: 執行測試確認 RED**

Run: `pnpm test -- --testPathPattern="youtube-utils" --no-coverage`
Expected: FAIL - module not found

**Step 4: 實作 youtube-utils.ts**

```typescript
// src/lib/knowledge/youtube-utils.ts

export interface YouTubeVideoInfo {
  type: 'video'
  videoId: string
  playlistId?: string
}

export interface YouTubePlaylistInfo {
  type: 'playlist'
  playlistId: string
}

export interface YouTubeChannelInfo {
  type: 'channel'
  channelHandle: string
}

export type YouTubeUrlInfo = YouTubeVideoInfo | YouTubePlaylistInfo | YouTubeChannelInfo

const YOUTUBE_HOSTS = ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be']

export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return YOUTUBE_HOSTS.includes(parsed.hostname)
  } catch {
    return false
  }
}

export function parseYouTubeUrl(url: string): YouTubeUrlInfo | null {
  try {
    const parsed = new URL(url)
    if (!YOUTUBE_HOSTS.includes(parsed.hostname)) return null

    // youtu.be short URL
    if (parsed.hostname === 'youtu.be') {
      const videoId = parsed.pathname.slice(1)
      if (!videoId) return null
      return { type: 'video', videoId }
    }

    // Channel URL: /@handle
    const channelMatch = parsed.pathname.match(/^\/@([^/]+)/)
    if (channelMatch) {
      return { type: 'channel', channelHandle: channelMatch[1] }
    }

    // Playlist URL: /playlist?list=...
    if (parsed.pathname === '/playlist') {
      const listId = parsed.searchParams.get('list')
      if (listId) return { type: 'playlist', playlistId: listId }
    }

    // Video URL: /watch?v=...
    const videoId = parsed.searchParams.get('v')
    if (videoId) {
      const playlistId = parsed.searchParams.get('list') ?? undefined
      return { type: 'video', videoId, ...(playlistId ? { playlistId } : {}) }
    }

    return null
  } catch {
    return null
  }
}

export function extractVideoId(url: string): string | null {
  const info = parseYouTubeUrl(url)
  if (info?.type === 'video') return info.videoId
  return null
}

export function buildVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export async function getVideoMetadata(videoId: string): Promise<{
  title: string
  author_name: string
  thumbnail_url: string
} | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
```

**Step 5: 執行測試確認 GREEN**

Run: `pnpm test -- --testPathPattern="youtube-utils" --no-coverage`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/lib/knowledge/youtube-utils.ts src/lib/knowledge/__tests__/youtube-utils.test.ts package.json pnpm-lock.yaml
git commit -m "feat: add YouTube URL parsing utilities with tests"
```

---

## Task 2: YouTube 字幕擷取 + Gemini 回退

**Files:**
- Create: `src/lib/knowledge/youtube-fetcher.ts`
- Test: `src/lib/knowledge/__tests__/youtube-fetcher.test.ts`

**Step 1: 寫測試（RED）**

```typescript
// src/lib/knowledge/__tests__/youtube-fetcher.test.ts
import { formatTranscriptToMarkdown, processYouTubeContentWithAI } from '../youtube-fetcher'

// 僅測試純函式（不 mock 外部 API）
describe('formatTranscriptToMarkdown', () => {
  it('formats transcript segments into markdown with timestamps', () => {
    const segments = [
      { text: 'Hello world', offset: 0, duration: 5000, lang: 'en' },
      { text: 'This is a test', offset: 5000, duration: 3000, lang: 'en' },
    ]
    const result = formatTranscriptToMarkdown(segments, 'Test Video', 'TestChannel')
    expect(result).toContain('# Test Video')
    expect(result).toContain('**頻道:** TestChannel')
    expect(result).toContain('[00:00]')
    expect(result).toContain('Hello world')
    expect(result).toContain('[00:05]')
    expect(result).toContain('This is a test')
  })

  it('formats hours correctly for long videos', () => {
    const segments = [
      { text: 'Late content', offset: 3661000, duration: 2000, lang: 'en' },
    ]
    const result = formatTranscriptToMarkdown(segments, 'Long Video', 'Ch')
    expect(result).toContain('[1:01:01]')
  })

  it('handles empty segments', () => {
    const result = formatTranscriptToMarkdown([], 'Empty', 'Ch')
    expect(result).toContain('# Empty')
    expect(result).not.toContain('[')
  })
})
```

**Step 2: 執行測試確認 RED**

Run: `pnpm test -- --testPathPattern="youtube-fetcher" --no-coverage`
Expected: FAIL

**Step 3: 實作 youtube-fetcher.ts**

```typescript
// src/lib/knowledge/youtube-fetcher.ts
import { YoutubeTranscript } from 'youtube-transcript-plus'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getVideoMetadata, buildVideoUrl } from './youtube-utils'
import { computeHash } from './content-fetcher'

export interface TranscriptSegment {
  text: string
  offset: number
  duration: number
  lang?: string
}

export interface YouTubeContent {
  title: string
  channel: string
  thumbnailUrl: string
  transcript: string
  hash: string
  source: 'subtitle' | 'gemini-audio'
  videoUrl: string
}

const MAX_TRANSCRIPT_LENGTH = 50000

/**
 * 主入口：擷取 YouTube 影片內容（三層回退）
 * L1: youtube-transcript-plus 字幕
 * L2: Gemini API 音訊轉錄
 * L3: 拋出錯誤
 */
export async function fetchVideoContent(videoId: string): Promise<YouTubeContent> {
  const metadata = await getVideoMetadata(videoId)
  const title = metadata?.title ?? `YouTube Video ${videoId}`
  const channel = metadata?.author_name ?? '未知頻道'
  const thumbnailUrl = metadata?.thumbnail_url ?? ''
  const videoUrl = buildVideoUrl(videoId)

  // L1: 嘗試字幕擷取
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId)
    if (segments && segments.length > 0) {
      const transcript = formatTranscriptToMarkdown(segments, title, channel)
      const hash = await computeHash(transcript)
      return {
        title, channel, thumbnailUrl,
        transcript: transcript.slice(0, MAX_TRANSCRIPT_LENGTH),
        hash, source: 'subtitle', videoUrl,
      }
    }
  } catch {
    // L1 失敗，繼續 L2
  }

  // L2: Gemini API 音訊轉錄
  try {
    const transcript = await transcribeWithGemini(videoId, title, channel)
    const hash = await computeHash(transcript)
    return {
      title, channel, thumbnailUrl,
      transcript: transcript.slice(0, MAX_TRANSCRIPT_LENGTH),
      hash, source: 'gemini-audio', videoUrl,
    }
  } catch {
    // L2 失敗
  }

  // L3: 無法取得內容
  throw new Error(`無法取得影片內容：${title}（影片可能無字幕且音訊轉錄失敗）`)
}

/**
 * L2: 使用 Gemini API 直接處理 YouTube URL 進行音訊轉錄
 */
async function transcribeWithGemini(videoId: string, title: string, channel: string): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY 未設定')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

  const videoUrl = buildVideoUrl(videoId)

  const result = await model.generateContent([
    {
      fileData: {
        mimeType: 'video/mp4',
        fileUri: videoUrl,
      },
    },
    {
      text: `請將這個 YouTube 影片的語音內容完整轉錄為文字。
要求：
1. 使用影片的原始語言轉錄
2. 盡量保留完整的語音內容
3. 適當分段（每段 2-3 句）
4. 每段開頭標注大約的時間戳（格式：[MM:SS]）
5. 不要翻譯，保持原語言

輸出格式：
# ${title}
**頻道:** ${channel}

[00:00] 第一段內容...
[00:30] 第二段內容...`,
    },
  ])

  const text = result.response.text()
  if (!text || text.length < 50) {
    throw new Error('Gemini 轉錄結果過短')
  }

  return text
}

/**
 * 將字幕段落格式化為 Markdown
 */
export function formatTranscriptToMarkdown(
  segments: TranscriptSegment[],
  title: string,
  channel: string
): string {
  const lines: string[] = [
    `# ${title}`,
    `**頻道:** ${channel}`,
    '',
  ]

  for (const seg of segments) {
    const ts = formatTimestamp(seg.offset)
    lines.push(`[${ts}] ${seg.text}`)
  }

  return lines.join('\n')
}

/**
 * 毫秒 → 時間戳字串
 */
function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * 使用 Gemini AI 處理影片內容，生成結構化摘要
 */
export async function processYouTubeContentWithAI(
  transcript: string,
  title: string
): Promise<string> {
  const { generateText } = await import('ai')
  const { getProvider } = await import('@/lib/ai/providers')

  const truncated = transcript.slice(0, 15000)

  const { text } = await generateText({
    model: getProvider('gemini-flash'),
    prompt: `你是知識庫整理專家。以下是 YouTube 影片「${title}」的逐字稿。
請將其整理為結構化的知識文件：

1. 提取核心觀點和關鍵資訊
2. 按主題分段，加上標題
3. 保留重要的數據、引用和專有名詞
4. 移除口語贅詞和重複內容
5. 輸出繁體中文 Markdown 格式

逐字稿：
${truncated}`,
    temperature: 0.2,
  })

  return text
}
```

**Step 4: 執行測試確認 GREEN**

Run: `pnpm test -- --testPathPattern="youtube-fetcher" --no-coverage`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/knowledge/youtube-fetcher.ts src/lib/knowledge/__tests__/youtube-fetcher.test.ts
git commit -m "feat: add YouTube content fetcher with subtitle + Gemini fallback"
```

---

## Task 3: 單片匯入 API 路由

**Files:**
- Create: `src/app/api/knowledge/youtube/route.ts`
- Test: `src/app/api/knowledge/youtube/__tests__/route.test.ts`

**Step 1: 寫測試（RED）**

```typescript
// src/app/api/knowledge/youtube/__tests__/route.test.ts
import { isYouTubeUrl } from '@/lib/knowledge/youtube-utils'

// 測試 URL 驗證邏輯（API 整合測試需 Supabase，留給 E2E）
describe('YouTube API validation logic', () => {
  it('accepts valid YouTube URLs', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=abc123')).toBe(true)
    expect(isYouTubeUrl('https://youtu.be/abc123')).toBe(true)
  })

  it('rejects non-YouTube URLs (SSRF protection)', () => {
    expect(isYouTubeUrl('https://evil.com/watch?v=abc')).toBe(false)
    expect(isYouTubeUrl('http://localhost:3000')).toBe(false)
    expect(isYouTubeUrl('file:///etc/passwd')).toBe(false)
  })
})
```

**Step 2: 執行測試確認 RED 或 GREEN**

Run: `pnpm test -- --testPathPattern="knowledge/youtube" --no-coverage`

**Step 3: 實作 API 路由**

```typescript
// src/app/api/knowledge/youtube/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isYouTubeUrl, parseYouTubeUrl, extractVideoId } from '@/lib/knowledge/youtube-utils'
import { fetchVideoContent, processYouTubeContentWithAI } from '@/lib/knowledge/youtube-fetcher'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '未登入' }, { status: 401 })
    }

    const body = await req.json()
    const { url } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: '請提供 YouTube URL' }, { status: 400 })
    }

    // SSRF 保護：僅允許 YouTube 域名
    if (!isYouTubeUrl(url)) {
      return NextResponse.json({ error: '僅支援 YouTube URL' }, { status: 400 })
    }

    const videoId = extractVideoId(url)
    if (!videoId) {
      return NextResponse.json({ error: '無法解析影片 ID，請確認 URL 格式' }, { status: 400 })
    }

    // 擷取影片內容（三層回退）
    const content = await fetchVideoContent(videoId)

    // AI 結構化處理
    const processedContent = await processYouTubeContentWithAI(content.transcript, content.title)

    // 儲存到 documents 表
    const { data: doc, error: insertError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        title: `[YouTube] ${content.title}`,
        content: processedContent,
        summary: null,
        tags: ['YouTube', content.channel, content.source === 'gemini-audio' ? '語音轉錄' : '字幕'],
      })
      .select()
      .single()

    if (insertError) {
      throw new Error(`儲存文件失敗: ${insertError.message}`)
    }

    // 非同步觸發嵌入
    const port = process.env.PORT || 3000
    const cookie = req.headers.get('cookie') ?? ''
    fetch(`http://localhost:${port}/api/knowledge/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ documentId: doc.id }),
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      data: {
        documentId: doc.id,
        title: content.title,
        channel: content.channel,
        source: content.source,
        contentLength: processedContent.length,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

**Step 4: 執行測試確認 GREEN**

Run: `pnpm test -- --testPathPattern="knowledge/youtube" --no-coverage`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/app/api/knowledge/youtube/route.ts src/app/api/knowledge/youtube/__tests__/route.test.ts
git commit -m "feat: add YouTube single video import API endpoint"
```

---

## Task 4: 播放清單批次匯入 API

**Files:**
- Create: `src/app/api/knowledge/youtube/playlist/route.ts`

**Step 1: 實作播放清單路由**

```typescript
// src/app/api/knowledge/youtube/playlist/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isYouTubeUrl, parseYouTubeUrl } from '@/lib/knowledge/youtube-utils'
import { fetchVideoContent, processYouTubeContentWithAI } from '@/lib/knowledge/youtube-fetcher'
import { YoutubeTranscript } from 'youtube-transcript-plus'

const MAX_CONCURRENT = 3
const MAX_VIDEOS = 20

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '未登入' }, { status: 401 })
    }

    const body = await req.json()
    const { url, videoIds } = body

    // 支援兩種模式：播放清單 URL 或直接傳入 videoIds 陣列
    let ids: string[] = []

    if (videoIds && Array.isArray(videoIds)) {
      ids = videoIds.slice(0, MAX_VIDEOS)
    } else if (url && typeof url === 'string') {
      if (!isYouTubeUrl(url)) {
        return NextResponse.json({ error: '僅支援 YouTube URL' }, { status: 400 })
      }
      const parsed = parseYouTubeUrl(url)
      if (!parsed || parsed.type !== 'playlist') {
        return NextResponse.json({ error: '請提供播放清單 URL' }, { status: 400 })
      }
      // 注意：youtube-transcript-plus 無法直接取得播放清單影片列表
      // 前端需透過 oEmbed 或其他方式取得 videoIds 後傳入
      return NextResponse.json({ error: '請提供播放清單中的 videoIds 陣列' }, { status: 400 })
    } else {
      return NextResponse.json({ error: '請提供 videoIds 陣列或播放清單 URL' }, { status: 400 })
    }

    // 並行處理（限制同時 3 個）
    const results: Array<{ videoId: string; success: boolean; title?: string; error?: string }> = []

    for (let i = 0; i < ids.length; i += MAX_CONCURRENT) {
      const batch = ids.slice(i, i + MAX_CONCURRENT)
      const batchResults = await Promise.allSettled(
        batch.map(async (videoId) => {
          const content = await fetchVideoContent(videoId)
          const processed = await processYouTubeContentWithAI(content.transcript, content.title)

          const { data: doc, error: insertError } = await supabase
            .from('documents')
            .insert({
              user_id: user.id,
              title: `[YouTube] ${content.title}`,
              content: processed,
              summary: null,
              tags: ['YouTube', '播放清單', content.channel],
            })
            .select()
            .single()

          if (insertError) throw new Error(insertError.message)

          // 非同步觸發嵌入
          const port = process.env.PORT || 3000
          const cookie = req.headers.get('cookie') ?? ''
          fetch(`http://localhost:${port}/api/knowledge/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify({ documentId: doc.id }),
          }).catch(() => {})

          return { videoId, success: true, title: content.title }
        })
      )

      for (const [idx, result] of batchResults.entries()) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          results.push({
            videoId: batch[idx],
            success: false,
            error: result.reason?.message ?? '處理失敗',
          })
        }
      }
    }

    const successCount = results.filter(r => r.success).length

    return NextResponse.json({
      success: true,
      data: {
        total: ids.length,
        succeeded: successCount,
        failed: ids.length - successCount,
        results,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/knowledge/youtube/playlist/route.ts
git commit -m "feat: add YouTube playlist batch import API endpoint"
```

---

## Task 5: 頻道監控 + DB Migration

**Files:**
- Create: `supabase/migrations/20260225_add_youtube_source_type.sql`
- Create: `src/app/api/knowledge/youtube/channel/route.ts`

**Step 1: 建立 DB Migration**

```sql
-- supabase/migrations/20260225_add_youtube_source_type.sql

-- 擴展 knowledge_sources 的 source_type CHECK 約束
ALTER TABLE knowledge_sources DROP CONSTRAINT IF EXISTS knowledge_sources_source_type_check;
ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_source_type_check
  CHECK (source_type IN ('url', 'rss', 'sitemap', 'youtube'));

-- 新增 YouTube 專用欄位（使用 metadata JSONB）
COMMENT ON TABLE knowledge_sources IS 'YouTube sources store channel_handle, last_video_ids in metadata JSONB column';
```

**Step 2: 實作頻道監控路由**

```typescript
// src/app/api/knowledge/youtube/channel/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isYouTubeUrl, parseYouTubeUrl } from '@/lib/knowledge/youtube-utils'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '未登入' }, { status: 401 })
    }

    const body = await req.json()
    const { url, name, check_interval_hours = 24 } = body

    if (!url || !name) {
      return NextResponse.json({ error: '請提供頻道 URL 和名稱' }, { status: 400 })
    }

    if (!isYouTubeUrl(url)) {
      return NextResponse.json({ error: '僅支援 YouTube URL' }, { status: 400 })
    }

    const parsed = parseYouTubeUrl(url)
    if (!parsed || parsed.type !== 'channel') {
      return NextResponse.json({ error: '請提供 YouTube 頻道 URL（格式：youtube.com/@頻道名）' }, { status: 400 })
    }

    // 建立監控源
    const { data: source, error: insertError } = await supabase
      .from('knowledge_sources')
      .insert({
        user_id: user.id,
        source_type: 'youtube',
        url: url,
        name: name,
        check_interval_hours: check_interval_hours,
        is_active: true,
        metadata: {
          channel_handle: parsed.channelHandle,
          processed_video_ids: [],
        },
      })
      .select()
      .single()

    if (insertError) {
      throw new Error(`建立監控源失敗: ${insertError.message}`)
    }

    return NextResponse.json({
      success: true,
      data: source,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

**Step 3: 執行 Migration（NAS 部署時）**

在 nexusmind-db 容器中執行 SQL migration。
記得：`GRANT ALL ON knowledge_sources TO service_role; NOTIFY pgrst, 'reload schema';`

**Step 4: Commit**

```bash
git add supabase/migrations/20260225_add_youtube_source_type.sql src/app/api/knowledge/youtube/channel/route.ts
git commit -m "feat: add YouTube channel monitoring with DB migration"
```

---

## Task 6: YouTube 匯入 UI 元件

**Files:**
- Create: `src/components/knowledge/youtube-import.tsx`
- Modify: `src/app/(protected)/knowledge/page.tsx`

**Step 1: 實作 YouTube 匯入元件**

```typescript
// src/components/knowledge/youtube-import.tsx
'use client'

import { useState } from 'react'
import { Youtube, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react'

interface ImportResult {
  success: boolean
  title?: string
  channel?: string
  source?: string
  error?: string
}

export function YouTubeImport({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [url, setUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim() || importing) return

    setImporting(true)
    setResult(null)

    try {
      const res = await fetch('/api/knowledge/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setResult({ success: false, error: data.error })
      } else {
        setResult({
          success: true,
          title: data.data.title,
          channel: data.data.channel,
          source: data.data.source,
        })
        onSuccess()
      }
    } catch {
      setResult({ success: false, error: '網路錯誤' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50/30 dark:bg-red-900/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Youtube className="w-5 h-5 text-red-500" />
          <span className="font-medium text-foreground">匯入 YouTube 影片</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleImport} className="space-y-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          required
          type="url"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
          >
            {importing && <Loader2 className="w-4 h-4 animate-spin" />}
            {importing ? '擷取中...' : '匯入影片'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            取消
          </button>
        </div>
      </form>

      {result && (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
          result.success
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
        }`}>
          {result.success ? (
            <>
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">{result.title}</p>
                <p className="text-xs mt-1">
                  頻道: {result.channel} · 來源: {result.source === 'subtitle' ? '字幕' : '語音轉錄'}
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{result.error}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2: 整合到知識庫頁面**

修改 `src/app/(protected)/knowledge/page.tsx`：
1. 新增 `showYouTubeImport` state
2. 在 action bar 新增 YouTube 按鈕（lucide-react 的 Youtube icon）
3. 條件渲染 `<YouTubeImport />` 元件

在 action bar 區域（viewMode === 'list' 的按鈕群組中）新增：

```tsx
import { YouTubeImport } from '@/components/knowledge/youtube-import'
// ... 在 state 區塊新增：
const [showYouTubeImport, setShowYouTubeImport] = useState(false)

// ... 在按鈕列新增（與 URL 匯入按鈕相鄰）：
<button
  onClick={() => setShowYouTubeImport(!showYouTubeImport)}
  className="..."
>
  <Youtube className="w-4 h-4" />
  YouTube
</button>

// ... 在表單區域新增：
{showYouTubeImport && (
  <YouTubeImport
    onClose={() => setShowYouTubeImport(false)}
    onSuccess={() => loadDocuments()}
  />
)}
```

**Step 3: Commit**

```bash
git add src/components/knowledge/youtube-import.tsx src/app/\(protected\)/knowledge/page.tsx
git commit -m "feat: add YouTube import UI component and integrate into knowledge page"
```

---

## Task 7: 整合驗證

**Step 1: 執行全部測試**

Run: `pnpm test --no-coverage`
Expected: ALL PASS

**Step 2: 執行覆蓋率檢查**

Run: `pnpm test --coverage`
Expected: >= 80%

**Step 3: Lint 檢查**

Run: `pnpm run lint`
Expected: 0 errors

**Step 4: Build 檢查**

Run: `pnpm run build`
Expected: SUCCESS

**Step 5: 手動驗證（在瀏覽器中啟動開發伺服器）**

1. 開啟知識庫頁面
2. 確認 YouTube 匯入按鈕出現
3. 貼入 YouTube URL 測試匯入
4. 確認文件出現在知識庫列表中
5. 確認可以在聊天中引用該文件

**Step 6: 最終 Commit**

```bash
git add -A
git commit -m "feat: YouTube knowledge base integration complete

- YouTube URL parsing utilities (video, playlist, channel)
- Three-layer fallback: subtitle → Gemini audio → error
- Single video import API with AI content structuring
- Playlist batch import with parallel processing
- Channel monitoring with DB migration
- YouTube import UI component in knowledge page"
```

---

## 依賴關係

```
Task 1 (youtube-utils) ──┐
                          ├── Task 3 (single import API) ──┐
Task 2 (youtube-fetcher) ─┤                                ├── Task 6 (UI) ── Task 7 (驗證)
                          ├── Task 4 (playlist API) ───────┤
                          └── Task 5 (channel + migration) ┘
```

- Task 1 和 Task 2 可平行開發
- Task 3/4/5 依賴 Task 1+2
- Task 6 依賴 Task 3（API 端點）
- Task 7 依賴所有前置任務
