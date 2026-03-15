/**
 * GET /api/skills/:id — Fetch full skill content by ID or name
 * Used by the lazy loading system to load complete skill content on demand.
 *
 * Query params:
 *   - byName=true: look up by skill name instead of UUID
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createRawClient } from "@supabase/supabase-js";

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
  const url = new URL(_req.url);
  const byName = url.searchParams.get("byName") === "true";

  try {
    const adminClient = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createRawClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
      : supabase;

    // 查詢技能（全域共享，不篩選 user_id）
    let query = adminClient
      .from("skills")
      .select(
        "id, name, display_name, description, skill_md, skill_config, is_enabled",
      );

    if (byName) {
      query = query.eq("name", id);
    } else {
      query = query.eq("id", id);
    }

    const { data: skill, error } = await query.single();

    if (error || !skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    // 檢查用戶偏好
    const { data: pref } = await adminClient
      .from("user_skill_preferences")
      .select("is_enabled")
      .eq("user_id", user.id)
      .eq("skill_id", skill.id)
      .single();

    const isEnabled = pref ? pref.is_enabled : skill.is_enabled;
    if (!isEnabled) {
      return NextResponse.json({ error: "Skill is disabled" }, { status: 404 });
    }

    return NextResponse.json({ skill: { ...skill, is_enabled: isEnabled } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
