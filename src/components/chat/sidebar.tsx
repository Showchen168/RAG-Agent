"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  MessageSquare,
  BookOpen,
  Settings,
  LogOut,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Loader2,
  GitBranch,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { Conversation } from "@/types";
interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const MOBILE_BREAKPOINT = 768;

export function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  // 用同步 window.innerWidth 判斷手機，避免 useIsMobile 的初始化競態條件
  const closeMobileSidebar = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      window.innerWidth < MOBILE_BREAKPOINT &&
      onToggleCollapse
    ) {
      onToggleCollapse();
    }
  }, [onToggleCollapse]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [streamingThreadIds, setStreamingThreadIds] = useState<Set<string>>(
    new Set(),
  );
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (res.ok) {
      const { data } = await res.json();
      setConversations(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // 監聽新對話建立事件，自動刷新列表
  useEffect(() => {
    function handleConversationCreated() {
      setTimeout(loadConversations, 500);
    }

    window.addEventListener("conversation-created", handleConversationCreated);
    return () =>
      window.removeEventListener(
        "conversation-created",
        handleConversationCreated,
      );
  }, [loadConversations]);

  // 監聽串流狀態事件 — 顯示/隱藏轉圈動畫（支援多 session 同時串流）
  useEffect(() => {
    function handleStreamingState(e: Event) {
      const detail = (e as CustomEvent).detail as {
        threadId: string | null;
        isRunning: boolean;
      };
      if (!detail.threadId) return;
      setStreamingThreadIds((prev) => {
        const next = new Set(prev);
        if (detail.isRunning) {
          next.add(detail.threadId!);
        } else {
          next.delete(detail.threadId!);
        }
        return next;
      });
    }

    window.addEventListener("streaming-state-changed", handleStreamingState);
    return () =>
      window.removeEventListener(
        "streaming-state-changed",
        handleStreamingState,
      );
  }, []);

  // 回退機制：每 2 秒檢查 localStorage 的串流標記
  // 如果標記已被移除（串流結束）但 spinner 仍在轉，自動清除
  // 這解決了 useChat 切換 store 時 onFinish/onError 可能不觸發的邊界情況
  useEffect(() => {
    if (streamingThreadIds.size === 0) return;

    const interval = setInterval(() => {
      setStreamingThreadIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const tid of prev) {
          if (!window.localStorage.getItem(`stream-executing-${tid}`)) {
            next.delete(tid);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [streamingThreadIds.size]);

  function handleNewChat() {
    // 先發送事件讓 NexusMindChat 重置狀態
    window.dispatchEvent(new CustomEvent("new-chat-requested"));

    if (pathname === "/chat") {
      // 已在新對話頁面，只需重置狀態（event 已發送）
      window.dispatchEvent(new CustomEvent("conversation-created"));
    } else {
      // 在其他頁面或 /chat/[id]，必須用 Next.js router 導航
      // history.pushState 不會觸發 Next.js 頁面重新渲染
      router.push("/chat");
    }
    closeMobileSidebar();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleDelete(convId: string) {
    setDeletingId(convId);
    const activeId = pathname.startsWith("/chat/")
      ? pathname.split("/chat/")[1]
      : undefined;
    const currentList = conversations;

    try {
      const res = await fetch(`/api/conversations/${convId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const nextList = currentList.filter((c) => c.id !== convId);
        setConversations(nextList);

        // 刪除當前活躍對話（含列表清空）：一律回新對話頁
        // 先發事件清除狀態，再導航，避免 race condition 導致重新載入已刪除的對話
        if (activeId === convId || nextList.length === 0) {
          window.dispatchEvent(new CustomEvent("new-chat-requested"));
          router.replace("/chat");
        }
      }
    } catch {
      await loadConversations();
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  const activeId = pathname.startsWith("/chat/")
    ? pathname.split("/chat/")[1]
    : undefined;

  return (
    <aside className="h-full bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
      {/* 標題列 + 折疊按鈕 */}
      <div className="h-14 px-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        {!collapsed && (
          <h1 className="text-lg font-bold text-foreground pl-1 whitespace-nowrap">
            NexusMind
          </h1>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={`p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 ${collapsed ? "mx-auto" : ""}`}
            title={collapsed ? "展開側欄" : "折疊側欄"}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-5 h-5" />
            ) : (
              <PanelLeftClose className="w-5 h-5" />
            )}
          </button>
        )}
      </div>

      {/* 新對話按鈕 */}
      <div className="p-3">
        <button
          onClick={handleNewChat}
          className={`flex items-center gap-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${collapsed ? "w-10 h-10 justify-center mx-auto" : "w-full px-3 py-2"
            }`}
          title={collapsed ? "新對話" : undefined}
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">新對話</span>}
        </button>
      </div>

      {/* 對話列表 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 space-y-1">
        {collapsed ? (
          conversations.slice(0, 12).map((conv) => (
            <Link
              key={conv.id}
              href={`/chat/${conv.id}`}
              className={`relative flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-colors ${activeId === conv.id
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "hover:bg-gray-100 dark:hover:bg-gray-800 text-foreground"
                }`}
              title={conv.title}
            >
              {streamingThreadIds.has(conv.id) ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              ) : (
                <MessageSquare className="w-4 h-4" />
              )}
            </Link>
          ))
        ) : (
          <>
            {loading ? (
              <p className="text-sm text-gray-400 text-center py-4">
                載入中...
              </p>
            ) : conversations.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">尚無對話</p>
            ) : (
              conversations.map((conv) => (
                <div key={conv.id} className="group relative">
                  <Link
                    href={`/chat/${conv.id}`}
                    onClick={closeMobileSidebar}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors pr-8 ${activeId === conv.id
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800 text-foreground"
                      }`}
                  >
                    {streamingThreadIds.has(conv.id) ? (
                      <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin text-blue-500" />
                    ) : (
                      <MessageSquare className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span className="truncate">{conv.title}</span>
                  </Link>

                  {confirmDeleteId === conv.id ? (
                    <div className="absolute right-0 top-0 flex items-center h-full gap-0.5 pr-1">
                      <button
                        onClick={() => handleDelete(conv.id)}
                        disabled={deletingId === conv.id}
                        className="p-1 text-xs text-red-600 bg-red-50 dark:bg-red-900/30 rounded hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                        title="確認刪除"
                      >
                        {deletingId === conv.id ? "..." : "✓"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="p-1 text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        title="取消"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setConfirmDeleteId(conv.id);
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all rounded"
                      title="刪除對話"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* 底部導航 */}
      <div
        className={`border-t border-gray-200 dark:border-gray-700 space-y-1 ${collapsed ? "p-2" : "p-3"}`}
      >
        <Link
          href="/knowledge"
          prefetch={true}
          onClick={closeMobileSidebar}
          className={`flex items-center rounded-lg transition-colors ${collapsed
            ? "w-10 h-10 justify-center mx-auto"
            : "gap-2 px-3 py-2 text-sm"
            } ${pathname === "/knowledge"
              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "hover:bg-gray-100 dark:hover:bg-gray-800 text-foreground"
            }`}
          title={collapsed ? "知識庫" : undefined}
        >
          <BookOpen className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">知識庫</span>}
        </Link>
        <Link
          href="/diagram"
          prefetch={true}
          onClick={closeMobileSidebar}
          className={`flex items-center rounded-lg transition-colors ${collapsed
            ? "w-10 h-10 justify-center mx-auto"
            : "gap-2 px-3 py-2 text-sm"
            } ${pathname === "/diagram"
              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "hover:bg-gray-100 dark:hover:bg-gray-800 text-foreground"
            }`}
          title={collapsed ? "圖表" : undefined}
        >
          <GitBranch className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">圖表</span>}
        </Link>
        <Link
          href="/settings"
          prefetch={true}
          onClick={closeMobileSidebar}
          className={`flex items-center rounded-lg transition-colors ${collapsed
            ? "w-10 h-10 justify-center mx-auto"
            : "gap-2 px-3 py-2 text-sm"
            } ${pathname === "/settings"
              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "hover:bg-gray-100 dark:hover:bg-gray-800 text-foreground"
            }`}
          title={collapsed ? "設定" : undefined}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">設定</span>}
        </Link>
        <button
          onClick={handleLogout}
          className={`flex items-center rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 ${collapsed
            ? "w-10 h-10 justify-center mx-auto"
            : "w-full gap-2 px-3 py-2 text-sm"
            }`}
          title={collapsed ? "登出" : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">登出</span>}
        </button>
      </div>
    </aside>
  );
}
