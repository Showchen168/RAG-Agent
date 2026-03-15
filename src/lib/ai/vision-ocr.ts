import { generateText } from "ai";
import { getProvider } from "./providers";

/** 並行度限制 — 同時最多 4 個 Gemini API 呼叫 */
const OCR_CONCURRENCY = 4;

/**
 * 對圖片型 PDF 的頁面進行 Gemini Vision OCR。
 *
 * 接收 base64 PNG 圖片陣列（每頁一張），以 batch 並行方式送 Gemini Flash 提取文字，
 * 最後合併為完整的 Markdown 文本。
 *
 * @param pageImages - base64 編碼的 PNG 圖片陣列
 * @returns 合併後的 Markdown 文本
 */
export async function ocrPdfPages(pageImages: string[]): Promise<string> {
  const results: (string | null)[] = new Array(pageImages.length).fill(null);

  // 以 batch 並行處理（每批 OCR_CONCURRENCY 頁）
  for (let batchStart = 0; batchStart < pageImages.length; batchStart += OCR_CONCURRENCY) {
    const batchEnd = Math.min(batchStart + OCR_CONCURRENCY, pageImages.length);
    const batchPromises: Promise<void>[] = [];

    for (let i = batchStart; i < batchEnd; i++) {
      batchPromises.push(
        ocrSinglePage(pageImages[i], i).then((text) => {
          results[i] = text;
        }),
      );
    }

    await Promise.allSettled(batchPromises);
  }

  // 組合結果（保持頁面順序）
  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i]) {
      parts.push(`## Page ${i + 1}\n\n${results[i]}`);
    }
  }

  return parts.join("\n\n---\n\n");
}

/**
 * 單頁 OCR — 獨立函式以便並行呼叫
 */
async function ocrSinglePage(
  imageB64: string,
  pageIndex: number,
): Promise<string | null> {
  const imageBuffer = Buffer.from(imageB64, "base64");

  try {
    const { text } = await generateText({
      model: getProvider("gemini-flash"),
      experimental_telemetry: {
        isEnabled: true,
        functionId: "vision-ocr",
        metadata: { feature: "pdf-ocr", page: pageIndex + 1 },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `This is page ${pageIndex + 1} of a PDF document rendered as an image. Please extract ALL text content from this page as accurately as possible. Preserve the original structure using Markdown formatting (headings, bullet points, tables if present). Output ONLY the extracted text, no commentary or description. If the page contains charts or diagrams, describe their key data points briefly.`,
            },
            {
              type: "image",
              image: imageBuffer,
            },
          ],
        },
      ],
    });

    return text.trim() || null;
  } catch (error) {
    console.warn(`[Vision OCR] Page ${pageIndex + 1} failed:`, error);
    return null;
  }
}
