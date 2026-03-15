"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { AIModel } from "@/types";
import { generateUUID } from "@/lib/uuid";

// ─── Types ──────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

type ChatMode = "chat" | "canvas";

interface ChatSessionState {
  messages: ChatMessage[];
  isLoading: boolean;
  conversationId: string | undefined;
  model: AIModel;
  input: string;
  authStatus: "checking" | "ok" | "error";
  historyLoading: boolean;
  suggestions: string[];
  mode: ChatMode;
}

interface ChatSessionActions {
  sendMessage: (text: string) => Promise<void>;
  stopGeneration: () => void;
  setModel: (model: AIModel) => void;
  setInput: (input: string) => void;
  resetSession: () => void;
  loadConversation: (conversationId: string) => Promise<void>;
  setMode: (mode: ChatMode) => void;
}

type ChatSessionContextValue = ChatSessionState & ChatSessionActions;

// ─── Context ────────────────────────────────────────────
const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);

export function useChatSession(): ChatSessionContextValue {
  const ctx = useContext(ChatSessionContext);
  if (!ctx)
    throw new Error("useChatSession must be used within ChatSessionProvider");
  return ctx;
}

// ─── Provider ───────────────────────────────────────────
interface ChatSessionProviderProps {
  children: ReactNode;
}

export function ChatSessionProvider({ children }: ChatSessionProviderProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState<AIModel>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nexusmind_model");
      if (saved === "gemini-flash" || saved === "gemini-pro") {
        return saved as AIModel;
      }
    }
    return "gemini-flash";
  });
  const [input, setInput] = useState("");
  const [authStatus, setAuthStatus] = useState<"checking" | "ok" | "error">(
    "checking",
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const conversationIdRef = useRef<string | undefined>(undefined);
  const [conversationId, setConversationId] = useState<string | undefined>(
    undefined,
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  // 儲存偏好模型，讓 resetSession 可以還原
  const preferredModelRef = useRef<AIModel>(model);

  const [mode, setMode] = useState<ChatMode>("chat");
  const handleSetModel = useCallback((newModel: AIModel) => {
    setModel(newModel);
    if (typeof window !== "undefined") {
      localStorage.setItem("nexusmind_model", newModel);
    }
    preferredModelRef.current = newModel;
  }, []);

  // 固定 supabase client 參考，避免每次 render 重建造成 useEffect 無限觸發
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // ─── Auth 驗證 + 偏好模型 ─────────────────────────
  useEffect(() => {
    let ignore = false;
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (ignore) return;
      if (session) {
        setAuthStatus("ok");
        // User request: Remove "Default AI Model" override. Let each chat manage its own model.
        // We no longer fetch or set profile.preferred_model here.
      } else {
        const {
          data: { session: refreshed },
        } = await supabase.auth.refreshSession();
        if (!ignore) setAuthStatus(refreshed ? "ok" : "error");
      }
    }
    checkAuth();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 載入 AI 生成的建議（含 sessionStorage 快取，避免重複呼叫 AI） ───
  useEffect(() => {
    let ignore = false;
    const CACHE_KEY = "nexusmind:knowledge-suggestions";
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分鐘快取

    async function loadSuggestions() {
      // 優先使用 sessionStorage 快取
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data: cachedData, ts } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL_MS && Array.isArray(cachedData) && cachedData.length > 0) {
            if (!ignore) setSuggestions(cachedData);
            return;
          }
        }
      } catch {
        // 快取讀取失敗，繼續呼叫 API
      }

      try {
        const res = await fetch("/api/knowledge/suggestions");
        if (ignore) return;
        if (res.ok) {
          const { data } = await res.json();
          if (!ignore && Array.isArray(data) && data.length > 0) {
            setSuggestions(data);
            try {
              sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
            } catch {
              // sessionStorage 寫入失敗不影響功能
            }
          }
        }
      } catch {
        // 載入失敗不影響核心功能
      }
    }
    loadSuggestions();
    return () => {
      ignore = true;
    };
  }, []);

  // ─── 監聽「新對話」事件 ────────────────────────────
  useEffect(() => {
    function handleNewChat() {
      setMessages([]);
      setInput("");
      setIsLoading(false);
      conversationIdRef.current = undefined;
      setConversationId(undefined);
    }
    window.addEventListener("new-chat-requested", handleNewChat);
    return () =>
      window.removeEventListener("new-chat-requested", handleNewChat);
  }, []);

  // ─── 載入歷史對話 ──────────────────────────────────
  const loadConversation = useCallback(
    async (convId: string) => {
      // 如果已經載入同一個對話，不重複載入
      if (conversationIdRef.current === convId && messages.length > 0) return;

      conversationIdRef.current = convId;
      setConversationId(convId);
      setHistoryLoading(true);

      try {
        // 1. 載入對話詳細資訊 (取得 Model 設定)
        const convRes = await fetch(`/api/conversations/${convId}`);
        if (convRes.ok) {
          const { data } = await convRes.json();
          if (data && data.model) {
            setModel(data.model as AIModel);
          }
        }

        // 2. 載入訊息
        const res = await fetch(`/api/conversations/${convId}/messages`);
        if (res.ok) {
          const { data } = await res.json();
          if (data && data.length > 0) {
            const loaded: ChatMessage[] = data
              .filter(
                (m: { role: string }) =>
                  m.role === "user" || m.role === "assistant",
              )
              .map(
                (m: {
                  id: string;
                  role: "user" | "assistant";
                  content: string;
                }) => ({
                  id: m.id,
                  role: m.role,
                  content: m.content,
                }),
              );
            setMessages(loaded);
          } else {
            setMessages([]);
          }
        }
      } catch {
        // 載入失敗不阻擋使用
      } finally {
        setHistoryLoading(false);
      }
    },
    [messages.length],
  );

  // ─── 重置 session（還原偏好模型） ──────────────────
  const resetSession = useCallback(() => {
    setMessages([]);
    setInput("");
    setIsLoading(false);
    setModel(preferredModelRef.current);
    conversationIdRef.current = undefined;
    setConversationId(undefined);
  }, []);

  // ─── 中止生成 ────────────────────────────────────
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  // ─── 核心送出邏輯（不依賴 component 生命週期） ──────
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text || isLoading) return;

      // 建立新的 AbortController
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const userMessage: ChatMessage = {
        id: generateUUID(),
        role: "user",
        content: text,
      };

      setInput("");
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      const assistantId = generateUUID();
      let activeConversationId = conversationIdRef.current;

      try {
        // 自動建立對話（新對話第一次送出）
        if (!activeConversationId) {
          const convRes = await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: text.slice(0, 30),
              model,
            }),
          });

          if (convRes.ok) {
            const { data } = await convRes.json();
            activeConversationId = data.id as string;
            conversationIdRef.current = activeConversationId;
            setConversationId(activeConversationId);

            // 更新 URL（不觸發 Next.js navigation，避免 component remount）
            window.history.replaceState(
              null,
              "",
              `/chat/${activeConversationId}`,
            );

            // 通知 sidebar 刷新
            window.dispatchEvent(new CustomEvent("conversation-created"));
          }
        }

        // 取得最新 messages（包含剛加入的 userMessage）
        const allMessages = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: allMessages,
            model,
            conversationId: activeConversationId,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          let accumulated = "";
          let inserted = false;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            accumulated += decoder.decode(value, { stream: true });
            const current = accumulated;
            if (!inserted) {
              setMessages((prev) => [
                ...prev,
                { id: assistantId, role: "assistant", content: current },
              ]);
              inserted = true;
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: current } : m,
                ),
              );
            }
          }
        }
      } catch (error) {
        // 使用者中止不顯示錯誤訊息
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (error instanceof Error && /aborted/i.test(error.message)) return;

        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: `Error: ${errorMsg}` },
        ]);
      } finally {
        abortControllerRef.current = null;
        setIsLoading(false);
      }
    },
    [isLoading, messages, model],
  );

  const value: ChatSessionContextValue = {
    messages,
    isLoading,
    conversationId,
    model,
    input,
    authStatus,
    historyLoading,
    suggestions,
    mode,
    sendMessage,
    stopGeneration,
    setModel: handleSetModel,
    setInput,
    resetSession,
    loadConversation,
    setMode,
  };

  return (
    <ChatSessionContext.Provider value={value}>
      {children}
    </ChatSessionContext.Provider>
  );
}
