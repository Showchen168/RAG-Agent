import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: 列出使用者的所有 Canvas 文件
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
    .from("canvas_documents")
    .select("id, title, content, updated_at, created_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// POST: 建立新 Canvas 文件
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
    title?: string;
    content?: Record<string, unknown>;
    plain_text?: string;
    source_conversation_id?: string;
    source_type?: string;
  };

  const insertData: Record<string, unknown> = {
    user_id: user.id,
    title: body.title || "未命名文件",
    content: body.content || {},
    plain_text: body.plain_text || "",
  };
  if (body.source_conversation_id) {
    insertData.source_conversation_id = body.source_conversation_id;
  }
  if (body.source_type) {
    insertData.source_type = body.source_type;
  }

  const { data, error } = await supabase
    .from("canvas_documents")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
