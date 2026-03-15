/**
 * Context Token Optimization — 統一 Web/Telegram 的 context 截斷邏輯
 *
 * 截斷策略：
 * 1. context.length <= maxChars → 直接回傳
 * 2. 找最後一個在 maxChars 內的 </source> 位置
 * 3. 在該位置截斷 + 補 closing tags
 * 4. 附加截斷提示
 * 5. Fallback: 找不到 </source> → slice(0, maxChars)
 */

/** Web chat 最大 context 字元數（Gemini 1M context，但 ~20K 是 RAG 最佳實踐） */
export const MAX_CONTEXT_CHARS_WEB = 20000;

/** Telegram 最大 context 字元數 */
export const MAX_CONTEXT_CHARS_TELEGRAM = 10000;

const TRUNCATION_NOTICE =
  "\n\n[知識庫內容因長度限制已截斷，已保留最相關的文件段落]";

const CLOSING_TAGS = "\n  </layer>\n</context_layers>";

/**
 * 在 XML </source> 邊界智慧截斷 context
 *
 * @param context - RAG 組合的知識上下文（XML 格式）
 * @param maxChars - 最大字元數
 * @returns 截斷後的 context（保持 XML 結構完整）
 */
export function truncateContext(context: string, maxChars: number): string {
  if (context.length <= maxChars) {
    return context;
  }

  // 在 maxChars 範圍內找最後一個 </source> 標籤
  const searchRange = context.slice(0, maxChars);
  const lastSourceEnd = searchRange.lastIndexOf("</source>");

  if (lastSourceEnd === -1) {
    // Fallback: 找不到 </source> → 硬截斷
    return context.slice(0, maxChars);
  }

  // 在 </source> 結束位置截斷
  const truncated = context.slice(0, lastSourceEnd + "</source>".length);

  return truncated + CLOSING_TAGS + TRUNCATION_NOTICE;
}

/**
 * 粗略估算文字的 token 數
 *
 * 估算規則：
 * - 中文字元：~1.5 chars/token
 * - 英文/ASCII：~4 chars/token
 * - 混合文字：依中文比例加權平均
 *
 * @param text - 要估算的文字
 * @returns 估算的 token 數
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;

  // 計算中文字元數（CJK Unified Ideographs + 常用標點）
  const chineseCharCount = (
    text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []
  ).length;

  const totalChars = text.length;
  const nonChineseChars = totalChars - chineseCharCount;

  // 中文部分：~1.5 chars/token
  const chineseTokens = chineseCharCount / 1.5;
  // 非中文部分：~4 chars/token
  const nonChineseTokens = nonChineseChars / 4;

  return Math.ceil(chineseTokens + nonChineseTokens);
}
