/**
 * GET /api/skills/attachments/[id]
 * 技能附件下載 API：查詢附件 metadata，讀取檔案回傳
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handleGetAttachment } from "@/lib/skills/attachment-handler";
import { existsSync, readFileSync } from "fs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const result = await handleGetAttachment(supabase, id);

    // 如果不是 200，直接回傳錯誤
    if (result.status !== 200) {
      return NextResponse.json(result.body, { status: result.status });
    }

    const storagePath = result.body.storagePath as string;
    const mimeType = result.body.mimeType as string;
    const fileName = result.body.fileName as string;

    // 檢查檔案是否存在
    if (!existsSync(storagePath)) {
      return NextResponse.json(
        { error: "File not found on storage" },
        { status: 404 },
      );
    }

    // 讀取檔案並回傳
    const fileBuffer = readFileSync(storagePath);

    // RFC 5987 編碼檔名（處理非 ASCII 字元）
    const encodedFileName = encodeURIComponent(fileName).replace(
      /['()]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );

    // 必須轉換為 Uint8Array — Node.js Buffer 在 Next.js standalone Response 中可能導致二進制損壞
    return new Response(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedFileName}`,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
