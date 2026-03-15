import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSkillFromHistory } from "@/lib/skills/skill-generator";
import { z } from "zod";
import crypto from "crypto";

// ─── Rate Limiting ──────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  rateLimitMap.set(userId, { ...entry, count: entry.count + 1 });
  return true;
}

// ─── Request Validation ─────────────────────────────

const GenerateRequestSchema = z.object({
  conversationHistory: z
    .array(z.string())
    .min(1, "對話歷史不能為空")
    .max(200, "對話歷史訊息數超過上限"),
});

const SaveRequestSchema = z.object({
  display_name: z.string().min(2).max(50),
  description: z.string().min(1).max(200),
  prompt_template: z.string().min(10).max(5000),
  category: z.enum(["document", "data", "creative", "utility"]),
  icon: z.string().min(1).max(50),
  input_type: z.enum(["context", "user", "both"]),
});

// ─── POST: Generate skill from history ──────────────

export async function POST(req: Request) {
  const supabase = await createClient();

  // 驗證使用者身份
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit 檢查
  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "已超過每小時生成上限（10 次），請稍後再試" },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // 判斷是「生成」還是「儲存」
  const isGenerateRequest = (body as Record<string, unknown>)
    ?.conversationHistory !== undefined;

  if (isGenerateRequest) {
    // ─── 從對話歷史生成 skill config ────────
    const parsed = GenerateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    try {
      const generatedConfig = await generateSkillFromHistory(
        parsed.data.conversationHistory,
      );
      return NextResponse.json({ config: generatedConfig }, { status: 200 });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "技能生成失敗";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ─── 儲存生成的 skill 到 DB ──────────────
  const parsed = SaveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { display_name, description, prompt_template, category, icon, input_type } =
    parsed.data;

  // 生成 skill name（從 display_name 轉換 + UUID 後綴避免碰撞）
  const nameBase = display_name
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "skill";
  const uniqueSuffix = crypto.randomUUID().slice(0, 8);
  const skillName = `${nameBase}-${uniqueSuffix}`;

  try {
    const skillData = {
      user_id: user.id,
      name: skillName,
      display_name,
      description,
      icon,
      category,
      version: "1.0.0",
      skill_md: prompt_template,
      skill_config: {
        name: skillName,
        displayName: display_name,
        description,
        icon,
        category,
        version: "1.0.0",
        input: {
          type: input_type,
          userInputLabel: "請輸入內容",
        },
        output: {
          fileType: "text",
          mimeType: "text/plain",
          previewFormat: "markdown",
        },
        runtime: {
          baseImage: "node:20-slim",
          timeout: 30,
          maxMemory: "256m",
        },
      },
      storage_path: "",
      is_system: false,
      is_enabled: true,
      updated_at: new Date().toISOString(),
    };

    const { data: skill, error } = await supabase
      .from("skills")
      .upsert(skillData, { onConflict: "user_id,name" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ skill }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "儲存技能失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
