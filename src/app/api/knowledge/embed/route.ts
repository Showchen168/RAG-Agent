import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { embed, generateText } from "ai";
import {
  getEmbeddingModel,
  getProvider,
  EMBEDDING_PROVIDER_OPTIONS,
} from "@/lib/ai/providers";

// POST: 為文件生成 Embedding
// 支援兩種認證方式：
// 1. Cookie auth（一般使用者操作）
// 2. X-Service-Role-Key header（cron / 無使用者 session 場景）
export async function POST(req: Request) {
  // ─── 認證：嘗試 cookie auth，fallback 到 service_role key ───
  let supabase: Awaited<ReturnType<typeof createClient>>;
  let isServiceRole = false;
  let userId: string | null = null;

  const serviceRoleKey = req.headers.get("x-service-role-key");

  if (
    serviceRoleKey &&
    serviceRoleKey === process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    // service_role 模式：cron 等無使用者 session 場景
    supabase = createAdminClient();
    isServiceRole = true;
  } else {
    // 一般使用者模式：透過 cookie 驗證身分
    supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  const body = (await req.json()) as {
    documentId: string;
    markerChunks?: Array<{ text: string; page: number; chunk_type: string }>;
  };
  const { documentId, markerChunks } = body;

  if (!documentId) {
    return NextResponse.json(
      { error: "documentId is required" },
      { status: 400 },
    );
  }

  // 1. 取得文件內容
  // service_role 模式：admin client bypass RLS，不需要 user_id filter
  // 一般使用者模式：限制 user_id 確保資料隔離
  let query = supabase
    .from("documents")
    .select("content, title")
    .eq("id", documentId);

  if (!isServiceRole) {
    query = query.eq("user_id", userId!);
  }

  const { data: doc, error: docError } = await query.single();

  if (docError || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // 2. 分段（Chunking）—— Marker chunks 直通 or builtin chunking
  let chunks: Chunk[];
  if (markerChunks && markerChunks.length > 0) {
    // Marker 已提供結構化 chunks，直接使用
    chunks = markerChunks.map((mc) => ({ text: mc.text, page: mc.page }));
  } else {
    const isTabularContent =
      doc.content.includes("【") && doc.content.includes(",");
    chunks = isTabularContent
      ? chunkTabularText(doc.content, 3000)
      : chunkText(doc.content, 800, 80);
  }

  // 3. 刪除舊的 embeddings
  await supabase
    .from("document_embeddings")
    .delete()
    .eq("document_id", documentId);

  // 4. 生成 embeddings 並存入
  const embeddingModel = getEmbeddingModel();

  for (let i = 0; i < chunks.length; i++) {
    const { embedding } = await embed({
      model: embeddingModel,
      value: chunks[i].text,
      providerOptions: EMBEDDING_PROVIDER_OPTIONS,
    });

    const chunkMeta: Record<string, unknown> = { page: chunks[i].page };
    // 保留 Marker chunk_type 資訊
    if (markerChunks && markerChunks[i]?.chunk_type) {
      chunkMeta.chunk_type = markerChunks[i].chunk_type;
    }

    await supabase.from("document_embeddings").insert({
      document_id: documentId,
      chunk_text: chunks[i].text,
      embedding: JSON.stringify(embedding),
      chunk_index: i,
      metadata: chunkMeta,
    });
  }

  // 5. 用 AI 自動生成文件摘要（非同步，不阻擋 embedding 回應）
  generateDocSummary(supabase, documentId, doc.title, doc.content).catch(
    (err) => {
      console.error("[Embed] 摘要生成失敗:", err);
    },
  );

  // 6. 非同步觸發 AI 文件關係推導（不阻擋回應）
  // service_role 模式跳過：cron 觸發的重新 embedding 不需要重建文件關係
  // （關係已在首次上傳時建立，且此呼叫需要 cookie 轉發）
  if (!isServiceRole) {
    triggerRelationDiscovery(req, documentId).catch((err) => {
      console.error("[Embed] 關係推導失敗:", err);
    });
  }

  // 7. 非同步索引到 LightRAG（不阻擋回應）
  // service_role 模式跳過：cron 重新 embedding 不需要重新索引 LightRAG
  // （LightRAG 已在首次上傳時建立索引）
  if (!isServiceRole && userId) {
    indexToLightRAG(doc.content, documentId, userId).catch((err) => {
      console.error("[Embed] LightRAG 索引失敗:", err);
    });
  }

  return NextResponse.json({
    success: true,
    data: { chunksCount: chunks.length },
  });
}

/** 用 AI 生成文件摘要並寫回 documents 表 */
async function generateDocSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentId: string,
  title: string,
  content: string,
) {
  // 擷取前 2000 字作為摘要素材，避免超過 token 限制
  const excerpt =
    content.length > 2000 ? content.slice(0, 2000) + "..." : content;
  const model = getProvider("gemini-flash");

  const { text: summary } = await generateText({
    model,
    prompt: `你是一位專業的文件摘要專家。請用繁體中文為以下文件生成一段精簡的概括摘要（50-120字）。

要求：
- 只輸出摘要文字，不加任何標題、引號或前綴
- 精準概括文件的核心內容和主要觀點
- 語句通順、資訊密度高

文件標題：${title}

文件內容：
${excerpt}

摘要：`,
    temperature: 0.3,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "knowledge-embed-summary",
      metadata: { feature: "knowledge-embed", documentId },
    },
  });

  if (summary?.trim()) {
    await supabase
      .from("documents")
      .update({ summary: summary.trim() })
      .eq("id", documentId);
  }
}

export interface Chunk {
  text: string;
  page: number;
}

// 一般文字分段函式
export function chunkText(
  text: string,
  chunkSize: number,
  overlap: number,
): Chunk[] {
  const chunks: Chunk[] = [];
  // Split by page markers first to maintain page context
  // Regex to match [[PAGE_N]]
  const pageParts = text.split(/(\[\[PAGE_\d+\]\])/g);

  let currentPage = 1;

  // Flatten parts into a stream of { text, page }
  // Then chunk the stream
  // Simplification: Process valid text parts. If part matches marker, update page.

  let currentChunkText = "";
  let currentChunkStartPage = 1;

  for (const part of pageParts) {
    const match = part.match(/^\[\[PAGE_(\d+)\]\]$/);
    if (match) {
      currentPage = parseInt(match[1], 10);
      continue;
    }

    if (!part.trim()) continue;

    const sentences = part.split(/(?<=[。！？.!?\n])/g).filter(Boolean);

    for (const sentence of sentences) {
      if (
        (currentChunkText + sentence).length > chunkSize &&
        currentChunkText.length > 0
      ) {
        chunks.push({
          text: currentChunkText.trim(),
          page: currentChunkStartPage,
        });
        // Overlap handling
        const words = currentChunkText.split("");
        // Overlap stays on the same page context roughly, but for simplicity let's say it effectively starts a new chunk
        // The logic here for page mapping on overlap is tricky.
        // We just assume the new chunk starts at current page.
        currentChunkText = words.slice(-overlap).join("") + sentence;
        currentChunkStartPage = currentPage; // Update start page for the new chunk
      } else {
        if (currentChunkText.length === 0) {
          currentChunkStartPage = currentPage;
        }
        currentChunkText += sentence;
      }
    }
  }

  if (currentChunkText.trim()) {
    chunks.push({
      text: currentChunkText.trim(),
      page: currentChunkStartPage,
    });
  }

  return chunks.length > 0 ? chunks : [{ text, page: 1 }];
}

/**
 * 表格感知的 chunking — 專為 Excel/Google Sheet CSV 資料設計。
 *
 * 策略：
 * 1. 按 sheet 分割（以「【sheetName】」為分隔）
 * 2. 每個 sheet 內以行為單位分割
 * 3. 每個 chunk 開頭自動帶上 sheet 標題 + header row（第一行）
 * 4. 確保完整行，不在行中間截斷
 */
export function chunkTabularText(text: string, maxChunkSize: number): Chunk[] {
  const chunks: Chunk[] = [];

  // 按 sheet 分割：找到所有 【...】 標記
  const sheetPattern = /^【[^】]+】$/m;
  const sheetSections = text.split(/(^【[^】]+】$)/m).filter(Boolean);

  let currentSheetTitle = "";

  for (const section of sheetSections) {
    if (sheetPattern.test(section.trim())) {
      currentSheetTitle = section.trim();
      continue;
    }

    const lines = section.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;

    // 第一行視為 header row
    const headerRow = lines[0];
    const prefix = currentSheetTitle
      ? `${currentSheetTitle}\n${headerRow}\n`
      : `${headerRow}\n`;

    let currentChunk = prefix;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // 如果加入此行會超過限制，先存當前 chunk 再開新的
      if (
        (currentChunk + line + "\n").length > maxChunkSize &&
        currentChunk.length > prefix.length
      ) {
        chunks.push({ text: currentChunk.trim(), page: 1 }); // Tabular data currently assumes page 1
        currentChunk = prefix; // 新 chunk 帶上 header
      }
      currentChunk += line + "\n";
    }

    if (currentChunk.trim().length > prefix.trim().length) {
      chunks.push({ text: currentChunk.trim(), page: 1 });
    }
  }

  // Fallback
  if (chunks.length === 0) {
    return [{ text, page: 1 }];
  }

  return chunks;
}

/** 非同步索引文件到 LightRAG 知識圖譜 */
async function indexToLightRAG(
  content: string,
  documentId: string,
  userId: string,
) {
  const { indexDocument } = await import("@/lib/rag/lightrag-client");
  const result = await indexDocument({
    text: content,
    docId: documentId,
    userId,
  });
  if (result.success) {
    console.info("[Embed] LightRAG 索引成功:", documentId);
  } else {
    console.info("[Embed] LightRAG 索引跳過:", result.error);
  }
}

/**
 * 非同步觸發 AI 文件關係推導
 * 透過內部 fetch 呼叫 /api/knowledge/relations，攜帶原始請求的 cookie
 */
async function triggerRelationDiscovery(
  originalReq: Request,
  documentId: string,
) {
  // 用 localhost 內部呼叫，避免繞經 Cloudflare Tunnel 導致 SSL 錯誤
  const internalOrigin = `http://localhost:${process.env.PORT || 3000}`;
  const cookie = originalReq.headers.get("cookie") ?? "";

  await fetch(`${internalOrigin}/api/knowledge/relations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ documentId }),
  });
}
