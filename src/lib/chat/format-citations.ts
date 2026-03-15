/**
 * Citation Format — 統一 Telegram/Web 引用來源格式化
 *
 * 所有函數皆為純函數（無副作用、無 I/O）
 */

const CHUNK_PREVIEW_MAX_LENGTH = 200;

/**
 * 格式化 Telegram 引用列表
 *
 * @param citationTitles - 引用文件標題陣列
 * @returns 格式化的引用文字（含分隔線、emoji header、bullet list），空陣列回傳空字串
 */
export function formatCitationsForTelegram(citationTitles: string[]): string {
  if (citationTitles.length === 0) {
    return "";
  }

  const citationList = citationTitles.map((t) => `• ${t}`).join("\n");
  return `\n\n---\n📚 **參考來源：**\n${citationList}`;
}

interface WebCitationItem {
  title: string;
  similarity: number;
  chunkPreview: string;
}

interface RAGResultForCitation {
  relevantDocIds: string[];
  docTitleMap: Map<string, string>;
  docSimilarityMap: Map<string, number>;
  chunksByDoc: Map<string, Array<{ text: string; metadata: unknown }>>;
}

/**
 * 格式化 Web 引用結構（RAGMetadata 相容格式，含 chunkPreview）
 *
 * @param ragResult - RAG 查詢結果的子集
 * @returns 引用項目陣列，可直接用於前端 RAG 透明度面板
 */
export function formatCitationsForWeb(
  ragResult: RAGResultForCitation,
): WebCitationItem[] {
  return ragResult.relevantDocIds.map((id) => {
    const title = ragResult.docTitleMap.get(id) ?? "未知文件";
    const similarity = ragResult.docSimilarityMap.get(id) ?? 0;
    const chunks = ragResult.chunksByDoc.get(id) ?? [];
    const firstChunkText = chunks[0]?.text ?? "";

    const chunkPreview =
      firstChunkText.length > CHUNK_PREVIEW_MAX_LENGTH
        ? firstChunkText.slice(0, CHUNK_PREVIEW_MAX_LENGTH) + "..."
        : firstChunkText;

    return { title, similarity, chunkPreview };
  });
}
