"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Typography from "@tiptap/extension-typography";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Save,
  Download,
  FileText,
  Plus,
  Check,
  ArrowLeft,
  BookmarkPlus,
  Loader2,
} from "lucide-react";
import { useCallback, useState, useEffect, useRef } from "react";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { marked } from "marked";
import { AICompletion } from "./extensions/ai-completion";
import { TextTransformBubble } from "./extensions/text-transform-bubble";
import { useModeStore } from "@/stores/mode-store";

interface CanvasEditorProps {
  initialContent?: string;
  /** 報告正在生成中（顯示 loading 動畫） */
  isGenerating?: boolean;
  /** 從 reports API 載入指定報告 */
  reportId?: string;
  /** 從 knowledge API 載入指定文件 */
  documentId?: string;
  /** 標記來自對話頁面的報告生成（首次儲存時建立新報告） */
  fromConversation?: boolean;
  /** 關閉 Canvas 編輯器的回調 */
  onClose?: () => void;
}

interface CanvasDocument {
  id: string;
  title: string;
  content: Record<string, unknown>;
  plain_text: string;
  updated_at: string;
  created_at: string;
}

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  title: string;
  icon: React.ElementType;
}

function ToolbarButton({
  onClick,
  active,
  title,
  icon: Icon,
}: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg transition-colors ${
        active
          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

/** 使用 marked 將 Markdown 轉換為 TipTap 可用的 HTML */
function markdownToHtml(md: string): string {
  marked.setOptions({ gfm: true, breaks: true });
  return marked.parse(md) as string;
}

/** TipTap HTML → 近似 Markdown（供 AI 處理與知識庫存檔） */
function htmlToApproxMarkdown(html: string): string {
  let md = html;

  // === 1. 表格：先處理，避免被後續正則破壞 ===
  md = md.replace(
    /<table[^>]*>([\s\S]*?)<\/table>/gi,
    (_match, inner: string) => {
      const rows: string[][] = [];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch: RegExpExecArray | null;
      let isHeader = true;

      while ((rowMatch = rowRegex.exec(inner)) !== null) {
        const cells: string[] = [];
        const cellRegex = /<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
          // 清除 cell 內的 HTML 標籤但保留粗體
          const cellText = cellMatch[1]
            .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
            .replace(/<[^>]+>/g, "")
            .trim();
          cells.push(cellText);
        }
        rows.push(cells);

        // 在 header row 之後插入分隔行
        if (isHeader && cells.length > 0) {
          rows.push(cells.map(() => "---"));
          isHeader = false;
        }
      }

      if (rows.length === 0) return "";
      return (
        "\n" +
        rows.map((row) => "| " + row.join(" | ") + " |").join("\n") +
        "\n"
      );
    },
  );

  // === 2. 程式碼區塊 ===
  md = md.replace(
    /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    "\n```\n$1\n```\n",
  );
  md = md.replace(/<code>(.*?)<\/code>/gi, "`$1`");

  // === 3. 標題 ===
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n");
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n");
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n");
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n");

  // === 4. 粗體、斜體 ===
  md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");

  // === 5. 列表 ===
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  md = md.replace(/<\/?[ou]l[^>]*>/gi, "");

  // === 6. 引用 ===
  md = md.replace(
    /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_m, inner: string) => {
      const lines = inner
        .replace(/<[^>]+>/g, "")
        .trim()
        .split("\n");
      return lines.map((l) => `> ${l.trim()}`).join("\n") + "\n";
    },
  );

  // === 7. 水平線、換行、段落 ===
  md = md.replace(/<hr\s*\/?>/gi, "\n---\n");
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<\/p>/gi, "\n\n");
  md = md.replace(/<p[^>]*>/gi, "");

  // === 8. 移除剩餘 HTML 標籤 ===
  md = md.replace(/<[^>]+>/g, "");

  // === 9. 解碼 HTML 實體 ===
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&nbsp;/g, " ");

  // === 10. 清理多餘空行 ===
  md = md.replace(/\n{3,}/g, "\n\n");
  return md.trim();
}

export function CanvasEditor({
  initialContent,
  isGenerating,
  reportId,
  documentId,
  fromConversation,
  onClose,
}: CanvasEditorProps) {
  const [activeReportId, setActiveReportId] = useState<string | null>(
    reportId ?? null,
  );
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(
    documentId ?? null,
  );
  const [isLoadingCompletion, setIsLoadingCompletion] = useState(false);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("未命名文件");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [docList, setDocList] = useState<CanvasDocument[]>([]);
  const [showDocList, setShowDocList] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutoSaveRef = useRef(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [savingToReport, setSavingToReport] = useState(false);
  const [savingToKnowledge, setSavingToKnowledge] = useState(false);
  const [isExporting, setIsExporting] = useState<"pdf" | "docx" | null>(null);

  // 載入文件列表
  const loadDocList = useCallback(async () => {
    try {
      const res = await fetch("/api/canvas");
      if (res.ok) {
        const { data } = await res.json();
        setDocList(data || []);
      }
    } catch {
      // 靜默失敗
    }
  }, []);

  useEffect(() => {
    loadDocList();
  }, [loadDocList]);

  // 儲存文件
  const saveDocument = useCallback(
    async (editorInstance: ReturnType<typeof useEditor>) => {
      if (!editorInstance) return;
      setIsSaving(true);
      try {
        const content = editorInstance.getJSON();
        const plainText = editorInstance.getText();
        const htmlContent = editorInstance.getHTML();

        // 模式 1：正在編輯報告 → 直接 PUT 回報告 API
        if (activeReportId) {
          const res = await fetch(`/api/reports/${activeReportId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: docTitle,
              canvas_content: content,
              plain_text: plainText,
            }),
          });
          if (res.ok) {
            window.dispatchEvent(new CustomEvent("reports-updated"));
            setSaveToast("報告已儲存 → 知識庫 → 專業報告");
            setTimeout(() => setSaveToast(null), 4000);
          }
          setLastSaved(new Date().toLocaleTimeString());
          return;
        }

        // 模式 2：正在編輯知識庫文件 → PUT 回知識庫 API（保留 Markdown 格式）
        if (activeDocumentId) {
          const markdownContent = htmlToApproxMarkdown(htmlContent);
          const res = await fetch(`/api/knowledge/${activeDocumentId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: docTitle,
              content: markdownContent,
            }),
          });
          if (res.ok) {
            window.dispatchEvent(new CustomEvent("knowledge-updated"));
            setSaveToast("文件已儲存 → 知識庫 → 我的文件");
            setTimeout(() => setSaveToast(null), 4000);
          }
          setLastSaved(new Date().toLocaleTimeString());
          return;
        }

        // 模式 2.5：來自對話的報告生成 → 首次儲存建立新報告
        if (fromConversation && !activeReportId) {
          const markdownForReport = htmlToApproxMarkdown(htmlContent);
          const res = await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: docTitle,
              markdown_content: markdownForReport,
              canvas_content: content,
              plain_text: plainText,
            }),
          });
          if (res.ok) {
            const { data } = await res.json();
            setActiveReportId(data.id);
            window.dispatchEvent(new CustomEvent("reports-updated"));
            setSaveToast("報告已儲存 → 知識庫 → 專業報告");
            setTimeout(() => setSaveToast(null), 4000);
          }
          setLastSaved(new Date().toLocaleTimeString());
          return;
        }

        // 模式 3：一般 canvas 文件 → 存到 canvas_documents
        if (currentDocId) {
          await fetch(`/api/canvas/${currentDocId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: docTitle,
              content,
              plain_text: plainText,
            }),
          });
        } else {
          const res = await fetch("/api/canvas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: docTitle,
              content,
              plain_text: plainText,
            }),
          });
          if (res.ok) {
            const { data } = await res.json();
            setCurrentDocId(data.id);
          }
        }

        setSaveToast("已儲存 → Canvas 文件");
        setTimeout(() => setSaveToast(null), 4000);
        setLastSaved(new Date().toLocaleTimeString());
        loadDocList();
      } catch {
        // 靜默失敗
      } finally {
        setIsSaving(false);
      }
    },
    [
      currentDocId,
      docTitle,
      loadDocList,
      activeReportId,
      activeDocumentId,
      fromConversation,
    ],
  );

  // 載入文件
  const loadDocument = useCallback(
    async (docId: string, editorInstance: ReturnType<typeof useEditor>) => {
      if (!editorInstance) return;
      try {
        const res = await fetch(`/api/canvas/${docId}`);
        if (res.ok) {
          const { data } = await res.json();
          setCurrentDocId(data.id);
          setDocTitle(data.title);
          skipAutoSaveRef.current = true;
          editorInstance.commands.setContent(data.content);
          skipAutoSaveRef.current = false;
          setShowDocList(false);
        }
      } catch {
        // 靜默失敗
      }
    },
    [],
  );

  // 匯出為 Markdown
  const exportMarkdown = useCallback(
    (editorInstance: ReturnType<typeof useEditor>) => {
      if (!editorInstance) return;
      const text = htmlToApproxMarkdown(editorInstance.getHTML());
      const blob = new Blob([text], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${docTitle}.md`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
    },
    [docTitle],
  );

  // 匯出為 PDF — 使用 server-side Playwright 生成高品質 PDF
  const exportPDF = useCallback(
    async (editorInstance: ReturnType<typeof useEditor>) => {
      if (!editorInstance) return;
      setShowExportMenu(false);
      setIsExporting("pdf");
      const html = editorInstance.getHTML();
      try {
        const res = await fetch("/api/canvas/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html, title: docTitle, format: "pdf" }),
        });
        if (!res.ok) throw new Error(`Export failed: ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${docTitle}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("PDF export failed:", e);
        alert("PDF 匯出失敗，請稍後再試");
      } finally {
        setIsExporting(null);
      }
    },
    [docTitle],
  );

  // 匯出為 Word (.docx) — 將 Markdown 傳給 server-side 生成 Word
  const exportWord = useCallback(
    async (editorInstance: ReturnType<typeof useEditor>) => {
      if (!editorInstance) return;
      setShowExportMenu(false);
      setIsExporting("docx");
      const html = editorInstance.getHTML();
      const markdown = htmlToApproxMarkdown(html);
      try {
        const res = await fetch("/api/canvas/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown, title: docTitle, format: "docx" }),
        });
        if (!res.ok) throw new Error(`Export failed: ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${docTitle}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("Word export failed:", e);
        alert("Word 匯出失敗，請稍後再試");
      } finally {
        setIsExporting(null);
      }
    },
    [docTitle],
  );

  const fetchCompletion = useCallback(
    async (text: string, position: number): Promise<string> => {
      try {
        setIsLoadingCompletion(true);
        const response = await fetch("/api/copilot/completion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_text: text,
            cursor_position: position,
          }),
        });

        if (!response.ok) return "";

        const reader = response.body?.getReader();
        if (!reader) return "";

        let completion = "";
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          completion += decoder.decode(value, { stream: true });
        }

        return completion.trim();
      } catch {
        return "";
      } finally {
        setIsLoadingCompletion(false);
      }
    },
    [],
  );

  const executeTransformCommand = useCallback(
    async (command: string, selectedText: string): Promise<string> => {
      try {
        // 取得完整文件內容作為上下文，讓 AI 理解全文再針對選取部分修改
        const fullDoc = editor?.getHTML();
        const fullText = fullDoc ? htmlToApproxMarkdown(fullDoc) : "";

        const response = await fetch("/api/copilot/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command,
            text: selectedText,
            fullDocument: fullText,
          }),
        });

        if (!response.ok) return "";

        const reader = response.body?.getReader();
        if (!reader) return "";

        let result = "";
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          result += decoder.decode(value, { stream: true });
        }

        return result.trim();
      } catch {
        return "";
      }
    },
    [],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false }),
      Typography,
      Link.configure({ openOnClick: false }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: "開始寫作... (Cmd+J 觸發 AI 完成)",
      }),
      AICompletion.configure({
        onFetchCompletion: fetchCompletion,
        debounceMs: 500,
      }),
      TextTransformBubble.configure({
        onExecuteCommand: executeTransformCommand,
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[400px] px-6 py-4",
      },
    },
    content: "",
    onUpdate: () => {
      // 來自對話的 Canvas 不自動儲存 — 僅透過手動「存入專業報告」或「存入知識庫」
      if (fromConversation) return;
      // 程式設定內容（載入文件、插入 AI 回覆）時跳過自動儲存
      if (skipAutoSaveRef.current) return;
      // 自動儲存：debounce 3 秒
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        if (editor) {
          saveDocument(editor);
        }
      }, 3000);
    },
  });

  // 監聯 canvas-insert-content 事件（追加插入內容到 Canvas）
  useEffect(() => {
    const handleInsert = (
      e: CustomEvent<{ content?: string; imageData?: string }>,
    ) => {
      if (!editor) return;

      skipAutoSaveRef.current = true;

      // 優先處理圖片數據（來自 modern-screenshot 截圖）
      if (e.detail.imageData) {
        editor.commands.insertContent([
          { type: "horizontalRule" },
          { type: "image", attrs: { src: e.detail.imageData } },
          { type: "paragraph" },
        ]);
        skipAutoSaveRef.current = false;
        return;
      }

      // 降級處理：Markdown 文字插入
      const markdown = e.detail.content;
      if (!markdown?.trim()) {
        skipAutoSaveRef.current = false;
        return;
      }
      const htmlContent = markdownToHtml(markdown);
      editor.commands.insertContent("<hr/>" + htmlContent);
      skipAutoSaveRef.current = false;
    };
    window.addEventListener(
      "canvas-insert-content",
      handleInsert as EventListener,
    );
    return () =>
      window.removeEventListener(
        "canvas-insert-content",
        handleInsert as EventListener,
      );
  }, [editor]);

  // 監聽 canvas-get-content 事件（讓浮動助手即時讀取最新編輯器內容）
  useEffect(() => {
    const handleGetContent = (
      e: CustomEvent<{ callback: (text: string) => void }>,
    ) => {
      if (!editor) return;
      // 取得 HTML 並轉回近似 Markdown，保留格式給 AI 處理
      const html = editor.getHTML();
      const md = htmlToApproxMarkdown(html);
      e.detail.callback(md);
    };
    window.addEventListener(
      "canvas-get-content",
      handleGetContent as EventListener,
    );
    return () =>
      window.removeEventListener(
        "canvas-get-content",
        handleGetContent as EventListener,
      );
  }, [editor]);

  // 監聽 canvas-replace-content 事件（直接替換整篇文件內容）
  useEffect(() => {
    const handleReplace = (e: CustomEvent<{ content: string }>) => {
      if (!editor) return;
      const markdown = e.detail.content;
      if (!markdown?.trim()) return;
      skipAutoSaveRef.current = true;
      const htmlContent = markdownToHtml(markdown);
      editor.commands.setContent(htmlContent);
      skipAutoSaveRef.current = false;
    };
    window.addEventListener(
      "canvas-replace-content",
      handleReplace as EventListener,
    );
    return () =>
      window.removeEventListener(
        "canvas-replace-content",
        handleReplace as EventListener,
      );
  }, [editor]);

  // 從 reports API 載入指定報告
  useEffect(() => {
    if (!editor || !reportId) return;
    let ignore = false;
    async function loadReport() {
      try {
        const res = await fetch(`/api/reports/${reportId}`);
        if (!res.ok || ignore) return;
        const { data } = await res.json();
        if (ignore) return;
        setDocTitle(data.title || "未命名報告");
        setActiveReportId(data.id);
        skipAutoSaveRef.current = true;
        // 優先使用 canvas_content（TipTap JSON），其次 markdown_content
        if (
          data.canvas_content &&
          Object.keys(data.canvas_content).length > 0
        ) {
          editor?.commands.setContent(data.canvas_content);
        } else if (data.markdown_content) {
          const content = data.markdown_content.trim();
          const isHtml = /^<[a-z][\s\S]*>/i.test(content);
          if (isHtml) {
            // 檢查是否為「壞 HTML」— HTML 裡仍包含 Markdown 語法
            const stripped = content.replace(/<[^>]+>/g, "");
            const hasMarkdownInHtml =
              /(?:^|\n)#{1,6}\s|(?:^|\n)-\s+\[|\*\*[^*]+\*\*/.test(stripped);
            if (hasMarkdownInHtml) {
              const plainMarkdown = content
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
                .replace(/<[^>]+>/g, "")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&nbsp;/g, " ")
                .trim();
              editor?.commands.setContent(markdownToHtml(plainMarkdown));
            } else {
              editor?.commands.setContent(content);
            }
          } else {
            // 純 Markdown → 用 marked 轉 HTML
            editor?.commands.setContent(markdownToHtml(content));
          }
        }
        skipAutoSaveRef.current = false;
      } catch {
        // 靜默失敗
      }
    }
    loadReport();
    return () => {
      ignore = true;
    };
  }, [editor, reportId]);

  // 從 knowledge API 載入指定文件
  useEffect(() => {
    if (!editor || !documentId) return;
    let ignore = false;
    async function loadKnowledgeDoc() {
      try {
        const res = await fetch(`/api/knowledge/${documentId}`);
        if (!res.ok || ignore) return;
        const { data } = await res.json();
        if (ignore) return;
        setDocTitle(data.title || "未命名文件");
        setActiveDocumentId(data.id);
        // 知識庫文件內容為純文字，轉為 HTML
        if (data.content) {
          skipAutoSaveRef.current = true;
          const htmlContent = markdownToHtml(data.content);
          editor?.commands.setContent(htmlContent);
          skipAutoSaveRef.current = false;
        }
      } catch {
        // 靜默失敗
      }
    }
    loadKnowledgeDoc();
    return () => {
      ignore = true;
    };
  }, [editor, documentId]);

  // 接收對話內容自動填入 — 當 initialContent 變更時填入
  const lastAppliedContentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor || !initialContent) return;
    // 避免重複填入相同內容
    if (lastAppliedContentRef.current === initialContent) return;

    lastAppliedContentRef.current = initialContent;

    // 將 Markdown 轉為 HTML 再填入 TipTap
    skipAutoSaveRef.current = true;
    const htmlContent = markdownToHtml(initialContent);
    editor.commands.setContent(htmlContent);
    skipAutoSaveRef.current = false;
    if (!currentDocId) {
      setDocTitle("AI 生成報告");
    }
  }, [editor, initialContent, currentDocId]);

  // 存入專業報告
  const handleSaveToReport = useCallback(async () => {
    if (!editor || savingToReport) return;
    setSavingToReport(true);
    try {
      const htmlContent = editor.getHTML();
      const markdownContent = htmlToApproxMarkdown(htmlContent);
      const canvasContent = editor.getJSON();
      const plainText = editor.getText();
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: docTitle || "Canvas 報告",
          markdown_content: markdownContent,
          canvas_content: canvasContent,
          plain_text: plainText,
        }),
      });
      if (res.ok) {
        window.dispatchEvent(new CustomEvent("reports-updated"));
        setSaveToast(`已存入「專業報告」→ ${docTitle}`);
        setTimeout(() => setSaveToast(null), 5000);
      } else {
        const data = await res.json();
        setSaveToast(data.error || "儲存報告失敗");
        setTimeout(() => setSaveToast(null), 5000);
      }
    } catch {
      setSaveToast("儲存報告失敗");
      setTimeout(() => setSaveToast(null), 5000);
    } finally {
      setSavingToReport(false);
    }
  }, [editor, docTitle, savingToReport]);

  // 存入知識庫
  const handleSaveToKnowledge = useCallback(async () => {
    if (!editor || savingToKnowledge) return;
    setSavingToKnowledge(true);
    try {
      const htmlContent = editor.getHTML();
      const markdownContent = htmlToApproxMarkdown(htmlContent);
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: docTitle || "Canvas 文件",
          content: markdownContent,
        }),
      });
      if (res.ok) {
        window.dispatchEvent(new CustomEvent("knowledge-updated"));
        setSaveToast(`已存入「知識庫」→ ${docTitle}`);
        setTimeout(() => setSaveToast(null), 5000);
      } else {
        const data = await res.json();
        setSaveToast(data.error || "儲存知識庫失敗");
        setTimeout(() => setSaveToast(null), 5000);
      }
    } catch {
      setSaveToast("儲存知識庫失敗");
      setTimeout(() => setSaveToast(null), 5000);
    } finally {
      setSavingToKnowledge(false);
    }
  }, [editor, docTitle, savingToKnowledge]);

  // 新建文件
  const handleNewDocument = useCallback(() => {
    if (!editor) return;
    setCurrentDocId(null);
    setDocTitle("未命名文件");
    skipAutoSaveRef.current = true;
    editor.commands.setContent("");
    skipAutoSaveRef.current = false;
    setLastSaved(null);
    setShowDocList(false);
  }, [editor]);

  const { canvasSettings } = useModeStore();
  void canvasSettings; // 保留 store 引用，未來擴展用

  if (!editor) {
    return null;
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 relative">
      {/* 儲存提示 Toast */}
      {saveToast && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            {saveToast}
          </div>
        </div>
      )}
      {/* Header: 文件標題 + 文件操作 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-800">
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="返回"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setShowDocList(!showDocList)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 whitespace-nowrap"
          >
            <FileText className="w-4 h-4" />
            文件
          </button>
          {showDocList && (
            <div className="absolute top-8 left-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-72 max-h-80 overflow-y-auto">
              <button
                onClick={handleNewDocument}
                className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700"
              >
                <Plus className="w-4 h-4" />
                新建文件
              </button>
              {docList.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => loadDocument(doc.id, editor)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between ${
                    doc.id === currentDocId
                      ? "bg-blue-50 dark:bg-blue-900/20"
                      : ""
                  }`}
                >
                  <span className="truncate">{doc.title}</span>
                  {doc.id === currentDocId && (
                    <Check className="w-3 h-3 text-blue-500" />
                  )}
                </button>
              ))}
              {docList.length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-400 text-center">
                  尚無文件
                </div>
              )}
            </div>
          )}
        </div>

        <input
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          className="flex-1 text-sm font-medium bg-transparent border-none outline-none text-foreground"
          placeholder="文件標題..."
        />

        <div className="flex items-center gap-1">
          {!fromConversation && lastSaved && (
            <span className="text-xs text-gray-400 mr-2">
              已儲存 {lastSaved}
            </span>
          )}
          {!fromConversation && (
            <button
              onClick={() => saveDocument(editor)}
              disabled={isSaving}
              title="儲存 (自動儲存已啟用)"
              className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
            >
              <Save className={`w-4 h-4 ${isSaving ? "animate-pulse" : ""}`} />
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              title="匯出"
              className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <Download className="w-4 h-4" />
            </button>
            {showExportMenu && (
              <div className="absolute top-8 right-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-48">
                <button
                  onClick={() => exportMarkdown(editor)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  匯出 Markdown (.md)
                </button>
                <button
                  onClick={() => exportWord(editor)}
                  disabled={isExporting !== null}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  {isExporting === "docx" ? "匯出中..." : "匯出 Word (.docx)"}
                </button>
                <button
                  onClick={() => exportPDF(editor)}
                  disabled={isExporting !== null}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  {isExporting === "pdf" ? "PDF 生成中..." : "列印 / 匯出 PDF"}
                </button>
              </div>
            )}
          </div>

          {/* 知識庫 canvas 顯示「存入專業報告」；專業報告 canvas 不顯示 */}
          {!activeReportId && (
            <button
              onClick={handleSaveToReport}
              disabled={savingToReport}
              title="存入專業報告"
              className="p-1.5 rounded text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 disabled:opacity-50 transition-colors"
            >
              {savingToReport ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
            </button>
          )}
          {/* 專業報告 canvas 顯示「存入知識庫」；知識庫 canvas 不顯示 */}
          {!activeDocumentId && (
            <button
              onClick={handleSaveToKnowledge}
              disabled={savingToKnowledge}
              title="存入知識庫"
              className="p-1.5 rounded text-gray-400 hover:text-green-600 dark:hover:text-green-400 disabled:opacity-50 transition-colors"
            >
              {savingToKnowledge ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <BookmarkPlus className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <>
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-0.5">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive("bold")}
              title="粗體 (Cmd+B)"
              icon={Bold}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive("italic")}
              title="斜體 (Cmd+I)"
              icon={Italic}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              active={editor.isActive("underline")}
              title="底線 (Cmd+U)"
              icon={UnderlineIcon}
            />
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
            <ToolbarButton
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 1 }).run()
              }
              active={editor.isActive("heading", { level: 1 })}
              title="標題 1"
              icon={Heading1}
            />
            <ToolbarButton
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
              active={editor.isActive("heading", { level: 2 })}
              title="標題 2"
              icon={Heading2}
            />
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive("bulletList")}
              title="項目清單"
              icon={List}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              active={editor.isActive("orderedList")}
              title="編號清單"
              icon={ListOrdered}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              active={editor.isActive("blockquote")}
              title="引用"
              icon={Quote}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              active={editor.isActive("codeBlock")}
              title="程式碼區塊"
              icon={Code}
            />
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
            <button
              onClick={() => {
                const url = window.prompt("輸入連結網址:");
                if (url) {
                  editor.chain().focus().setLink({ href: url }).run();
                }
              }}
              title="插入連結"
              className={`p-1.5 rounded-lg transition-colors ${
                editor.isActive("link")
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <LinkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Editor */}
        <div
          className="flex-1 overflow-y-auto relative"
          onClick={() => {
            setShowDocList(false);
            setShowExportMenu(false);
          }}
        >
          {isGenerating && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
              <div className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
                <div className="flex gap-1">
                  <span
                    className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                  報告生成中...
                </span>
              </div>
            </div>
          )}
          <EditorContent editor={editor} />
        </div>
      </>
    </div>
  );
}
