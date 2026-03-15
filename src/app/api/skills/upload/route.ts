import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handleUploadSkill } from "@/lib/skills/api-handlers";

/** 技能 scripts 的本地存儲根路徑 */
const SKILLS_STORAGE_BASE =
  process.env.SKILLS_STORAGE_PATH || "/data/skills";

export async function POST(req: Request) {
  const supabase = await createClient();

  let zipBuffer: Buffer;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Use form field 'file'" },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    zipBuffer = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json(
      { error: "Failed to read uploaded file" },
      { status: 400 },
    );
  }

  const result = await handleUploadSkill(
    supabase,
    zipBuffer,
    SKILLS_STORAGE_BASE,
  );
  return NextResponse.json(result.body, { status: result.status });
}
