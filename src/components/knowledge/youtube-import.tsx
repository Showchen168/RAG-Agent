"use client";

import { useState } from "react";
import { Youtube, Loader2, CheckCircle, AlertCircle, X, Info } from "lucide-react";

interface ImportResult {
  success: boolean;
  type?: "video" | "playlist" | "channel";
  title?: string;
  channel?: string;
  source?: string;
  total?: number;
  succeeded?: number;
  error?: string;
}

interface YouTubeImportProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function YouTubeImport({ onClose, onSuccess }: YouTubeImportProps) {
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || importing) return;

    setImporting(true);
    setResult(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

      const res = await fetch("/api/knowledge/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await res.json();

      if (!res.ok) {
        setResult({ success: false, error: data.error || `伺服器錯誤 (${res.status})` });
      } else {
        const responseType = data.type as "video" | "playlist" | "channel";
        if (responseType === "playlist") {
          setResult({
            success: true,
            type: "playlist",
            total: data.data.total,
            succeeded: data.data.succeeded,
          });
        } else if (responseType === "channel") {
          setResult({
            success: true,
            type: "channel",
            title: data.data.name,
          });
        } else {
          setResult({
            success: true,
            type: "video",
            title: data.data.title,
            channel: data.data.channel,
            source: data.data.source,
          });
        }
        onSuccess();
      }
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "請求逾時（超過 5 分鐘），影片可能過長或伺服器繁忙"
          : err instanceof Error
            ? `網路錯誤：${err.message}`
            : "網路錯誤，請稍後再試";
      setResult({ success: false, error: message });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mb-6 p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50/30 dark:bg-red-900/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Youtube className="w-4 h-4 text-red-500" />
          <span className="text-sm font-medium text-foreground">
            匯入 YouTube 影片
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-gray-500">
        貼上影片或播放清單 URL 即可匯入。系統自動擷取字幕，以
        AI 生成摘要與分段筆記；播放清單則批次處理所有影片。
      </p>

      {/* 偵測頻道 URL 時提示 */}
      {/youtube\.com\/@/.test(url) && (
        <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            頻道訂閱請到「監控源」頁面的「新增頻道」按鈕操作，此處僅支援單一影片和播放清單匯入。
          </span>
        </div>
      )}

      <form onSubmit={handleImport} className="space-y-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="影片或播放清單 URL"
          required
          type="url"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={importing || !url.trim() || /youtube\.com\/@/.test(url)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
          >
            {importing && <Loader2 className="w-4 h-4 animate-spin" />}
            {importing ? "處理中..." : "匯入"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            取消
          </button>
        </div>
      </form>

      {result && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
            result.success
              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
          }`}
        >
          {result.success ? (
            <>
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                {result.type === "playlist" ? (
                  <>
                    <p className="font-medium">播放清單匯入完成</p>
                    <p className="text-xs mt-1 opacity-80">
                      共 {result.total} 部影片，成功 {result.succeeded} 部
                    </p>
                  </>
                ) : result.type === "channel" ? (
                  <>
                    <p className="font-medium">已建立頻道監控</p>
                    <p className="text-xs mt-1 opacity-80">{result.title}</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">{result.title}</p>
                    <p className="text-xs mt-1 opacity-80">
                      頻道：{result.channel}・來源：
                      {result.source === "subtitle" ? "字幕" : "語音轉錄"}
                    </p>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{result.error}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
