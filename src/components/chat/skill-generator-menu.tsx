"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Wand2, History, FileUp, Loader2 } from "lucide-react";

// ─── Constants ──────────────────────────────────────

/** 允許的檔案類型 */
const ACCEPTED_FILE_TYPES = ".md,.txt,.json";

/** 檔案大小上限（1 MB） */
const MAX_FILE_SIZE = 1_048_576;

// ─── Props ──────────────────────────────────────────

interface SkillGeneratorMenuProps {
  /** 是否正在生成中 */
  readonly isGenerating: boolean;
  /** 從歷史生成 */
  readonly onGenerateFromHistory: () => void;
  /** 從檔案載入 */
  readonly onLoadFile: (file: File) => void;
  /** 是否有對話歷史可用 */
  readonly hasHistory: boolean;
  /** 檔案驗證錯誤回報（可選） */
  readonly onFileError?: (message: string) => void;
}

// ─── Component ──────────────────────────────────────

export function SkillGeneratorMenu({
  isGenerating,
  onGenerateFromHistory,
  onLoadFile,
  hasHistory,
  onFileError,
}: SkillGeneratorMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 點擊外部關閉
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // ESC 關閉
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    if (!isGenerating) {
      setIsOpen((prev) => !prev);
    }
  }, [isGenerating]);

  const handleGenerateClick = useCallback(() => {
    setIsOpen(false);
    onGenerateFromHistory();
  }, [onGenerateFromHistory]);

  const handleLoadFileClick = useCallback(() => {
    setIsOpen(false);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // 重置 input 以允許重複選擇同一檔案
      e.target.value = "";

      if (file.size > MAX_FILE_SIZE) {
        onFileError?.("檔案大小超過 1MB 上限");
        return;
      }

      onLoadFile(file);
    },
    [onLoadFile, onFileError],
  );

  return (
    <div ref={menuRef} className="relative" data-testid="skill-generator-menu">
      {/* 魔法棒按鈕 */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={isGenerating}
        data-testid="skill-generator-trigger"
        className={`flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 whitespace-nowrap ${
          isOpen
            ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md shadow-purple-500/25"
            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title="技能生成器"
      >
        {isGenerating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Wand2 className="w-3.5 h-3.5" />
        )}
        <span className="hidden md:inline">
          {isGenerating ? "生成中..." : "技能生成"}
        </span>
      </button>

      {/* 下拉選單 */}
      {isOpen && (
        <div
          data-testid="skill-generator-dropdown"
          className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl shadow-black/10 dark:shadow-black/30 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="p-1.5">
            {/* 從對話歷史生成 */}
            <button
              type="button"
              onClick={handleGenerateClick}
              disabled={!hasHistory}
              data-testid="generate-from-history-btn"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50 transition-colors">
                <History className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground">從對話歷史生成</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {hasHistory
                    ? "分析當前對話，自動建立技能"
                    : "需要先有對話內容"}
                </p>
              </div>
            </button>

            {/* 分隔線 */}
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

            {/* 載入檔案 */}
            <button
              type="button"
              onClick={handleLoadFileClick}
              data-testid="load-file-btn"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20 group"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                <FileUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground">載入技能/規則檔案</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  支援 .md, .txt, .json 格式
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* 隱藏的檔案選擇器 */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        onChange={handleFileChange}
        className="hidden"
        data-testid="file-input"
      />
    </div>
  );
}
