import { memo, useMemo, useState, useRef, useEffect } from "react";
import type { UIMessage } from "ai";
import { MarkdownRenderer as MarkDownRenderer } from "@/components/chat/markdown-renderer";
import {
  FileText,
  FileDown,
  Presentation,
  Pin,
  BookmarkPlus,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { DataTableTemplate } from "@/components/crayon/templates/data-table-template";
import { ChartTemplate } from "@/components/crayon/templates/chart-template";
import { StepsTemplate } from "@/components/crayon/templates/steps-template";
import { CompareTemplate } from "@/components/crayon/templates/compare-template";
import { TimelineTemplate } from "@/components/crayon/templates/timeline-template";
import { SuggestionButtons } from "@/components/chat/suggestion-buttons";
import { SourceCard } from "@/components/chat/source-card";
import { ChatThinkingProgress } from "@/components/chat/chat-thinking-progress";
import {
  RAGTransparencyPanel,
  type RAGMetadata,
} from "@/components/chat/rag-transparency-panel";
import {
  extractInlineCitationSources,
  stripInlineCitations,
  mergeSources,
} from "@/lib/chat/source-extraction";

/**
 * Template name → Component 映射。
 * Schema 使用 snake_case（data_table）— LLM 會回傳這些名稱。
 * 同時支援 PascalCase 作為 fallback。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = React.ComponentType<any>;

const TEMPLATE_MAP: Record<string, AnyComponent> = {
  // snake_case（schema 中定義的名稱，LLM 會使用這些）
  data_table: DataTableTemplate,
  chart: ChartTemplate,
  timeline: TimelineTemplate,
  steps: StepsTemplate,
  compare: CompareTemplate,
  // PascalCase（相容用）
  DataTableTemplate: DataTableTemplate,
  ChartTemplate: ChartTemplate,
  TimelineTemplate: TimelineTemplate,
  StepsTemplate: StepsTemplate,
  CompareTemplate: CompareTemplate,
  thinking_process: ChatThinkingProgress,
};

interface AssistantMessageRendererProps {
  message: UIMessage;
  conversationId?: string;
  isGenerating?: boolean;
  /** 由外部（如 /api/chat/suggestions）提供的 suggestions，優先於內嵌格式 */
  externalSuggestions?: string[];
}

/** 從 UIMessage.parts 中提取 text/template 結構（相容舊 Crayon 格式） */
interface LegacyMessagePart {
  type: "text" | "template";
  text?: string;
  name?: string;
  templateProps?: Record<string, unknown>;
}

interface ParsedLegacyPart {
  type: "text" | "template";
  text?: string;
  name?: string;
  templateProps?: Record<string, unknown>;
}

/** RAG 透明度面板包裝元件（內含 toggle 狀態） */
function RAGTransparencyPanelWrapper({ metadata }: { metadata: RAGMetadata }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <RAGTransparencyPanel
      metadata={metadata}
      isOpen={isOpen}
      onToggle={() => setIsOpen((prev) => !prev)}
    />
  );
}

// ... helper functions ...

function getCombinedText(
  parts: Array<{ type: string; text?: string }>,
): string {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}

function isDocumentDraftLike(
  parts: Array<{ type: string; text?: string; name?: string }>,
): boolean {
  const text = getCombinedText(parts);
  return text.trim().length > 0 || parts.length > 0;
}

/** 儲存成功 Toast 通知 */
function SavedToast({
  title,
  onClose,
  onNavigate,
}: {
  title: string;
  onClose: () => void;
  onNavigate: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 bg-white dark:bg-gray-800 border border-green-200 dark:border-green-800 rounded-xl shadow-lg shadow-green-500/10 px-4 py-3 max-w-md">
        <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            已儲存「{title}」
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            前往 知識庫 → 專業報告 查看
          </p>
        </div>
        <button
          onClick={onNavigate}
          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium whitespace-nowrap"
        >
          前往查看
        </button>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** 儲存為專業報告按鈕 */
function SaveToReportButton({
  parts,
  conversationId,
}: {
  parts: Array<{
    type: string;
    text?: string;
    name?: string;
    templateProps?: Record<string, unknown>;
  }>;
  conversationId?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<{ title: string } | null>(null);

  const handleSave = async () => {
    if (saving || saved) return;
    setSaving(true);

    try {
      // 組合所有文字與模板為 markdown
      const markdownParts: string[] = [];
      for (const part of parts) {
        if (part.type === "text" && part.text) {
          markdownParts.push(part.text);
        }
        if (
          part.type === "template" &&
          part.name &&
          part.name !== "suggestions" &&
          part.name !== "rag_transparency" &&
          part.name !== "thinking_process"
        ) {
          const md = templateToMarkdown(
            part.name,
            part.templateProps as Record<string, unknown>,
          );
          if (md) markdownParts.push(md);
        }
      }
      const markdown = markdownParts.join("\n\n");
      if (!markdown.trim()) {
        alert("此訊息沒有可儲存的內容");
        return;
      }

      // 從 markdown 第一行取標題
      const firstLine = markdown
        .split("\n")
        .find((l) => l.trim())
        ?.replace(/^#+\s*/, "")
        .trim();
      const title = firstLine?.slice(0, 60) || "未命名報告";

      const res = await fetch("/api/reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          markdown_content: markdown,
          conversation_id: conversationId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "儲存失敗");
      }

      setSaved(true);
      setToast({ title });
      // 通知知識庫頁面更新
      window.dispatchEvent(new CustomEvent("reports-updated"));
    } catch (err) {
      alert(`儲存報告失敗: ${err instanceof Error ? err.message : "未知錯誤"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={handleSave}
        disabled={saving || saved}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs cursor-pointer transition-colors ${saved
          ? "border-green-300 text-green-600 bg-green-50 dark:border-green-700 dark:text-green-400 dark:bg-green-900/20"
          : "border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30"
          } disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {saving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : saved ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <BookmarkPlus className="w-3.5 h-3.5" />
        )}
        {saving ? "儲存中..." : saved ? "已儲存到報告" : "儲存為報告"}
      </button>
      {toast && (
        <SavedToast
          title={toast.title}
          onClose={() => setToast(null)}
          onNavigate={() => {
            window.open("/knowledge?tab=reports", "_blank");
            setToast(null);
          }}
        />
      )}
    </>
  );
}

function ExportActions({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string;
}) {
  const handleDownload = async (format: string) => {
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/export?messageId=${messageId}&format=${format}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Download failed");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const contentDisposition = res.headers.get("Content-Disposition");
      let filename = `nexusmind-export.${format}`;
      if (contentDisposition) {
        const filenameStarMatch = contentDisposition.match(
          /filename\*=UTF-8''([^;]+)/,
        );
        if (filenameStarMatch && filenameStarMatch[1]) {
          filename = decodeURIComponent(filenameStarMatch[1]);
        } else {
          const filenameMatch =
            contentDisposition.match(/filename="?([^"]+)"?/);
          if (filenameMatch && filenameMatch[1]) {
            filename = decodeURIComponent(filenameMatch[1]);
          }
        }
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download error:", err);
      alert(`下載失敗: ${err instanceof Error ? err.message : "未知錯誤"}`);
    }
  };

  const btnClass =
    "inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 cursor-pointer";

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <button onClick={() => handleDownload("docx")} className={btnClass}>
        <FileText className="w-3.5 h-3.5" />
        下載 Word
      </button>
      <button onClick={() => handleDownload("pdf")} className={btnClass}>
        <FileDown className="w-3.5 h-3.5" />
        下載 PDF
      </button>
      <button onClick={() => handleDownload("pptx")} className={btnClass}>
        <Presentation className="w-3.5 h-3.5" />
        下載 PPT
      </button>
    </div>
  );
}

/** 單一模板的「插入到 Canvas」按鈕 — 附在每個視覺化模板下方 */
function TemplateInsertButton({
  templateRef,
  templateName,
  templateProps,
}: {
  templateRef: React.RefObject<HTMLDivElement | null>;
  templateName: string;
  templateProps?: Record<string, unknown>;
}) {
  const [isCapturing, setIsCapturing] = useState(false);

  const handleInsert = async () => {
    // 策略 1：截圖（視覺化模板優先）
    if (templateRef.current) {
      setIsCapturing(true);
      try {
        const { domToPng } = await import("modern-screenshot");
        const dataUrl = await domToPng(templateRef.current, {
          scale: 2,
          backgroundColor: "#ffffff",
          style: { margin: "0", borderRadius: "0" },
        });
        if (dataUrl && dataUrl.length > 500) {
          window.dispatchEvent(
            new CustomEvent("canvas-insert-content", {
              detail: { imageData: dataUrl },
            }),
          );
          setIsCapturing(false);
          return;
        }
      } catch (err) {
        console.warn("截圖失敗，降級為 Markdown:", err);
      } finally {
        setIsCapturing(false);
      }
    }

    // 策略 2：降級為 Markdown
    const markdown = templateToMarkdown(templateName, templateProps);
    if (markdown.trim()) {
      window.dispatchEvent(
        new CustomEvent("canvas-insert-content", {
          detail: { content: markdown },
        }),
      );
    }
  };

  return (
    <button
      onClick={handleInsert}
      disabled={isCapturing}
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-1"
    >
      <Pin className={`w-3 h-3 ${isCapturing ? "animate-spin" : ""}`} />
      {isCapturing ? "截圖中..." : "插入到 Canvas"}
    </button>
  );
}

/** 將單一模板轉為 Markdown（截圖失敗時的降級策略） */
function templateToMarkdown(
  name: string,
  props?: Record<string, unknown>,
): string {
  if (!props) return "";

  // 表格
  if (name === "data_table" || name === "DataTableTemplate") {
    const p = props as {
      title?: string;
      headers?: string[];
      rows?: string[][];
    };
    if (!p.headers || !p.rows) return "";
    let md = p.title ? `### ${p.title}\n\n` : "";
    md += "| " + p.headers.join(" | ") + " |\n";
    md += "| " + p.headers.map(() => "---").join(" | ") + " |\n";
    p.rows.forEach((row) => {
      md += "| " + row.join(" | ") + " |\n";
    });
    return md;
  }

  // 時間軸
  if (name === "timeline" || name === "TimelineTemplate") {
    const p = props as {
      title?: string;
      events?: Array<{
        name: string;
        start: string;
        end?: string;
        milestones?: string[];
      }>;
    };
    if (!p.events) return "";
    let md = p.title ? `### ${p.title}\n\n` : "";
    p.events.forEach((ev) => {
      const range = ev.end ? `${ev.start} ~ ${ev.end}` : ev.start;
      md += `**${ev.name}**（${range}）\n`;
      ev.milestones?.forEach((ms) => {
        md += `  - 里程碑：${ms}\n`;
      });
      md += "\n";
    });
    return md;
  }

  // 圖表（降級為描述文字）
  if (name === "chart" || name === "ChartTemplate") {
    const p = props as {
      title?: string;
      chartType?: string;
      data?: Array<{ label: string; value: number }>;
    };
    if (!p.data) return "";
    let md = p.title ? `### ${p.title}\n\n` : "";
    md += `| 項目 | 數值 |\n| --- | --- |\n`;
    p.data.forEach((d) => {
      md += `| ${d.label} | ${d.value} |\n`;
    });
    return md;
  }

  // 步驟
  if (name === "steps" || name === "StepsTemplate") {
    const p = props as {
      title?: string;
      steps?: Array<{ title: string; description?: string }>;
    };
    if (!p.steps) return "";
    let md = p.title ? `### ${p.title}\n\n` : "";
    p.steps.forEach((step, i) => {
      md += `${i + 1}. **${step.title}**\n`;
      if (step.description) md += `   ${step.description}\n`;
      md += "\n";
    });
    return md;
  }

  // Compare
  if (name === "compare" || name === "CompareTemplate") {
    const p = props as {
      title?: string;
      items?: Array<{ name: string; pros?: string[]; cons?: string[] }>;
    };
    if (!p.items) return "";
    let md = p.title ? `### ${p.title}\n\n` : "";
    p.items.forEach((item) => {
      md += `#### ${item.name}\n\n`;
      item.pros?.forEach((pro) => {
        md += `- ✅ ${pro}\n`;
      });
      item.cons?.forEach((con) => {
        md += `- ❌ ${con}\n`;
      });
      md += "\n";
    });
    return md;
  }

  return "";
}

/** 包裝視覺化模板：渲染模板 + 附帶「插入到 Canvas」按鈕 */
function TemplateWithInsertButton({
  templateName,
  templateProps,
  children,
}: {
  templateName: string;
  templateProps?: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="my-2">
      <div ref={ref} data-visual-template={templateName}>
        {children}
      </div>
      <TemplateInsertButton
        templateRef={ref}
        templateName={templateName}
        templateProps={templateProps}
      />
    </div>
  );
}

function extractSuggestions(text: string): {
  cleanText: string;
  suggestions: string[];
} {
  const regex = /:::suggestions\s*([\s\S]*?)\s*:::/;
  const match = text.match(regex);
  if (!match) return { cleanText: text, suggestions: [] };

  let cleanText = text.replace(regex, "").trim();
  cleanText = cleanText.replace(/(^|\n):::(\s*|$)/g, "$1").trim();

  const suggestionsBlock = match[1];
  const suggestions = suggestionsBlock
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-*]\s+|\d+\.\s+/, ""))
    .map((line) => {
      if (line.startsWith("[") && line.endsWith("]")) {
        return line.slice(1, -1);
      }
      return line;
    })
    .filter((line) => line.length > 0);

  return { cleanText, suggestions };
}

/**
 * Strips the "知識品質摘要" block from AI output text.
 * Matches the header line and consumes all subsequent lines that look like
 * quality metadata (bullets, pipe-delimited items, conflict signals, etc.)
 * until a blank line or unrelated content is found.
 */
function stripKnowledgeQualitySummary(text: string): string {
  const headerRegex =
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:📎\s*)?知識品質摘要\b[：:\s]*/m;
  const match = text.match(headerRegex);
  if (!match || match.index === undefined) return text;

  const startIndex = match.index;
  const headerEndIndex = startIndex + match[0].length;
  const remainder = text.slice(headerEndIndex);
  const lines = remainder.split("\n");

  // Keywords that indicate the line belongs to the quality summary block
  const qualityKeywords =
    /可信度|新鮮度|來源|引用來源|衝突訊號|疑似衝突|更新|內部|外部/;

  let consumedLines = 0;
  let foundContent = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line: if we already found content lines, this ends the block
    if (!trimmed) {
      consumedLines++;
      if (foundContent) break;
      continue;
    }

    // Check if the line looks like it belongs to the summary block:
    // - Contains quality-related keywords
    // - Starts with bullet markers (●, -, *, •, numbers)
    // - Contains pipe delimiters (｜)
    const isBullet = /^[●•\-*]\s/.test(trimmed) || /^\d+[.)]\s/.test(trimmed);
    const hasPipe = trimmed.includes("｜");
    const hasKeyword = qualityKeywords.test(trimmed);

    if (isBullet || hasPipe || hasKeyword) {
      foundContent = true;
      consumedLines++;
      continue;
    }

    // Line doesn't match — stop consuming
    break;
  }

  const consumedText = lines.slice(0, consumedLines).join("\n");
  const blockEndIndex = headerEndIndex + consumedText.length;
  return `${text.slice(0, startIndex)}${text.slice(blockEndIndex)}`.trim();
}

function extractReferenceSources(text: string): {
  cleanText: string;
  sources: Array<{ title: string; type?: string }>;
} {
  const sources: Array<{ title: string; type?: string }> = [];

  // 1. First pass: Line-based extraction for "引用來源：Title" lines causing interrupts
  const lines = text.split("\n");
  const newLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Match: "引用來源：Title (Type)" or "Reference Source: Title (Type)"
    const matchStart = trimmed.match(
      /^(?:引用來源|Reference Source|來源)[:：]\s*/,
    );
    // Match: "* 引用來源：..." (Bullet)
    const bulletMatch = trimmed.match(
      /^[-*]\s*(?:引用來源|Reference Source|來源)[:：]\s*/,
    );

    const match = matchStart || bulletMatch;
    if (match) {
      const content = trimmed.substring(match[0].length);
      const typeMatch = content.match(/[（(](.+?)[）)]$/);
      const title = typeMatch
        ? content.replace(typeMatch[0], "").trim()
        : content.trim();
      const type = typeMatch ? typeMatch[1] : undefined;

      if (title) {
        sources.push({ title, type });
        continue; // Remove this line
      }
    }
    newLines.push(line);
  }

  let cleanText = newLines.join("\n");

  // 2. Second pass: Remove "References" block at the end
  // Matches "### 參考資料", "**References**", "Sources:", etc. and everything following if it looks like a list
  const refHeaderRegex =
    /(?:^|\n)\s*(?:#{1,6}\s*)?(\*\*?)?(?:參考資料|引用來源|References|Sources?|Documentation)\1[:：]?\s*(?:\n|$)/i;
  const headerMatch = cleanText.match(refHeaderRegex);

  if (headerMatch && headerMatch.index !== undefined) {
    // Check if the remainder is mostly a list of sources
    const remainder = cleanText.slice(
      headerMatch.index + headerMatch[0].length,
    );
    // If remainder is empty or looks like a list (starts with bullets or numbers), remove it
    if (!remainder.trim() || /^\s*[-*1]\.?\s+/.test(remainder.trim())) {
      // Extract sources from the block before removing (if not already caught by line-based)
      const refLines = remainder.split("\n");
      for (const l of refLines) {
        const t = l.trim().replace(/^[-*]\s+|\d+\.\s+/, "");
        if (t && t.length > 5 && !sources.some((s) => s.title === t)) {
          // Crude extraction, might include extra text, but better than losing it?
          // Actually, if it's redundant to what's in Citation tags or already extracted, we can just drop it.
          // The user wants to hide the text, so dropping it is safer for visual cleanliness.
        }
      }
      cleanText = cleanText.slice(0, headerMatch.index).trim();
    }
  }

  return { cleanText, sources };
}

function CitationBadge({ text }: { text: string }) {
  // Parse "Title, Page: 5" or "Title, Page: 5" (case insensitive for "Page")
  const pageMatch = text.match(/, Page: (\d+)$/i);
  const title = pageMatch ? text.replace(pageMatch[0], "") : text;
  const page = pageMatch ? parseInt(pageMatch[1]) : undefined;

  const handleClick = () => {
    window.dispatchEvent(
      new CustomEvent("citation-clicked", {
        detail: { title, page },
      }),
    );
  };

  return (
    <span
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-1 rounded text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 cursor-pointer transition-colors border border-blue-100 dark:border-blue-800"
    >
      <FileText className="w-3 h-3" />
      <span className="truncate max-w-[200px]">{title}</span>
      {page && <span className="opacity-70 ml-0.5">p.{page}</span>}
    </span>
  );
}

function RichTextWithCitations({
  text,
  isStreaming = false,
}: {
  text: string;
  isStreaming?: boolean;
}) {
  // User requested to remove inline citations from the text body
  // We simply remove the citation tags from the text string BEFORE rendering markdown.
  // This prevents splitting the text into multiple parts which breaks markdown block elements
  // (e.g. causing a trailing period to be rendered as a new paragraph).
  const cleanText = text.replace(/\[\[Citation:\s*.*?\]\]/g, "");

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <MarkDownRenderer textMarkdown={cleanText} isStreaming={isStreaming} />
    </div>
  );
}

/** Memoized text part — 快取正則提取結果，避免 streaming 期間每個 token 都重新執行 */
const MemoizedTextPart = memo(function MemoizedTextPart({
  text,
  isStreaming = false,
  ragDocSourceTypes,
  skipSourceCards = false,
}: {
  text: string;
  isStreaming?: boolean;
  /** RAG 文件 sourceType mapping（title → sourceType），用於豐富引用卡片的來源類型 */
  ragDocSourceTypes?: Map<string, string>;
  /** 當 RAG 來源卡片已從 metadata 直接渲染時，跳過文字解析的重複卡片 */
  skipSourceCards?: boolean;
}) {
  const extracted = useMemo(() => {
    const { cleanText: textWithoutSuggestions } = extractSuggestions(text);
    const textWithoutQuality = stripKnowledgeQualitySummary(
      textWithoutSuggestions,
    );
    const { cleanText: finalCleanText, sources: explicitSources } =
      extractReferenceSources(textWithoutQuality);
    const citationSources = extractInlineCitationSources(finalCleanText);
    const allSources = mergeSources(explicitSources, citationSources);

    // 用 RAG 面板的 sourceType 資訊豐富引用卡片（不過濾）
    // RAG 面板顯示「檢索過程」，參考來源顯示「回答引用」，兩者用途不同，應共存
    const sources =
      ragDocSourceTypes && ragDocSourceTypes.size > 0
        ? allSources.map((s) => {
          const titleKey = s.title
            .replace(/,?\s*Page:\s*\d+$/i, "")
            .trim()
            .toLowerCase();
          const ragType = ragDocSourceTypes.get(titleKey);
          if (ragType && !s.type) {
            return { ...s, type: ragType };
          }
          return s;
        })
        : allSources;

    return { cleanText: stripInlineCitations(finalCleanText), sources };
  }, [text, ragDocSourceTypes]);

  return (
    <div>
      {/* 引用卡片已移除，改由 AI 在回覆結尾以純文字列出引用來源 */}
      <RichTextWithCitations
        text={extracted.cleanText}
        isStreaming={isStreaming}
      />
    </div>
  );
});

function findBalancedJsonEnd(input: string, jsonStartIdx: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = jsonStartIdx; i < input.length; i++) {
    const ch = input[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseLegacyTemplateText(text: string): ParsedLegacyPart[] {
  const parts: ParsedLegacyPart[] = [];
  const pattern = /(^|\n)\s*template\s+([a-zA-Z_][\w]*)\s+/g;
  let cursor = 0;

  while (true) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(text);
    if (!match) break;

    const matchStart = match.index + (match[1]?.length ?? 0);
    const name = (match[2] ?? "").trim();
    const jsonStart = pattern.lastIndex;
    if (text[jsonStart] !== "{") {
      cursor = pattern.lastIndex;
      continue;
    }

    const jsonEnd = findBalancedJsonEnd(text, jsonStart);
    if (jsonEnd < 0) {
      cursor = pattern.lastIndex;
      continue;
    }

    if (matchStart > cursor) {
      const plain = text.slice(cursor, matchStart).trim();
      if (plain) parts.push({ type: "text", text: plain });
    }

    const jsonRaw = text.slice(jsonStart, jsonEnd + 1);
    try {
      const templateProps = JSON.parse(jsonRaw) as Record<string, unknown>;
      parts.push({
        type: "template",
        name,
        templateProps,
      });
      cursor = jsonEnd + 1;
    } catch {
      const raw = text.slice(matchStart, jsonEnd + 1).trim();
      if (raw) parts.push({ type: "text", text: raw });
      cursor = jsonEnd + 1;
    }
  }

  const tail = text.slice(cursor).trim();
  if (tail) parts.push({ type: "text", text: tail });
  return parts.length > 0 ? parts : [{ type: "text", text }];
}

/** P3: 判斷 template props 是否不完整（用於 skeleton 顯示） */
function isTemplatePropsIncomplete(
  templateName: string,
  props?: Record<string, unknown>,
): boolean {
  if (!props) return true;
  switch (templateName) {
    case "data_table":
    case "DataTableTemplate": {
      const headers = props.headers as unknown[] | undefined;
      const rows = props.rows as unknown[] | undefined;
      return !headers || headers.length === 0 || !rows || rows.length === 0;
    }
    case "chart":
    case "ChartTemplate": {
      const data = props.data as unknown[] | undefined;
      return !data || data.length === 0;
    }
    case "timeline":
    case "TimelineTemplate": {
      const events = props.events as unknown[] | undefined;
      return !events || events.length === 0;
    }
    default:
      return false;
  }
}

/** P3: Template 骨架動畫元件 */
function TemplateSkeleton({ templateName }: { templateName: string }) {
  const isTable =
    templateName === "data_table" || templateName === "DataTableTemplate";
  const isChart = templateName === "chart" || templateName === "ChartTemplate";
  const isTimeline =
    templateName === "timeline" || templateName === "TimelineTemplate";

  const label = isTable
    ? "表格"
    : isChart
      ? "圖表"
      : isTimeline
        ? "時間軸"
        : "模板";

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-4 h-4 rounded bg-gray-300 dark:bg-gray-600" />
        <div className="h-4 w-24 rounded bg-gray-300 dark:bg-gray-600" />
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
          {label}生成中…
        </span>
      </div>
      {isTable && (
        <div className="space-y-2">
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-3 flex-1 rounded bg-gray-200 dark:bg-gray-700"
              />
            ))}
          </div>
          {[1, 2, 3].map((row) => (
            <div key={row} className="flex gap-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-3 flex-1 rounded bg-gray-100 dark:bg-gray-700/50"
                />
              ))}
            </div>
          ))}
        </div>
      )}
      {isChart && (
        <div className="flex items-end gap-2 h-24 px-2">
          {[40, 65, 35, 80, 55, 70].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-gray-200 dark:bg-gray-700"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      )}
      {isTimeline && (
        <div className="space-y-3 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600 -ml-[1.3rem]" />
              <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      )}
      {!isTable && !isChart && !isTimeline && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-3 rounded bg-gray-200 dark:bg-gray-700"
              style={{ width: `${70 + i * 10}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const VISUAL_TEMPLATE_NAMES = new Set([
  "data_table",
  "DataTableTemplate",
  "timeline",
  "TimelineTemplate",
  "chart",
  "ChartTemplate",
]);

const SKILL_PHASES = [
  "分析意圖與歷史對話...",
  "搜尋相關領域知識...",
  "報告結構與分析構思中...",
  "建構專屬圖表與數據模型...",
  "編譯並打包為 Word 檔案...",
  "最後調整，即將完成..."
];

function SkillProgressLoader() {
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    // 模擬 40-50 秒的生成過程
    const timings = [3000, 6000, 12000, 15000, 10000];
    let timeout: NodeJS.Timeout;

    let currentPhase = 0;
    const nextPhase = () => {
      if (currentPhase < timings.length) {
        timeout = setTimeout(() => {
          currentPhase++;
          setPhaseIndex(currentPhase);
          nextPhase();
        }, timings[currentPhase]);
      }
    };
    nextPhase();
    return () => clearTimeout(timeout);
  }, []);

  // 估算進度百分比 (平滑遞增)
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const targetProgress = Math.min(((phaseIndex + 0.5) / SKILL_PHASES.length) * 100, 95);
    const interval = setInterval(() => {
      setProgress(p => {
        if (p < targetProgress) return p + 0.5;
        return p;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [phaseIndex]);

  return (
    <div className="flex flex-col gap-4 w-full py-2">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400 font-medium text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="animate-pulse">{SKILL_PHASES[phaseIndex]}</span>
        </div>
        {/* 進度條 */}
        <div className="w-full bg-blue-100 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-blue-600 dark:bg-blue-500 h-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
          <span>進階分析通常需要 30 到 60 秒的時間</span>
          <span className="font-mono">{Math.floor(progress)}%</span>
        </div>
      </div>
      <div className="space-y-3 w-full opacity-50 mt-2 pointer-events-none">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-md w-3/4 animate-pulse"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-md w-full animate-pulse" style={{ animationDelay: "150ms" }}></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-md w-5/6 animate-pulse" style={{ animationDelay: "300ms" }}></div>
        <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-md w-full animate-pulse mt-4" style={{ animationDelay: "450ms" }}></div>
      </div>
    </div>
  );
}

export const AssistantMessageRenderer = memo(function AssistantMessageRenderer({
  message,
  conversationId,
  isGenerating = false,
  externalSuggestions,
}: AssistantMessageRendererProps) {
  // 緩存 RAG metadata — useChat 在串流結束後會重設 message.parts（移除 data-* parts），
  // 所以需要用 state 保留串流期間收到的 RAG metadata，避免面板消失
  const [cachedRagMeta, setCachedRagMeta] = useState<Record<string, unknown> | null>(null);

  // 監聽 message.parts 中的 data-rag-transparency，一旦出現就緩存
  useEffect(() => {
    for (const p of message.parts ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const part = p as any;
      if (part.type === "data-rag-transparency" && part.data) {
        setCachedRagMeta(part.data as Record<string, unknown>);
        return;
      }
    }
  }, [message.parts]);

  // 從 UIMessage.parts 提取 text + RAG metadata，再透過 parseLegacyTemplateText 解析嵌入的 template
  const parts: LegacyMessagePart[] = useMemo(() => {
    const result: LegacyMessagePart[] = [];

    // 1. RAG metadata 放在文字內容上方
    if (cachedRagMeta) {
      result.push({
        type: "template" as const,
        name: "rag_transparency",
        templateProps: cachedRagMeta,
      });
    }

    // 2. 提取文字部分
    const textParts = (message.parts ?? [])
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    if (textParts.trim()) {
      result.push({ type: "text" as const, text: textParts });
    }

    return result;
  }, [message.parts, cachedRagMeta]);

  const handleSuggestionClick = (text: string) => {
    window.dispatchEvent(
      new CustomEvent("suggestion-clicked", { detail: text }),
    );
  };

  // 統一從外部 API、text parts（舊 :::suggestions 格式）和 template parts 提取建議
  // 注意：不在 isGenerating 時提前返回 []，允許在串流期間顯示已完成的 :::suggestions::: 區塊
  // extractSuggestions 的 regex 需要完整的 closing :::，不會匹配未完成的區塊，因此安全
  const combinedSuggestions = useMemo(() => {
    // 0. 優先使用外部 suggestions（從 /api/chat/suggestions 取得）
    if (externalSuggestions && externalSuggestions.length > 0) {
      return externalSuggestions;
    }

    // 1. 從 JSON suggestions template 提取（舊 Crayon 格式，相容用）
    for (const part of parts) {
      if (part.type === "template" && part.name === "suggestions") {
        const props = part.templateProps as
          | { suggestions?: string[] }
          | undefined;
        if (Array.isArray(props?.suggestions)) {
          const valid = props.suggestions
            .filter(
              (s): s is string => typeof s === "string" && s.trim().length > 0,
            )
            .map((s) => s.trim());
          if (valid.length > 0) return valid;
        }
      }
    }

    // 2. 從 text parts 提取（舊 :::suggestions 格式，相容用）
    const combinedText = getCombinedText(parts);
    const { suggestions } = extractSuggestions(combinedText);
    return suggestions;
  }, [parts, externalSuggestions]);

  // 從 rag_transparency template 提取文件 sourceType mapping
  // 讓 SourceCard 能區分 RSS/外部 vs 內部 PDF 文件
  const ragDocSourceTypes = useMemo(() => {
    const map = new Map<string, string>();
    for (const part of parts) {
      if (part.type === "template" && part.name === "rag_transparency") {
        const meta = part.templateProps as unknown as RAGMetadata | undefined;
        if (meta?.documents) {
          for (const doc of meta.documents) {
            const st = (doc as { sourceType?: string }).sourceType;
            if (st) map.set(doc.title.toLowerCase(), st);
          }
        }
      }
    }
    return map;
  }, [parts]);

  // RAG metadata 中是否已有文件（用於跳過文字解析的重複來源卡片）
  const hasRagSourceCards = useMemo(() => {
    if (!cachedRagMeta) return false;
    const meta = cachedRagMeta as unknown as RAGMetadata | undefined;
    return (meta?.documents?.length ?? 0) > 0;
  }, [cachedRagMeta]);

  if (parts.length === 0) {
    return null;
  }

  // 若訊息狀態為 in_progress (技能執行中)，則顯示動畫骨架
  if ((message as any).status === "in_progress") {
    return <SkillProgressLoader />;
  }

  // 已移除下載報告功能（ExportActions）
  // const shouldShowExportActions = ...

  return (
    <div className="space-y-3">
      {parts.map((part, idx) => {
        if (part.type === "text") {
          const legacyParts = parseLegacyTemplateText(part.text ?? "");
          return legacyParts.map((legacyPart, legacyIdx) => {
            if (legacyPart.type === "template" && legacyPart.name) {
              const LegacyTemplateComponent = TEMPLATE_MAP[legacyPart.name];
              if (LegacyTemplateComponent) {
                const isVisual = VISUAL_TEMPLATE_NAMES.has(legacyPart.name!);
                if (isVisual) {
                  return (
                    <TemplateWithInsertButton
                      key={`legacy-template-${idx}-${legacyIdx}`}
                      templateName={legacyPart.name!}
                      templateProps={legacyPart.templateProps}
                    >
                      <LegacyTemplateComponent
                        {...(legacyPart.templateProps ?? {})}
                      />
                    </TemplateWithInsertButton>
                  );
                }
                return (
                  <div
                    key={`legacy-template-${idx}-${legacyIdx}`}
                    className="my-2"
                  >
                    <LegacyTemplateComponent
                      {...(legacyPart.templateProps ?? {})}
                    />
                  </div>
                );
              }
              return (
                <div
                  key={`legacy-unknown-${idx}-${legacyIdx}`}
                  className="my-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-x-auto"
                >
                  <p className="text-xs text-gray-500 mb-1">
                    Unknown template: {legacyPart.name}
                  </p>
                  <pre className="text-xs break-all">
                    {JSON.stringify(legacyPart.templateProps ?? {}, null, 2)}
                  </pre>
                </div>
              );
            }

            return (
              <MemoizedTextPart
                key={`text-${idx}-${legacyIdx}`}
                text={legacyPart.text ?? ""}
                isStreaming={isGenerating}
                ragDocSourceTypes={ragDocSourceTypes}
                skipSourceCards={hasRagSourceCards}
              />
            );
          });
        }

        if (part.type === "template" && part.name) {
          // suggestions template 由統一的 SuggestionButtons 渲染，不在此處顯示
          if (part.name === "suggestions") return null;

          // RAG 透明度面板 + 來源卡片（在文字生成前立即顯示）
          if (part.name === "rag_transparency") {
            const ragMeta = part.templateProps as unknown as
              | RAGMetadata
              | undefined;
            if (ragMeta) {
              return (
                <div key={`rag-${idx}`}>
                  <RAGTransparencyPanelWrapper metadata={ragMeta} />
                </div>
              );
            }
            return null;
          }

          const TemplateComponent = TEMPLATE_MAP[part.name];
          if (TemplateComponent) {
            // Special handling for thinking process to sync with generation state
            const extraProps =
              part.name === "thinking_process"
                ? { isLoading: isGenerating }
                : {};
            const isVisual = VISUAL_TEMPLATE_NAMES.has(part.name);

            // P3: 生成期間 template props 不完整時顯示 skeleton
            const isPropsIncomplete =
              isGenerating &&
              isVisual &&
              isTemplatePropsIncomplete(
                part.name,
                part.templateProps as Record<string, unknown> | undefined,
              );

            if (isPropsIncomplete) {
              return (
                <div key={`template-skeleton-${idx}`} className="my-2">
                  <TemplateSkeleton templateName={part.name} />
                </div>
              );
            }

            if (isVisual) {
              return (
                <TemplateWithInsertButton
                  key={`template-${idx}`}
                  templateName={part.name}
                  templateProps={part.templateProps as Record<string, unknown>}
                >
                  <div className="animate-in fade-in duration-300">
                    <TemplateComponent
                      {...(part.templateProps ?? {})}
                      {...extraProps}
                    />
                  </div>
                </TemplateWithInsertButton>
              );
            }
            return (
              <div
                key={`template-${idx}`}
                className="my-2 animate-in fade-in duration-200"
              >
                <TemplateComponent
                  {...(part.templateProps ?? {})}
                  {...extraProps}
                />
              </div>
            );
          }
          return (
            <div
              key={`unknown-${idx}`}
              className="my-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg"
            >
              <p className="text-xs text-gray-500 mb-1">
                Unknown template: {part.name}
              </p>
              <pre className="text-xs overflow-auto">
                {JSON.stringify(part.templateProps, null, 2)}
              </pre>
            </div>
          );
        }

        return null;
      })}
      {combinedSuggestions.length > 0 && (
        <SuggestionButtons
          suggestions={combinedSuggestions}
          onSelect={handleSuggestionClick}
        />
      )}
    </div>
  );
});
