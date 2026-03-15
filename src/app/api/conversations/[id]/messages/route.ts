import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const INTERRUPTED_ASSISTANT_PLACEHOLDER = "（回覆中斷，內容未完整儲存）";

function normalizeAssistantContent(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // 常見的中斷殘片，避免落地後造成「有訊息但無內容」或 JSON 外露
  if (
    trimmed === "{" ||
    trimmed === '{"' ||
    trimmed === '{"response"' ||
    trimmed === '{"response":'
  ) {
    return INTERRUPTED_ASSISTANT_PLACEHOLDER;
  }
  return raw;
}

// GET: 取得對話的所有訊息
export async function GET(
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

  // 確認對話屬於該使用者
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  // 取得訊息，按時間排序
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, metadata, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// POST: 補寫 assistant 訊息（保底同步，避免前端已顯示但 DB 未落地）
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

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const content = normalizeAssistantContent(
    typeof body?.content === "string" ? body.content : "",
  );

  if (!content.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }
  // allowUpdate=true：允許更新已有完整內容的 assistant 訊息（用於 suggestions 注入後的 re-persist）
  const allowUpdate = body?.allowUpdate === true;

  // 先看最新一筆訊息，決定是補齊、插入，還是略過（避免重複）
  const { data: latestMessage, error: latestMessageError } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestMessageError) {
    return NextResponse.json(
      { error: latestMessageError.message },
      { status: 500 },
    );
  }

  if (latestMessage?.role === "assistant") {
    const latestContent = String(latestMessage.content ?? "");
    const latestTrimmed = latestContent.trim();

    // 已有完整內容，且與本次相同 -> 直接略過
    if (latestTrimmed && latestTrimmed === content.trim()) {
      return NextResponse.json({
        success: true,
        mode: "noop-already-persisted",
      });
    }

    // 已有完整內容（但不同）
    if (latestTrimmed) {
      // allowUpdate=true（如 suggestions re-persist）-> 強制 UPDATE，確保 suggestions 落地
      if (allowUpdate) {
        const { error: forceUpdateError } = await supabase
          .from("messages")
          .update({ content })
          .eq("id", latestMessage.id)
          .eq("conversation_id", id);

        if (forceUpdateError) {
          return NextResponse.json(
            { error: forceUpdateError.message },
            { status: 500 },
          );
        }
        return NextResponse.json({
          success: true,
          mode: "force-updated-assistant",
        });
      }
      // 一般保底 persist -> 不覆蓋，避免誤寫歷史
      return NextResponse.json({ success: true, mode: "noop-has-assistant" });
    }

    // 最新 assistant 是空內容 -> 先嘗試補齊（某些 RLS 配置下 update 可能 0 rows）
    const { data: updatedRows, error: updateError } = await supabase
      .from("messages")
      .update({ content })
      .eq("id", latestMessage.id)
      .eq("conversation_id", id)
      .select("id");

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (updatedRows && updatedRows.length > 0) {
      return NextResponse.json({
        success: true,
        mode: "updated-empty-assistant",
      });
    }

    // update 未生效（0 rows）時，改為插入完整 assistant，避免內容遺失
    const { error: insertFallbackError } = await supabase
      .from("messages")
      .insert({
        conversation_id: id,
        role: "assistant",
        content,
      });

    if (insertFallbackError) {
      return NextResponse.json(
        { error: insertFallbackError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      mode: "inserted-assistant-fallback",
    });
  }

  // 最新一筆為 user（或完全無訊息）-> 插入 assistant（保底）
  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: id,
    role: "assistant",
    content,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, mode: "inserted-assistant" });
}
