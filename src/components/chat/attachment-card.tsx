"use client";

import { useState, useCallback } from "react";
import {
  FileText,
  Download,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { MarkdownRenderer } from "./markdown-renderer";
import type { SkillAttachmentInfo } from "@/hooks/use-skills";
import type { SkillPreviewFormat } from "@/types/skills";

// ─── Utils ──────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(bytes % 1024 === 0 ? 0 : 1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
}

/** 根據 mimeType 判斷是否為圖片 */
function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/** 驗證下載 URL 是否為安全的內部路徑 */
function isSafeDownloadUrl(url: string): boolean {
  return url.startsWith("/api/skills/attachments/");
}

/** 透過 fetch + Blob 下載檔案，避免瀏覽器導航行為 */
async function downloadViaBlob(url: string, fileName: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

// ─── Props ──────────────────────────────────────────

interface AttachmentCardProps {
  readonly attachment: SkillAttachmentInfo;
  readonly previewFormat?: SkillPreviewFormat;
}

// ─── Component ──────────────────────────────────────

export function AttachmentCard({
  attachment,
  previewFormat,
}: AttachmentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const hasPreview =
    attachment.previewContent !== null || previewFormat === "image";
  const isImage = previewFormat === "image" || isImageMime(attachment.mimeType);

  const handleDownload = useCallback(async () => {
    if (isDownloading || !isSafeDownloadUrl(attachment.downloadUrl)) return;
    setIsDownloading(true);
    try {
      await downloadViaBlob(attachment.downloadUrl, attachment.fileName);
    } catch {
      window.open(attachment.downloadUrl, "_blank");
    } finally {
      setIsDownloading(false);
    }
  }, [attachment.downloadUrl, attachment.fileName, isDownloading]);

  return (
    <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-800/50">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isImage ? (
            <ImageIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
          ) : (
            <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
          )}
          <span className="text-sm font-medium text-foreground truncate">
            {attachment.fileName}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0">
            {formatFileSize(attachment.fileSize)}
          </span>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {hasPreview && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 transition-colors"
              aria-label={isExpanded ? "收合" : "展開"}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  收合
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  展開
                </>
              )}
            </button>
          )}
          {isSafeDownloadUrl(attachment.downloadUrl) && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:text-green-400 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
              aria-label="下載"
            >
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              下載
            </button>
          )}
        </div>
      </div>

      {isExpanded && hasPreview && (
        <div className="mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
          {isImage && isSafeDownloadUrl(attachment.downloadUrl) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={attachment.downloadUrl}
              alt={attachment.fileName}
              className="max-w-full rounded-lg"
            />
          ) : attachment.previewContent ? (
            <MarkdownRenderer textMarkdown={attachment.previewContent} />
          ) : null}
        </div>
      )}
    </div>
  );
}
