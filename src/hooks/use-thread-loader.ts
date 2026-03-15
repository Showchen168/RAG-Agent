import { useEffect, useState, useCallback } from "react";

export interface UseThreadLoaderOptions<T = unknown> {
  chatStoreId: string;
  loadThread: (threadId: string) => Promise<T[]>;
  setMessages: (messages: T[]) => void;
}

export interface UseThreadLoaderResult {
  isLoadingMessages: boolean;
  /** 最近一次成功載入的 chatStoreId；載入中或失敗時為 null */
  loadedChatStoreId: string | null;
  /** 最近一次載入錯誤訊息；成功或載入中時為 null */
  loadError: string | null;
  /** 手動重新載入目前對話 */
  retryLoad: () => void;
}

/**
 * 管理對話訊息載入的 hook
 *
 * 負責：
 * - 當 chatStoreId 為有效 thread id 時自動呼叫 loadThread
 * - 追蹤載入狀態、成功/失敗狀態
 * - 防止 stale response（快速切換對話時忽略慢的回應）
 * - 提供手動 retry 機制
 */
export function useThreadLoader<T = unknown>({
  chatStoreId,
  loadThread,
  setMessages,
}: UseThreadLoaderOptions<T>): UseThreadLoaderResult {
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedChatStoreId, setLoadedChatStoreId] = useState<string | null>(null);
  // 用於強制 retry 時觸發 effect 重新執行
  const [loadVersion, setLoadVersion] = useState(0);

  useEffect(() => {
    if (chatStoreId === "new-chat" || chatStoreId.startsWith("_new_")) {
      setMessages([]);
      setIsLoadingMessages(false);
      setLoadError(null);
      setLoadedChatStoreId("new-chat");
      return;
    }

    let cancelled = false;
    setIsLoadingMessages(true);
    setLoadError(null);
    setLoadedChatStoreId(null);

    loadThread(chatStoreId)
      .then((msgs) => {
        if (cancelled) return;
        setMessages(msgs);
        setIsLoadingMessages(false);
        setLoadedChatStoreId(chatStoreId);
      })
      .catch((err) => {
        if (cancelled) return;
        setIsLoadingMessages(false);
        setLoadError(err instanceof Error ? err.message : String(err));
        // 不設定 loadedChatStoreId — 載入失敗不應被視為「已成功載入」
      });

    return () => {
      cancelled = true;
    };
  }, [chatStoreId, loadThread, setMessages, loadVersion]);

  const retryLoad = useCallback(() => {
    setLoadVersion((v) => v + 1);
  }, []);

  return {
    isLoadingMessages,
    loadedChatStoreId,
    loadError,
    retryLoad,
  };
}
