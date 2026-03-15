/**
 * Cron Endpoint — 定期檢查到期的知識庫監控源
 *
 * NAS Task Scheduler 每小時 curl 觸發：
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/check-sources
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkSource, type CheckResult } from "@/lib/knowledge/source-checker";

/** 5 分鐘 timeout — 多個源序列處理需要較長時間 */
export const maxDuration = 300;

export async function GET(req: Request) {
  // 1. 驗證 CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. 用 admin client 查詢到期的監控源
  const supabase = createAdminClient();

  const { data: allSources, error: queryError } = await supabase
    .from("knowledge_sources")
    .select("*")
    .eq("is_active", true);

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  // 篩選到期的源（last_checked_at IS NULL 或距上次檢查 >= 24 小時）
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  const dueSources = (allSources ?? []).filter((s) => {
    if (!s.last_checked_at) return true;
    return s.last_checked_at < twentyFourHoursAgo;
  });

  // 3. 序列處理每個到期源
  const results: Array<{
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly status: string;
    readonly error?: string;
    readonly new_videos?: number;
  }> = [];

  for (const source of dueSources) {
    try {
      const result: CheckResult = await checkSource(supabase, source);
      results.push({
        id: result.sourceId,
        name: result.sourceName,
        type: result.sourceType,
        status: result.status,
        ...(result.error ? { error: result.error } : {}),
        ...(result.newVideoCount !== undefined
          ? { new_videos: result.newVideoCount }
          : {}),
      });
    } catch (err) {
      // 單個源失敗不影響其他源
      results.push({
        id: source.id,
        name: source.name ?? "",
        type: source.source_type ?? "",
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // 4. 回傳統計
  const totalSources = (allSources ?? []).length;
  const failedCount = results.filter((r) => r.status === "error").length;

  return NextResponse.json({
    success: true,
    stats: {
      total_sources: totalSources,
      due_for_check: dueSources.length,
      checked: results.length,
      skipped: totalSources - dueSources.length,
      failed: failedCount,
    },
    results,
  });
}
