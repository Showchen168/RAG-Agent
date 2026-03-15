/**
 * Marker 文件解析微服務 HTTP Client
 *
 * 提供與 Docker 中的 Marker 服務通訊的介面。
 * 當 Marker 不可用時，靜默返回失敗，讓呼叫端降級回 builtin 解析。
 */

const MARKER_URL = process.env.MARKER_SERVICE_URL || "";
const HEALTH_TIMEOUT_MS = 3000;
const PARSE_TIMEOUT_MS = 120000;

export interface MarkerChunk {
  text: string;
  page: number;
  chunk_type: "text" | "heading" | "table" | "list" | "code";
}

export interface MarkerParseResult {
  success: true;
  markdown: string;
  chunks: MarkerChunk[];
  page_images?: string[];
  metadata: {
    filename: string;
    page_count: number;
    parse_time_seconds: number;
    ocr_needed?: boolean;
  };
}

interface MarkerFailure {
  success: false;
  error: string;
}

type MarkerResult = MarkerParseResult | MarkerFailure;

/** 檢查 Marker 微服務是否在線。 */
export async function isMarkerAvailable(): Promise<boolean> {
  if (!MARKER_URL) return false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(`${MARKER_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 呼叫 Marker 微服務解析檔案。
 *
 * @param buffer - 檔案原始 bytes
 * @param fileName - 檔名（帶副檔名）
 * @returns MarkerResult — success=true 時包含 markdown + chunks
 */
export async function parseWithMarker(
  buffer: Buffer,
  fileName: string,
): Promise<MarkerResult> {
  if (!MARKER_URL) {
    return { success: false, error: "MARKER_SERVICE_URL not configured" };
  }

  try {
    const formData = new FormData();
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer]);
    formData.append("file", blob, fileName);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

    const res = await fetch(`${MARKER_URL}/parse`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Marker HTTP ${res.status}: ${body}` };
    }

    const data = await res.json();
    if (!data.success) {
      return { success: false, error: data.error || "Unknown marker error" };
    }

    return data as MarkerParseResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[MarkerClient] Parse failed:", msg);
    return { success: false, error: msg };
  }
}
