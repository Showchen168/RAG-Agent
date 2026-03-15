/**
 * GET /api/skills/execute/status?messageId=xxx
 * 輪詢技能執行狀態：前端超時後改用此端點確認後端是否已完成
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createRawClient } from "@supabase/supabase-js";

/** 技能執行失敗的佔位符文字（與 execute-handler.ts 保持一致） */
const FAILURE_PLACEHOLDER = "（技能執行失敗）";

export async function GET(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");
  if (!messageId) {
    return NextResponse.json(
      { error: "Missing messageId" },
      { status: 400 },
    );
  }

  // 使用 admin client 繞過 RLS
  const adminClient =
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL
      ? createRawClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
        )
      : supabase;

  // 查詢訊息
  const { data: message, error: msgError } = await adminClient
    .from("messages")
    .select("id, content, conversation_id")
    .eq("id", messageId)
    .single();

  if (msgError || !message) {
    return NextResponse.json(
      { error: "Message not found" },
      { status: 404 },
    );
  }

  // 驗證使用者擁有此對話
  const { data: conversation } = await adminClient
    .from("conversations")
    .select("user_id")
    .eq("id", message.conversation_id)
    .single();

  if (!conversation || conversation.user_id !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const content = (message.content as string) ?? "";

  // 仍在處理中（佔位符為空字串）
  if (content === "") {
    return NextResponse.json({ status: "processing" });
  }

  // 執行失敗
  if (content === FAILURE_PLACEHOLDER) {
    return NextResponse.json({
      status: "failed",
      error: "技能執行失敗",
    });
  }

  // 已完成 — 查詢附件
  const { data: attachment } = await adminClient
    .from("skill_attachments")
    .select(
      "id, file_name, file_type, mime_type, file_size, preview_content",
    )
    .eq("message_id", messageId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    status: "completed",
    message: content,
    attachment: attachment
      ? {
          id: attachment.id,
          fileName: attachment.file_name,
          fileType: attachment.file_type,
          mimeType: attachment.mime_type,
          fileSize: attachment.file_size,
          downloadUrl: `/api/skills/attachments/${attachment.id}`,
          previewContent: attachment.preview_content,
        }
      : null,
  });
}
