import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isYouTubeUrl,
  parseYouTubeUrl,
  fetchPlaylistVideoIds,
} from "@/lib/knowledge/youtube-utils";
import {
  fetchVideoContent,
  processYouTubeContentWithAI,
} from "@/lib/knowledge/youtube-fetcher";

export const maxDuration = 300; // Batch processing multiple videos via Gemini

const MAX_CONCURRENT = 3;
const MAX_VIDEOS = 20;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "未登入" }, { status: 401 });
    }

    const body = await req.json();
    const { url, videoIds } = body;

    let ids: string[] = [];

    if (videoIds && Array.isArray(videoIds)) {
      ids = videoIds.slice(0, MAX_VIDEOS);
    } else if (url && typeof url === "string") {
      if (!isYouTubeUrl(url)) {
        return NextResponse.json(
          { error: "僅支援 YouTube URL" },
          { status: 400 },
        );
      }
      const parsed = parseYouTubeUrl(url);
      if (!parsed || parsed.type !== "playlist") {
        return NextResponse.json(
          { error: "請提供播放清單 URL" },
          { status: 400 },
        );
      }
      ids = (await fetchPlaylistVideoIds(parsed.playlistId)).slice(
        0,
        MAX_VIDEOS,
      );
      if (ids.length === 0) {
        return NextResponse.json(
          { error: "無法取得播放清單影片，請確認播放清單是否公開" },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "請提供 videoIds 陣列或播放清單 URL" },
        { status: 400 },
      );
    }

    if (ids.length === 0) {
      return NextResponse.json({ error: "videoIds 不可為空" }, { status: 400 });
    }

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

          const { data: doc, error: insertError } = await supabase
            .from("documents")
            .insert({
              user_id: user.id,
              title: `[YouTube] ${content.title}`,
              content: summary,
              summary,
              tags: ["YouTube", "播放清單", content.channel],
            })
            .select()
            .single();

          if (insertError) throw new Error(insertError.message);

          const port = process.env.PORT || 3000;
          const cookie = req.headers.get("cookie") ?? "";
          fetch(`http://localhost:${port}/api/knowledge/embed`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookie },
            body: JSON.stringify({ documentId: doc.id }),
          }).catch(() => {});

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
              result.reason instanceof Error
                ? result.reason.message
                : "處理失敗",
          });
        }
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: true,
      data: {
        total: ids.length,
        succeeded: successCount,
        failed: ids.length - successCount,
        results,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知錯誤";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
