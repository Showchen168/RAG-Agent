"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  RefreshCw,
  Pause,
  Play,
  Trash2,
  Loader2,
  Rss,
  Globe,
  X,
  ExternalLink,
  Youtube,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Check,
  Clock,
} from "lucide-react";

interface KnowledgeSource {
  id: string;
  source_type: "url" | "rss" | "youtube";
  url: string;
  name: string;
  check_interval_hours: number;
  last_checked_at: string | null;
  is_active: boolean;
  document_id: string | null;
  metadata?: {
    channel_id?: string;
    channel_handle?: string;
    last_video_ids?: string[];
  };
}

interface DiscoveredVideo {
  videoId: string;
  title: string;
  published: string;
}

export function SourceManager() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"url" | "rss">("url");
  const [formUrl, setFormUrl] = useState("");
  const [formName, setFormName] = useState("");
  const [formInterval, setFormInterval] = useState(24);
  const [creating, setCreating] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // YouTube 新增表單
  const [showYouTubeForm, setShowYouTubeForm] = useState(false);
  const [ytFormUrl, setYtFormUrl] = useState("");
  const [ytFormName, setYtFormName] = useState("");
  const [ytFormInterval, setYtFormInterval] = useState(24);
  const [ytCreating, setYtCreating] = useState(false);

  // YouTube 展開管理（per-source 獨立狀態）
  const [expandedYouTubeIds, setExpandedYouTubeIds] = useState<Set<string>>(
    new Set(),
  );
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [discoveredVideosMap, setDiscoveredVideosMap] = useState<
    Record<string, DiscoveredVideo[]>
  >({});
  const [selectedVideoIdsMap, setSelectedVideoIdsMap] = useState<
    Record<string, Set<string>>
  >({});
  const [importingSourceIds, setImportingSourceIds] = useState<Set<string>>(
    new Set(),
  );
  const [importProgressMap, setImportProgressMap] = useState<
    Record<string, Record<string, "pending" | "importing" | "done" | "timeout">>
  >({});
  const [importMessageMap, setImportMessageMap] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    loadSources();
  }, []);

  const youtubeSources = sources.filter((s) => s.source_type === "youtube");
  const otherSources = sources.filter((s) => s.source_type !== "youtube");

  async function loadSources() {
    const res = await fetch("/api/knowledge/sources");
    if (res.ok) {
      const { data } = await res.json();
      setSources(data ?? []);
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formUrl.trim() || !formName.trim() || creating) return;

    setCreating(true);
    setMessage(null);

    try {
      const res = await fetch("/api/knowledge/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: formType,
          url: formUrl.trim(),
          name: formName.trim(),
          check_interval_hours: formInterval,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage(`新增失敗: ${result.error}`);
      } else {
        setSources((prev) => [result.data, ...prev]);
        setFormUrl("");
        setFormName("");
        setShowForm(false);
        setMessage("監控源已建立，正在抓取內容...");
      }
    } catch {
      setMessage("新增失敗: 網路錯誤");
    } finally {
      setCreating(false);
    }
  }

  async function handleCheck(sourceId: string) {
    if (checkingId) return;
    setCheckingId(sourceId);
    setMessage(null);

    try {
      const res = await fetch(`/api/knowledge/sources/${sourceId}/check`, {
        method: "POST",
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage(`檢查失敗: ${result.error}`);
      } else if (result.data.sourceType === "youtube") {
        const d = result.data;
        if (d.newVideoCount > 0) {
          setMessage(
            `發現 ${d.newVideoCount} 部新影片，成功匯入 ${d.succeeded ?? 0} 部${d.failed ? `，失敗 ${d.failed} 部` : ""}`,
          );
        } else {
          setMessage("無新影片");
        }
        await loadSources();
      } else if (result.data.updated) {
        setMessage("偵測到更新，已重新建立索引");
        await loadSources();
      } else {
        setMessage("內容無變化");
        await loadSources();
      }
    } catch {
      setMessage("檢查失敗: 網路錯誤");
    } finally {
      setCheckingId(null);
    }
  }

  async function handleReset(sourceId: string) {
    if (resettingId) return;
    setResettingId(sourceId);
    setMessage(null);

    try {
      const res = await fetch(`/api/knowledge/sources/${sourceId}/reset`, {
        method: "POST",
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage(`重置失敗: ${result.error}`);
      } else {
        const videos = (result.data.videos ?? []) as DiscoveredVideo[];
        setDiscoveredVideosMap((prev) => ({ ...prev, [sourceId]: videos }));
        setSelectedVideoIdsMap((prev) => ({
          ...prev,
          [sourceId]: new Set<string>(),
        }));
        setExpandedYouTubeIds((prev) => new Set([...prev, sourceId]));
        await loadSources();
      }
    } catch {
      setMessage("重置失敗: 網路錯誤");
    } finally {
      setResettingId(null);
    }
  }

  async function handleImportSelected(sourceId: string) {
    const selected = selectedVideoIdsMap[sourceId];
    if (importingSourceIds.has(sourceId) || !selected || selected.size === 0)
      return;
    setImportingSourceIds((prev) => new Set([...prev, sourceId]));
    setMessage(null);

    const ids = Array.from(selected);
    let succeeded = 0;
    let timedOut = 0;

    // 初始化所有選取的影片為 pending
    const initial: Record<
      string,
      "pending" | "importing" | "done" | "timeout"
    > = {};
    for (const id of ids) initial[id] = "pending";
    setImportProgressMap((prev) => ({ ...prev, [sourceId]: initial }));

    for (let i = 0; i < ids.length; i++) {
      setImportProgressMap((prev) => ({
        ...prev,
        [sourceId]: { ...prev[sourceId], [ids[i]]: "importing" },
      }));

      try {
        const res = await fetch(
          `/api/knowledge/sources/${sourceId}/import-videos`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoIds: [ids[i]] }),
          },
        );

        if (!res.ok) {
          timedOut++;
          setImportProgressMap((prev) => ({
            ...prev,
            [sourceId]: { ...prev[sourceId], [ids[i]]: "timeout" },
          }));
          continue;
        }

        const result = await res.json();
        succeeded += result.data.succeeded;
        setImportProgressMap((prev) => ({
          ...prev,
          [sourceId]: {
            ...prev[sourceId],
            [ids[i]]: result.data.succeeded > 0 ? "done" : "timeout",
          },
        }));
      } catch {
        timedOut++;
        setImportProgressMap((prev) => ({
          ...prev,
          [sourceId]: { ...prev[sourceId], [ids[i]]: "timeout" },
        }));
      }
    }

    const total = ids.length;
    const msg =
      timedOut > 0
        ? `匯入完成：${succeeded} 部成功，${timedOut} 部逾時（可能已在背景完成）`
        : `已成功匯入 ${succeeded}/${total} 部影片`;
    setImportMessageMap((prev) => ({ ...prev, [sourceId]: msg }));
    await loadSources();
    window.dispatchEvent(new Event("knowledge-updated"));
    // 延遲清除，讓使用者看到最終狀態
    setTimeout(() => {
      setDiscoveredVideosMap((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
      setSelectedVideoIdsMap((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
      setImportProgressMap((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
      setImportingSourceIds((prev) => {
        const next = new Set(prev);
        next.delete(sourceId);
        return next;
      });
      setImportMessageMap((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
    }, 5000);
  }

  function toggleVideoSelection(sourceId: string, videoId: string) {
    setSelectedVideoIdsMap((prev) => {
      const current = prev[sourceId] ?? new Set<string>();
      const next = new Set(current);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return { ...prev, [sourceId]: next };
    });
  }

  function toggleAllVideos(sourceId: string) {
    const videos = discoveredVideosMap[sourceId] ?? [];
    const selected = selectedVideoIdsMap[sourceId] ?? new Set<string>();
    const allSelected =
      videos.length > 0 && videos.every((v) => selected.has(v.videoId));
    setSelectedVideoIdsMap((prev) => ({
      ...prev,
      [sourceId]: allSelected
        ? new Set<string>()
        : new Set(videos.map((v) => v.videoId)),
    }));
  }

  async function handleToggleActive(source: KnowledgeSource) {
    const newActive = !source.is_active;
    setSources((prev) =>
      prev.map((s) =>
        s.id === source.id ? { ...s, is_active: newActive } : s,
      ),
    );

    const res = await fetch(`/api/knowledge/sources/${source.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: newActive }),
    });

    if (!res.ok) {
      setSources((prev) =>
        prev.map((s) =>
          s.id === source.id ? { ...s, is_active: source.is_active } : s,
        ),
      );
    }
  }

  async function handleDelete(sourceId: string) {
    if (deletingId) return;
    setDeletingId(sourceId);

    const res = await fetch(`/api/knowledge/sources/${sourceId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      setExpandedYouTubeIds((prev) => {
        const next = new Set(prev);
        next.delete(sourceId);
        return next;
      });
      setDiscoveredVideosMap((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
      setSelectedVideoIdsMap((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
      setImportMessageMap((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
    }

    setDeletingId(null);
  }

  async function handleCreateYouTube(e: React.FormEvent) {
    e.preventDefault();
    if (!ytFormUrl.trim() || !ytFormName.trim() || ytCreating) return;

    setYtCreating(true);
    setMessage(null);

    try {
      const res = await fetch("/api/knowledge/youtube/channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: ytFormUrl.trim(),
          name: ytFormName.trim(),
          check_interval_hours: ytFormInterval,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage(`新增失敗: ${result.error}`);
      } else {
        setSources((prev) => [result.data, ...prev]);
        setYtFormUrl("");
        setYtFormName("");
        setShowYouTubeForm(false);
        setMessage("YouTube 頻道監控已建立");
      }
    } catch {
      setMessage("新增失敗: 網路錯誤");
    } finally {
      setYtCreating(false);
    }
  }

  function formatLastChecked(dateStr: string | null): string {
    if (!dateStr) return "從未檢查";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "剛剛";
    if (diffMin < 60) return `${diffMin} 分鐘前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} 小時前`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay} 天前`;
  }

  function formatPublished(dateStr: string): string {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    } catch {
      return "";
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 訊息 */}
      {message && (
        <div
          className={`px-4 py-2 rounded-lg text-sm flex items-center justify-between ${
            message.includes("失敗")
              ? "bg-red-50 dark:bg-red-900/20 text-red-600"
              : "bg-green-50 dark:bg-green-900/20 text-green-600"
          }`}
        >
          <span>{message}</span>
          <button onClick={() => setMessage(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── YouTube 頻道監控區塊 ─── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
            <Youtube className="w-4 h-4" />
            YouTube 頻道監控
          </h3>
          <button
            onClick={() => setShowYouTubeForm(!showYouTubeForm)}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            新增頻道
          </button>
        </div>

        {/* YouTube 新增表單 */}
        {showYouTubeForm && (
          <form
            onSubmit={handleCreateYouTube}
            className="p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50/30 dark:bg-red-900/10 space-y-3"
          >
            <input
              value={ytFormName}
              onChange={(e) => setYtFormName(e.target.value)}
              placeholder="頻道名稱（如：Fireship）"
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <input
              value={ytFormUrl}
              onChange={(e) => setYtFormUrl(e.target.value)}
              placeholder="https://www.youtube.com/@頻道名"
              required
              type="url"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex items-center gap-2">
              <label className="text-sm text-foreground">檢查頻率:</label>
              <select
                value={ytFormInterval}
                onChange={(e) => setYtFormInterval(Number(e.target.value))}
                className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm"
              >
                <option value={6}>每 6 小時</option>
                <option value={12}>每 12 小時</option>
                <option value={24}>每天</option>
                <option value={168}>每週</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={ytCreating}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
              >
                {ytCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                建立監控
              </button>
              <button
                type="button"
                onClick={() => setShowYouTubeForm(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                取消
              </button>
            </div>
          </form>
        )}

        {youtubeSources.length === 0 ? (
          <p className="text-center py-4 text-sm text-gray-400">
            尚無 YouTube 頻道監控，點擊「新增頻道」開始
          </p>
        ) : (
          youtubeSources.map((source) => {
            const isExpanded = expandedYouTubeIds.has(source.id);
            const trackedCount = source.metadata?.last_video_ids?.length ?? 0;
            const sourceVideos = discoveredVideosMap[source.id] ?? [];
            const sourceSelected =
              selectedVideoIdsMap[source.id] ?? new Set<string>();
            const sourceProgress = importProgressMap[source.id] ?? {};
            const sourceImporting = importingSourceIds.has(source.id);
            const sourceMessage = importMessageMap[source.id];
            const allSelected =
              sourceVideos.length > 0 &&
              sourceVideos.every((v) => sourceSelected.has(v.videoId));

            return (
              <div
                key={source.id}
                className={`border rounded-lg transition-colors overflow-hidden ${
                  source.is_active
                    ? "border-red-200 dark:border-red-900/50"
                    : "border-gray-200 dark:border-gray-700 opacity-50"
                }`}
              >
                {/* 頻道卡片 header */}
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Youtube className="w-5 h-5 text-red-500 flex-shrink-0" />
                        <span className="font-medium text-foreground truncate text-base">
                          {source.name}
                        </span>
                        {!source.is_active && (
                          <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-full">
                            已暫停
                          </span>
                        )}
                      </div>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-400 hover:text-blue-500 truncate mt-1 flex items-center gap-1"
                      >
                        {source.url}
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </div>

                    {/* 操作按鈕 */}
                    <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                      <button
                        onClick={() => handleDelete(source.id)}
                        disabled={deletingId === source.id}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                        title="刪除"
                      >
                        {deletingId === source.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 發現影片 + 收合按鈕 */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <button
                      onClick={() => {
                        // 已有資料：toggle 展開/收合
                        if (sourceVideos.length > 0) {
                          setExpandedYouTubeIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(source.id)) {
                              next.delete(source.id);
                            } else {
                              next.add(source.id);
                            }
                            return next;
                          });
                        } else {
                          // 無資料：呼叫 reset API 發現影片
                          handleReset(source.id);
                        }
                      }}
                      disabled={resettingId === source.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {resettingId === source.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isExpanded && sourceVideos.length > 0 ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                      {sourceVideos.length > 0
                        ? `${sourceVideos.length} 部影片`
                        : "發現影片"}
                    </button>

                    {/* 收合時顯示匯入進度 / 結果 */}
                    {!isExpanded && sourceImporting && (
                      <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        匯入中{" "}
                        {
                          Object.values(sourceProgress).filter(
                            (s) => s === "done" || s === "timeout",
                          ).length
                        }
                        /{Object.keys(sourceProgress).length}
                      </span>
                    )}
                    {!isExpanded && !sourceImporting && sourceMessage && (
                      <span
                        className={`text-xs font-medium ${
                          sourceMessage.includes("逾時")
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-green-600 dark:text-green-400"
                        }`}
                      >
                        {sourceMessage}
                      </span>
                    )}
                  </div>
                </div>

                {/* 展開的影片管理面板 */}
                {isExpanded && sourceVideos.length > 0 && (
                  <div className="border-t border-red-100 dark:border-red-900/30 bg-red-50/30 dark:bg-red-900/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-foreground">
                          發現 {sourceVideos.length} 部影片
                        </h4>
                        <p className="text-xs text-gray-400 mt-0.5">
                          YouTube RSS 僅提供頻道最新約 15 部影片
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs cursor-pointer text-gray-500">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleAllVideos(source.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        全選 ({sourceSelected.size}/
                        {sourceVideos.length})
                      </label>
                    </div>

                    {/* 影片列表 */}
                    <div className="max-h-72 overflow-y-auto space-y-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-background">
                      {sourceVideos.map((video) => {
                        const status = sourceProgress[video.videoId];
                        return (
                          <label
                            key={video.videoId}
                            className={`flex items-start gap-3 px-3 py-2 cursor-pointer text-sm border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors ${
                              status === "done"
                                ? "bg-green-50 dark:bg-green-900/10"
                                : status === "importing"
                                  ? "bg-blue-50 dark:bg-blue-900/10"
                                  : status === "timeout"
                                    ? "bg-yellow-50 dark:bg-yellow-900/10"
                                    : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                            }`}
                          >
                            {status ? (
                              <div className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center">
                                {status === "importing" && (
                                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                )}
                                {status === "done" && (
                                  <Check className="w-4 h-4 text-green-500" />
                                )}
                                {status === "timeout" && (
                                  <Clock className="w-4 h-4 text-yellow-500" />
                                )}
                                {status === "pending" && (
                                  <div className="w-3 h-3 rounded-full border-2 border-gray-300" />
                                )}
                              </div>
                            ) : (
                              <input
                                type="checkbox"
                                checked={sourceSelected.has(video.videoId)}
                                onChange={() =>
                                  toggleVideoSelection(source.id, video.videoId)
                                }
                                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <span className="text-foreground block leading-tight">
                                {video.title}
                              </span>
                              <span className="text-xs text-gray-400 mt-0.5 block">
                                {status === "importing"
                                  ? "匯入中..."
                                  : status === "done"
                                    ? "已完成"
                                    : status === "timeout"
                                      ? "回應逾時（可能已在背景完成）"
                                      : `${formatPublished(video.published)} · ${video.videoId}`}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    {/* 匯入按鈕 */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleImportSelected(source.id)}
                        disabled={
                          sourceImporting || sourceSelected.size === 0
                        }
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        {sourceImporting && (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                        {sourceImporting
                          ? `匯入中 ${Object.values(sourceProgress).filter((s) => s === "done" || s === "timeout").length}/${Object.keys(sourceProgress).length}`
                          : `匯入 ${sourceSelected.size} 部影片`}
                      </button>
                      <span className="text-xs text-gray-400">
                        {sourceImporting
                          ? `${Object.values(sourceProgress).filter((s) => s === "done").length} 完成`
                          : "匯入後影片將被 AI 摘要並加入知識庫"}
                      </span>
                    </div>

                    {/* per-source 匯入結果訊息 */}
                    {sourceMessage && (
                      <div
                        className={`px-3 py-2 rounded-lg text-xs font-medium ${
                          sourceMessage.includes("逾時")
                            ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400"
                            : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                        }`}
                      >
                        {sourceMessage}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }))
        }
      </section>

      {/* ─── URL / RSS 監控源區塊 ─── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <Globe className="w-4 h-4" />
            網頁 / RSS 監控
          </h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            新增監控源
          </button>
        </div>

        {/* 新增表單 */}
        {showForm && (
          <form
            onSubmit={handleCreate}
            className="p-4 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/30 dark:bg-blue-900/10 space-y-3"
          >
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormType("url")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  formType === "url"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-foreground"
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                網頁 URL
              </button>
              <button
                type="button"
                onClick={() => setFormType("rss")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  formType === "rss"
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-foreground"
                }`}
              >
                <Rss className="w-3.5 h-3.5" />
                RSS Feed
              </button>
            </div>

            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="來源名稱（如：Tech Blog）"
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <input
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder={
                formType === "rss"
                  ? "https://example.com/feed.xml"
                  : "https://example.com/article"
              }
              required
              type="url"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="flex items-center gap-2">
              <label className="text-sm text-foreground">檢查頻率:</label>
              <select
                value={formInterval}
                onChange={(e) => setFormInterval(Number(e.target.value))}
                className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm"
              >
                <option value={1}>每小時</option>
                <option value={6}>每 6 小時</option>
                <option value={12}>每 12 小時</option>
                <option value={24}>每天</option>
                <option value={168}>每週</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                新增並抓取
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                取消
              </button>
            </div>
          </form>
        )}

        {/* URL/RSS 監控源列表 */}
        {otherSources.length === 0 ? (
          <p className="text-center py-4 text-sm text-gray-400">
            尚無網頁/RSS 監控源
          </p>
        ) : (
          <div className="space-y-2">
            {otherSources.map((source) => (
              <div
                key={source.id}
                className={`p-4 border rounded-lg transition-colors ${
                  source.is_active
                    ? "border-gray-200 dark:border-gray-700"
                    : "border-gray-200 dark:border-gray-700 opacity-50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {source.source_type === "rss" ? (
                        <Rss className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      ) : (
                        <Globe className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      )}
                      <span className="font-medium text-foreground truncate">
                        {source.name}
                      </span>
                      {!source.is_active && (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-full">
                          已暫停
                        </span>
                      )}
                    </div>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-400 hover:text-blue-500 truncate block mt-1 flex items-center gap-1"
                    >
                      {source.url}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>
                        最後檢查: {formatLastChecked(source.last_checked_at)}
                      </span>
                      <span>頻率: 每 {source.check_interval_hours} 小時</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                    <button
                      onClick={() => handleCheck(source.id)}
                      disabled={checkingId === source.id}
                      className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
                      title="立即檢查"
                    >
                      {checkingId === source.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleToggleActive(source)}
                      className={`p-2 rounded-lg transition-colors ${
                        source.is_active
                          ? "text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                          : "text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20"
                      }`}
                      title={source.is_active ? "暫停" : "啟用"}
                    >
                      {source.is_active ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(source.id)}
                      disabled={deletingId === source.id}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                      title="刪除"
                    >
                      {deletingId === source.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
