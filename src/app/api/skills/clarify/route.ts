/**
 * POST /api/skills/clarify
 * 技能釐清 API：Gemini generateObject → 結構化問題
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handleClarifySkill } from "@/lib/skills/clarify-handler";

export async function POST(req: Request) {
  const supabase = await createClient();

  let payload: {
    skillId?: string;
    userInput?: string;
  };

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await handleClarifySkill(supabase, {
    skillId: payload.skillId ?? "",
    userInput: payload.userInput ?? "",
  });

  return NextResponse.json(result.body, { status: result.status });
}
