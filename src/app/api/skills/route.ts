import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  handleGetSkills,
  handlePatchSkill,
} from "@/lib/skills/api-handlers";

export async function GET() {
  const supabase = await createClient();
  const result = await handleGetSkills(supabase);
  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();

  let payload: { id?: string; is_enabled?: boolean; display_name?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await handlePatchSkill(supabase, payload);
  return NextResponse.json(result.body, { status: result.status });
}
