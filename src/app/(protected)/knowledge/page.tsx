"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Plus,
  FileText,
  Search,
  Trash2,
  Loader2,
  CheckCircle,
  X,
  Upload,
  Cloud,
  Unplug,
  ToggleLeft,
  ToggleRight,
  Folder,
  ChevronRight,
  RefreshCw,
  Globe,
  Link,
  Clock,
  FolderOpen,
  Radio,
  BookOpen,
  Youtube,
  Filter,
  MessageSquare,
} from "lucide-react";
import type { Document } from "@/types";
import { KnowledgeGraph } from "@/components/knowledge/knowledge-graph";

import { VersionHistory } from "@/components/knowledge/version-history";
import { BatchUpload } from "@/components/knowledge/batch-upload";
import { SourceManager } from "@/components/knowledge/source-manager";
import { YouTubeImport } from "@/components/knowledge/youtube-import";
import { CanvasEditor } from "@/components/canvas/canvas-editor";
import { FloatingKnowledgeChat } from "@/components/knowledge/floating-knowledge-chat";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { MobileDrawer } from "@/components/ui/mobile-drawer";

interface SearchResult {
  document_id: string;
  chunk_text: string;
  similarity: number;
}

interface GDriveFile {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size?: number;
  modifiedTime?: string;
}

interface FolderBreadcrumb {
  id: string;
  name: string;
}

const ACCEPTED_EXTENSIONS =
  ".pdf,.docx,.pptx,.xlsx,.xls,.txt,.md,.png,.jpg,.jpeg";

function toSummaryPreview(summary: string | null): string | null {
  if (!summary) return null;
  const cleaned = summary
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`_~|-]/g, " ")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;
  return cleaned;
}

export default function KnowledgePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = useMemo(() => {
    const tab = searchParams.get("tab");
    if (tab === "reports" || tab === "graph" || tab === "sources") return tab;
    return "list";
  }, [searchParams]);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"text" | "semantic">("text");
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState<
    Record<string, "pending" | "indexing" | "done">
  >({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [showGDrivePicker, setShowGDrivePicker] = useState(false);
  const [gdriveFiles, setGdriveFiles] = useState<GDriveFile[]>([]);
  const [loadingGDrive, setLoadingGDrive] = useState(false);
  const [importingFileIds, setImportingFileIds] = useState<Set<string>>(
    new Set(),
  );
  const [gdriveNextPageToken, setGdriveNextPageToken] = useState<string | null>(
    null,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [gdriveConnected, setGdriveConnected] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [folderPath, setFolderPath] = useState<FolderBreadcrumb[]>([]);
  const [gdriveSearchQuery, setGdriveSearchQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [regeneratingSummaries, setRegeneratingSummaries] = useState(false);
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [viewMode, setViewMode] = useState<
    "list" | "graph" | "sources" | "reports"
  >(initialTab);
  const [versionHistoryDocId, setVersionHistoryDocId] = useState<string | null>(
    null,
  );
  const [showBatchUpload, setShowBatchUpload] = useState(false);
  const [showYouTubeImport, setShowYouTubeImport] = useState(false);
  const [ragHighlightIds, setRagHighlightIds] = useState<string[]>([]);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [mobileDetailDoc, setMobileDetailDoc] = useState<Document | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // 切換 tab 時關閉所有匯入/建立視窗
  const switchTab = useCallback(
    (tab: "list" | "graph" | "sources" | "reports") => {
      setViewMode(tab);
      setShowCreate(false);
      setShowUrlImport(false);
      setShowBatchUpload(false);
      setShowYouTubeImport(false);
      setShowCreateReport(false);
    },
    [],
  );
  // Marker 解析預設啟用，不需要手動開關
  const useMarker = true;

  // === Canvas 編輯器 state ===
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasReportId, setCanvasReportId] = useState<string | undefined>(
    undefined,
  );
  const [canvasDocumentId, setCanvasDocumentId] = useState<string | undefined>(
    undefined,
  );

  // === 專業報告相關 state ===
  interface Report {
    id: string;
    title: string;
    summary: string | null;
    tags: string[];
    created_at: string;
    updated_at: string;
  }
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  // === 報告頁面操作 state ===
  const reportFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingReport, setIsUploadingReport] = useState(false);
  const [showCreateReport, setShowCreateReport] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [isCreatingReport, setIsCreatingReport] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  // Listen for knowledge-updated events (from version restore, batch upload, etc.)
  useEffect(() => {
    const handler = () => loadDocuments();
    window.addEventListener("knowledge-updated", handler);
    return () => window.removeEventListener("knowledge-updated", handler);
  }, []);

  // 載入報告列表
  async function loadReports() {
    setReportsLoading(true);
    try {
      const res = await fetch("/api/reports", { credentials: "include" });
      if (res.ok) {
        const { data } = await res.json();
        setReports(data ?? []);
      }
    } finally {
      setReportsLoading(false);
    }
  }

  // 切換 Tab 時自動載入對應資料，切到列表檢視時捲回最上面
  useEffect(() => {
    if (viewMode === "list" || viewMode === "graph") {
      loadDocuments();
    } else if (viewMode === "reports") {
      loadReports();
    }
    if (viewMode === "list") {
      listContainerRef.current?.scrollTo({ top: 0 });
    }
  }, [viewMode]);

  // 監聽報告更新事件
  useEffect(() => {
    const handler = () => {
      if (viewMode === "reports") loadReports();
    };
    window.addEventListener("reports-updated", handler);
    return () => window.removeEventListener("reports-updated", handler);
  }, [viewMode]);

  // Google Drive OAuth 授權完成後自動開啟檔案選擇器
  useEffect(() => {
    if (searchParams.get("gdrive_connected") === "true") {
      // 清除 URL 參數，避免重複觸發
      router.replace("/knowledge", { scroll: false });
      // 延遲一小段時間讓頁面穩定後再開啟
      setTimeout(() => {
        openGDrivePicker();
      }, 500);
    }
  }, [searchParams]);

  async function deleteReport(reportId: string) {
    if (!confirm("確定要刪除此報告嗎？")) return;
    setDeletingReportId(reportId);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== reportId));
      }
    } finally {
      setDeletingReportId(null);
    }
  }

  // 報告頁面 — 上傳檔案
  async function handleReportFileUpload(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingReport(true);
    setUploadMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    if (useMarker) formData.append("useMarker", "true");

    try {
      const res = await fetch("/api/reports/upload", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        setUploadMessage(`上傳失敗：${result.error}`);
      } else {
        setUploadMessage(
          `「${result.data.title}」已存入專業報告（${result.meta.fileType.toUpperCase()}，${result.meta.textLength} 字）`,
        );
        loadReports();
      }
    } catch {
      setUploadMessage("上傳失敗：網路錯誤");
    } finally {
      setIsUploadingReport(false);
      if (reportFileInputRef.current) reportFileInputRef.current.value = "";
    }
  }

  // 報告頁面 — 新增文字報告
  async function createReport(e: React.FormEvent) {
    e.preventDefault();
    if (!reportTitle.trim() || !reportContent.trim() || isCreatingReport)
      return;

    setIsCreatingReport(true);

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: reportTitle,
          markdown_content: reportContent,
          tags: ["MANUAL"],
        }),
      });

      if (res.ok) {
        setReportTitle("");
        setReportContent("");
        setShowCreateReport(false);
        loadReports();
      } else {
        const data = await res.json();
        setUploadMessage(`建立報告失敗：${data.error}`);
      }
    } catch {
      setUploadMessage("建立報告失敗：網路錯誤");
    } finally {
      setIsCreatingReport(false);
    }
  }

  async function loadDocuments() {
    const res = await fetch("/api/knowledge");
    if (res.ok) {
      const { data } = await res.json();
      setDocuments(data ?? []);
    }
    setLoading(false);
  }

  async function createDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim() || isCreating) return;

    setIsCreating(true);

    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });

    if (res.ok) {
      const { data } = await res.json();
      const docId = data.id as string;

      setDocuments((prev) => [data, ...prev]);
      setTitle("");
      setContent("");
      setShowCreate(false);

      // 非同步建立 embedding
      triggerEmbedding(docId);
    }

    setIsCreating(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    if (useMarker) formData.append("useMarker", "true");

    try {
      const res = await fetch("/api/knowledge/upload", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        setUploadMessage(`上傳失敗：${result.error}`);
      } else {
        const docId = result.data.id as string;
        setDocuments((prev) => [result.data, ...prev]);
        const parsedByLabel =
          result.meta?.parsedBy === "marker" ? "，Marker 解析" : "";
        setUploadMessage(
          `「${result.data.title}」上傳成功（${result.meta.fileType.toUpperCase()}，${result.meta.textLength} 字${parsedByLabel}）`,
        );

        // 自動建立 embedding（含 Marker chunks 直通）
        triggerEmbedding(docId, result.meta?.markerChunks);
      }
    } catch {
      setUploadMessage("上傳失敗：網路錯誤");
    } finally {
      setIsUploading(false);
      // 清空 input 讓同檔案可再次上傳
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function triggerEmbedding(
    docId: string,
    markerChunksJson?: string | null,
  ) {
    setEmbeddingStatus((prev) => ({ ...prev, [docId]: "indexing" }));

    try {
      const embedBody: Record<string, unknown> = { documentId: docId };
      if (markerChunksJson) {
        embedBody.markerChunks = JSON.parse(markerChunksJson);
      }
      await fetch("/api/knowledge/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(embedBody),
      });
      setEmbeddingStatus((prev) => ({ ...prev, [docId]: "done" }));
    } catch {
      setEmbeddingStatus((prev) => ({ ...prev, [docId]: "pending" }));
    }
  }

  async function loadGDriveFolder(folderId?: string) {
    setLoadingGDrive(true);
    setGdriveFiles([]);
    setGdriveNextPageToken(null);

    try {
      const params = new URLSearchParams();
      if (folderId) params.set("folderId", folderId);
      if (gdriveSearchQuery) params.set("query", gdriveSearchQuery);

      const listRes = await fetch(`/api/gdrive/list?${params.toString()}`);
      if (listRes.ok) {
        const { data } = await listRes.json();
        setGdriveFiles(data?.files ?? []);
        setGdriveNextPageToken(data?.nextPageToken ?? null);
      } else if (listRes.status === 403) {
        setUploadMessage("Google Drive 權限不足，正在重新授權...");
        setShowGDrivePicker(false);
        setGdriveConnected(false);
        const disconnRes = await fetch("/api/gdrive/connect", {
          method: "DELETE",
        });
        if (disconnRes.ok) {
          const { data: disconnData } = await disconnRes.json();
          if (disconnData?.authUrl) {
            redirectToGoogleAuth(disconnData.authUrl);
          }
        }
      } else {
        const listData = await listRes.json();
        setUploadMessage(`無法載入 Google Drive 檔案：${listData.error}`);
      }
    } catch {
      setUploadMessage("載入 Google Drive 檔案失敗");
    } finally {
      setLoadingGDrive(false);
    }
  }

  function redirectToGoogleAuth(authUrl: string) {
    window.location.href = authUrl;
  }

  async function openGDrivePicker() {
    setShowGDrivePicker(true);
    setLoadingGDrive(true);
    setUploadMessage(null);
    setFolderPath([]);
    setGdriveSearchQuery("");

    try {
      // Step 1: 先檢查 Google Drive 連接狀態
      const connectRes = await fetch("/api/gdrive/connect");
      const connectData = await connectRes.json();

      if (!connectRes.ok) {
        setUploadMessage(`Google Drive 連接檢查失敗：${connectData.error}`);
        setShowGDrivePicker(false);
        return;
      }

      if (!connectData.data.connected) {
        const authUrl = connectData.data.authUrl as string | null;
        if (authUrl) {
          setUploadMessage("正在跳轉到 Google Drive 授權頁面...");
          redirectToGoogleAuth(authUrl);
        } else {
          setUploadMessage(
            "Google Drive 未連接，無法取得認證連結。請確認 Google Drive 整合已正確配置",
          );
        }
        setShowGDrivePicker(false);
        return;
      }

      // Step 2: 已連接，載入根目錄
      setGdriveConnected(true);
      await loadGDriveFolder();
    } catch {
      setUploadMessage("Google Drive 連接失敗：請確認已正確配置");
      setShowGDrivePicker(false);
    } finally {
      setLoadingGDrive(false);
    }
  }

  function navigateToFolder(folder: GDriveFile) {
    setFolderPath((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setGdriveSearchQuery("");
    loadGDriveFolder(folder.id);
  }

  function navigateToBreadcrumb(index: number) {
    if (index === -1) {
      // 回到根目錄
      setFolderPath([]);
      setGdriveSearchQuery("");
      loadGDriveFolder();
    } else {
      const newPath = folderPath.slice(0, index + 1);
      setFolderPath(newPath);
      setGdriveSearchQuery("");
      loadGDriveFolder(newPath[newPath.length - 1].id);
    }
  }

  async function importFromGDrive(file: GDriveFile) {
    if (importingFileIds.has(file.id)) return;
    setImportingFileIds((prev) => {
      const next = new Set(prev);
      next.add(file.id);
      return next;
    });
    setUploadMessage(null);

    // 根據當前 viewMode 決定匯入目標
    const isReportMode = viewMode === "reports";
    const apiUrl = isReportMode
      ? "/api/reports/gdrive-import"
      : "/api/gdrive/import";

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setUploadMessage(`匯入失敗：${result.error}`);
      } else if (isReportMode) {
        setUploadMessage(
          `「${result.data.title}」已存入專業報告（${result.meta.fileType}，${result.meta.textLength} 字，來自 Google Drive）`,
        );
        loadReports();
      } else {
        const docId = result.data.id as string;
        setDocuments((prev) => [result.data, ...prev]);
        setUploadMessage(
          `「${result.data.title}」匯入成功（${result.meta.fileType.toUpperCase()}，${result.meta.textLength} 字，來自 Google Drive）`,
        );
        triggerEmbedding(docId);
      }
    } catch {
      setUploadMessage("匯入失敗：網路錯誤");
    } finally {
      setImportingFileIds((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
    }
  }

  async function loadMoreGDriveFiles() {
    if (!gdriveNextPageToken || loadingMore) return;
    setLoadingMore(true);

    try {
      const params = new URLSearchParams({ pageToken: gdriveNextPageToken });
      const currentFolderId =
        folderPath.length > 0 ? folderPath[folderPath.length - 1].id : "";
      if (currentFolderId) params.set("folderId", currentFolderId);
      if (gdriveSearchQuery) params.set("query", gdriveSearchQuery);

      const listRes = await fetch(`/api/gdrive/list?${params.toString()}`);
      if (listRes.ok) {
        const { data } = await listRes.json();
        setGdriveFiles((prev) => [...prev, ...(data?.files ?? [])]);
        setGdriveNextPageToken(data?.nextPageToken ?? null);
      }
    } catch {
      // 載入更多失敗不阻擋
    } finally {
      setLoadingMore(false);
    }
  }

  async function disconnectGDrive() {
    if (disconnecting) return;
    setDisconnecting(true);
    setUploadMessage(null);

    try {
      const res = await fetch("/api/gdrive/connect", { method: "DELETE" });
      const result = await res.json();

      if (res.ok) {
        setGdriveConnected(false);
        setGdriveFiles([]);
        setShowGDrivePicker(false);

        // reinitiate_all 會產生新 OAuth URL，直接跳轉讓用戶切換帳號
        const authUrl = result.data?.authUrl as string | null;
        if (authUrl) {
          setUploadMessage("正在跳轉到 Google Drive 重新授權...");
          redirectToGoogleAuth(authUrl);
        } else {
          setUploadMessage(
            "Google Drive 已斷開連接，請重新點擊「Google Drive」按鈕連接",
          );
        }
      } else {
        setUploadMessage(`斷開連接失敗：${result.error}`);
      }
    } catch {
      setUploadMessage("斷開連接失敗：網路錯誤");
    } finally {
      setDisconnecting(false);
    }
  }

  async function deleteDocument(docId: string) {
    if (deletingId) return;
    setDeletingId(docId);

    const res = await fetch(`/api/knowledge/${docId}`, { method: "DELETE" });
    if (res.ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setEmbeddingStatus((prev) => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });
    }

    setDeletingId(null);
  }

  async function toggleDocEnabled(docId: string, currentEnabled: boolean) {
    // 樂觀更新 UI
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId ? { ...d, enabled: !currentEnabled } : d,
      ),
    );

    try {
      const res = await fetch(`/api/knowledge/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });

      if (!res.ok) {
        // 回滾
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId ? { ...d, enabled: currentEnabled } : d,
          ),
        );
      }
    } catch {
      // 回滾
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === docId ? { ...d, enabled: currentEnabled } : d,
        ),
      );
    }
  }

  const doSemanticSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSemanticResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, matchCount: 10, threshold: 0.3 }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setSemanticResults(data ?? []);
      }
    } catch {
      setSemanticResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  function handleSearchInput(value: string) {
    setSearchQuery(value);

    if (searchMode === "semantic") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSemanticSearch(value), 500);
    }
  }

  // 從每個文件的第一個標籤（來源類型，如 DOCX、YouTube）提取篩選選項
  const allTags = useMemo(() => {
    const tagCount = new Map<string, number>();
    for (const doc of documents) {
      const firstTag = doc.tags?.[0];
      if (firstTag) {
        tagCount.set(firstTag, (tagCount.get(firstTag) ?? 0) + 1);
      }
    }
    return [...tagCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [documents]);

  // 文字搜尋 + 標籤篩選 filter
  const filteredDocuments = useMemo(() => {
    let result = documents;
    if (searchMode === "text" && searchQuery) {
      result = result.filter((doc) =>
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    if (filterTag) {
      result = result.filter((doc) => doc.tags?.[0] === filterTag);
    }
    return result;
  }, [documents, searchMode, searchQuery, filterTag]);

  // 語意搜尋時，標記命中的 document_id
  const semanticDocIds = new Set(semanticResults.map((r) => r.document_id));

  function formatMimeType(mime: string): string {
    const map: Record<string, string> = {
      "application/pdf": "PDF",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "Word",
      "application/msword": "Word",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        "PowerPoint",
      "application/vnd.ms-powerpoint": "PowerPoint",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        "Excel",
      "application/vnd.ms-excel": "Excel",
      "application/vnd.google-apps.document": "Google Docs",
      "application/vnd.google-apps.spreadsheet": "Google Sheets",
      "application/vnd.google-apps.presentation": "Google Slides",
      "text/plain": "TXT",
      "text/markdown": "Markdown",
      "text/csv": "CSV",
      "text/x-python": "Python",
    };
    return map[mime] ?? mime;
  }

  function renderEmbeddingBadge(docId: string) {
    const status = embeddingStatus[docId];
    if (status === "indexing") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full">
          <Loader2 className="w-3 h-3 animate-spin" />
          索引中
        </span>
      );
    }
    if (status === "done") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
          <CheckCircle className="w-3 h-3" />
          已索引
        </span>
      );
    }
    return null;
  }

  /** 為所有缺少 summary 的文件批量補生成摘要 */
  async function regenerateAllSummaries() {
    if (regeneratingSummaries) return;
    setRegeneratingSummaries(true);

    const docsWithoutSummary = documents.filter((d) => !d.summary);
    for (const doc of docsWithoutSummary) {
      try {
        await fetch("/api/knowledge/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: doc.id }),
        });
      } catch {
        // 單個文件失敗不阻擋其他
      }
    }

    // 重新載入文件列表以取得最新 summary
    await loadDocuments();
    setRegeneratingSummaries(false);
  }

  /** 從網址匯入知識庫文件 */
  async function importFromUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!urlInput.trim() || isImportingUrl) return;

    setIsImportingUrl(true);
    setUploadMessage(null);

    try {
      const res = await fetch("/api/knowledge/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });

      const result = await res.json();

      if (!res.ok) {
        setUploadMessage(`網址匯入失敗：${result.error}`);
      } else {
        const docId = result.data.id as string;
        setDocuments((prev) => [result.data, ...prev]);
        setUploadMessage(
          `「${result.data.title}」匯入成功（來源：${result.meta.sourceUrl}，${result.meta.processedLength} 字）`,
        );
        setUrlInput("");
        setShowUrlImport(false);

        // 自動建立 embedding
        triggerEmbedding(docId);
      }
    } catch {
      setUploadMessage("網址匯入失敗：網路錯誤");
    } finally {
      setIsImportingUrl(false);
    }
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-6">
      {/* 標題列 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
          <h2 className="text-xl md:text-2xl font-bold text-foreground whitespace-nowrap">
            知識庫
          </h2>
          <div className="flex overflow-x-auto bg-gray-100 dark:bg-gray-800 rounded-lg p-1 text-sm">
            <button
              onClick={() => switchTab("list")}
              className={`whitespace-nowrap flex-shrink-0 px-3 py-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-white dark:bg-gray-700 shadow text-foreground" : "text-gray-500 hover:text-foreground"}`}
            >
              列表檢視
            </button>
            <button
              onClick={() => switchTab("graph")}
              className={`whitespace-nowrap flex-shrink-0 px-3 py-1.5 rounded-md transition-all ${viewMode === "graph" ? "bg-white dark:bg-gray-700 shadow text-foreground" : "text-gray-500 hover:text-foreground"}`}
            >
              知識圖譜
            </button>
            <button
              onClick={() => switchTab("sources")}
              className={`whitespace-nowrap flex-shrink-0 px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${viewMode === "sources" ? "bg-teal-500 text-white shadow" : "text-gray-500 hover:text-foreground"}`}
            >
              <Radio className="w-3.5 h-3.5" />
              監控源
            </button>
            <button
              onClick={() => switchTab("reports")}
              className={`whitespace-nowrap flex-shrink-0 px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${viewMode === "reports" ? "bg-blue-500 text-white shadow" : "text-gray-500 hover:text-foreground"}`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              專業報告
            </button>
          </div>
        </div>
        {viewMode === "list" && (
          <div
            className={`flex flex-wrap items-center gap-2 ${isMobile ? "w-full" : ""}`}
          >
            {/* 上傳檔案按鈕 — 用 label 包裹 input，原生觸發檔案選擇器 */}
            <label
              className={`flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-sm text-foreground cursor-pointer ${isUploading ? "opacity-50 pointer-events-none" : ""} ${isMobile ? "w-full justify-center" : ""}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileUpload}
                className="hidden"
              />
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              上傳檔案
            </label>
            {/* Marker 高品質解析已預設啟用 */}
            {/* 批次匯入按鈕 */}
            <button
              onClick={() => setShowBatchUpload(!showBatchUpload)}
              className="flex items-center gap-2 px-4 py-2 border border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors text-sm"
            >
              <FolderOpen className="w-4 h-4" />
              批次匯入
            </button>
            {/* 網址匯入按鈕 */}
            <button
              onClick={() => setShowUrlImport(!showUrlImport)}
              className="flex items-center gap-2 px-4 py-2 border border-purple-500 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors text-sm"
            >
              <Globe className="w-4 h-4" />
              網址匯入
            </button>
            {/* YouTube 匯入按鈕 */}
            <button
              onClick={() => setShowYouTubeImport(!showYouTubeImport)}
              className="flex items-center gap-2 px-4 py-2 border border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-sm"
            >
              <Youtube className="w-4 h-4" />
              YouTube
            </button>
            {/* Google Drive 匯入按鈕 */}
            <div className="flex items-center gap-1">
              <button
                onClick={openGDrivePicker}
                className="flex items-center gap-2 px-4 py-2 border border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors text-sm"
              >
                <Cloud className="w-4 h-4" />
                Google Drive
              </button>
              {gdriveConnected && (
                <button
                  onClick={disconnectGDrive}
                  disabled={disconnecting}
                  className="flex items-center gap-1 px-2 py-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-xs disabled:opacity-50"
                  title="斷開 Google Drive 連接"
                >
                  {disconnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unplug className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
            {/* 新增文字文件按鈕 */}
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              新增文件
            </button>
          </div>
        )}
        {viewMode === "reports" && (
          <div className="flex flex-wrap items-center gap-2">
            {/* 報告：上傳檔案按鈕 — 用 label 包裹 input */}
            <label
              className={`flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-sm text-foreground cursor-pointer ${isUploadingReport ? "opacity-50 pointer-events-none" : ""}`}
            >
              <input
                ref={reportFileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleReportFileUpload}
                className="hidden"
              />
              {isUploadingReport ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              上傳檔案
            </label>
            {/* 報告：Google Drive 匯入按鈕 */}
            <div className="flex items-center gap-1">
              <button
                onClick={openGDrivePicker}
                className="flex items-center gap-2 px-4 py-2 border border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors text-sm"
              >
                <Cloud className="w-4 h-4" />
                Google Drive
              </button>
              {gdriveConnected && (
                <button
                  onClick={disconnectGDrive}
                  disabled={disconnecting}
                  className="flex items-center gap-1 px-2 py-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-xs disabled:opacity-50"
                  title="斷開 Google Drive 連接"
                >
                  {disconnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unplug className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
            {/* 報告：新增文字報告按鈕 */}
            <button
              onClick={() => setShowCreateReport(!showCreateReport)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              新增報告
            </button>
          </div>
        )}
      </div>

      {/* 上傳提示訊息 */}
      {uploadMessage && (
        <div
          className={`mb-4 px-4 py-2 rounded-lg text-sm flex items-center justify-between ${uploadMessage.includes("失敗")
              ? "bg-red-50 dark:bg-red-900/20 text-red-600"
              : "bg-green-50 dark:bg-green-900/20 text-green-600"
            }`}
        >
          <span>{uploadMessage}</span>
          <button
            onClick={() => setUploadMessage(null)}
            className="ml-2 hover:opacity-70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 批次匯入面板 */}
      {showBatchUpload && (
        <BatchUpload
          onComplete={() => {
            loadDocuments();
          }}
          onClose={() => setShowBatchUpload(false)}
        />
      )}

      {/* 支援格式提示 + 補生成摘要 */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-400">
          支援格式：PDF、Word、PowerPoint、Excel、TXT、Markdown、PNG、JPG、Google
          Docs、Google Sheets、Google Slides，上限 50MB
        </p>
        {documents.some((d) => !d.summary) && (
          <button
            onClick={regenerateAllSummaries}
            disabled={regeneratingSummaries}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0 ml-4"
            title="為缺少概括的文件補生成摘要"
          >
            {regeneratingSummaries ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {regeneratingSummaries ? "生成中..." : "補生成摘要"}
          </button>
        )}
      </div>

      {/* 搜尋列 */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder={
              searchMode === "text" ? "搜尋文件標題..." : "語意搜尋知識庫..."
            }
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSemanticResults([]);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-sm">
          <button
            onClick={() => {
              setSearchMode("text");
              setSemanticResults([]);
            }}
            className={`px-3 py-2 transition-colors ${searchMode === "text"
                ? "bg-blue-600 text-white"
                : "bg-background text-foreground hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
          >
            文字
          </button>
          <button
            onClick={() => {
              setSearchMode("semantic");
              if (searchQuery) doSemanticSearch(searchQuery);
            }}
            className={`px-3 py-2 transition-colors ${searchMode === "semantic"
                ? "bg-blue-600 text-white"
                : "bg-background text-foreground hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
          >
            語意
          </button>
        </div>
      </div>

      {/* 標籤篩選列 */}
      {allTags.length > 0 && viewMode === "list" && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <button
            onClick={() => setFilterTag(null)}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${filterTag === null
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
          >
            全部
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setFilterTag(filterTag === tag ? null : tag)}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${filterTag === tag
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* YouTube 匯入元件 */}
      {showYouTubeImport && (
        <YouTubeImport
          onClose={() => setShowYouTubeImport(false)}
          onSuccess={() => {
            loadDocuments();
            setShowYouTubeImport(false);
          }}
        />
      )}

      {/* 網址匯入表單 */}
      {showUrlImport && (
        <form
          onSubmit={importFromUrl}
          className="mb-6 p-4 border border-purple-200 dark:border-purple-800 rounded-lg bg-purple-50/30 dark:bg-purple-900/10 space-y-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <Link className="w-4 h-4 text-purple-500" />
            <span className="text-sm font-medium text-foreground">
              從網址匯入
            </span>
          </div>
          <p className="text-xs text-gray-500">
            輸入網頁網址，系統會自動抓取內容並使用 AI 整理成結構化知識文件。
          </p>
          <div className="flex gap-2">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/article"
              required
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="submit"
              disabled={isImportingUrl || !urlInput.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors flex-shrink-0"
            >
              {isImportingUrl ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  擷取中...
                </>
              ) : (
                "匯入"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowUrlImport(false);
                setUrlInput("");
              }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* 新增文件表單 */}
      {showCreate && (
        <form
          onSubmit={createDocument}
          className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="文件標題"
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="貼上或輸入文件內容..."
            required
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isCreating}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
            >
              {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
              儲存並建立索引
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* 語意搜尋結果 */}
      {searchMode === "semantic" && searchQuery && (
        <div className="mb-4">
          {isSearching ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              搜尋中...
            </div>
          ) : semanticResults.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-2">
                找到 {semanticResults.length} 個相關片段
              </p>
              {semanticResults.map((result, idx) => (
                <div
                  key={`${result.document_id}-${idx}`}
                  className="p-3 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/50 dark:bg-blue-900/20"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                      相似度: {(result.similarity * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-sm text-foreground line-clamp-3">
                    {result.chunk_text}
                  </p>
                </div>
              ))}
            </div>
          ) : searchQuery.length >= 2 ? (
            <p className="text-sm text-gray-400 py-2">未找到相關結果</p>
          ) : null}
        </div>
      )}

      {/* 知識圖譜 / 監控源 / 文件列表 */}
      {viewMode === "graph" ? (
        <div className="flex-1 overflow-hidden">
          <KnowledgeGraph />
        </div>
      ) : viewMode === "sources" ? (
        <div className="flex-1 overflow-y-auto">
          <SourceManager />
        </div>
      ) : viewMode === "reports" ? (
        <div className="flex-1 overflow-y-auto space-y-2">
          {/* 新增報告表單 */}
          {showCreateReport && (
            <form
              onSubmit={createReport}
              className="mb-4 p-4 border border-violet-200 dark:border-violet-800 rounded-lg bg-violet-50/30 dark:bg-violet-900/10 space-y-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-medium text-foreground">
                  新增報告
                </span>
              </div>
              <input
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder="報告標題"
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <textarea
                value={reportContent}
                onChange={(e) => setReportContent(e.target.value)}
                placeholder="貼上或輸入報告內容..."
                required
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isCreatingReport}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
                >
                  {isCreatingReport && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  建立報告
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateReport(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          )}
          {reportsLoading ? (
            <p className="text-center text-gray-400 py-8">載入中...</p>
          ) : reports.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <BookOpen className="w-12 h-12 mx-auto mb-2" />
              <p>尚無報告</p>
              <p className="text-xs mt-1">
                點擊「上傳檔案」、「Google Drive」或「新增報告」來建立專業報告
              </p>
            </div>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                onClick={() => {
                  setCanvasReportId(report.id);
                  setCanvasDocumentId(undefined);
                  setCanvasOpen(true);
                }}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground">
                      {report.title}
                    </h3>
                    <div className="mt-1">
                      <p className="text-[11px] font-medium text-gray-400">
                        概括預覽
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-3 leading-relaxed">
                        {report.summary ?? "尚未產生概括摘要"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {report.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                      <span className="px-2 py-0.5 text-xs bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 rounded-full">
                        報告
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(report.created_at).toLocaleDateString(
                          "zh-TW",
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteReport(report.id);
                      }}
                      disabled={deletingReportId === report.id}
                      className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                      title="刪除報告"
                    >
                      {deletingReportId === report.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Trash2 className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div ref={listContainerRef} className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <p className="text-center text-gray-400 py-8">載入中...</p>
          ) : documents.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <FileText className="w-12 h-12 mx-auto mb-2" />
              <p>尚無文件，點擊「上傳檔案」或「新增文件」開始建立知識庫</p>
            </div>
          ) : filteredDocuments.length === 0 && filterTag ? (
            <div className="text-center text-gray-400 py-8">
              <Filter className="w-12 h-12 mx-auto mb-2" />
              <p>沒有標籤為「{filterTag}」的文件</p>
              <button
                onClick={() => setFilterTag(null)}
                className="mt-2 text-sm text-blue-500 hover:underline"
              >
                清除篩選
              </button>
            </div>
          ) : (
            filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                onClick={() => {
                  if (isMobile) {
                    setMobileDetailDoc(doc);
                  } else {
                    setCanvasDocumentId(doc.id);
                    setCanvasReportId(undefined);
                    setCanvasOpen(true);
                  }
                }}
                className={`p-4 border rounded-lg transition-colors cursor-pointer ${searchMode === "semantic" && semanticDocIds.size > 0
                    ? semanticDocIds.has(doc.id)
                      ? "border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10"
                      : "border-gray-200 dark:border-gray-700 opacity-50"
                    : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground">{doc.title}</h3>
                    <div className="mt-1">
                      <p className="text-[11px] font-medium text-gray-400">
                        概括預覽
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-3 leading-relaxed">
                        {toSummaryPreview(doc.summary) ??
                          "尚未產生概括摘要，建議補充文件摘要以提升檢索品質。"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {doc.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                      {renderEmbeddingBadge(doc.id)}
                      <span className="text-xs text-gray-400">
                        {new Date(doc.created_at).toLocaleDateString("zh-TW")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const res = await fetch(`/api/knowledge/${doc.id}/related`);
                          const { relatedDocIds } = await res.json();
                          let url = `/chat?docId=${encodeURIComponent(doc.id)}`;
                          if (relatedDocIds?.length > 0) {
                            url += `&relatedDocIds=${relatedDocIds.map(encodeURIComponent).join(",")}`;
                          }
                          router.push(url);
                        } catch {
                          router.push(`/chat?docId=${encodeURIComponent(doc.id)}`);
                        }
                      }}
                      className="p-2.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
                      title="開啟對話"
                    >
                      <MessageSquare className="w-5 h-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDocEnabled(doc.id, doc.enabled);
                      }}
                      className={`p-2 rounded-xl transition-all ${doc.enabled
                          ? "text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                          : "text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                      title={
                        doc.enabled
                          ? "已啟用引用（點擊停用）"
                          : "已停用引用（點擊啟用）"
                      }
                    >
                      {doc.enabled ? (
                        <ToggleRight className="w-8 h-8" />
                      ) : (
                        <ToggleLeft className="w-8 h-8" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDocument(doc.id);
                      }}
                      disabled={deletingId === doc.id}
                      className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                      title="刪除文件"
                    >
                      {deletingId === doc.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Trash2 className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Google Drive 檔案選擇器 Modal */}
      {showGDrivePicker && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowGDrivePicker(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-foreground">
                  從 Google Drive 匯入
                </h3>
              </div>
              <button
                onClick={() => setShowGDrivePicker(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* 麵包屑導航 */}
            <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center gap-1 text-sm overflow-x-auto">
              <button
                onClick={() => navigateToBreadcrumb(-1)}
                className="text-blue-600 hover:underline flex-shrink-0 font-medium"
              >
                我的雲端硬碟
              </button>
              {folderPath.map((folder, idx) => (
                <span
                  key={folder.id}
                  className="flex items-center gap-1 flex-shrink-0"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  {idx === folderPath.length - 1 ? (
                    <span className="text-foreground font-medium">
                      {folder.name}
                    </span>
                  ) : (
                    <button
                      onClick={() => navigateToBreadcrumb(idx)}
                      className="text-blue-600 hover:underline"
                    >
                      {folder.name}
                    </button>
                  )}
                </span>
              ))}
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[55vh]">
              {loadingGDrive ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                  <span className="ml-3 text-gray-500">載入中...</span>
                </div>
              ) : gdriveFiles.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-2" />
                  <p>此資料夾中沒有可匯入的檔案</p>
                  <p className="text-xs mt-1">
                    支援：PDF、Word、PowerPoint、Excel、TXT、Markdown、Google
                    Docs/Sheets/Slides
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 mb-2">
                    {gdriveFiles.filter((f) => f.isFolder).length > 0 &&
                      `${gdriveFiles.filter((f) => f.isFolder).length} 個資料夾`}
                    {gdriveFiles.filter((f) => f.isFolder).length > 0 &&
                      gdriveFiles.filter((f) => !f.isFolder).length > 0 &&
                      "、"}
                    {gdriveFiles.filter((f) => !f.isFolder).length > 0 &&
                      `${gdriveFiles.filter((f) => !f.isFolder).length} 個檔案`}
                  </p>
                  {gdriveFiles.map((file) =>
                    file.isFolder ? (
                      <button
                        key={file.id}
                        onClick={() => navigateToFolder(file)}
                        className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <Folder className="w-5 h-5 text-gray-400 flex-shrink-0" />
                          <p className="font-medium text-foreground truncate">
                            {file.name}
                          </p>
                          <ChevronRight className="w-4 h-4 text-gray-300 ml-auto flex-shrink-0" />
                        </div>
                      </button>
                    ) : (
                      <button
                        key={file.id}
                        onClick={() => importFromGDrive(file)}
                        disabled={importingFileIds.has(file.id)}
                        className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {file.name}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatMimeType(file.mimeType)}
                              {file.size
                                ? ` · ${(file.size / 1024).toFixed(0)} KB`
                                : ""}
                            </p>
                          </div>
                          {importingFileIds.has(file.id) ? (
                            <Loader2 className="w-5 h-5 animate-spin text-green-600 flex-shrink-0" />
                          ) : (
                            <Upload className="w-5 h-5 text-green-600 flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    ),
                  )}
                  {gdriveNextPageToken && (
                    <button
                      onClick={loadMoreGDriveFiles}
                      disabled={loadingMore}
                      className="w-full py-3 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {loadingMore ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          載入中...
                        </span>
                      ) : (
                        "載入更多"
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                透過 Google Drive API 直連
              </p>
              <button
                onClick={disconnectGDrive}
                disabled={disconnecting}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
              >
                {disconnecting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Unplug className="w-3 h-3" />
                )}
                切換帳號
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 手機端文件詳情 Drawer */}
      {isMobile && (
        <MobileDrawer
          open={mobileDetailDoc !== null}
          onClose={() => setMobileDetailDoc(null)}
          side="bottom"
          title={mobileDetailDoc?.title ?? "文件詳情"}
        >
          {mobileDetailDoc && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-400">概括預覽</p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                  {toSummaryPreview(mobileDetailDoc.summary) ??
                    "尚未產生概括摘要"}
                </p>
              </div>
              {mobileDetailDoc.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {mobileDetailDoc.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400">
                建立於{" "}
                {new Date(mobileDetailDoc.created_at).toLocaleDateString(
                  "zh-TW",
                )}
              </p>
              <button
                onClick={() => {
                  setCanvasDocumentId(mobileDetailDoc.id);
                  setCanvasReportId(undefined);
                  setCanvasOpen(true);
                  setMobileDetailDoc(null);
                }}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                開啟編輯器
              </button>
            </div>
          )}
        </MobileDrawer>
      )}

      {/* Canvas 編輯器覆蓋層 */}
      {canvasOpen && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900">
          <CanvasEditor
            key={`${canvasReportId ?? ""}-${canvasDocumentId ?? ""}`}
            reportId={canvasReportId}
            documentId={canvasDocumentId}
            onClose={() => {
              setCanvasOpen(false);
              setCanvasReportId(undefined);
              setCanvasDocumentId(undefined);
              // 關閉後刷新列表
              if (viewMode === "reports") loadReports();
              else loadDocuments();
            }}
          />
          {/* 浮動 AI 問答（僅在 Canvas 編輯模式顯示） */}
          <FloatingKnowledgeChat
            mode={canvasReportId ? "reports" : "knowledge"}
            reportId={canvasReportId}
            documentId={canvasDocumentId}
          />
        </div>
      )}
    </div>
  );
}
