import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  resolveChannelId,
  fetchChannelVideos,
} from "@/lib/knowledge/youtube-utils";

// POST: 重置 YouTube 監控源並發現可匯入的影片
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: source, error: sourceError } = await supabase
    .from("knowledge_sources")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (sourceError || !source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  if (source.source_type !== "youtube") {
    return NextResponse.json(
      { error: "僅支援 YouTube 監控源的重置操作" },
      { status: 400 },
    );
  }

  const metadata = (source.metadata ?? {}) as Record<string, unknown>;

  // 1. 強制重新解析 channel_id（不使用快取，避免舊的錯誤 ID）
  const channelId =
    (await resolveChannelId(source.url as string)) ?? undefined;
  if (!channelId) {
    return NextResponse.json(
      { error: "無法解析頻道 ID" },
      { status: 400 },
    );
  }

  // 2. 從 RSS 抓取最新影片列表（含標題）
  const videos = await fetchChannelVideos(channelId);
  if (videos.length === 0) {
    return NextResponse.json(
      { error: "YouTube RSS 暫時無法存取（已重試 3 次），請稍後再試" },
      { status: 400 },
    );
  }

  // 3. 清空 last_video_ids
  const previousCount = Array.isArray(metadata.last_video_ids)
    ? (metadata.last_video_ids as string[]).length
    : 0;

  const { error: updateError } = await supabase
    .from("knowledge_sources")
    .update({
      metadata: { ...metadata, channel_id: channelId, last_video_ids: [] },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: `重置失敗: ${updateError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      cleared_video_count: previousCount,
      videos: videos.map((v) => ({
        videoId: v.videoId,
        title: v.title,
        published: v.published,
      })),
    },
  });
}
