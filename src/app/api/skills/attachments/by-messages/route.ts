/**
 * POST /api/skills/attachments/by-messages
 * 批量查詢技能附件（支援兩種模式）：
 * 1. messageIds — 直接透過 message IDs 查詢
 * 2. conversationId — 透過 conversation_id JOIN messages 查詢（解決 placeholder message ID 不匹配問題）
 */

import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { messageIds?: string[]; conversationId?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 模式 2: 透過 conversationId 查詢（先取 conversation 的所有 message IDs，再查 skill_attachments）
  if (payload.conversationId) {
    // Step 1: 取得該 conversation 的所有 message IDs
    const { data: msgRows, error: msgError } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", payload.conversationId);

    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    const allMsgIds = (msgRows ?? []).map(
      (r: Record<string, unknown>) => r.id as string,
    );
    if (allMsgIds.length === 0) {
      return NextResponse.json({ attachments: [] });
    }

    // Step 2: 用 adminClient 查 skill_attachments（繞過嵌套 RLS 問題 — messages 表的 RLS 導致 skill_attachments 子查詢失敗）
    // 安全性由 Step 1 保證：已透過使用者 client 驗證 conversation 歸屬
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("skill_attachments")
      .select("*")
      .in("message_id", allMsgIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const attachments = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      messageId: row.message_id as string,
      fileName: row.file_name as string,
      fileType: row.file_type as string,
      mimeType: row.mime_type as string,
      fileSize: row.file_size as number,
      downloadUrl: `/api/skills/attachments/${row.id as string}`,
      previewContent: (row.preview_content as string) ?? null,
    }));

    return NextResponse.json({ attachments });
  }

  // 模式 1: 透過 messageIds 查詢（原始行為）
  const messageIds = payload.messageIds;
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return NextResponse.json({ attachments: [] });
  }

  // 限制一次最多查詢 100 筆，防止濫用
  const ids = messageIds.slice(0, 100);

  const { data, error } = await supabase
    .from("skill_attachments")
    .select("*")
    .in("message_id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const attachments = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    messageId: row.message_id as string,
    fileName: row.file_name as string,
    fileType: row.file_type as string,
    mimeType: row.mime_type as string,
    fileSize: row.file_size as number,
    downloadUrl: `/api/skills/attachments/${row.id as string}`,
    previewContent: (row.preview_content as string) ?? null,
  }));

  return NextResponse.json({ attachments });
}
