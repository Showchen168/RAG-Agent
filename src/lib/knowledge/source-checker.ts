/**
 * 監控源檢查核心邏輯
 *
 * 從 check/route.ts 抽取，可被手動 API 和 cron endpoint 共用。
 * 不依賴 Request / NextResponse，只接收 SupabaseClient 與 source 資料。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchUrlContent,
  fetchRssContent,
  enrichRssItems,
} from "@/lib/knowledge/content-fetcher";
import {
  resolveChannelId,
  fetchChannelVideoIds,
} from "@/lib/knowledge/youtube-utils";
import {
  fetchVideoContent,
  buildStructuredContent,
  processYouTubeContentWithAI,
} from "@/lib/knowledge/youtube-fetcher";

// ─── 常數 ──────────────────────────────────────────────────────────

/** 每次檢查最多處理的新影片數量 */
const MAX_NEW_VIDEOS_PER_CHECK = 5;

/** 同時處理的影片數量上限 */
const MAX_CONCURRENT = 2;

// ─── 型別 ──────────────────────────────────────────────────────────

export interface CheckResult {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceType: string;
  readonly status: "ok" | "error" | "no_change";
  readonly updated: boolean;
  readonly documentId?: string;
  readonly reembedded?: boolean;
  // YouTube 專用
  readonly newVideoCount?: number;
  readonly processed?: number;
  readonly succeeded?: number;
  readonly failed?: number;
  readonly results?: ReadonlyArray<{
    videoId: string;
    success: boolean;
    title?: string;
    error?: string;
  }>;
  readonly error?: string;
}

// ─── 主入口 ────────────────────────────────────────────────────────

/**
 * 檢查單一監控源是否有新內容。
 * 根據 source_type 分流到 YouTube / URL / RSS 專用邏輯。
 */
export async function checkSource(
  supabase: SupabaseClient,
  source: Record<string, unknown>,
): Promise<CheckResult> {
  const sourceId = source.id as string;
  const sourceName = (source.name as string) ?? "";
  const sourceType = source.source_type as string;

  try {
    if (sourceType === "youtube") {
      return await checkYouTubeSource(supabase, source);
    }

    return await checkUrlOrRssSource(supabase, source);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      sourceId,
      sourceName,
      sourceType,
      status: "error",
      updated: false,
      error: `檢查失敗: ${message}`,
    };
  }
}

// ─── URL / RSS 檢查 ───────────────────────────────────────────────

/**
 * URL 或 RSS 監控源檢查：抓取內容 → 比對 hash → 更新文件 / 觸發 embedding
 */
async function checkUrlOrRssSource(
  supabase: SupabaseClient,
  source: Record<string, unknown>,
): Promise<CheckResult> {
  const sourceId = source.id as string;
  const sourceName = (source.name as string) ?? "";
  const sourceType = source.source_type as string;

  // 抓取最新內容
  let content: string;
  let hash: string;

  if (sourceType === "rss") {
    const result = await fetchRssContent(source.url as string);
    const enrichedItems = await enrichRssItems(result.items);
    content = enrichedItems
      .map(
        (item: {
          title: string;
          description: string;
          link: string;
          fullContent?: string;
        }) => {
          const body = item.fullContent || item.description;
          return `## ${item.title}\n${body}\n來源: ${item.link}\n`;
        },
      )
      .join("\n");
    hash = result.hash;
  } else {
    const result = await fetchUrlContent(source.url as string);
    content = result.content;
    hash = result.hash;
  }

  const now = new Date().toISOString();
  const documentId = source.document_id as string | undefined;

  // 比對 hash — 有更新
  if (hash !== source.last_content_hash) {
    if (documentId) {
      await supabase
        .from("documents")
        .update({
          content: content.slice(0, 50000),
          updated_at: now,
        })
        .eq("id", documentId);

      // 刪除舊 embeddings
      await supabase
        .from("document_embeddings")
        .delete()
        .eq("document_id", documentId);

      // 非同步觸發重新 embedding
      triggerEmbedding(documentId).catch(() => {
        /* 忽略 */
      });
    }

    // 更新監控源
    await supabase
      .from("knowledge_sources")
      .update({
        last_checked_at: now,
        last_content_hash: hash,
        updated_at: now,
      })
      .eq("id", sourceId);

    return {
      sourceId,
      sourceName,
      sourceType,
      status: "ok",
      updated: true,
      documentId,
    };
  }

  // 無更新 — 檢查是否有缺失的 embeddings（上次可能失敗）
  let reembedded = false;
  if (documentId) {
    const { count } = await supabase
      .from("document_embeddings")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId);

    if (count === 0) {
      triggerEmbedding(documentId).catch(() => {
        /* 忽略 */
      });
      reembedded = true;
    }
  }

  await supabase
    .from("knowledge_sources")
    .update({ last_checked_at: now, updated_at: now })
    .eq("id", sourceId);

  return {
    sourceId,
    sourceName,
    sourceType,
    status: "no_change",
    updated: false,
    reembedded,
  };
}

// ─── YouTube 頻道檢查 ─────────────────────────────────────────────

/**
 * YouTube 頻道專用檢查：比對 RSS 影片列表，自動匯入新影片
 */
async function checkYouTubeSource(
  supabase: SupabaseClient,
  source: Record<string, unknown>,
): Promise<CheckResult> {
  const sourceId = source.id as string;
  const sourceName = (source.name as string) ?? "";
  const sourceType = "youtube";
  const userId = source.user_id as string;
  const metadata = (source.metadata ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  // 1. 解析 channel_id — 每次都重新解析以修正可能的舊快取錯誤
  const cachedChannelId = metadata.channel_id as string | undefined;
  const freshChannelId =
    (await resolveChannelId(source.url as string)) ?? undefined;
  const channelId = freshChannelId ?? cachedChannelId;

  if (!channelId) {
    await supabase
      .from("knowledge_sources")
      .update({ last_checked_at: now, updated_at: now })
      .eq("id", sourceId);

    return {
      sourceId,
      sourceName,
      sourceType,
      status: "error",
      updated: false,
      error: "無法解析頻道 ID，請確認頻道 URL 是否正確",
    };
  }

  // 2. 取得頻道最新影片 IDs（YouTube RSS 回傳最近 15 部）
  const currentVideoIds = await fetchChannelVideoIds(channelId);
  if (currentVideoIds.length === 0) {
    await supabase
      .from("knowledge_sources")
      .update({ last_checked_at: now, updated_at: now })
      .eq("id", sourceId);

    return {
      sourceId,
      sourceName,
      sourceType,
      status: "error",
      updated: false,
      newVideoCount: 0,
      error: `YouTube RSS 暫時無法存取（已重試 3 次），請稍後再試`,
    };
  }

  // 3. 找出新影片（不在 last_video_ids 中的）
  const lastVideoIds = (metadata.last_video_ids ?? []) as string[];
  const lastVideoSet = new Set(lastVideoIds);
  const newVideoIds = currentVideoIds.filter(
    (vid) => !lastVideoSet.has(vid),
  );

  if (newVideoIds.length === 0) {
    const updatedMetadata = { ...metadata, channel_id: channelId };
    await supabase
      .from("knowledge_sources")
      .update({
        last_checked_at: now,
        updated_at: now,
        metadata: updatedMetadata,
      })
      .eq("id", sourceId);

    return {
      sourceId,
      sourceName,
      sourceType,
      status: "no_change",
      updated: false,
      newVideoCount: 0,
    };
  }

  // 4. 批次處理新影片（限制數量避免超時）
  const idsToProcess = newVideoIds.slice(0, MAX_NEW_VIDEOS_PER_CHECK);
  const results: Array<{
    videoId: string;
    success: boolean;
    title?: string;
    error?: string;
  }> = [];

  for (let i = 0; i < idsToProcess.length; i += MAX_CONCURRENT) {
    const batch = idsToProcess.slice(i, i + MAX_CONCURRENT);
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
            user_id: userId,
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

        triggerEmbedding(doc.id).catch(() => {
          /* 忽略 */
        });
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

  // 5. 更新 metadata — 合併新 video IDs
  const allKnownIds = [...new Set([...currentVideoIds, ...lastVideoIds])];
  const updatedMetadata = {
    ...metadata,
    channel_id: channelId,
    last_video_ids: allKnownIds,
  };

  await supabase
    .from("knowledge_sources")
    .update({
      last_checked_at: now,
      updated_at: now,
      metadata: updatedMetadata,
    })
    .eq("id", sourceId);

  const successCount = results.filter((r) => r.success).length;

  return {
    sourceId,
    sourceName,
    sourceType,
    status: successCount > 0 ? "ok" : "error",
    updated: successCount > 0,
    newVideoCount: newVideoIds.length,
    processed: idsToProcess.length,
    succeeded: successCount,
    failed: idsToProcess.length - successCount,
    results,
  };
}

// ─── 工具函式 ─────────────────────────────────────────────────────

/**
 * 觸發 embedding 建立。
 * 使用 localhost 內部呼叫 + X-Service-Role-Key header，
 * 不依賴使用者 cookie，可在 cron 等無使用者 session 的場景使用。
 */
export function triggerEmbedding(documentId: string): Promise<Response> {
  const internalOrigin = `http://localhost:${process.env.PORT || 3000}`;
  return fetch(`${internalOrigin}/api/knowledge/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Role-Key": process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    },
    body: JSON.stringify({ documentId }),
  });
}

/**
 * 解析轉錄文字中的時間標記格式。
 * 支援 [HH:MM:SS] 和 [MM:SS] 兩種格式。
 */
export function parseTranscriptSegments(
  transcript: string,
): Array<{ text: string; offset: number; duration: number }> {
  const segments: Array<{
    text: string;
    offset: number;
    duration: number;
  }> = [];
  const lines = transcript.split("\n");

  for (const line of lines) {
    const match =
      line.match(/^\[(\d+):(\d{2}):(\d{2})\]\s*(.+)$/) ??
      line.match(/^\[(\d{2}):(\d{2})\]\s*(.+)$/);
    if (!match) continue;

    let offsetMs: number;
    let text: string;
    if (match.length === 5) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const seconds = parseInt(match[3], 10);
      offsetMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
      text = match[4];
    } else {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      offsetMs = (minutes * 60 + seconds) * 1000;
      text = match[3];
    }

    segments.push({ text, offset: offsetMs, duration: 0 });
  }

  return segments;
}
