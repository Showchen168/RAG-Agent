import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(
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

  const { data: template, error } = await supabase
    .from("prompt_templates")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // 驗證權限：公開模板 or 自己的模板
  if (!template.is_public && template.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ template });
}

export async function PUT(
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
  const body = await req.json();

  // 驗證權限：自己的角色或公開角色皆可編輯
  const { data: existing } = await supabase
    .from("prompt_templates")
    .select("user_id, is_public")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 非自己的且非公開的不能編輯
  if (existing.user_id !== user.id && !existing.is_public) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: template, error } = await supabase
    .from("prompt_templates")
    .update({
      name: body.name,
      description: body.description,
      icon: body.icon,
      category: body.category,
      system_prompt: body.system_prompt,
      is_public: body.is_public ?? existing.is_public,
      tags: body.tags,
      variables: body.variables,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // 認證檢查：確保用戶已登入
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // 用 admin client 繞過 RLS（系統模板 user_id=null 無法被 authenticated role 刪除）
  const admin = createAdminClient();

  // 確認角色存在
  const { data: existing } = await admin
    .from("prompt_templates")
    .select("id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await admin
    .from("prompt_templates")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
