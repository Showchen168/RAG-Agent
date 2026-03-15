import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchUrlContent,
  fetchRssContent,
  enrichRssItems,
} from "@/lib/knowledge/content-fetcher";

// GET: 列出使用者的監控源
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("knowledge_sources")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// POST: 新增監控源
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    source_type: "url" | "rss";
    url: string;
    name: string;
    check_interval_hours?: number;
  };

  if (!body.url?.trim() || !body.name?.trim() || !body.source_type) {
    return NextResponse.json(
      { error: "source_type, url, and name are required" },
      { status: 400 },
    );
  }

  try {
    // 首次抓取內容
    let content: string;
    let hash: string;

    if (body.source_type === "rss") {
      const result = await fetchRssContent(body.url);
      // 並行抓取每個 item 的完整頁面內容（GitHub README 等）
      const enrichedItems = await enrichRssItems(result.items);
      content = enrichedItems
        .map((item) => {
          const body = item.fullContent || item.description;
          return `## ${item.title}\n${body}\n來源: ${item.link}\n`;
        })
        .join("\n");
      hash = result.hash;
    } else {
      const result = await fetchUrlContent(body.url);
      content = result.content;
      hash = result.hash;
    }

    // 建立 document
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        title: `[監控] ${body.name}`,
        content: content.slice(0, 50000),
        tags: ["MONITOR", body.source_type.toUpperCase()],
        enabled: true,
      })
      .select()
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: `建立文件失敗: ${docError?.message}` },
        { status: 500 },
      );
    }

    // 觸發 embedding（非同步，不阻擋回應）
    // 用 localhost 內部呼叫，避免繞經 Cloudflare Tunnel 導致 SSL 錯誤
    const internalOrigin = `http://localhost:${process.env.PORT || 3000}`;
    const cookie = req.headers.get("cookie") ?? "";
    fetch(`${internalOrigin}/api/knowledge/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ documentId: doc.id }),
    }).catch(() => {
      /* 忽略 */
    });

    // 建立監控源
    const now = new Date().toISOString();
    const { data: source, error: sourceError } = await supabase
      .from("knowledge_sources")
      .insert({
        user_id: user.id,
        source_type: body.source_type,
        url: body.url.trim(),
        name: body.name.trim(),
        check_interval_hours: body.check_interval_hours ?? 24,
        last_checked_at: now,
        last_content_hash: hash,
        is_active: true,
        document_id: doc.id,
      })
      .select()
      .single();

    if (sourceError) {
      return NextResponse.json({ error: sourceError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: source });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `抓取失敗: ${message}` },
      { status: 500 },
    );
  }
}
