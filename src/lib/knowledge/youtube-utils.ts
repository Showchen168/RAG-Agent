/**
 * 帶指數退避的重試機制（針對 YouTube RSS 間歇性 404）
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit & { signal?: AbortSignal },
  maxRetries = 3,
): Promise<Response | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      // 4xx/5xx → 等待後重試
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    } catch {
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  }
  return null;
}

export interface YouTubeVideoInfo {
  type: "video";
  videoId: string;
  playlistId?: string;
}

export interface YouTubePlaylistInfo {
  type: "playlist";
  playlistId: string;
}

export interface YouTubeChannelInfo {
  type: "channel";
  channelHandle: string;
}

export type YouTubeUrlInfo =
  | YouTubeVideoInfo
  | YouTubePlaylistInfo
  | YouTubeChannelInfo;

const YOUTUBE_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "m.youtube.com",
  "youtu.be",
];

export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return YOUTUBE_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function parseYouTubeUrl(url: string): YouTubeUrlInfo | null {
  try {
    const parsed = new URL(url);
    if (!YOUTUBE_HOSTS.includes(parsed.hostname)) return null;

    // youtu.be short URL
    if (parsed.hostname === "youtu.be") {
      const videoId = parsed.pathname.slice(1);
      if (!videoId) return null;
      return { type: "video", videoId };
    }

    // Channel URL: /@handle
    const channelMatch = parsed.pathname.match(/^\/@([^/]+)/);
    if (channelMatch) {
      return { type: "channel", channelHandle: channelMatch[1] };
    }

    // Playlist URL: /playlist?list=...
    if (parsed.pathname === "/playlist") {
      const listId = parsed.searchParams.get("list");
      if (listId) return { type: "playlist", playlistId: listId };
    }

    // Video URL: /watch?v=...
    const videoId = parsed.searchParams.get("v");
    if (videoId) {
      const playlistId = parsed.searchParams.get("list") ?? undefined;
      return { type: "video", videoId, ...(playlistId ? { playlistId } : {}) };
    }

    return null;
  } catch {
    return null;
  }
}

export function extractVideoId(url: string): string | null {
  const info = parseYouTubeUrl(url);
  if (info?.type === "video") return info.videoId;
  return null;
}

export function buildVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Fetch video IDs from a YouTube playlist RSS feed
 */
export async function fetchPlaylistVideoIds(
  playlistId: string,
): Promise<string[]> {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
  const res = await fetchWithRetry(rssUrl, {
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res) return [];

  try {
    const xml = await res.text();
    const videoIds: string[] = [];
    const pattern = /<yt:videoId>([^<]+)<\/yt:videoId>/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(xml)) !== null) {
      videoIds.push(match[1]);
    }
    return videoIds;
  } catch {
    return [];
  }
}

/**
 * Resolve YouTube channel ID from a channel URL (e.g., https://www.youtube.com/@handle)
 * Fetches the channel page and extracts the channel ID from embedded metadata.
 */
export async function resolveChannelId(
  channelUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(channelUrl, {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NexusMind/1.0; +https://nexusmind.showmico888.net)",
      },
    });
    if (!res.ok) return null;

    const html = await res.text();

    // Prefer externalId / browseId (page owner's channel), then fall back to channelId.
    // "channelId" can match a *featured/related* channel instead of the page itself.
    const match =
      html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/) ??
      html.match(/"browseId":"(UC[a-zA-Z0-9_-]+)"/) ??
      html.match(/<meta itemprop="channelId" content="(UC[a-zA-Z0-9_-]+)"/) ??
      html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/) ??
      html.match(/channel_id=(UC[a-zA-Z0-9_-]+)/);

    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Fetch video IDs from a YouTube channel RSS feed (by channel ID)
 * Returns up to 15 most recent video IDs (YouTube RSS limit).
 */
export async function fetchChannelVideoIds(
  channelId: string,
): Promise<string[]> {
  const videos = await fetchChannelVideos(channelId);
  return videos.map((v) => v.videoId);
}

export interface ChannelVideo {
  readonly videoId: string;
  readonly title: string;
  readonly published: string;
}

/**
 * Fetch video IDs and titles from a YouTube channel RSS feed.
 * Returns up to 15 most recent videos (YouTube RSS limit).
 */
export async function fetchChannelVideos(
  channelId: string,
): Promise<ChannelVideo[]> {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const res = await fetchWithRetry(rssUrl, {
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res) return [];

  try {
    const xml = await res.text();
    const videos: ChannelVideo[] = [];

    // Split by <entry> to parse each video
    const entries = xml.split("<entry>");
    for (let i = 1; i < entries.length; i++) {
      const entry = entries[i];
      const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
      const pubMatch = entry.match(/<published>([^<]+)<\/published>/);
      if (idMatch) {
        videos.push({
          videoId: idMatch[1],
          title: titleMatch?.[1] ?? idMatch[1],
          published: pubMatch?.[1] ?? "",
        });
      }
    }
    return videos;
  } catch {
    return [];
  }
}

export async function getVideoMetadata(videoId: string): Promise<{
  title: string;
  author_name: string;
  thumbnail_url: string;
} | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 從 YouTube 頁面 HTML 取得影片時長（秒）
 * 解析 `"lengthSeconds":"..."` 欄位
 * 回傳 null 表示無法取得
 */
export async function getVideoDurationSeconds(
  videoId: string,
): Promise<number | null> {
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NexusMind/1.0; +https://nexusmind.showmico888.net)",
      },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const match = html.match(/"lengthSeconds":"(\d+)"/);
    if (!match) return null;

    return parseInt(match[1], 10);
  } catch {
    return null;
  }
}
