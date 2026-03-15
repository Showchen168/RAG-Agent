import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchVideoContent,
  buildStructuredContent,
  processYouTubeContentWithAI,
} from "@/lib/knowledge/youtube-fetcher";
import {
  triggerEmbedding,
  parseTranscriptSegments,
} from "@/lib/knowledge/source-checker";

export const maxDuration = 120;

// POST: 匯入使用者選定的 YouTube 影片
export async function POST(
  req: Request,
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
  const body = (await req.json()) as { videoIds?: string[] };

  if (!Array.isArray(body.videoIds) || body.videoIds.length === 0) {
    return NextResponse.json(
      { error: "請選擇至少一部影片" },
      { status: 400 },
    );
  }

  // 驗證 source 屬於使用者且為 YouTube 類型
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
      { error: "僅支援 YouTube 監控源" },
      { status: 400 },
    );
  }

  const videoIds = body.videoIds.slice(0, 15); // 上限 15 部
  const results: Array<{
    videoId: string;
    success: boolean;
    title?: string;
    error?: string;
  }> = [];

  // 每次並行 2 部影片處理
  for (let i = 0; i < videoIds.length; i += 2) {
    const batch = videoIds.slice(i, i + 2);
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
            : `# ${content.title}\n**頻道:** ${content.channel}\n\n## 摘要\n\n${summary}\n\n## 原文\n\n${content.transcript}`;

        const { data: doc, error: insertError } = await supabase
          .from("documents")
          .insert({
            user_id: user.id,
            title: `[YouTube] ${content.title}`,
            content: structuredContent,
            summary,
            tags: [
              "YouTube",
              "頻道監控",
              content.channel,
              content.source === "gemini-audio" ? "語音轉錄" : "字幕",
            ],
          })
          .select()
          .single();

        if (insertError) throw new Error(insertError.message);

        triggerEmbedding(doc.id).catch(() => {});
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

  // 更新 last_video_ids — 把已匯入的影片加入已知列表
  const metadata = (source.metadata ?? {}) as Record<string, unknown>;
  const lastVideoIds = (metadata.last_video_ids ?? []) as string[];
  const allKnownIds = [...new Set([...lastVideoIds, ...videoIds])];

  await supabase
    .from("knowledge_sources")
    .update({
      metadata: { ...metadata, last_video_ids: allKnownIds },
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  const succeeded = results.filter((r) => r.success).length;

  return NextResponse.json({
    success: true,
    data: {
      total: videoIds.length,
      succeeded,
      failed: videoIds.length - succeeded,
      results,
    },
  });
}
