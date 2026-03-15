"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  MessageSquare,
  Link2,
  Unlink,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

interface TelegramStatus {
  linked: boolean;
  telegramChatId?: number;
  telegramUsername?: string;
  telegramFirstName?: string;
  botUsername?: string | null;
}

interface LinkCodeResponse {
  code: string;
  expires_at: string;
  deep_link: string | null;
}

type ViewState = "loading" | "unlinked" | "code-generated" | "linked";

export default function TelegramIntegration() {
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [linkCode, setLinkCode] = useState<LinkCodeResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ========== 查詢綁定狀態 ==========
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/status");
      if (!res.ok) return;
      const data: TelegramStatus = await res.json();
      setStatus(data);

      if (data.linked) {
        setViewState("linked");
        // 清除輪詢
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } else if (viewState === "loading") {
        setViewState("unlinked");
      }
    } catch {
      if (viewState === "loading") {
        setViewState("unlinked");
      }
    }
  }, [viewState]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ========== 倒數計時 ==========
  useEffect(() => {
    if (!linkCode || viewState !== "code-generated") return;

    const expiresAt = new Date(linkCode.expires_at).getTime();

    const timer = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.floor((expiresAt - Date.now()) / 1000),
      );
      setCountdown(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        setViewState("unlinked");
        setLinkCode(null);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [linkCode, viewState]);

  // ========== 產生綁定碼 ==========
  const handleGenerateCode = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "產生綁定碼失敗");
      }
      const data: LinkCodeResponse = await res.json();
      setLinkCode(data);
      setViewState("code-generated");

      // 開始輪詢（每 3 秒）
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(fetchStatus, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setGenerating(false);
    }
  };

  // ========== 複製綁定碼 ==========
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  // ========== 解除綁定 ==========
  const handleUnlink = async () => {
    if (!window.confirm("確定要解除 Telegram 帳號綁定嗎？")) return;
    setUnlinking(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/link", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "解除綁定失敗");
      }
      setStatus(null);
      setViewState("unlinked");
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setUnlinking(false);
    }
  };

  // ========== 清理輪詢 ==========
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ========== Loading ==========
  if (viewState === "loading") {
    return (
      <div className="p-6 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800/50">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">載入中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800/50">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Telegram Bot</h3>
          <p className="text-xs text-gray-500">
            綁定你的 Telegram 帳號，在手機上存取知識庫
          </p>
        </div>
        {viewState === "linked" && (
          <span className="ml-auto px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-medium rounded-full">
            已連接
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* ========== 未綁定狀態 ========== */}
      {viewState === "unlinked" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            綁定後，你可以在 Telegram 上直接向 AI 提問並存取你的知識庫文件。
          </p>

          {/* Bot 連結說明 */}
          {status?.botUsername && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <span className="font-medium">Step 1：</span>先到 Telegram 加入我們的 Bot →{" "}
                <a
                  href={`https://t.me/${status.botUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline hover:text-blue-800 dark:hover:text-blue-200"
                >
                  @{status.botUsername}
                </a>
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                <span className="font-medium">Step 2：</span>回到這裡點「產生綁定碼」，再把綁定碼傳給 Bot
              </p>
            </div>
          )}

          <button
            onClick={handleGenerateCode}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
            {generating ? "產生中..." : "產生綁定碼"}
          </button>
        </div>
      )}

      {/* ========== 綁定碼已產生 ========== */}
      {viewState === "code-generated" && linkCode && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-xs text-gray-500 mb-2">你的綁定碼：</p>
            <div className="flex items-center gap-3">
              <code className="text-2xl font-mono font-bold tracking-wider text-foreground">
                {linkCode.code}
              </code>
              <button
                onClick={() => handleCopy(linkCode.code)}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="複製綁定碼"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              有效期限：{formatCountdown(countdown)}
            </p>
          </div>

          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <p className="font-medium text-foreground">操作步驟：</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>
                開啟 Telegram，找到{" "}
                {status?.botUsername ? (
                  <a
                    href={`https://t.me/${status.botUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
                  >
                    @{status.botUsername}
                  </a>
                ) : (
                  "Bot"
                )}
              </li>
              <li>
                傳送 <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">/link {linkCode.code}</code> 給 Bot
              </li>
              <li>等待綁定完成（此頁面會自動更新）</li>
            </ol>
          </div>

          {linkCode.deep_link && (
            <a
              href={linkCode.deep_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              在 Telegram 中開啟
            </a>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <RefreshCw className="w-3 h-3 animate-spin" />
            等待綁定中...
          </div>
        </div>
      )}

      {/* ========== 已綁定狀態 ========== */}
      {viewState === "linked" && status && (
        <div className="space-y-4">
          <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-800 flex items-center justify-center">
                <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  已綁定 Telegram 帳號
                </p>
                <p className="text-xs text-green-600 dark:text-green-500">
                  {status.telegramFirstName}
                  {status.telegramUsername && ` (@${status.telegramUsername})`}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleUnlink}
            disabled={unlinking}
            className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/10 text-red-600 dark:text-red-400 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {unlinking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Unlink className="w-4 h-4" />
            )}
            {unlinking ? "解除中..." : "解除綁定"}
          </button>
        </div>
      )}
    </div>
  );
}
