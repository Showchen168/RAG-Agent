"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  FolderOpen,
} from "lucide-react";

interface UploadProgress {
  fileName: string;
  status: "pending" | "uploading" | "embedding" | "done" | "error";
  progress: number;
  error?: string;
  parsedBy?: "marker" | "builtin";
}

const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
]);

const ACCEPTED_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "xls",
  "txt",
  "md",
  "png",
  "jpg",
  "jpeg",
]);

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ACCEPTED_EXTENSIONS.has(ext);
}

interface BatchUploadProps {
  onComplete: () => void;
  onClose: () => void;
}

export function BatchUpload({ onComplete, onClose }: BatchUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<UploadProgress[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    const accepted = newFiles.filter(isAcceptedFile);
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const unique = accepted.filter((f) => !existingNames.has(f.name));
      return [...prev, ...unique];
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const items = Array.from(e.dataTransfer.items);
      const filePromises: Promise<File[]>[] = [];

      for (const item of items) {
        const entry = item.webkitGetAsEntry?.();
        if (entry) {
          filePromises.push(readEntry(entry));
        } else if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) filePromises.push(Promise.resolve([file]));
        }
      }

      Promise.all(filePromises).then((results) => {
        addFiles(results.flat());
      });
    },
    [addFiles],
  );

  const handleFolderSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? []);
      addFiles(selected);
      if (folderInputRef.current) folderInputRef.current.value = "";
    },
    [addFiles],
  );

  const removeFile = useCallback((fileName: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== fileName));
  }, []);

  const startUpload = useCallback(async () => {
    if (files.length === 0 || isRunning) return;
    setIsRunning(true);

    const initialProgress: UploadProgress[] = files.map((f) => ({
      fileName: f.name,
      status: "pending",
      progress: 0,
    }));
    setProgress(initialProgress);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Update status to uploading
      setProgress((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: "uploading", progress: 30 } : p,
        ),
      );

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("useMarker", "true");

        const uploadRes = await fetch("/api/knowledge/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes
            .json()
            .catch(() => ({ error: "Upload failed" }));
          setProgress((prev) =>
            prev.map((p, idx) =>
              idx === i
                ? { ...p, status: "error", progress: 0, error: err.error }
                : p,
            ),
          );
          continue;
        }

        const uploadResult = await uploadRes.json();
        const docId = uploadResult.data?.id;

        // Update status to embedding
        setProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: "embedding", progress: 70 } : p,
          ),
        );

        if (docId) {
          const embedBody: Record<string, unknown> = { documentId: docId };
          // Marker chunks 直通 embed 階段
          if (uploadResult.meta?.markerChunks) {
            embedBody.markerChunks = JSON.parse(
              uploadResult.meta.markerChunks as string,
            );
          }
          await fetch("/api/knowledge/embed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(embedBody),
          });
        }

        setProgress((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? {
                  ...p,
                  status: "done",
                  progress: 100,
                  parsedBy: uploadResult.meta?.parsedBy as
                    | "marker"
                    | "builtin"
                    | undefined,
                }
              : p,
          ),
        );
      } catch {
        setProgress((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? { ...p, status: "error", progress: 0, error: "網路錯誤" }
              : p,
          ),
        );
      }
    }

    setIsRunning(false);
    onComplete();
  }, [files, isRunning, onComplete]);

  const totalFiles = files.length;
  const doneCount = progress.filter((p) => p.status === "done").length;
  const errorCount = progress.filter((p) => p.status === "error").length;
  const overallProgress =
    totalFiles > 0 ? Math.round((doneCount / totalFiles) * 100) : 0;

  return (
    <div className="mb-6 p-4 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/30 dark:bg-blue-900/10 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-blue-500" />
          <h3 className="text-sm font-medium text-foreground">批次匯入</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragOver
            ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
            : "border-gray-300 dark:border-gray-600 hover:border-blue-300"
        }`}
      >
        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          拖放檔案或資料夾到此處
        </p>
        <p className="text-xs text-gray-400 mt-1">
          支援：PDF、Word、PowerPoint、Excel、TXT、Markdown、PNG、JPG
        </p>
        <div className="mt-3">
          <label className="text-xs text-blue-600 hover:underline cursor-pointer">
            <input
              ref={folderInputRef}
              type="file"
              multiple
              // @ts-expect-error webkitdirectory is a non-standard attribute
              webkitdirectory=""
              onChange={handleFolderSelect}
              className="hidden"
            />
            或點此選擇資料夾
          </label>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {totalFiles} 個檔案
              {progress.length > 0 && ` / ${doneCount} 完成`}
              {errorCount > 0 && ` / ${errorCount} 失敗`}
            </p>
            {!isRunning && progress.length === 0 && (
              <button
                onClick={startUpload}
                disabled={files.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs transition-colors disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                開始上傳
              </button>
            )}
          </div>

          {/* Overall progress */}
          {progress.length > 0 && (
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          )}

          <div className="max-h-48 overflow-y-auto space-y-1">
            {files.map((file, idx) => {
              const p = progress[idx];
              return (
                <div
                  key={file.name}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
                >
                  {p?.status === "done" ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  ) : p?.status === "error" ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  ) : p?.status === "uploading" || p?.status === "embedding" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 flex-shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600 flex-shrink-0" />
                  )}
                  <span className="flex-1 truncate text-foreground">
                    {file.name}
                  </span>
                  {p?.status === "uploading" && (
                    <span className="text-blue-500">上傳中...</span>
                  )}
                  {p?.status === "embedding" && (
                    <span className="text-purple-500">建立索引...</span>
                  )}
                  {p?.status === "error" && (
                    <span className="text-red-500">{p.error}</span>
                  )}
                  {!isRunning && !p && (
                    <button
                      onClick={() => removeFile(file.name)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper: recursively read files from a dropped directory entry
async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file(
        (file) => resolve([file]),
        () => resolve([]),
      );
    });
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    return new Promise((resolve) => {
      reader.readEntries(
        async (entries) => {
          const results = await Promise.all(entries.map(readEntry));
          resolve(results.flat());
        },
        () => resolve([]),
      );
    });
  }

  return [];
}
