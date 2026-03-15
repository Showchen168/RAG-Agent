"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Settings2,
  Loader2,
  Check,
  Trash2,
  Globe,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";

interface BotInfo {
  id: number | null;
  bot_username: string | null;
  bot_first_name: string | null;
  bot_token_masked: string;
  webhook_url: string | null;
  webhook_registered_at: string | null;
}

interface WebhookStatus {
  connected: boolean;
  info?: {
    url: string;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  };
  error?: string;
}

type ViewState = "loading" | "no-config" | "configured" | "owned-by-other";

export default function TelegramBotConfig() {
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(
    null,
  );
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [webhookUrlInput, setWebhookUrlInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [deletingWebhook, setDeletingWebhook] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ========== 載入設定 ==========
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/bot");
      if (!res.ok) return;
      const data = await res.json();

      if (data.owned_by_other) {
        setViewState("owned-by-other");
      } else if (data.config) {
        setBotInfo(data.config);
        setWebhookStatus(data.webhook);
        setViewState("configured");
      } else {
        setViewState("no-config");
      }
    } catch {
      setViewState("no-config");
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ========== 驗證並儲存 Token ==========
  const handleSaveToken = async () => {
    if (!tokenInput.trim()) {
      setError("請輸入 Bot Token");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/telegram/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "驗證失敗");
      }

      setSuccess(
        `Bot 驗證成功：@${data.bot.username} (${data.bot.first_name})`,
      );
      setTokenInput("");
      await fetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setSaving(false);
    }
  };

  // ========== 刪除設定 ==========
  const handleDelete = async () => {
    if (!window.confirm("確定要刪除 Bot 設定嗎？這將移除 Token 和 Webhook 設定。")) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch("/api/telegram/bot", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "刪除失敗");
      }

      setBotInfo(null);
      setWebhookStatus(null);
      setViewState("no-config");
      setSuccess("Bot 設定已刪除");
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setDeleting(false);
    }
  };

  // ========== 註冊 Webhook ==========
  const handleRegisterWebhook = async () => {
    setRegisteringWebhook(true);
    setError(null);
    setSuccess(null);

    try {
      const body: Record<string, string> = {};
      if (webhookUrlInput.trim()) {
        body.webhookUrl = webhookUrlInput.trim();
      }

      const res = await fetch("/api/telegram/bot/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Webhook 註冊失敗");
      }

      setSuccess(`Webhook 已註冊：${data.webhookUrl}`);
      setWebhookUrlInput("");
      await fetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setRegisteringWebhook(false);
    }
  };

  // ========== 取消 Webhook ==========
  const handleDeleteWebhook = async () => {
    setDeletingWebhook(true);
    setError(null);

    try {
      const res = await fetch("/api/telegram/bot/webhook", {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Webhook 取消失敗");
      }

      setSuccess("Webhook 已取消");
      await fetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setDeletingWebhook(false);
    }
  };

  // ========== 自動清除訊息 ==========
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // ========== Loading ==========
  if (viewState === "loading") {
    return (
      <div className="p-6 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800/50">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">載入 Bot 設定...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800/50">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
          <Bot className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">
            Bot 設定（管理員）
          </h3>
          <p className="text-xs text-gray-500">
            設定 Telegram Bot Token 和 Webhook
          </p>
        </div>
        {viewState === "configured" && webhookStatus?.connected && (
          <span className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-medium rounded-full">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            連線中
          </span>
        )}
        {viewState === "configured" && webhookStatus && !webhookStatus.connected && (
          <span className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-medium rounded-full">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            未連線
          </span>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-2">
          <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
          <p className="text-sm text-green-600 dark:text-green-400">
            {success}
          </p>
        </div>
      )}

      {/* ========== 已被其他用戶設定 ========== */}
      {viewState === "owned-by-other" && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Telegram Bot 已由其他管理員設定
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
              目前的 Bot 設定屬於另一位用戶，你無法修改或刪除。如需重新設定，請聯絡原設定者。
            </p>
          </div>
        </div>
      )}

      {/* ========== 未設定狀態 ========== */}
      {viewState === "no-config" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            從{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              @BotFather
            </a>{" "}
            取得 Bot Token，貼到下方驗證。
          </p>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Bot Token
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="1234567890:ABCdefGHIjklmNOpqrsTUVwxyz"
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                {showToken ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <button
            onClick={handleSaveToken}
            disabled={saving || !tokenInput.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Settings2 className="w-4 h-4" />
            )}
            {saving ? "驗證中..." : "驗證並儲存"}
          </button>
        </div>
      )}

      {/* ========== 已設定狀態 ========== */}
      {viewState === "configured" && botInfo && (
        <div className="space-y-5">
          {/* Bot 資訊 */}
          <div className="p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Bot</span>
              <span className="text-sm font-medium text-foreground">
                @{botInfo.bot_username} ({botInfo.bot_first_name})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Token</span>
              <code className="text-xs font-mono text-gray-600 dark:text-gray-400">
                {botInfo.bot_token_masked}
              </code>
            </div>
          </div>

          {/* Webhook 區塊 */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Webhook
            </h4>

            {webhookStatus?.connected && webhookStatus.info ? (
              <div className="space-y-3">
                <div className="p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg text-sm">
                  <p className="text-green-700 dark:text-green-400 font-medium">
                    Webhook 已啟用
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-500 mt-1 break-all font-mono">
                    {webhookStatus.info.url}
                  </p>
                  {webhookStatus.info.pending_update_count > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      待處理更新：{webhookStatus.info.pending_update_count}
                    </p>
                  )}
                  {webhookStatus.info.last_error_message && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      最近錯誤：{webhookStatus.info.last_error_message}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={fetchConfig}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-xs transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    重新整理
                  </button>
                  <button
                    onClick={handleDeleteWebhook}
                    disabled={deletingWebhook}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/10 text-red-600 dark:text-red-400 rounded-lg text-xs transition-colors disabled:opacity-50"
                  >
                    {deletingWebhook ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    取消 Webhook
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  尚未註冊 Webhook。點擊下方按鈕自動偵測 URL 並註冊。
                </p>

                {/* 進階：手動輸入 URL */}
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  {showAdvanced ? "隱藏進階設定" : "進階設定（手動輸入 URL）"}
                </button>

                {showAdvanced && (
                  <div className="space-y-2">
                    <label className="block text-xs text-gray-500">
                      Webhook URL（留空自動偵測）
                    </label>
                    <input
                      type="url"
                      value={webhookUrlInput}
                      onChange={(e) => setWebhookUrlInput(e.target.value)}
                      placeholder="https://your-domain.com/api/telegram/webhook"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}

                <button
                  onClick={handleRegisterWebhook}
                  disabled={registeringWebhook}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
                >
                  {registeringWebhook ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Globe className="w-4 h-4" />
                  )}
                  {registeringWebhook ? "註冊中..." : "一鍵註冊 Webhook"}
                </button>
              </div>
            )}
          </div>

          {/* 分隔線 + 刪除 */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/10 text-red-600 dark:text-red-400 rounded-lg text-xs transition-colors disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              {deleting ? "刪除中..." : "刪除 Bot 設定"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
