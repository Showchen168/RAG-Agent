import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkSource } from "@/lib/knowledge/source-checker";

export const maxDuration = 120;

// POST: 手動觸發內容檢查
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

  // 讀取監控源（限定當前使用者）
  const { data: source, error: sourceError } = await supabase
    .from("knowledge_sources")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (sourceError || !source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const result = await checkSource(supabase, source);

  // 嚴重錯誤（URL/RSS 抓取失敗等）回傳 500
  // YouTube 相關的錯誤（頻道解析失敗、部分影片處理失敗）維持 200，與原行為一致
  if (result.status === "error" && result.sourceType !== "youtube") {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: result });
}
