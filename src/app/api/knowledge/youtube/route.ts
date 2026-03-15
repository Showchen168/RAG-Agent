import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isYouTubeUrl,
  parseYouTubeUrl,
  fetchPlaylistVideoIds,
  resolveChannelId,
  fetchChannelVideoIds,
} from "@/lib/knowledge/youtube-utils";
import {
  fetchVideoContent,
  buildStructuredContent,
  processYouTubeContentWithAI,
} from "@/lib/knowledge/youtube-fetcher";

export const maxDuration = 300; // Gemini audio transcription of 30+ min videos needs up to 5 min

const MAX_PLAYLIST_VIDEOS = 20;
const MAX_CONCURRENT = 3;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const body = (await req.json()) as {
    url: string;
    name?: string;
    check_interval_hours?: number;
  };
  const { url } = body;

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "請提供 YouTube URL" }, { status: 400 });
  }

  if (!isYouTubeUrl(url)) {
    return NextResponse.json({ error: "僅支援 YouTube URL" }, { status: 400 });
  }

  const parsed = parseYouTubeUrl(url);
  if (!parsed) {
    return NextResponse.json(
      { error: "無法解析 YouTube URL，請確認格式" },
      { status: 400 },
    );
  }

  try {
    switch (parsed.type) {
      case "video":
        return await handleVideo(parsed.videoId, user.id, req, supabase);
      case "playlist":
        return await handlePlaylist(parsed.playlistId, user.id, req, supabase);
      case "channel":
        return await handleChannel(
          url,
          body.name || parsed.channelHandle,
          user.id,
          body.check_interval_hours ?? 24,
          supabase,
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知錯誤";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleVideo(
  videoId: string,
  userId: string,
  req: Request,
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const content = await fetchVideoContent(videoId);

  // Generate AI summary
  const summary = await processYouTubeContentWithAI(
    content.transcript,
    content.title,
  );

  // Build structured content with summary + segmented transcript
  const segments = parseTranscriptSegments(content.transcript);
  const structuredContent =
    segments.length > 0
      ? buildStructuredContent(
          segments,
          content.title,
          content.channel,
          content.source,
          summary,
        )
      : `# ${content.title}\n**頻道:** ${content.channel}\n\n## 摘要\n\n${summary}\n\n## 原文\n\n${content.transcript}`;

  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      title: `[YouTube] ${content.title}`,
      content: structuredContent,
      summary,
      tags: [
        "YouTube",
        content.channel,
        content.source === "gemini-audio" ? "語音轉錄" : "字幕",
      ],
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: `儲存文件失敗: ${insertError.message}` },
      { status: 500 },
    );
  }

  triggerEmbedding(doc.id, req);

  return NextResponse.json({
    success: true,
    type: "video",
    data: {
      documentId: doc.id,
      title: content.title,
      channel: content.channel,
      source: content.source,
      contentLength: structuredContent.length,
    },
  });
}

async function handlePlaylist(
  playlistId: string,
  userId: string,
  req: Request,
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const videoIds = await fetchPlaylistVideoIds(playlistId);
  if (videoIds.length === 0) {
    return NextResponse.json(
      { error: "無法取得播放清單影片，請確認播放清單是否公開" },
      { status: 400 },
    );
  }

  const ids = videoIds.slice(0, MAX_PLAYLIST_VIDEOS);
  const results: Array<{
    videoId: string;
    success: boolean;
    title?: string;
    error?: string;
  }> = [];

  for (let i = 0; i < ids.length; i += MAX_CONCURRENT) {
    const batch = ids.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.allSettled(
      batch.map(async (videoId) => {
        const content = await fetchVideoContent(videoId);
        const summary = await processYouTubeContentWithAI(
          content.transcript,
          content.title,
        );
        const segments = parseTranscriptSegments(content.transcript);
        const structuredContent =
          segments.length > 0
            ? buildStructuredContent(
                segments,
                content.title,
                content.channel,
                content.source,
                summary,
              )
            : `# ${content.title}\n**頻道:** ${content.channel}\n\n## 摘要\n\n${summary}`;

        const { data: doc, error: insertError } = await supabase
          .from("documents")
          .insert({
            user_id: userId,
            title: `[YouTube] ${content.title}`,
            content: structuredContent,
            summary,
            tags: ["YouTube", "播放清單", content.channel],
          })
          .select()
          .single();

        if (insertError) throw new Error(insertError.message);

        triggerEmbedding(doc.id, req);
        return { videoId, success: true as const, title: content.title };
      }),
    );

    for (const [idx, result] of batchResults.entries()) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        results.push({
          videoId: batch[idx],
          success: false,
          error:
            result.reason instanceof Error ? result.reason.message : "處理失敗",
        });
      }
    }
  }

  const successCount = results.filter((r) => r.success).length;

  return NextResponse.json({
    success: true,
    type: "playlist",
    data: {
      total: ids.length,
      succeeded: successCount,
      failed: ids.length - successCount,
      results,
    },
  });
}

async function handleChannel(
  url: string,
  name: string,
  userId: string,
  checkIntervalHours: number,
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  if (!name) {
    return NextResponse.json(
      { error: "頻道監控需提供 name 參數" },
      { status: 400 },
    );
  }

  // Resolve channel_id and fetch initial video IDs for baseline
  const channelId = await resolveChannelId(url);
  const initialVideoIds = channelId
    ? await fetchChannelVideoIds(channelId)
    : [];

  const metadata: Record<string, unknown> = {
    channel_handle: name,
    ...(channelId ? { channel_id: channelId } : {}),
    last_video_ids: initialVideoIds,
  };

  const { data: source, error: insertError } = await supabase
    .from("knowledge_sources")
    .insert({
      user_id: userId,
      source_type: "youtube",
      url,
      name,
      check_interval_hours: checkIntervalHours,
      is_active: true,
      metadata,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: `建立監控源失敗: ${insertError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    type: "channel",
    data: {
      ...source,
      initial_video_count: initialVideoIds.length,
      channel_id_resolved: !!channelId,
    },
  });
}

/**
 * Parse markdown transcript back into segments for structured content
 */
function parseTranscriptSegments(
  transcript: string,
): Array<{ text: string; offset: number; duration: number }> {
  const segments: Array<{ text: string; offset: number; duration: number }> =
    [];
  const lines = transcript.split("\n");

  for (const line of lines) {
    const match =
      line.match(/^\[(\d+):(\d{2}):(\d{2})\]\s*(.+)$/) ??
      line.match(/^\[(\d{2}):(\d{2})\]\s*(.+)$/);
    if (!match) continue;

    let offsetMs: number;
    let text: string;
    if (match.length === 5) {
      // HH:MM:SS format
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const seconds = parseInt(match[3], 10);
      offsetMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
      text = match[4];
    } else {
      // MM:SS format
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      offsetMs = (minutes * 60 + seconds) * 1000;
      text = match[3];
    }

    segments.push({ text, offset: offsetMs, duration: 0 });
  }

  return segments;
}

function triggerEmbedding(documentId: string, req: Request) {
  const port = process.env.PORT || 3000;
  const cookie = req.headers.get("cookie") ?? "";
  fetch(`http://localhost:${port}/api/knowledge/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ documentId }),
  }).catch(() => {});
}
