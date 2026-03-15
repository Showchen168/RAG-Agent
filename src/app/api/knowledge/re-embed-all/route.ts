import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { embed } from "ai";
import {
  getEmbeddingModel,
  EMBEDDING_PROVIDER_OPTIONS,
} from "@/lib/ai/providers";

/**
 * POST /api/knowledge/re-embed-all
 *
 * 用新的 embedding 模型重新產生所有文件和記憶的 embedding。
 * 僅限 service_role 呼叫（管理員操作）。
 *
 * 流程：
 * 1. 重新嵌入 document_embeddings 的所有 chunks
 * 2. 重新嵌入 user_memories 的所有記憶
 */
export async function POST(req: Request) {
  // 驗證 service_role key
  const serviceRoleKey = req.headers.get("x-service-role-key");
  if (
    !serviceRoleKey ||
    serviceRoleKey !== process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const embeddingModel = getEmbeddingModel();

  const results = {
    documents: { total: 0, success: 0, failed: 0 },
    memories: { total: 0, success: 0, failed: 0 },
  };

  // ─── 1. 重新嵌入 document_embeddings ───
  const { data: chunks, error: chunksError } = await supabase
    .from("document_embeddings")
    .select("id, chunk_text")
    .order("created_at", { ascending: true });

  if (chunksError) {
    return NextResponse.json(
      { error: "Failed to fetch document chunks", detail: chunksError.message },
      { status: 500 },
    );
  }

  results.documents.total = chunks?.length ?? 0;

  if (chunks) {
    for (const chunk of chunks) {
      try {
        const { embedding } = await embed({
          model: embeddingModel,
          value: chunk.chunk_text,
          providerOptions: EMBEDDING_PROVIDER_OPTIONS,
        });

        await supabase
          .from("document_embeddings")
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", chunk.id);

        results.documents.success++;
      } catch (err) {
        results.documents.failed++;
        console.error(
          `[Re-embed] document chunk ${chunk.id} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // ─── 2. 重新嵌入 user_memories ───
  const { data: memories, error: memoriesError } = await supabase
    .from("user_memories")
    .select("id, content")
    .order("created_at", { ascending: true });

  if (memoriesError) {
    console.error("[Re-embed] Failed to fetch memories:", memoriesError.message);
  } else if (memories) {
    results.memories.total = memories.length;

    for (const memory of memories) {
      try {
        const { embedding } = await embed({
          model: embeddingModel,
          value: memory.content,
          providerOptions: EMBEDDING_PROVIDER_OPTIONS,
        });

        await supabase
          .from("user_memories")
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", memory.id);

        results.memories.success++;
      } catch (err) {
        results.memories.failed++;
        console.error(
          `[Re-embed] memory ${memory.id} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: results,
  });
}
