import {
  isYouTubeUrl,
  extractVideoId,
  parseYouTubeUrl,
} from '@/lib/knowledge/youtube-utils'

describe('YouTube API validation logic', () => {
  describe('URL validation (SSRF protection)', () => {
    it('accepts valid YouTube URLs', () => {
      expect(isYouTubeUrl('https://www.youtube.com/watch?v=abc123')).toBe(true)
      expect(isYouTubeUrl('https://youtu.be/abc123')).toBe(true)
      expect(isYouTubeUrl('https://m.youtube.com/watch?v=abc123')).toBe(true)
    })

    it('rejects non-YouTube URLs', () => {
      expect(isYouTubeUrl('https://evil.com/watch?v=abc')).toBe(false)
      expect(isYouTubeUrl('http://localhost:3000')).toBe(false)
      expect(isYouTubeUrl('file:///etc/passwd')).toBe(false)
      expect(isYouTubeUrl('https://youtube.com.evil.com/watch?v=abc')).toBe(false)
    })

    it('rejects invalid URLs', () => {
      expect(isYouTubeUrl('not a url')).toBe(false)
      expect(isYouTubeUrl('')).toBe(false)
    })
  })

  describe('video ID extraction', () => {
    it('extracts video ID from standard URL', () => {
      expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })

    it('extracts video ID from short URL', () => {
      expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })

    it('extracts video ID from URL with extra params', () => {
      expect(extractVideoId('https://www.youtube.com/watch?v=abc123&t=60')).toBe('abc123')
    })

    it('returns null for playlist-only URL', () => {
      expect(extractVideoId('https://www.youtube.com/playlist?list=PLxyz')).toBeNull()
    })

    it('returns null for channel URL', () => {
      expect(extractVideoId('https://www.youtube.com/@channelname')).toBeNull()
    })

    it('returns null for non-YouTube URL', () => {
      expect(extractVideoId('https://vimeo.com/123')).toBeNull()
    })
  })

  describe('channel URL parsing', () => {
    it('parses channel URL correctly', () => {
      const result = parseYouTubeUrl('https://www.youtube.com/@channelname')
      expect(result).toEqual({ type: 'channel', channelHandle: 'channelname' })
    })

    it('parses channel URL with subdirectory', () => {
      const result = parseYouTubeUrl('https://www.youtube.com/@tech_channel')
      expect(result).toEqual({ type: 'channel', channelHandle: 'tech_channel' })
    })

    it('rejects non-channel URL for channel endpoint', () => {
      const result = parseYouTubeUrl('https://www.youtube.com/watch?v=abc')
      expect(result?.type).not.toBe('channel')
    })

    it('returns video type for watch URL', () => {
      const result = parseYouTubeUrl('https://www.youtube.com/watch?v=abc123')
      expect(result).toEqual({ type: 'video', videoId: 'abc123' })
    })

    it('returns playlist type for playlist URL', () => {
      const result = parseYouTubeUrl('https://www.youtube.com/playlist?list=PLxyz')
      expect(result).toEqual({ type: 'playlist', playlistId: 'PLxyz' })
    })

    it('returns null for unrecognized YouTube path', () => {
      const result = parseYouTubeUrl('https://www.youtube.com/feed/history')
      expect(result).toBeNull()
    })
  })
})
