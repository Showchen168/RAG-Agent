import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

/** 建議生成超時（首頁載入體感優先，3 秒內未回傳即放棄） */
const SUGGESTIONS_TIMEOUT_MS = 3000;

/**
 * GET /api/knowledge/suggestions
 *
 * 根據使用者知識庫文件，用 AI 生成 6 個自然的對話建議
 * 每次呼叫都會產生不同的建議
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 只讀取已啟用（enabled）的文件，確保建議與使用者選擇的知識庫同步
  const { data: docs, error } = await supabase
    .from("documents")
    .select("title, summary, tags")
    .eq("user_id", user.id)
    .eq("enabled", true)
    .order("updated_at", { ascending: false })
    .limit(6);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 沒有文件 → 空建議
  if (!docs || docs.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  // 組合文件資訊
  const docInfo = docs
    .map((d, i) => {
      const summary = d.summary ? `（${d.summary.slice(0, 80)}）` : "";
      const tags = d.tags?.length ? `[${d.tags.join(", ")}]` : "";
      return `${i + 1}. ${d.title} ${summary} ${tags}`;
    })
    .join("\n");

  try {
    const result = await Promise.race([
      generateText({
        model: google("gemini-3-flash-preview"),
        prompt: `你是一個智慧助手的建議系統。使用者的知識庫中有以下文件：

${docInfo}

請根據這些文件內容，生成恰好 6 個使用者可能會想問的問題。

規則：
1. 問題要自然口語化，像真人會問的（例如「車禍怎麼理賠？」「今天適合投資嗎？」「風水擺設要注意什麼？」）
2. 問題要短，最多 15 個字
3. 問題要跟知識庫文件內容相關，但不要提到文件名
4. 每個問題風格不同：有的實用、有的好奇、有的趣味
5. 直接輸出 JSON 陣列，不要其他文字

輸出格式：["問題1", "問題2", "問題3", "問題4", "問題5", "問題6"]`,
        temperature: 1.0,
      }),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), SUGGESTIONS_TIMEOUT_MS),
      ),
    ]);

    if (!result) {
      console.warn("[Suggestions] Timeout after", SUGGESTIONS_TIMEOUT_MS, "ms");
      return NextResponse.json({ success: true, data: [] });
    }

    // 解析 JSON 陣列
    const suggestions = parseSuggestions(result.text);

    return NextResponse.json({ success: true, data: suggestions });
  } catch (e) {
    // AI 生成失敗 → 回傳空陣列（不阻擋主流程）
    const detail = e instanceof Error ? e.message : "Unknown";
    console.warn("[Suggestions] AI 生成失敗:", detail);
    return NextResponse.json({ success: true, data: [] });
  }
}

/**
 * 從 AI 回傳中提取建議陣列
 */
function parseSuggestions(text: string): string[] {
  try {
    // 嘗試直接解析
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 30)
        .slice(0, 6);
    }
  } catch {
    // 可能包含 markdown code block
  }

  // Fallback: 嘗試從文本中提取 JSON 陣列
  const match = text.match(/\[[\s\S]*?\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s.length <= 30)
          .slice(0, 6);
      }
    } catch {
      // 解析失敗
    }
  }

  return [];
}
