/**
 * RAG Diagnostics — RAG 執行失敗時的診斷報告產生器
 *
 * 所有函數皆為純函數（無副作用、無 I/O）
 */

export interface RAGDiagnosticReport {
  triggeredAt: string;
  triggerReason:
    | "zero_results"
    | "low_similarity"
    | "grading_timeout"
    | "empty_response";
  retriever: {
    matchCount: number;
    topSimilarity: number;
    avgSimilarity: number;
    queryRewriteUsed: boolean;
    searchMethod: "vector" | "bm25" | "hybrid";
    embeddingModel: string;
  };
  generator: {
    contextLength: number;
    contextTokenEstimate: number;
    budgetUsed: { maxDocs: number; maxChunksPerDoc: number };
    truncated: boolean;
  };
  suggestions: string[];
}

interface ClassifyParams {
  matchCount: number;
  topSimilarity: number;
  gradingTimedOut: boolean;
  emptyResponse: boolean;
}

const LOW_SIMILARITY_THRESHOLD = 0.6;

/**
 * 分類 RAG 失敗原因
 *
 * 前置條件：此函數只應在 RAG 確認失敗時呼叫（由 buildEmptyResult 觸發）。
 * 優先順序：zero_results > low_similarity > grading_timeout > empty_response
 * 當所有具體條件都不滿足時，歸類為 empty_response（無法判定的失敗原因）。
 */
export function classifyFailureReason(
  params: ClassifyParams,
): RAGDiagnosticReport["triggerReason"] {
  const { matchCount, topSimilarity, gradingTimedOut, emptyResponse } = params;

  if (matchCount === 0) {
    return "zero_results";
  }

  if (topSimilarity < LOW_SIMILARITY_THRESHOLD) {
    return "low_similarity";
  }

  if (gradingTimedOut) {
    return "grading_timeout";
  }

  if (emptyResponse) {
    return "empty_response";
  }

  return "empty_response";
}

/**
 * 根據診斷報告產出改善建議
 */
export function generateSuggestions(report: RAGDiagnosticReport): string[] {
  const suggestions: string[] = [];

  switch (report.triggerReason) {
    case "zero_results":
      suggestions.push("擴展知識庫：上傳更多與查詢主題相關的文件");
      suggestions.push("檢查文件是否已正確索引至知識庫");
      break;

    case "low_similarity":
      suggestions.push("優化查詢：嘗試使用更具體的關鍵字或調整問句");
      suggestions.push("調整相似度閾值以容納更多潛在相關結果");
      if (!report.retriever.queryRewriteUsed) {
        suggestions.push("啟用查詢重寫功能以改善搜尋品質");
      }
      break;

    case "grading_timeout":
      suggestions.push("評分超時：減少單次檢索的文件數量以加速評分");
      suggestions.push("考慮縮短 context 長度或減少 maxChunksPerDoc");
      break;

    case "empty_response":
      suggestions.push(
        "生成器回傳空結果：檢查 context 長度是否過長導致截斷遺失關鍵資訊",
      );
      if (report.generator.truncated) {
        suggestions.push(
          "context 已被截斷，考慮減少 maxDocs 或 maxChunksPerDoc",
        );
      }
      break;
  }

  return suggestions;
}

interface DiagnosticParams {
  matchCount: number;
  topSimilarity: number;
  avgSimilarity: number;
  queryRewriteUsed: boolean;
  searchMethod: "vector" | "bm25" | "hybrid";
  embeddingModel: string;
  contextLength: number;
  contextTokenEstimate: number;
  budgetUsed: { maxDocs: number; maxChunksPerDoc: number };
  truncated: boolean;
  gradingTimedOut: boolean;
  emptyResponse: boolean;
}

/**
 * 主函數：接收 RAG 執行結果，產出完整診斷報告
 */
export function generateDiagnosticReport(
  params: DiagnosticParams,
  triggeredAt: string = new Date().toISOString(),
): RAGDiagnosticReport {
  const triggerReason = classifyFailureReason({
    matchCount: params.matchCount,
    topSimilarity: params.topSimilarity,
    gradingTimedOut: params.gradingTimedOut,
    emptyResponse: params.emptyResponse,
  });

  const report: RAGDiagnosticReport = {
    triggeredAt,
    triggerReason,
    retriever: {
      matchCount: params.matchCount,
      topSimilarity: params.topSimilarity,
      avgSimilarity: params.avgSimilarity,
      queryRewriteUsed: params.queryRewriteUsed,
      searchMethod: params.searchMethod,
      embeddingModel: params.embeddingModel,
    },
    generator: {
      contextLength: params.contextLength,
      contextTokenEstimate: params.contextTokenEstimate,
      budgetUsed: params.budgetUsed,
      truncated: params.truncated,
    },
    suggestions: [],
  };

  return {
    ...report,
    suggestions: generateSuggestions(report),
  };
}
