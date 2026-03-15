"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Send,
  Loader2,
  Copy,
  Check,
  GitBranch,
  PenTool,
  PanelRightClose,
  Square,
  ImagePlus,
} from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { createClient } from "@/lib/supabase/client";
import { useThreadList } from "@/hooks/use-thread-list";
import { useThreadLoader } from "@/hooks/use-thread-loader";
import { AssistantMessageRenderer } from "@/components/crayon/assistant-message-renderer";
import { ChatThinkingProgress } from "@/components/chat/chat-thinking-progress";

import type { AIModel } from "@/types";
import { PromptLibrary } from "@/components/chat/prompt-library";
import { DEFAULT_PERSONA, type Persona } from "@/lib/crayon/prompts";

import { DocumentViewer } from "@/components/knowledge/document-viewer";
import { useChatSession } from "@/components/chat/chat-session-context";
import { CanvasEditor } from "@/components/canvas/canvas-editor";
import { useImageAttach } from "@/hooks/use-image-attach";
import { ImagePreviewBar } from "@/components/chat/image-preview-bar";
import { generateUUID } from "@/lib/uuid";
import { useSkills, type SimpleMessage } from "@/hooks/use-skills";
import { useSkillLazyLoading } from "@/hooks/use-skill-lazy-loading";
import { SkillLoadingIndicator } from "@/components/chat/skill-loading-indicator";
import { SkillExecutionProgress, type SkillExecutionState } from "@/components/chat/skill-execution-progress";
import { AttachmentCard } from "@/components/chat/attachment-card";
import type {
  Skill,
  GeneratedSkillConfig,
  LoadedFileResult,
} from "@/types/skills";
import { useCapsulePersonas } from "@/hooks/use-capsule-personas";
import {
  AssistantSkillSelector,
  SelectedItemBadge,
  getPersonaIconText,
  getSkillIcon,
  type SelectedItem,
} from "@/components/chat/assistant-skill-selector";
import { PersonaDetailPanel } from "@/components/chat/persona-detail-panel";
import { SkillGeneratorMenu } from "@/components/chat/skill-generator-menu";
import { SkillPreviewDialog } from "@/components/chat/skill-preview-dialog";
import { parseJsonSkillConfig } from "@/lib/skills/skill-generator";

interface NexusMindChatProps {
  conversationId?: string;
}

interface TextareaScrollHintState {
  showTop: boolean;
  showBottom: boolean;
}

function isAbortLikeError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error) {
    return error.name === "AbortError" || /aborted/i.test(error.message);
  }
  return false;
}

function isNetworkLikeError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    return /network error|failed to fetch|load failed|network request failed/i.test(
      error.message,
    );
  }
  return false;
}

// parseAssistantResponseParts removed — Crayon JSON 解析不再需要

/** 使用者頭像 — 暖色漸層 */
function UserAvatar() {
  return (
    <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/25">
      <svg
        className="w-4 h-4 text-white"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M20 21a8 8 0 0 0-16 0" />
      </svg>
    </div>
  );
}

/** AI 機器人頭像 — 漸層 + 呼吸動畫 */
function BotAvatar({
  size = "md",
  animate = false,
}: {
  size?: "sm" | "md";
  animate?: boolean;
}) {
  const dimension = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <div
      className={`${dimension} rounded-2xl bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-400 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/25 ${animate ? "animate-pulse" : ""}`}
    >
      <svg
        className={`${iconSize} text-white`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 8V4H8" />
        <rect x="4" y="8" width="16" height="12" rx="2" />
        <path d="M2 14h2" />
        <path d="M20 14h2" />
        <path d="M9 13v2" />
        <path d="M15 13v2" />
      </svg>
    </div>
  );
}

/** 複製按鈕 — 始終可見，點擊後 2 秒內顯示「已複製」 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-green-500" />
          <span className="text-green-500">已複製</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          <span>複製</span>
        </>
      )}
    </button>
  );
}

/** 分支按鈕 — 從此訊息分叉出新對話 */
function ForkButton({
  conversationId,
  messageIndex,
}: {
  conversationId: string;
  messageIndex: number;
}) {
  const [forking, setForking] = useState(false);

  const handleFork = useCallback(async () => {
    if (forking) return;
    setForking(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageIndex }),
      });
      if (res.ok) {
        const { conversationId: newId } = await res.json();
        window.history.pushState(null, "", `/chat/${newId}`);
        window.dispatchEvent(new CustomEvent("conversation-created"));
        window.location.reload();
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("[Fork] Failed:", errData);
      }
    } catch (e) {
      console.error("[Fork] Error:", e);
    } finally {
      setForking(false);
    }
  }, [conversationId, messageIndex, forking]);

  return (
    <button
      type="button"
      onClick={handleFork}
      disabled={forking}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
    >
      {forking ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <GitBranch className="w-3.5 h-3.5" />
      )}
      <span>分支</span>
    </button>
  );
}

/** 從 UIMessage parts 提取純文字（用於複製） */
function extractPlainText(parts: unknown): string {
  if (typeof parts === "string") return parts;
  if (!Array.isArray(parts)) return String(parts ?? "");
  return parts
    .filter((p: { type?: string; text?: string }) => p?.type === "text" && typeof p?.text === "string")
    .map((p: { text: string }) => p.text)
    .join("\n\n");
}

/** 從 UIMessage 提取助理回覆文字 */
function serializeAssistantMessageContent(msg: UIMessage): string {
  if (!msg.parts) return "";
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text" && "text" in p)
    .map((p) => p.text)
    .join("\n\n");
}

interface AssistantCacheEntry {
  userText: string;
  assistantContent: string;
  savedAt: number;
}

function getAssistantCacheKey(threadId: string): string {
  return `nexusmind-assistant-cache:${threadId}`;
}

function readAssistantCache(threadId: string): AssistantCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(getAssistantCacheKey(threadId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AssistantCacheEntry;
    if (!parsed?.assistantContent?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeAssistantCache(
  threadId: string,
  entry: AssistantCacheEntry,
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      getAssistantCacheKey(threadId),
      JSON.stringify(entry),
    );
  } catch {
    // ignore cache write errors
  }
}

const globalCanvasCache = new Map<string, { content: string; open: boolean }>();
const globalSelectedItemCache = new Map<string, SelectedItem | null>();

export function NexusMindChat({ conversationId }: NexusMindChatProps) {
  // Skill execution progress — 獨立於 useChat，不會被持久化到 DB
  const [skillExecution, setSkillExecution] = useState<SkillExecutionState | null>(null);
  const skillExecutionRef = useRef<SkillExecutionState | null>(null);
  // Chat thinking progress — 最小顯示時間控制
  const [chatThinkingVisible, setChatThinkingVisible] = useState(false);
  const chatThinkingStartRef = useRef<number>(0);
  // Document Viewer State
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerTitle, setViewerTitle] = useState("");
  const [viewerDocId, setViewerDocId] = useState<string | undefined>(undefined);
  const [viewerPage, setViewerPage] = useState(1);

  // Ref 鏡像 viewerDocId — 確保 useThreadManager callback 中拿到最新值（避免 stale closure）
  const viewerDocIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    viewerDocIdRef.current = viewerDocId;
  }, [viewerDocId]);

  const searchParams = useSearchParams();
  const initialDocId = searchParams?.get("docId");
  const initialRelatedDocIds = searchParams?.get("relatedDocIds");

  // 多文件 RAG：主文件 + 關聯文件 ID 陣列（來自知識圖譜）
  const [ragDocIds, setRagDocIds] = useState<string[] | undefined>(undefined);
  const ragDocIdsRef = useRef<string[] | undefined>(undefined);
  useEffect(() => {
    ragDocIdsRef.current = ragDocIds;
  }, [ragDocIds]);

  // Effect to handle initial docId + relatedDocIds from URL
  useEffect(() => {
    if (initialDocId) {
      setViewerDocId(initialDocId);
      // 組合 docIds 陣列：主文件 + 關聯文件（去重）
      const ids = new Set([initialDocId]);
      if (initialRelatedDocIds) {
        for (const id of initialRelatedDocIds.split(",")) {
          if (id.trim()) ids.add(id.trim());
        }
      }
      setRagDocIds([...ids]);
    }
  }, [initialDocId, initialRelatedDocIds]);

  // Listen for citation clicks
  useEffect(() => {
    const handleCitationClick = (
      e: CustomEvent<{ title: string; page?: number }>,
    ) => {
      setViewerTitle(e.detail.title);
      setViewerDocId(undefined); // Reset ID if title is used
      setViewerPage(e.detail.page || 1);
      setViewerOpen(true);
    };

    window.addEventListener(
      "citation-clicked",
      handleCitationClick as EventListener,
    );
    return () =>
      window.removeEventListener(
        "citation-clicked",
        handleCitationClick as EventListener,
      );
  }, []);
  const pathname = usePathname();
  // 防止刪除對話後 stale pathname 導致 URL sync effect 重新選取已刪除的對話
  const skipUrlSyncRef = useRef(false);
  const pathnameConversationId = useMemo(() => {
    const match = pathname.match(/^\/chat\/([^/?#]+)/);
    return match?.[1];
  }, [pathname]);
  const { mode, setMode } = useChatSession();
  const [showCanvas, setShowCanvas] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("nexusmind-canvas-open") === "true";
    }
    return false;
  });
  const [canvasInitialContent, setCanvasInitialContent] = useState<
    string | undefined
  >(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("nexusmind-canvas-content") || undefined;
    }
    return undefined;
  });
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // 同步 Canvas 狀態到 sessionStorage，切頁後保持
  useEffect(() => {
    sessionStorage.setItem("nexusmind-canvas-open", String(showCanvas));
  }, [showCanvas]);
  useEffect(() => {
    if (canvasInitialContent) {
      sessionStorage.setItem("nexusmind-canvas-content", canvasInitialContent);
    }
  }, [canvasInitialContent]);

  // 固定 supabase client 參考，避免每次 render 重建造成 useEffect 無限觸發
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [model, setModel] = useState<AIModel>("gemini-flash");
  const modelRef = useRef<AIModel>(model);
  modelRef.current = model;
  const modelLoadedRef = useRef(false);

  const [selectedPersona, setSelectedPersona] =
    useState<Persona>(DEFAULT_PERSONA);
  const selectedPersonaRef = useRef<Persona>(selectedPersona);
  selectedPersonaRef.current = selectedPersona;

  // 膠囊 AI 角色系統（消費 prompt_templates，與設定頁同源）
  const {
    personas: capsulePersonas,
    selectedPersona: capsuleSelectedPersona,
    isLoading: capsuleLoading,
    selectPersona: selectCapsulePersona,
    removePersona,
  } = useCapsulePersonas();
  // 用於 thread-list-manager 的 createThread 讀取 extra
  const conversationExtraRef = useRef<Record<string, unknown> | null>(null);

  // ─── 統一的選中項目（助理 or 技能） ───
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const selectedItemRef = useRef(selectedItem);
  selectedItemRef.current = selectedItem;

  // ─── 選擇項持久化（sessionStorage） ─────────────────────
  const SELECTED_ITEM_KEY = "nexusmind:selected_item" as const;
  const hasRestoredRef = useRef(false);
  const pendingRestoreRef = useRef<{ type: "persona" | "skill"; id: string } | null>(null);
  /** 追蹤當前活躍對話 ID（供 persona 持久化使用，在 threadList 宣告前即可用） */
  const activeConversationIdRef = useRef<string | null>(pathnameConversationId ?? null);

  // Mount 時從 localStorage（對話專屬）或 sessionStorage 讀取 pending restore
  useEffect(() => {
    // 優先：對話專屬 localStorage（頁面刷新後仍可恢復正確角色/技能）
    const convId = pathnameConversationId;
    if (convId) {
      try {
        const storedPersonaId = localStorage.getItem(`nexusmind:persona:${convId}`);
        if (storedPersonaId) {
          pendingRestoreRef.current = { type: "persona", id: storedPersonaId };
          return;
        }
        const storedSkillId = localStorage.getItem(`nexusmind:skill:${convId}`);
        if (storedSkillId) {
          pendingRestoreRef.current = { type: "skill", id: storedSkillId };
          return;
        }
      } catch { /* ignore */ }
    }
    // Fallback：sessionStorage（非對話專屬，向後相容）
    try {
      const raw = sessionStorage.getItem(SELECTED_ITEM_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { type: "persona" | "skill"; id: string };
      if (parsed.type === "persona" || parsed.type === "skill") {
        pendingRestoreRef.current = parsed;
      }
    } catch {
      // ignore malformed data
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同步膠囊 persona 手動選擇到 selectedItem（不含初始自動選中）
  const hasUserInteracted = useRef(false);
  useEffect(() => {
    if (!hasUserInteracted.current) return;
    if (capsuleSelectedPersona) {
      setSelectedItem({ type: "persona", persona: capsuleSelectedPersona });
    } else {
      setSelectedItem((prev) => (prev?.type === "skill" ? prev : null));
    }
  }, [capsuleSelectedPersona]);

  // ─── 恢復 persona 選擇（capsule 首次載入完成後） ────────
  useEffect(() => {
    if (hasRestoredRef.current) return;
    if (capsuleLoading) return;
    const pending = pendingRestoreRef.current;
    if (!pending || pending.type !== "persona") return;
    if (capsulePersonas.length === 0) return;

    const persona = capsulePersonas.find((p) => p.id === pending.id);
    if (persona) {
      hasRestoredRef.current = true;
      hasUserInteracted.current = true;
      selectCapsulePersona(pending.id);
      setSelectedItem({ type: "persona", persona });
      setSelectedPersona(persona);
      pendingRestoreRef.current = null;
    }
  }, [capsuleLoading, capsulePersonas, selectCapsulePersona]);

  const handleSelectPersonaUnified = useCallback(
    (personaId: string) => {
      hasUserInteracted.current = true;
      selectCapsulePersona(personaId);
      const persona = capsulePersonas.find((p) => p.id === personaId);
      if (persona) {
        setSelectedItem({ type: "persona", persona });
        // 同步到 selectedPersona（影響 AI system prompt）
        setSelectedPersona(persona);
        // 持久化到 sessionStorage（向後相容）
        try {
          sessionStorage.setItem(SELECTED_ITEM_KEY, JSON.stringify({ type: "persona", id: personaId }));
        } catch { /* ignore */ }
        // 對話專屬持久化到 localStorage（頁面刷新後可恢復）
        const convId = activeConversationIdRef.current;
        if (convId) {
          try { localStorage.setItem(`nexusmind:persona:${convId}`, personaId); } catch { /* ignore */ }
        }
      }
    },
    [selectCapsulePersona, capsulePersonas, SELECTED_ITEM_KEY],
  );

  const handleSelectSkillUnified = useCallback(
    (skill: Skill) => {
      hasUserInteracted.current = true;
      selectCapsulePersona("");
      setSelectedItem({ type: "skill", skill });
      // 持久化到 sessionStorage（向後相容）
      try {
        sessionStorage.setItem(SELECTED_ITEM_KEY, JSON.stringify({ type: "skill", id: skill.id }));
      } catch { /* ignore */ }
      // 對話專屬持久化到 localStorage（頁面刷新 / 重新登入後可恢復）
      const convId = activeConversationIdRef.current;
      if (convId) {
        try { localStorage.setItem(`nexusmind:skill:${convId}`, skill.id); } catch { /* ignore */ }
      }
    },
    [selectCapsulePersona, SELECTED_ITEM_KEY],
  );

  const handleDeselectItem = useCallback(() => {
    hasUserInteracted.current = true;
    selectCapsulePersona("");
    setSelectedItem(null);
    setSelectedPersona(DEFAULT_PERSONA);
    // 清除持久化
    try { sessionStorage.removeItem(SELECTED_ITEM_KEY); } catch { /* ignore */ }
    const convId = activeConversationIdRef.current;
    if (convId) {
      try { localStorage.removeItem(`nexusmind:persona:${convId}`); } catch { /* ignore */ }
      try { localStorage.removeItem(`nexusmind:skill:${convId}`); } catch { /* ignore */ }
    }
  }, [selectCapsulePersona, SELECTED_ITEM_KEY]);

  // PromptLibrary 選擇時雙向同步到膠囊
  const handlePromptLibrarySelect = useCallback(
    (persona: Persona) => {
      setSelectedPersona(persona);
      const inCapsule = capsulePersonas.find((p) => p.id === persona.id);
      if (inCapsule) {
        selectCapsulePersona(persona.id);
        hasUserInteracted.current = true;
        setSelectedItem({ type: "persona", persona: inCapsule });
      } else {
        selectCapsulePersona("");
        setSelectedItem(null);
      }
    },
    [capsulePersonas, selectCapsulePersona],
  );

  const [input, setInput] = useState("");
  const [newChatTextareaHint, setNewChatTextareaHint] =
    useState<TextareaScrollHintState>({ showTop: false, showBottom: false });
  const [bottomTextareaHint, setBottomTextareaHint] =
    useState<TextareaScrollHintState>({ showTop: false, showBottom: false });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const newChatInputRef = useRef<HTMLTextAreaElement>(null);
  const bottomInputRef = useRef<HTMLTextAreaElement>(null);
  const submitLockRef = useRef(false);
  const threadMessagesCacheRef = useRef<Map<string, UIMessage[]>>(new Map());
  const lastBackupPersistSignatureRef = useRef<string>("");

  const calcTextareaHintState = useCallback(
    (el: HTMLTextAreaElement | null): TextareaScrollHintState => {
      if (!el) return { showTop: false, showBottom: false };
      const hasOverflow = el.scrollHeight - el.clientHeight > 2;
      if (!hasOverflow) return { showTop: false, showBottom: false };
      const showTop = el.scrollTop > 2;
      const showBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
      return { showTop, showBottom };
    },
    [],
  );

  const syncTextareaHint = useCallback(
    (el: HTMLTextAreaElement | null) => {
      const hintState = calcTextareaHintState(el);
      if (el === newChatInputRef.current) {
        setNewChatTextareaHint((prev) =>
          prev.showTop === hintState.showTop &&
            prev.showBottom === hintState.showBottom
            ? prev
            : hintState,
        );
        return;
      }
      if (el === bottomInputRef.current) {
        setBottomTextareaHint((prev) =>
          prev.showTop === hintState.showTop &&
            prev.showBottom === hintState.showBottom
            ? prev
            : hintState,
        );
      }
    },
    [calcTextareaHintState],
  );

  const resizeTextarea = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
      syncTextareaHint(el);
    },
    [syncTextareaHint],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      resizeTextarea(e.currentTarget);
    },
    [resizeTextarea],
  );

  // IME 組合輸入追蹤（修正中文選字時 Enter 誤送出問題）
  const isComposingRef = useRef(false);
  const compositionJustEndedRef = useRef(false);
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
    compositionJustEndedRef.current = false;
  }, []);
  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    // 部分瀏覽器/IME 在 compositionEnd 後立刻觸發 keydown Enter，
    // 設置短暫延遲防止誤送出。50ms 足以攔截幽靈 Enter，
    // 但不會誤擋用戶確認選字後的正常 Enter 送出操作
    compositionJustEndedRef.current = true;
    setTimeout(() => {
      compositionJustEndedRef.current = false;
    }, 50);
  }, []);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const nativeEvent = e.nativeEvent as KeyboardEvent;
      if (
        isComposingRef.current ||
        nativeEvent.isComposing ||
        nativeEvent.keyCode === 229 ||
        compositionJustEndedRef.current
      ) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const form = e.currentTarget.form;
        form?.requestSubmit();
      }
    },
    [],
  );

  const handleInputScroll = useCallback(
    (e: React.UIEvent<HTMLTextAreaElement>) => {
      syncTextareaHint(e.currentTarget);
    },
    [syncTextareaHint],
  );

  useEffect(() => {
    syncTextareaHint(newChatInputRef.current);
    syncTextareaHint(bottomInputRef.current);
  }, [input, syncTextareaHint]);

  // 載入使用者偏好模型
  useEffect(() => {
    let ignore = false;
    async function loadPreferred() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (ignore || !session) {
        modelLoadedRef.current = true;
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("preferred_model")
        .eq("id", session.user.id)
        .single();
      if (!ignore && profile?.preferred_model) {
        setModel(profile.preferred_model as AIModel);
      }
      if (!ignore) {
        modelLoadedRef.current = true;
      }
    }
    loadPreferred();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 監聽 Sidebar 的新對話請求，清空選中的助手與技能
  useEffect(() => {
    const handleNewChatRequested = () => {
      selectCapsulePersona("");
      setSelectedItem(null);
      setSelectedPersona(DEFAULT_PERSONA);
    };
    window.addEventListener("new-chat-requested", handleNewChatRequested);
    return () => {
      window.removeEventListener("new-chat-requested", handleNewChatRequested);
    };
  }, [selectCapsulePersona]);

  // 導航函式
  const onNavigate = useCallback(
    (path: string) => {
      if (pathname !== path) {
        window.history.pushState(null, "", path);
        window.dispatchEvent(new CustomEvent("conversation-created"));
      }
    },
    [pathname],
  );

  const getConversationExtra = useCallback(
    () => conversationExtraRef.current,
    [],
  );
  const threadList = useThreadList({
    onNavigate,
    getConversationExtra,
  });

  // 同步 URL / prop conversationId → selectedThreadId
  // 優先使用 pathname（可反映 Link 導航），fallback 到 server prop。
  useEffect(() => {
    // 刪除對話後 pathname 尚未更新前，跳過 URL sync 避免重新選取已刪除的對話
    if (skipUrlSyncRef.current) {
      if (!pathnameConversationId) {
        // pathname 已更新為 /chat，清除 flag
        skipUrlSyncRef.current = false;
      }
      return;
    }

    // 新對話串流期間跳過 URL sync — selectThread 會在 onFinish 中呼叫
    if (pendingThreadIdRef.current) return;

    const activeConversationId = pathnameConversationId || conversationId;
    // 更新 ref，供 persona 持久化使用
    activeConversationIdRef.current = activeConversationId ?? null;

    if (
      activeConversationId &&
      threadList.selectedThreadId !== activeConversationId
    ) {
      // 切換對話前：儲存目前對話的 Canvas 與 selectedItem
      const prevThreadId = threadList.selectedThreadId;
      if (prevThreadId) {
        globalSelectedItemCache.set(prevThreadId, selectedItemRef.current);
      }
      if (prevThreadId && showCanvas) {
        // 透過 custom event 取得 CanvasEditor 目前的內容
        let currentContent: string | undefined;
        const getContentEvent = new CustomEvent("canvas-get-content", {
          detail: {
            callback: (text: string) => {
              currentContent = text;
            },
          },
        });
        window.dispatchEvent(getContentEvent);
        if (currentContent) {
          globalCanvasCache.set(prevThreadId, { content: currentContent, open: true });
        }
      } else if (prevThreadId && !showCanvas) {
        // Canvas 已關閉，不需要保存，但保留快取（如果有的話）
      }

      threadList.selectThread(activeConversationId);

      // 切換到新對話：檢查是否有快取的 Canvas 內容
      const cached = globalCanvasCache.get(activeConversationId);
      if (cached) {
        setShowCanvas(cached.open);
        setCanvasInitialContent(cached.content);
        setIsGeneratingReport(false);
        sessionStorage.setItem("nexusmind-canvas-open", String(cached.open));
        sessionStorage.setItem("nexusmind-canvas-content", cached.content);
      } else {
        // 沒有快取：關閉 Canvas
        setShowCanvas(false);
        setCanvasInitialContent(undefined);
        setIsGeneratingReport(false);
        sessionStorage.removeItem("nexusmind-canvas-open");
        sessionStorage.removeItem("nexusmind-canvas-content");
      }

      // 切換到目標對話：還原 selectedItem（含 persona/skill）
      if (globalSelectedItemCache.has(activeConversationId)) {
        const restoredItem = globalSelectedItemCache.get(activeConversationId) ?? null;
        setSelectedItem(restoredItem);
        // 阻止 capsule restore effect 用 sessionStorage 的舊值覆蓋這裡正確還原的值
        hasRestoredRef.current = true;
        pendingRestoreRef.current = null;
        if (restoredItem?.type === "persona") {
          hasUserInteracted.current = true;
          selectCapsulePersona(restoredItem.persona.id);
          setSelectedPersona(restoredItem.persona);
        } else {
          selectCapsulePersona("");
          setSelectedPersona(DEFAULT_PERSONA);
        }
      } else {
        // 嘗試從 localStorage 恢復角色/技能（適用所有場景，包含頁面刷新 prevThreadId===null）
        const storedPersonaId = localStorage.getItem(`nexusmind:persona:${activeConversationId}`);
        const storedSkillId = !storedPersonaId
          ? localStorage.getItem(`nexusmind:skill:${activeConversationId}`)
          : null;
        const restoredPersona = storedPersonaId ? capsulePersonas.find((p) => p.id === storedPersonaId) : null;
        if (restoredPersona) {
          hasUserInteracted.current = true;
          setSelectedItem({ type: "persona", persona: restoredPersona });
          selectCapsulePersona(restoredPersona.id);
          setSelectedPersona(restoredPersona);
          hasRestoredRef.current = true;
          pendingRestoreRef.current = null;
        } else if (storedPersonaId) {
          // Personas 尚未載入，用 pending restore 機制延遲恢復
          hasRestoredRef.current = false;
          pendingRestoreRef.current = { type: "persona", id: storedPersonaId };
        } else if (storedSkillId) {
          // 技能 localStorage 恢復（用 pending restore 機制，等待 skills 載入完成）
          hasRestoredRef.current = false;
          pendingRestoreRef.current = { type: "skill", id: storedSkillId };
        } else if (prevThreadId) {
          // 僅在對話切換時重置（初次載入/刷新無 localStorage 則由 sessionStorage restore 處理）
          setSelectedItem(null);
          selectCapsulePersona("");
          setSelectedPersona(DEFAULT_PERSONA);
        } else {
          // prevThreadId 為 null（對話剛建立第一次 URL sync，或初次載入無 localStorage）
          // 若目前有選擇角色/技能，存入 localStorage 確保重新登入後可以恢復
          const currentItem = selectedItemRef.current;
          if (currentItem?.type === "persona" && currentItem.persona) {
            try { localStorage.setItem(`nexusmind:persona:${activeConversationId}`, currentItem.persona.id); } catch { /* ignore */ }
          } else if (currentItem?.type === "skill" && currentItem.skill) {
            try { localStorage.setItem(`nexusmind:skill:${activeConversationId}`, currentItem.skill.id); } catch { /* ignore */ }
          }
        }
      }
      // 若 prevThreadId 為 null 且無 localStorage（初次載入），由 sessionStorage restore 處理
    } else if (!activeConversationId && threadList.selectedThreadId) {
      // 切換到新對話前：儲存目前對話的 Canvas 與 selectedItem
      const prevThreadId = threadList.selectedThreadId;
      globalSelectedItemCache.set(prevThreadId, selectedItemRef.current);
      if (prevThreadId && showCanvas) {
        let currentContent: string | undefined;
        const getContentEvent = new CustomEvent("canvas-get-content", {
          detail: {
            callback: (text: string) => {
              currentContent = text;
            },
          },
        });
        window.dispatchEvent(getContentEvent);
        if (currentContent) {
          globalCanvasCache.set(prevThreadId, { content: currentContent, open: true });
        }
      }

      threadList.switchToNew();
      setModel("gemini-flash");
      // 新對話時重置 selectedItem（每個新對話獨立開始）
      setSelectedItem(null);
      selectCapsulePersona("");
      setSelectedPersona(DEFAULT_PERSONA);
      // 新對話時清除 Canvas 狀態
      setShowCanvas(false);
      setCanvasInitialContent(undefined);
      setIsGeneratingReport(false);
      sessionStorage.removeItem("nexusmind-canvas-open");
      sessionStorage.removeItem("nexusmind-canvas-content");
    }
  }, [conversationId, pathnameConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 進入新對話頁（/chat）時，模型預設固定為 Gemini 3 Flash；同時清除角色選擇，防止從其他頁面導航回來時殘留
  useEffect(() => {
    if (pathname === "/chat") {
      setModel("gemini-flash");
      selectCapsulePersona("");
      setSelectedItem(null);
      setSelectedPersona(DEFAULT_PERSONA);
      try { sessionStorage.removeItem(SELECTED_ITEM_KEY); } catch { /* ignore */ }
      // Bug A fix: 清除 pendingRestoreRef，防止 capsulePersonas 載入後 restore effect 重新套用舊的角色/技能
      pendingRestoreRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, selectCapsulePersona]);

  // 監聯 sidebar「新對話」事件 — 確保重置狀態
  useEffect(() => {
    function handleNewChat() {
      skipUrlSyncRef.current = true;
      // 清除 pendingThreadId，防止串流完成後 onFinish 把用戶拉回正在生成的對話
      pendingThreadIdRef.current = null;
      // 儲存目前對話的 selectedItem 到快取，再切換到新對話
      const currentThreadId = threadList.selectedThreadId;
      if (currentThreadId) {
        globalSelectedItemCache.set(currentThreadId, selectedItemRef.current);
      }
      threadList.switchToNew();
      // 新對話時重置 selectedItem（每個新對話獨立開始）
      setSelectedItem(null);
      selectCapsulePersona("");
      setSelectedPersona(DEFAULT_PERSONA);
      setModel("gemini-flash");
      // 清除 Canvas 狀態，新對話不殘留舊報告
      setShowCanvas(false);
      setCanvasInitialContent(undefined);
      setIsGeneratingReport(false);
      sessionStorage.removeItem("nexusmind-canvas-open");
      sessionStorage.removeItem("nexusmind-canvas-content");
      // 清除 selectedItem sessionStorage，防止下次 remount 時 capsule restore 覆蓋快取的正確值
      try { sessionStorage.removeItem("nexusmind:selected_item"); } catch { /* ignore */ }
      pendingRestoreRef.current = null;
      // 若背景串流正在執行：進入背景串流模式，讓舊 thread 的 spinner 保持顯示
      // 直到 onFinish/onError 在串流真正結束後才清除（不能提前清除）
      if (isStreamingRef.current) {
        const bgId = activeStreamThreadIdRef.current ?? threadIdRef.current;
        if (bgId) backgroundThreadIdsRef.current.add(bgId);
        skipChatStoreSwitchRef.current = true;
        setChatStoreId("_new_" + generateUUID());
      }
      // 若有技能在背景執行，釋放輸入鎖，讓用戶可在新對話中輸入；並清除進度 UI 防止殘留
      if (skillExecutionRef.current) {
        submitLockRef.current = false;
        setSkillExecution(null);
      }
    }
    window.addEventListener("new-chat-requested", handleNewChat);
    return () =>
      window.removeEventListener("new-chat-requested", handleNewChat);
  }, [threadList]);

  // useThreadList 在 mount 時自動載入對話列表，不需要手動 load()

  // 將 DB 訊息轉換為 UIMessage 格式
  const parseDbMessages = useCallback(
    (
      data: Array<{ id: string; role: string; content: unknown; metadata?: Record<string, unknown> | null }>,
    ): UIMessage[] => {
      const mapped = data
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => {
          const contentText =
            typeof m.content === "string"
              ? m.content
              : m.content == null
                ? ""
                : JSON.stringify(m.content);

          if (m.role === "user") {
            // 嘗試從 JSON 還原 multipart content（含圖片）
            let userText = contentText;
            try {
              const parsed =
                typeof m.content === "string"
                  ? JSON.parse(m.content)
                  : m.content;
              if (Array.isArray(parsed)) {
                const textParts = parsed.filter(
                  (p: { type: string }) => p.type === "text",
                );
                userText = textParts
                  .map((p: { text: string }) => p.text)
                  .join("\n");
              }
            } catch {
              // 不是 JSON，使用原始文字
            }
            return {
              id: m.id,
              role: "user" as const,
              parts: [{ type: "text" as const, text: userText }],
            } as UIMessage;
          }
          if (!contentText.trim()) {
            return {
              id: m.id,
              role: "assistant" as const,
              parts: [
                {
                  type: "text" as const,
                  text: "（此回覆內容遺失，請重新送出一次）",
                },
              ],
            } as UIMessage;
          }
          // 從 metadata 重建 RAG transparency data part（跳頁後還原 RAG 面板）
          const parts: UIMessage["parts"] = [];
          const ragMeta = m.metadata?.rag_transparency;
          if (ragMeta && typeof ragMeta === "object") {
            parts.push({
              type: "data-rag-transparency" as any,
              id: "rag-meta",
              data: ragMeta,
            } as any);
          }
          parts.push({ type: "text" as const, text: contentText });
          return {
            id: m.id,
            role: "assistant" as const,
            parts,
          } as UIMessage;
        });

      // 去重：同一輪若連續出現多筆 assistant（例如保底持久化 + onFinish 持久化），僅保留最後一筆
      return mapped.reduce<UIMessage[]>((acc, msg) => {
        const prev = acc[acc.length - 1];
        if (msg.role === "assistant" && prev?.role === "assistant") {
          acc[acc.length - 1] = msg;
          return acc;
        }
        acc.push(msg);
        return acc;
      }, []);
    },
    [],
  );

  // 載入歷史訊息（短輪詢等待 assistant 回應，避免長時間卡在 loading）
  const loadThread = useCallback(
    async (threadId: string): Promise<UIMessage[]> => {
      const fetchAndParse = async (): Promise<UIMessage[]> => {
        const res = await fetch(`/api/conversations/${threadId}/messages`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const err = new Error(
            `Failed to load messages: HTTP ${res.status}`,
          ) as Error & { status?: number };
          err.status = res.status;
          throw err;
        }
        const { data } = await res.json();
        if (!Array.isArray(data)) {
          throw new Error("Invalid messages payload");
        }
        return parseDbMessages(
          data as Array<{ id: string; role: string; content: unknown; metadata?: Record<string, unknown> | null }>,
        );
      };

      let messages: UIMessage[] | null = null;
      let lastError: unknown;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          messages = await fetchAndParse();
          break;
        } catch (error) {
          lastError = error;
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }

      if (!messages) {
        const status =
          typeof lastError === "object" &&
            lastError &&
            "status" in (lastError as object)
            ? (lastError as { status?: number }).status
            : undefined;
        if (status === 404) {
          // 對話不存在 → 自動跳回新對話頁，避免死胡同
          setTimeout(() => {
            window.history.replaceState(null, "", "/chat");
            window.dispatchEvent(new CustomEvent("new-chat-requested"));
          }, 0);
          return [];
        }
        const cached = threadMessagesCacheRef.current.get(threadId);
        if (cached) return cached;
        console.error(
          "[Chat] Failed to load thread messages:",
          threadId,
          lastError,
        );
        throw lastError instanceof Error
          ? lastError
          : new Error(String(lastError ?? "Failed to load messages"));
      }

      const withInterruptedPlaceholder = (input: UIMessage[]): UIMessage[] => {
        const last = input[input.length - 1];
        if (last?.role !== "user") return input;

        // 技能或串流執行中（可能耗時數分鐘）→ 顯示等待提示而非中斷訊息
        const skillExecutingTs = window.localStorage.getItem(`skill-executing-${threadId}`);
        const streamExecutingTs = window.localStorage.getItem(`stream-executing-${threadId}`);
        const executingTs = skillExecutingTs ?? streamExecutingTs;
        if (executingTs) {
          const elapsed = Date.now() - parseInt(executingTs, 10);
          if (elapsed < 10 * 60 * 1000) {
            return [...input, {
              id: `local-executing-${threadId}-${input.length}`,
              role: "assistant" as const,
              parts: [{ type: "text" as const, text: "（生成中，請稍候...）" }],
            } as UIMessage];
          }
          if (skillExecutingTs) window.localStorage.removeItem(`skill-executing-${threadId}`);
          if (streamExecutingTs) window.localStorage.removeItem(`stream-executing-${threadId}`);
        }

        // 若本機快取有對應使用者提問的 assistant 內容，優先用快取回填並嘗試補寫回 DB
        const cached = readAssistantCache(threadId);
        const lastUserText = last.parts
          ?.filter((p: { type: string }) => p.type === "text")
          .map((p: { type: string; text?: string }) => (p as { text: string }).text)
          .join("").trim() ?? "";
        if (cached && cached.userText.trim() === lastUserText) {
          const cachedAssistant = {
            id: `local-cached-${threadId}-${input.length}`,
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: cached.assistantContent }],
          } as UIMessage;
          void fetch(`/api/conversations/${threadId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify({ content: cached.assistantContent }),
          }).catch(() => {
            // ignore restore persist failure
          });
          return [...input, cachedAssistant];
        }

        return [
          ...input,
          {
            id: `local-interrupted-${threadId}-${input.length}`,
            role: "assistant" as const,
            parts: [
              { type: "text" as const, text: "（回覆中斷，內容未完整儲存）" },
            ],
          } as UIMessage,
        ];
      };

      // 如果最後一條是 user 訊息，可能剛好在生成 assistant 回應。
      // 這裡僅做短輪詢，避免使用者開啟對話時長時間卡在「載入對話紀錄...」。
      if (
        messages.length > 0 &&
        messages[messages.length - 1].role === "user"
      ) {
        const maxRetries = 2;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          await new Promise((r) => setTimeout(r, 800));
          const retryMessages = await fetchAndParse();
          if (retryMessages.length > messages.length) {
            const normalizedRetryMessages =
              withInterruptedPlaceholder(retryMessages);
            threadMessagesCacheRef.current.set(
              threadId,
              normalizedRetryMessages,
            );
            return normalizedRetryMessages;
          }
        }
      }

      const normalizedMessages = withInterruptedPlaceholder(messages);
      threadMessagesCacheRef.current.set(threadId, normalizedMessages);

      // 載入技能附件（非同步，不阻塞訊息顯示）— 透過 conversationId 查詢以解決 placeholder message ID 不匹配問題
      const assistantSimpleMsgs: SimpleMessage[] = normalizedMessages
        .filter((m) => m.role === "assistant")
        .map((m) => {
          const content = serializeAssistantMessageContent(m);
          return { id: m.id, role: m.role, content };
        });
      if (assistantSimpleMsgs.length > 0) {
        void loadAttachmentsRef.current(threadId, assistantSimpleMsgs);
      }

      return normalizedMessages;
    },
    [parseDbMessages],
  );

  // Ref for loadAttachmentsForConversation — allows loadThread (defined before useSkills) to trigger attachment loading
  const loadAttachmentsRef = useRef<
    (
      conversationId: string,
      visibleMessages: ReadonlyArray<SimpleMessage>,
    ) => Promise<void>
  >(async () => { });

  // 圖片附加 hook
  const imageAttach = useImageAttach();

  // 技能系統 hook
  const {
    skills,
    isLoadingSkills,
    executingSkillId,
    isGeneratingSkill,
    isSavingSkill,
    executeSkill,
    skillError,
    clearSkillError,
    getAttachment,
    loadAttachmentsForConversation,
    generateSkillFromHistory,
    saveGeneratedSkill,
    refreshSkills,
  } = useSkills();
  loadAttachmentsRef.current = loadAttachmentsForConversation;

  // ─── 恢復 skill 選擇（skills 首次載入完成後） ────────────
  useEffect(() => {
    if (hasRestoredRef.current) return;
    if (isLoadingSkills) return;
    const pending = pendingRestoreRef.current;
    if (!pending || pending.type !== "skill") return;
    if (skills.length === 0) return;

    const skill = skills.find((s) => s.id === pending.id);
    if (skill) {
      hasRestoredRef.current = true;
      hasUserInteracted.current = true;
      selectCapsulePersona("");
      setSelectedItem({ type: "skill", skill });
      pendingRestoreRef.current = null;
    }
  }, [isLoadingSkills, skills, selectCapsulePersona]);

  const handleRemoveSkill = useCallback(
    async (skillId: string) => {
      try {
        const res = await fetch("/api/skills", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: skillId, is_enabled: false }),
        });
        if (res.ok) {
          await refreshSkills();
          if (
            selectedItemRef.current?.type === "skill" &&
            selectedItemRef.current.skill.id === skillId
          ) {
            setSelectedItem(null);
          }
        }
      } catch {
        /* 靜默 */
      }
    },
    [refreshSkills],
  );

  const {
    loadingSkills,
    loadedSkills,
    processStreamText: processSkillMarkers,
  } = useSkillLazyLoading();
  // Ref to pass loaded skill names into the onProcessMessage closure
  const loadedSkillNamesRef = useRef<string[]>([]);
  loadedSkillNamesRef.current = loadedSkills.map((s) => s.name);
  // ─── Skill Generator 狀態 ──────────────────
  const [generatedConfig, setGeneratedConfig] =
    useState<GeneratedSkillConfig | null>(null);
  const [loadedFile, setLoadedFile] = useState<LoadedFileResult | null>(null);
  // Ref for threadManager — allows skill handlers (defined before threadManager) to call appendMessages
  const threadManagerRef = useRef<{
    appendMessages: (msg: UIMessage | Record<string, unknown>) => void;
    setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;
    messages: ReadonlyArray<UIMessage>;
  }>({ appendMessages: () => { }, setMessages: () => { }, messages: [] });

  // ─── Skill Generator Handlers ──────────────

  const handleGenerateFromHistory = useCallback(async () => {
    const messages = threadManagerRef.current.messages;
    if (messages.length === 0) return;

    const history = messages.map((msg) => {
      const content = (msg.parts ?? [])
        .filter((p: { type: string }) => p.type === "text")
        .map((p: { type: string; text?: string }) => p.text ?? "")
        .join("\n");
      return `${msg.role}: ${content}`;
    });

    const config = await generateSkillFromHistory(history);
    if (config) {
      setGeneratedConfig(config);
    }
  }, [generateSkillFromHistory]);

  const handleLoadFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onerror = () => {
      console.error(`FileReader error: failed to read ${file.name}`);
    };
    reader.onload = () => {
      const content = reader.result as string;
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

      if (ext === "json") {
        const parsed = parseJsonSkillConfig(content);
        if (parsed) {
          setGeneratedConfig(parsed);
          setLoadedFile({
            fileName: file.name,
            fileType: "json",
            content,
            parsedConfig: parsed,
          });
        } else {
          // JSON 解析失敗時，當作文字檔注入
          setLoadedFile({
            fileName: file.name,
            fileType: "text",
            content,
          });
        }
      } else if (ext === "md") {
        setLoadedFile({
          fileName: file.name,
          fileType: "markdown",
          content,
        });
      } else {
        setLoadedFile({
          fileName: file.name,
          fileType: "text",
          content,
        });
      }
    };
    reader.readAsText(file);
  }, []);

  const handleSaveGeneratedSkill = useCallback(
    async (config: GeneratedSkillConfig) => {
      await saveGeneratedSkill(config);
      setGeneratedConfig(null);
      setLoadedFile(null);
    },
    [saveGeneratedSkill],
  );

  const handleCancelPreview = useCallback(() => {
    setGeneratedConfig(null);
    setLoadedFile(null);
  }, []);

  const handleInjectInstruction = useCallback((content: string) => {
    // 限制注入內容長度並清理
    const MAX_INSTRUCTION_LENGTH = 5000;
    const sanitized = content.trim().slice(0, MAX_INSTRUCTION_LENGTH);
    if (!sanitized) return;

    // 注入 system instruction 到當前對話
    threadManagerRef.current.appendMessages({
      id: generateUUID(),
      role: "user",
      parts: [{ type: "text", text: `[系統規則載入]\n\n${sanitized}` }],
    } as UIMessage);
    setLoadedFile(null);
  }, []);

  // 技能 overlay 共用渲染（SkillPreviewDialog + 錯誤 toast）
  const skillOverlays = (
    <>
      <SkillPreviewDialog
        config={generatedConfig}
        loadedFile={loadedFile}
        isSaving={isSavingSkill}
        onSave={handleSaveGeneratedSkill}
        onCancel={handleCancelPreview}
        onInjectInstruction={handleInjectInstruction}
      />
      {skillError && (
        <div
          data-testid="skill-error-toast"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300"
        >
          <div className="flex items-center gap-3 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-xl shadow-lg shadow-red-500/10 px-4 py-3 max-w-md">
            <span className="text-red-500 text-lg flex-shrink-0">&#9888;</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                技能執行失敗
              </p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {skillError}
              </p>
            </div>
            <button
              type="button"
              onClick={clearSkillError}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
              aria-label="關閉錯誤提示"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
        </div>
      )}
    </>
  );

  // === Chat State Management (replacing useThreadManager with useChat) ===
  const pendingThreadIdRef = useRef<string | null>(null);
  const threadIdRef = useRef<string | null>(threadList.selectedThreadId);
  // 只有在沒有 pending thread 時才同步 — 避免新對話串流中 ref 被覆寫回 null
  if (!pendingThreadIdRef.current) {
    threadIdRef.current = threadList.selectedThreadId;
  }

  // 架構修復：解耦 useChat 的 id 與 selectedThreadId
  // chatStoreId 控制 useChat 使用哪個 message store
  // 只有在用戶「主動切換對話」時才改變，新對話建立時保持 "new-chat"
  const [chatStoreId, setChatStoreId] = useState<string>(
    threadList.selectedThreadId || "new-chat",
  );
  // 新對話建立後同步 sidebar 時，跳過 chatStoreId 更新
  const skipChatStoreSwitchRef = useRef(false);
  // 保存背景串流的 threadId，供導航後 onFinish/onError 使用（threadIdRef 可能已被清除）
  const activeStreamThreadIdRef = useRef<string | null>(null);
  // 同步 isStreaming 到 ref，供 handleNewChat（useEffect closure）讀取最新值
  const isStreamingRef = useRef(false);
  // 背景串流模式：用戶點擊新對話但舊串流仍在背景執行，spinner 不能被安全機制提前清除
  // 使用 Set 支援多個背景串流同時追蹤（用戶連續點新對話時不會互相覆蓋）
  const backgroundThreadIdsRef = useRef<Set<string>>(new Set());

  const {
    messages: chatMessages,
    setMessages,
    sendMessage: chatSendMessage,
    stop: stopChat,
    status: chatStatus,
  } = useChat({
    id: chatStoreId,
    onFinish: async ({ message }) => {
      // 判斷此次完成是否屬於背景串流
      const bgIds = backgroundThreadIdsRef.current;
      const candidateId = threadIdRef.current ?? activeStreamThreadIdRef.current;
      let threadId: string | null = null;
      if (candidateId && bgIds.has(candidateId)) {
        // 匹配到背景串流
        threadId = candidateId;
        bgIds.delete(candidateId);
      } else if (bgIds.size > 0) {
        // 無法精確匹配，取最早加入的背景串流 ID
        const firstBgId = bgIds.values().next().value ?? null;
        if (firstBgId) {
          threadId = firstBgId;
          bgIds.delete(firstBgId);
        }
      } else {
        threadId = candidateId;
      }
      if (!threadIdRef.current) activeStreamThreadIdRef.current = null;

      // Strip skill markers from final message text
      if (message.parts) {
        const hasMarkers = message.parts.some(
          (p) => p.type === "text" && /\[LOAD_SKILL:/.test(p.text),
        );
        if (hasMarkers) {
          const strippedParts = message.parts.map((p) =>
            p.type === "text"
              ? { ...p, text: processSkillMarkers(p.text) }
              : p,
          );
          setMessages((prev) =>
            prev.map((m) =>
              m.id === message.id ? { ...m, parts: strippedParts } : m,
            ),
          );
        }
      }

      // Backup persist to DB
      if (threadId) {
        const persistedContent = serializeAssistantMessageContent(message).trim();
        if (persistedContent) {
          void fetch(`/api/conversations/${threadId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify({
              content: persistedContent,
              allowUpdate: true,
            }),
          }).catch((err) => {
            console.warn("[Chat] backup assistant persist failed:", err);
          });
        }

      }

      // 清除串流執行中標記
      if (threadId) window.localStorage.removeItem(`stream-executing-${threadId}`);

      // Notify sidebar: streaming ended
      window.dispatchEvent(
        new CustomEvent("streaming-state-changed", {
          detail: { threadId, isRunning: false },
        }),
      );
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("conversation-created"));
      }, 1000);

      // Activate pending new thread after streaming completes
      // 架構修復：只更新 sidebar 選中狀態，不切換 chatStoreId
      // useChat 的 id 保持 "new-chat"，訊息留在原 store 不會消失
      if (pendingThreadIdRef.current) {
        const pid = pendingThreadIdRef.current;
        pendingThreadIdRef.current = null;
        skipChatStoreSwitchRef.current = true;
        globalSelectedItemCache.set(pid, selectedItemRef.current);
        threadList.setSelectedThreadId(pid);
      }
    },
    onError: (error) => {
      const bgIds = backgroundThreadIdsRef.current;
      const candidateId = threadIdRef.current ?? activeStreamThreadIdRef.current;
      let threadId: string | null = null;
      if (candidateId && bgIds.has(candidateId)) {
        threadId = candidateId;
        bgIds.delete(candidateId);
      } else if (bgIds.size > 0) {
        const firstBgId = bgIds.values().next().value ?? null;
        if (firstBgId) {
          threadId = firstBgId;
          bgIds.delete(firstBgId);
        }
      } else {
        threadId = candidateId;
      }
      if (!threadIdRef.current) activeStreamThreadIdRef.current = null;
      // 清除串流執行中標記
      if (threadId) window.localStorage.removeItem(`stream-executing-${threadId}`);
      window.dispatchEvent(
        new CustomEvent("streaming-state-changed", {
          detail: { threadId, isRunning: false },
        }),
      );

      // Activate pending new thread on error
      if (pendingThreadIdRef.current) {
        const pid = pendingThreadIdRef.current;
        pendingThreadIdRef.current = null;
        skipChatStoreSwitchRef.current = true;
        globalSelectedItemCache.set(pid, selectedItemRef.current);
        threadList.setSelectedThreadId(pid);
      }

      if (isAbortLikeError(error)) return;

      const fallbackText = isNetworkLikeError(error)
        ? "連線暫時不穩定（network error）。請稍候重試，或檢查網路/登入狀態後再送一次。"
        : `發生錯誤：${error.message || "未知錯誤"}`;

      setMessages((prev) => [
        ...prev,
        {
          id: generateUUID(),
          role: "assistant" as const,
          parts: [{ type: "text" as const, text: fallbackText }],
        },
      ]);
    },
  });

  // Derived streaming state
  const isStreaming = chatStatus === "streaming" || chatStatus === "submitted";
  isStreamingRef.current = isStreaming;
  skillExecutionRef.current = skillExecution;

  // 安全機制：當 isStreaming 變為 false 時，確保側邊欄轉圈動畫停止
  // 防止 onFinish callback 未正確 dispatch isRunning:false 的邊界情況
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
    } else if (wasStreamingRef.current) {
      // 背景串流模式：chatStoreId 切換導致 isStreaming 變 false，但背景串流仍在進行
      // 此時 spinner 應保持，等 onFinish/onError 在串流真正結束後才清除
      if (backgroundThreadIdsRef.current.size > 0) return;
      wasStreamingRef.current = false;
      const threadId = threadIdRef.current;
      if (threadId) {
        window.dispatchEvent(
          new CustomEvent("streaming-state-changed", {
            detail: { threadId, isRunning: false },
          }),
        );
      }
    }
  }, [isStreaming]);

  // 元件卸載清理：用戶離開聊天頁面時，清除主串流和背景串流的 spinner
  // （元件卸載 → useChat AbortController 取消串流 → onFinish 不觸發 → 需在此清理）
  useEffect(() => {
    return () => {
      // 清除所有背景串流的 spinner
      for (const tid of backgroundThreadIdsRef.current) {
        window.localStorage.removeItem(`stream-executing-${tid}`);
        window.dispatchEvent(
          new CustomEvent("streaming-state-changed", {
            detail: { threadId: tid, isRunning: false },
          }),
        );
      }
      backgroundThreadIdsRef.current.clear();
      // 清除當前活躍串流的 spinner
      const activeThreadId = isStreamingRef.current
        ? (activeStreamThreadIdRef.current ?? threadIdRef.current)
        : null;
      if (activeThreadId) {
        window.localStorage.removeItem(`stream-executing-${activeThreadId}`);
        window.dispatchEvent(
          new CustomEvent("streaming-state-changed", {
            detail: { threadId: activeThreadId, isRunning: false },
          }),
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chat thinking progress — 最小顯示 3 秒，確保用戶看到動畫
  useEffect(() => {
    if (isStreaming && !skillExecution) {
      setChatThinkingVisible(true);
      chatThinkingStartRef.current = Date.now();
    }
    if (!isStreaming) {
      setChatThinkingVisible(false);
    }
  }, [isStreaming, skillExecution]);

  // 思考動畫出現時，捲動讓 user 訊息 + 動畫區域都可見
  useEffect(() => {
    if (!chatThinkingVisible) return;
    requestAnimationFrame(() => {
      const el = messagesContainerRef.current;
      if (!el) return;
      const userMsgs = el.querySelectorAll<HTMLElement>("[data-message-id]");
      const lastUserMsg = userMsgs[userMsgs.length - 1];
      if (lastUserMsg) {
        const containerTop = el.getBoundingClientRect().top;
        const msgTop = lastUserMsg.getBoundingClientRect().top;
        const offset = msgTop - containerTop - 16;
        el.scrollTop += offset;
      } else {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, [chatThinkingVisible]);

  useEffect(() => {
    if (!chatThinkingVisible || !isStreaming) return;
    const lastMsg = chatMessages[chatMessages.length - 1];
    const hasTextContent =
      lastMsg?.role === "assistant" &&
      lastMsg.parts?.some(
        (p) => p.type === "text" && (p as { type: "text"; text: string }).text?.trim().length > 0,
      );
    if (!hasTextContent) return;
    const elapsed = Date.now() - chatThinkingStartRef.current;
    const MIN_DISPLAY_MS = 3000;
    if (elapsed >= MIN_DISPLAY_MS) {
      setChatThinkingVisible(false);
    } else {
      const timer = setTimeout(
        () => setChatThinkingVisible(false),
        MIN_DISPLAY_MS - elapsed,
      );
      return () => clearTimeout(timer);
    }
  }, [chatThinkingVisible, isStreaming, chatMessages]);

  // 同步 chatStoreId 與 selectedThreadId（僅用於「用戶主動切換對話」）
  // 新對話建立後 setSelectedThreadId 時，skipChatStoreSwitchRef 為 true → 跳過
  useEffect(() => {
    if (skipChatStoreSwitchRef.current) {
      skipChatStoreSwitchRef.current = false;
      return;
    }
    setChatStoreId(threadList.selectedThreadId || "new-chat");
  }, [threadList.selectedThreadId]);

  // Load thread messages when chatStoreId changes (user switches conversation)
  // 使用 useThreadLoader hook — 修復載入失敗後錯誤標記為「已載入」的 bug
  const {
    isLoadingMessages,
    loadedChatStoreId,
    loadError: threadLoadError,
    retryLoad,
  } = useThreadLoader({
    chatStoreId,
    loadThread,
    setMessages,
  });

  // Reset messages when switching to new thread
  useEffect(() => {
    if (threadList.shouldResetThreadState) {
      setMessages([]);
    }
  }, [threadList.shouldResetThreadState, setMessages]);

  // Helper: send a normal chat message (handles thread creation + sendMessage)
  const processChatMessage = useCallback(
    async (msg: {
      role: string;
      type?: string;
      message: string;
      context?: unknown[];
    }) => {
      // Auto-create thread if needed
      let threadId = threadIdRef.current;
      if (!threadId) {
        const newThread = await threadList.createThread(
          (msg.message ?? "新對話").slice(0, 30),
          modelRef.current,
        );
        threadId = newThread.id;
        // Don't call selectThread yet — it would change useChat's id mid-stream
        // causing messages to render from wrong store. Defer until onFinish.
        pendingThreadIdRef.current = threadId;
        threadIdRef.current = threadId;
        // Persist persona for this new conversation so it survives refresh & navigation
        const personaIdToSave = selectedPersonaRef.current?.id;
        if (personaIdToSave && personaIdToSave !== DEFAULT_PERSONA.id) {
          try {
            localStorage.setItem(`nexusmind:persona:${threadId}`, personaIdToSave);
          } catch { /* ignore */ }
        }
        window.history.replaceState(null, "", `/chat/${threadId}`);
        window.dispatchEvent(new CustomEvent("conversation-created"));
      }

      // Track active stream thread for ALL threads (new and existing)
      // so onFinish can find threadId even after handleNewChat clears threadIdRef
      activeStreamThreadIdRef.current = threadId;

      // Notify sidebar
      window.dispatchEvent(
        new CustomEvent("streaming-state-changed", {
          detail: { threadId, isRunning: true },
        }),
      );
      // 標記串流執行中，防止 withInterruptedPlaceholder 誤顯示「回覆中斷」
      window.localStorage.setItem(`stream-executing-${threadId}`, Date.now().toString());

      // Build per-request body
      const body: Record<string, unknown> = {
        model: modelRef.current,
        conversationId: threadId,
        systemPrompt: selectedPersonaRef.current?.systemPrompt,
        docId: viewerDocIdRef.current,
        docIds: ragDocIdsRef.current,
        loadedSkillNames: loadedSkillNamesRef.current,
      };

      // Handle image context
      const imageCtx =
        (msg.context as Array<{
          type: string;
          image: string;
          mediaType: string;
        }>) ?? [];
      if (imageCtx.length > 0) {
        body.imageContext = imageCtx;
      }

      await chatSendMessage({ text: msg.message }, { body });
    },
    [threadList, chatSendMessage],
  );

  // Helper: append a UIMessage (converting from old format if needed)
  const appendMessage = useCallback(
    (msg: UIMessage | Record<string, unknown>) => {
      const uiMsg: UIMessage =
        "parts" in msg && Array.isArray((msg as UIMessage).parts)
          ? (msg as UIMessage)
          : {
            id:
              ((msg as Record<string, unknown>).id as string) ||
              generateUUID(),
            role:
              ((msg as Record<string, unknown>).role as UIMessage["role"]) ||
              "assistant",
            parts: Array.isArray((msg as Record<string, unknown>).message)
              ? ((msg as Record<string, unknown>).message as UIMessage["parts"])
              : [
                {
                  type: "text" as const,
                  text: String(
                    (msg as Record<string, unknown>).message || "",
                  ),
                },
              ],
          };
      setMessages((prev) => [...prev, uiMsg]);
    },
    [setMessages],
  );

  // Compatibility layer: threadManager object
  // Maps old useThreadManager API to new useChat-based state
  const threadManager = useMemo(
    () => ({
      messages: chatMessages,
      isRunning: isStreaming,
      isLoadingMessages,
      onCancel: () => stopChat(),
      processMessage: processChatMessage,
      appendMessages: appendMessage,
      updateMessage: (msg: Record<string, unknown>) => {
        const id = msg.id as string;
        if (!id) return;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== id) return m;
            const newParts = Array.isArray(msg.message)
              ? (msg.message as UIMessage["parts"])
              : Array.isArray(msg.parts)
                ? (msg.parts as UIMessage["parts"])
                : m.parts;
            return { ...m, parts: newParts };
          }),
        );
      },
      deleteMessage: (id: string) => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      },
      setMessages,
    }),
    [
      chatMessages,
      isStreaming,
      isLoadingMessages,
      stopChat,
      processChatMessage,
      appendMessage,
      setMessages,
    ],
  );

  // Keep threadManagerRef in sync so skill handlers can call appendMessages
  threadManagerRef.current = threadManager;

  // Safety-net: 確保附件在導航回對話時一定被載入
  // loadThread 內部已呼叫 loadAttachmentsRef，但元件重新掛載後 attachmentsRef 被重置為空 Map。
  // 若 Crayon 框架在某些路徑下未觸發 loadThread（快取、時序問題），此 effect 提供補救。
  const prevAttachmentThreadRef = useRef<string | null>(null);
  useEffect(() => {
    const threadId = threadList.selectedThreadId;
    if (
      !threadId ||
      threadManager.isLoadingMessages ||
      threadManager.messages.length === 0
    ) {
      return;
    }

    // 同一對話只觸發一次
    if (prevAttachmentThreadRef.current === threadId) {
      return;
    }
    prevAttachmentThreadRef.current = threadId;

    const assistantSimpleMsgs: SimpleMessage[] = threadManager.messages
      .filter((m) => m.role === "assistant")
      .map((m) => {
        const content = serializeAssistantMessageContent(m);
        return { id: m.id, role: m.role, content };
      });

    if (assistantSimpleMsgs.length > 0) {
      void loadAttachmentsForConversation(threadId, assistantSimpleMsgs);
    }
  }, [
    threadList.selectedThreadId,
    threadManager.isLoadingMessages,
    threadManager.messages,
    loadAttachmentsForConversation,
  ]);

  // === Canvas 自動帶入對話內容 ===

  // 將對話訊息轉為純文字用於總結
  const getConversationText = useCallback((): string => {
    const messages = threadManager.messages;
    if (messages.length === 0) return "";

    return messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        if (m.role === "user") {
          const userText = m.parts
            ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("\n") || "";
          return `使用者：${userText}`;
        }
        const text = extractPlainText(m.parts || []);
        return `AI：${text}`;
      })
      .join("\n\n");
  }, [threadManager.messages]);

  // 呼叫 API 總結對話內容
  const summarizeConversation = useCallback(async (): Promise<string> => {
    const conversationText = getConversationText();
    if (!conversationText.trim()) return "";

    try {
      const response = await fetch("/api/copilot/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "summarize_to_draft",
          text: conversationText,
        }),
      });

      if (!response.ok) return conversationText;

      const reader = response.body?.getReader();
      if (!reader) return conversationText;

      let result = "";
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
      }

      return result.trim() || conversationText;
    } catch {
      return conversationText;
    }
  }, [getConversationText]);

  // 點擊「報告生成」按鈕 — 總結對話內容並填入 Canvas
  const handleToggleCanvas = useCallback(async () => {
    if (showCanvas) {
      // 關閉前儲存到快取
      const threadId = threadList.selectedThreadId;
      if (threadId) {
        let currentContent: string | undefined;
        const getContentEvent = new CustomEvent("canvas-get-content", {
          detail: {
            callback: (text: string) => {
              currentContent = text;
            },
          },
        });
        window.dispatchEvent(getContentEvent);
        if (currentContent) {
          globalCanvasCache.set(threadId, { content: currentContent, open: false });
        }
      }
      setShowCanvas(false);
      sessionStorage.removeItem("nexusmind-canvas-open");
      sessionStorage.removeItem("nexusmind-canvas-content");
      return;
    }
    // 打開 Canvas 並顯示生成中動畫
    setShowCanvas(true);
    setIsGeneratingReport(true);
    try {
      const summary = await summarizeConversation();
      if (summary) {
        setCanvasInitialContent(summary);
        // 儲存到快取
        const threadId = threadList.selectedThreadId;
        if (threadId) {
          globalCanvasCache.set(threadId, { content: summary, open: true });
        }
      }
    } finally {
      setIsGeneratingReport(false);
    }
  }, [showCanvas, summarizeConversation, threadList.selectedThreadId]);

  // 監聽 sidebar 的 toggle-canvas 事件
  useEffect(() => {
    const handleExtToggleCanvas = async () => {
      setShowCanvas(true);
      setIsGeneratingReport(true);
      try {
        const summary = await summarizeConversation();
        if (summary) {
          setCanvasInitialContent(summary);
        }
      } finally {
        setIsGeneratingReport(false);
      }
    };
    window.addEventListener("toggle-canvas", handleExtToggleCanvas);
    return () =>
      window.removeEventListener("toggle-canvas", handleExtToggleCanvas);
  }, [summarizeConversation]);

  // 監聯來自 AssistantMessageRenderer 的建議點擊事件
  useEffect(() => {
    const handleSuggestionClick = async (e: CustomEvent<string>) => {
      const text = e.detail;
      if (!text || threadManager.isRunning || submitLockRef.current) return;

      let activeSkill = selectedItem?.type === "skill" ? selectedItem.skill : null;

      if (!activeSkill && threadManagerRef.current.messages.length > 0) {
        const firstUserMsg = threadManagerRef.current.messages.find(m => m.role === "user");
        let firstText = "";
        if (firstUserMsg) {
          firstText = firstUserMsg.parts
            ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("\n") || "";
        }
        const match = firstText.match(/^\[(.*?)\]/);
        if (match) {
          const skillName = match[1];
          activeSkill = (skills as any[]).find(s => s.display_name === skillName || s.name === skillName) || null;
        }
      }

      if (activeSkill) {
        submitLockRef.current = true;
        const skill = activeSkill;
        const skillMsgId = generateUUID();
        const prefix = `[${skill.display_name}] `;
        const userMsgContent = text.startsWith(prefix) ? text : `${prefix}${text}`;

        conversationExtraRef.current = null;

        // 確保 thread 存在（新對話首發技能時建立）
        let threadId = threadList.selectedThreadId;
        const isNewSkillThread = !threadId;
        if (!threadId) {
          const newThread = await threadList.createThread(userMsgContent.slice(0, 30), modelRef.current);
          threadId = newThread.id;
          // 不立即 selectThread — useChat id 變更會清空 messages
          // 使用 pendingThreadIdRef 阻止 URL sync effect 提前切換
          pendingThreadIdRef.current = threadId;
          window.history.replaceState(null, "", `/chat/${threadId}`);
          window.dispatchEvent(new CustomEvent("conversation-created"));
        }

        // 組裝已有的對話歷史
        const existingMessages = threadManagerRef.current.messages;
        const messageHistory = existingMessages.map((msg) => {
          const role = msg.role === "user" ? "User" : "Assistant";
          const content = msg.parts
            ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("\n") || "";
          return `${role}: ${content}`;
        });

        threadManagerRef.current.appendMessages({
          id: generateUUID(),
          role: "user",
          parts: [{ type: "text", text: userMsgContent }],
        } as UIMessage);

        const loadingMsgId = generateUUID();
        setSkillExecution({
          id: loadingMsgId,
          skillName: skill.display_name,
          startedAt: Date.now(),
        });

        // 通知 sidebar 顯示轉圈動畫
        const skillStartThreadId1 = threadId;
        if (skillStartThreadId1) {
          window.dispatchEvent(new CustomEvent("streaming-state-changed", {
            detail: { threadId: skillStartThreadId1, isRunning: true },
          }));
        }

        // 標記技能執行中，防止 thread-loader 誤顯示「回覆中斷」
        if (skillStartThreadId1) {
          window.localStorage.setItem(`skill-executing-${skillStartThreadId1}`, Date.now().toString());
        }

        executeSkill(skill, {
          conversationId: threadId || undefined,
          userInput: text,
          messageId: skillMsgId,
          userMessageContent: userMsgContent,
          messageHistory: messageHistory.length > 0 ? messageHistory : undefined,
        }).then((result) => {
          setSkillExecution(null);
          if (result) {
            // 只有仍在同一 thread 時才更新 UI（背景執行時用戶可能已切換）
            if (threadIdRef.current === skillStartThreadId1) {
              threadManagerRef.current.appendMessages({
                id: skillMsgId,
                role: "assistant",
                parts: [{ type: "text", text: result.message }],
              } as UIMessage);
            }
            // 主動回寫到 DB，確保切換頁面後對話內容不會消失
            if (threadId) {
              void fetch(`/api/conversations/${threadId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                keepalive: true,
                body: JSON.stringify({
                  content: result.message,
                  allowUpdate: true,
                }),
              }).catch((err) => {
                console.warn("[Skill] backup persist failed:", err);
              });
            }
          } else {
            if (threadIdRef.current === skillStartThreadId1) {
              threadManagerRef.current.appendMessages({
                id: skillMsgId,
                role: "assistant",
                parts: [{ type: "text", text: "⚠️ 技能執行失敗，請稍後再試" }],
              } as UIMessage);
            }
          }
        }).catch(() => {
          setSkillExecution(null);
          if (threadIdRef.current === skillStartThreadId1) {
            threadManagerRef.current.appendMessages({
              id: skillMsgId,
              role: "assistant",
              parts: [{ type: "text" as const, text: "⚠️ 技能執行失敗，請稍後再試" }],
            } as UIMessage);
          }
        }).finally(() => {
          // 清除 localStorage 執行中標記
          if (skillStartThreadId1) {
            window.localStorage.removeItem(`skill-executing-${skillStartThreadId1}`);
          }
          // 停止 sidebar 轉圈動畫
          if (skillStartThreadId1) {
            window.dispatchEvent(new CustomEvent("streaming-state-changed", {
              detail: { threadId: skillStartThreadId1, isRunning: false },
            }));
          }
          submitLockRef.current = false;
          // 新建的技能對話：執行完成後再切換 sidebar
          if (isNewSkillThread && threadId) {
            pendingThreadIdRef.current = null;
            skipChatStoreSwitchRef.current = true;
            globalSelectedItemCache.set(threadId, selectedItemRef.current);
            threadList.setSelectedThreadId(threadId);
          }
        });

      } else {
        // 一般對話模式：直接發送訊息
        void threadManager.processMessage({
          role: "user",
          type: "prompt",
          message: text,
        });
      }
    };

    window.addEventListener(
      "suggestion-clicked",
      handleSuggestionClick as unknown as EventListener,
    );
    return () =>
      window.removeEventListener(
        "suggestion-clicked",
        handleSuggestionClick as unknown as EventListener,
      );
  }, [threadManager.isRunning, threadManager.messages, selectedItem, executeSkill, threadList.selectedThreadId, skills]);

  // 訊息容器 ref — 用於捲動
  const messagesContainerRef = useRef<HTMLDivElement>(null);


  // AI 回覆完成後，若 Canvas 開啟中，自動重新總結對話內容
  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (threadManager.isRunning) {
      wasRunningRef.current = true;
      return;
    }
    // isRunning 從 true → false：AI 回覆剛完成
    if (wasRunningRef.current && showCanvas) {
      wasRunningRef.current = false;
      // 延遲一下確保訊息已完整寫入
      const timer = setTimeout(async () => {
        setIsGeneratingReport(true);
        try {
          const summary = await summarizeConversation();
          if (summary) {
            setCanvasInitialContent(summary);
          }
        } finally {
          setIsGeneratingReport(false);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
    wasRunningRef.current = false;
  }, [threadManager.isRunning, showCanvas, summarizeConversation]);

  // 只要畫面上已經有 assistant 內容，立即保底寫回 DB（避免切頁後遺失）
  useEffect(() => {
    const threadId = threadList.selectedThreadId;
    if (!threadId) return;

    const messages = threadManager.messages;
    const latestAssistant = [...threadManager.messages]
      .reverse()
      .find((m) => m.role === "assistant");

    if (!latestAssistant) return;

    const content = serializeAssistantMessageContent(latestAssistant).trim();
    if (!content) return;
    if (latestAssistant.id.startsWith("local-")) return;
    if (content.includes("此回覆內容遺失")) return;

    const signature = `${threadId}:${content}`;
    if (signature === lastBackupPersistSignatureRef.current) return;

    const assistantIdx = messages.findIndex((m) => m.id === latestAssistant.id);
    let lastUserText = "";
    for (let i = assistantIdx - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.role === "user") {
        lastUserText = msg.parts
          ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("\n") || "";
        break;
      }
    }

    const timer = setTimeout(() => {
      lastBackupPersistSignatureRef.current = signature;
      writeAssistantCache(threadId, {
        userText: lastUserText,
        assistantContent: content,
        savedAt: Date.now(),
      });
      void fetch(`/api/conversations/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ content }),
      }).catch((err) => {
        console.warn("[Chat] realtime backup persist failed:", err);
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [threadManager.messages, threadList.selectedThreadId]);

  // 監聽 scroll-to-message 事件（摘要時間軸點擊）
  useEffect(() => {
    const handleScrollToMessage = (e: CustomEvent<{ messageId: string }>) => {
      const msgId = e.detail.messageId;
      const el = messagesContainerRef.current;
      if (!el) return;
      const target = el.querySelector(`[data-message-id="${msgId}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        // 閃爍高亮效果
        target.classList.add("ring-2", "ring-blue-400", "ring-offset-2");
        setTimeout(() => {
          target.classList.remove("ring-2", "ring-blue-400", "ring-offset-2");
        }, 2000);
      }
    };
    window.addEventListener(
      "scroll-to-message",
      handleScrollToMessage as EventListener,
    );
    return () =>
      window.removeEventListener(
        "scroll-to-message",
        handleScrollToMessage as EventListener,
      );
  }, []);

  // 監聽 canvas-insert-content 事件（從外部觸發開啟 Canvas）
  useEffect(() => {
    const handleCanvasInsert = () => {
      if (!showCanvas) {
        setShowCanvas(true);
      }
    };
    window.addEventListener(
      "canvas-insert-content",
      handleCanvasInsert as EventListener,
    );
    return () =>
      window.removeEventListener(
        "canvas-insert-content",
        handleCanvasInsert as EventListener,
      );
  }, [showCanvas]);

  // 同步 conversationExtraRef（供 createThread 讀取）
  const syncConversationExtra = useCallback(() => {
    conversationExtraRef.current = null;
  }, []);

  // 送出訊息
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitLockRef.current) return;
      // 雙重保險：如果 IME 組字中或剛結束選字，拒絕送出
      if (isComposingRef.current || compositionJustEndedRef.current) return;

      const text = input.trim();
      if ((!text && !imageAttach.hasImages) || threadManager.isRunning) return;

      submitLockRef.current = true;
      setInput("");

      resizeTextarea(newChatInputRef.current);
      resizeTextarea(bottomInputRef.current);

      // ─── 技能模式：選中技能時走技能執行（支援多輪對話） ───
      let activeSkill = selectedItemRef.current?.type === "skill" ? selectedItemRef.current.skill : null;

      if (!activeSkill && threadManager.messages.length > 0) {
        // 嘗試從歷史對話判斷是否為技能對話
        const firstUserMsg = threadManager.messages.find(m => m.role === "user");
        let firstText = "";
        if (firstUserMsg) {
          firstText = firstUserMsg.parts
            ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("\n") || "";
        }
        const match = firstText.match(/^\[(.*?)\]/);
        if (match) {
          const skillName = match[1];
          activeSkill = (skills as any[]).find(s => s.display_name === skillName || s.name === skillName) || null;
        }
      }

      if (activeSkill && text) {
        const skill = activeSkill;
        const skillMsgId = generateUUID();
        const prefix = `[${skill.display_name}] `;
        const userMsgContent = text.startsWith(prefix) ? text : `${prefix}${text}`;

        syncConversationExtra();

        // 確保如果是在新對話首發技能，先建立 Conversation
        let threadId = threadList.selectedThreadId;
        const isNewSkillThread2 = !threadId;
        if (!threadId) {
          const newThread = await threadList.createThread(userMsgContent.slice(0, 30), modelRef.current);
          threadId = newThread.id;
          // 不立即 selectThread — useChat id 變更會清空 messages
          pendingThreadIdRef.current = threadId;
          window.history.replaceState(null, "", `/chat/${threadId}`);
          window.dispatchEvent(new CustomEvent("conversation-created"));
        }

        // 從已有的對話中組裝 messageHistory（多輪迭代）
        const existingMessages = threadManagerRef.current.messages;
        const messageHistory = existingMessages.map((msg) => {
          const role = msg.role === "user" ? "User" : "Assistant";
          const content = msg.parts
            ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("\n") || "";
          return `${role}: ${content}`;
        });

        threadManagerRef.current.appendMessages({
          id: generateUUID(),
          role: "user",
          parts: [{ type: "text", text: userMsgContent }],
        } as UIMessage);

        // 使用獨立 state 顯示進度（不經由 appendMessages，避免被持久化到 DB）
        const loadingMsgId = generateUUID();
        setSkillExecution({
          id: loadingMsgId,
          skillName: skill.display_name,
          startedAt: Date.now(),
        });

        // 通知 sidebar 顯示轉圈動畫
        const skillStartThreadId2 = threadId;
        if (skillStartThreadId2) {
          window.dispatchEvent(new CustomEvent("streaming-state-changed", {
            detail: { threadId: skillStartThreadId2, isRunning: true },
          }));
        }

        // 把 user 訊息捲到視窗頂部，確保訊息 + 技能進度動畫都可見
        requestAnimationFrame(() => {
          const el = messagesContainerRef.current;
          if (!el) return;
          const userMsgs = el.querySelectorAll<HTMLElement>("[data-message-id]");
          const lastUserMsg = userMsgs[userMsgs.length - 1];
          if (lastUserMsg) {
            const containerTop = el.getBoundingClientRect().top;
            const msgTop = lastUserMsg.getBoundingClientRect().top;
            el.scrollTop += msgTop - containerTop - 16;
          } else {
            el.scrollTop = el.scrollHeight;
          }
        });

        // 標記技能執行中，防止 thread-loader 誤顯示「回覆中斷」
        if (skillStartThreadId2) {
          window.localStorage.setItem(`skill-executing-${skillStartThreadId2}`, Date.now().toString());
        }

        let result;
        try {
          result = await executeSkill(skill, {
            conversationId: threadId || undefined,
            userInput: text,
            messageId: skillMsgId,
            userMessageContent: userMsgContent,
            messageHistory: messageHistory.length > 0 ? messageHistory : undefined,
          });
        } finally {
          // 清除 localStorage 執行中標記
          if (skillStartThreadId2) {
            window.localStorage.removeItem(`skill-executing-${skillStartThreadId2}`);
          }
          // 清除進度狀態 + 停止 sidebar 轉圈
          setSkillExecution(null);
          if (skillStartThreadId2) {
            window.dispatchEvent(new CustomEvent("streaming-state-changed", {
              detail: { threadId: skillStartThreadId2, isRunning: false },
            }));
          }
        }

        if (result) {
          // 只有仍在同一 thread 時才更新 UI（背景執行時用戶可能已切換）
          if (threadIdRef.current === skillStartThreadId2) {
            threadManagerRef.current.appendMessages({
              id: skillMsgId,
              role: "assistant",
              parts: [{ type: "text", text: result.message }],
            } as UIMessage);
          }
          // 主動回寫到 DB，確保切換頁面後對話內容不會消失
          if (threadId) {
            void fetch(`/api/conversations/${threadId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              keepalive: true,
              body: JSON.stringify({
                content: result.message,
                allowUpdate: true,
              }),
            }).catch((err) => {
              console.warn("[Skill] backup persist failed:", err);
            });
          }
        } else if (skillError) {
          // 技能執行失敗時顯示錯誤訊息
          if (threadIdRef.current === skillStartThreadId2) {
            threadManagerRef.current.appendMessages({
              id: skillMsgId,
              role: "assistant",
              parts: [{ type: "text", text: `⚠️ 技能執行失敗：${skillError}` }],
            } as UIMessage);
          }
        }

        // 新建的技能對話：執行完成後再切換 sidebar
        if (isNewSkillThread2 && threadId) {
          pendingThreadIdRef.current = null;
          skipChatStoreSwitchRef.current = true;
          globalSelectedItemCache.set(threadId, selectedItemRef.current);
          threadList.setSelectedThreadId(threadId);
        }

        submitLockRef.current = false;
        return;
      }

      // ─── 一般對話模式 ───
      syncConversationExtra();

      // 建立圖片 context（供 onProcessMessage 讀取）
      const imageContext = imageAttach.images.map((img) => ({
        type: "image" as const,
        image: img.base64,
        mediaType: img.mediaType,
      }));
      imageAttach.clearImages();

      threadManager.processMessage({
        role: "user",
        type: "prompt",
        message: text,
        ...(imageContext.length > 0 ? { context: imageContext } : {}),
      });

      // 送出訊息後，把 user 訊息捲到視窗頂部附近，確保訊息 + 下方動畫都可見
      requestAnimationFrame(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        // 找到最後一則 user 訊息元素
        const userMsgs = el.querySelectorAll<HTMLElement>("[data-message-id]");
        const lastUserMsg = userMsgs[userMsgs.length - 1];
        if (lastUserMsg) {
          // 捲到 user 訊息頂部，留出少量上方空間
          const containerTop = el.getBoundingClientRect().top;
          const msgTop = lastUserMsg.getBoundingClientRect().top;
          const offset = msgTop - containerTop - 16; // 16px 上方留白
          el.scrollTop += offset;
        } else {
          el.scrollTop = el.scrollHeight;
        }
      });

      // 避免快速連點/雙擊在同一輪事件中重複送出
      setTimeout(() => {
        submitLockRef.current = false;
      }, 0);
    },
    [
      input,
      resizeTextarea,
      threadManager.isRunning,
      threadManager.messages,
      threadManager.processMessage,
      imageAttach,
      syncConversationExtra,
      executeSkill,
      threadList.selectedThreadId,
      skills,
    ],
  );

  const activeConversationId =
    threadList.selectedThreadId || conversationId;
  const isNewChat =
    threadManager.messages.length === 0 &&
    !threadManager.isLoadingMessages &&
    !activeConversationId;

  // 載入失敗畫面：loadThread 執行完但發生錯誤
  if (
    activeConversationId &&
    chatStoreId === activeConversationId &&
    threadLoadError &&
    !threadManager.isLoadingMessages &&
    !threadManager.isRunning
  ) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md text-center space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              載入對話時發生錯誤
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {threadLoadError}
            </p>
            <button
              onClick={retryLoad}
              className="px-4 py-1.5 text-xs rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
            >
              重新載入
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 空歷史畫面：必須滿足 (1) chatStoreId 已同步 (2) 已成功載入（loadedChatStoreId）
  // 防止元件掛載後 isLoadingMessages 仍為 false 的 render gap 顯示假空白
  if (
    activeConversationId &&
    chatStoreId === activeConversationId &&
    loadedChatStoreId === chatStoreId &&
    !threadManager.isLoadingMessages &&
    threadManager.messages.length === 0 &&
    !threadManager.isRunning
  ) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md text-center space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              此對話目前沒有可顯示內容。
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              可能是訊息尚在同步中，或網路連線暫時不穩定。
            </p>
            <button
              onClick={retryLoad}
              className="px-4 py-1.5 text-xs rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
            >
              重新載入
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === 新對話歡迎畫面（Gemini 風格，居中輸入框） ===
  if (isNewChat) {
    return (
      <div className="flex flex-col h-full bg-background">


        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-2xl flex flex-col items-center">
            {/* 酷炫機器人 + 歡迎語 */}
            <div className="mb-8 text-center">
              <div className="flex items-center justify-center mb-4">
                <div className="relative">
                  <div className="absolute -inset-2 bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-400 rounded-3xl opacity-20 blur-lg animate-pulse" />
                  <BotAvatar size="md" />
                </div>
              </div>
              <h1 className="text-3xl font-semibold text-foreground mb-2">
                {selectedItem?.type === "skill" && selectedItem.skill.name.includes("word_expert")
                  ? "你好，我是你的 Word 文件排版專家。"
                  : selectedItem?.type === "skill"
                    ? `你好，我是 ${selectedItem.skill.display_name}。`
                    : selectedItem?.type === "persona"
                      ? `你好，我是 ${selectedItem.persona.name}。`
                      : "你好，有什麼我能幫你的？"}
              </h1>
              <p className="text-sm text-gray-400 mb-6">
                {selectedItem?.type === "skill" && selectedItem.skill.name.includes("word_expert")
                  ? "只要告訴我您的主題和需求，我可以幫您生成包含精美圖表與排版的 Word 報告"
                  : selectedItem
                    ? "準備好為你提供專屬回答"
                    : "結合知識庫與網路搜尋，為你提供精準回答"}
              </p>

              {/* Document Context Indicator */}
              {viewerDocId && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full text-sm font-medium mb-4 animate-in fade-in slide-in-from-bottom-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                  正在研讀：{viewerTitle || "載入文件中..."}
                </div>
              )}
            </div>

            {/* 居中輸入框 */}
            <form onSubmit={handleSubmit} className="w-full mb-6">
              <ImagePreviewBar
                images={imageAttach.images}
                onRemove={imageAttach.removeImage}
              />
              <div className="relative flex flex-col bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
                {/* 輸入區（textarea + 送出按鈕） */}
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={imageAttach.openFilePicker}
                    disabled={!imageAttach.canAddMore}
                    className="mr-2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 transition-colors"
                    title="附加圖片"
                  >
                    <ImagePlus className="w-5 h-5" />
                  </button>
                  <div className="relative flex-1">
                    {newChatTextareaHint.showTop && (
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-4 rounded-t-xl bg-gradient-to-b from-black/12 to-transparent dark:from-white/12 z-10" />
                    )}
                    {newChatTextareaHint.showBottom && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 rounded-b-xl bg-gradient-to-t from-black/12 to-transparent dark:from-white/12 z-10" />
                    )}
                    <textarea
                      id="new-chat-input"
                      name="new-chat-input"
                      ref={newChatInputRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleInputKeyDown}
                      onCompositionStart={handleCompositionStart}
                      onCompositionEnd={handleCompositionEnd}
                      onScroll={handleInputScroll}
                      onPaste={imageAttach.handlePasteImages}
                      placeholder={
                        selectedItem
                          ? selectedItem.type === "persona"
                            ? `${selectedItem.persona.name}，發送訊息...`
                            : `${selectedItem.skill.display_name}，發送訊息...`
                          : "問問 NexusMind..."
                      }
                      rows={1}
                      className="flex-1 w-full bg-transparent text-foreground text-base focus:outline-none placeholder:text-gray-400 resize-none overflow-y-auto leading-6 max-h-[200px]"
                      autoFocus
                    />
                  </div>
                  {threadManager.isRunning ? (
                    <button
                      type="button"
                      onClick={() => threadManager.onCancel()}
                      className="ml-3 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full transition-all shadow-md shadow-red-500/25"
                      title="停止生成"
                    >
                      <Square className="w-4 h-4 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim() && !imageAttach.hasImages}
                      className="ml-3 p-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 disabled:opacity-30 text-white rounded-full transition-all shadow-md shadow-blue-500/25"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* 輸入框底部：選中的助理/技能標籤 */}
                {selectedItem && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <SelectedItemBadge
                      item={selectedItem}
                      executingSkillId={executingSkillId}
                      onDeselect={handleDeselectItem}
                    />
                  </div>
                )}
              </div>
            </form>

            {/* 統一膠囊選擇區（助理 + 技能） */}
            <AssistantSkillSelector
              personas={capsulePersonas}
              skills={skills}
              selectedItem={selectedItem}
              executingSkillId={executingSkillId}
              isLoading={capsuleLoading}
              onSelectPersona={handleSelectPersonaUnified}
              onSelectSkill={handleSelectSkillUnified}
              onDeselect={handleDeselectItem}
            />

            {/* 助理/技能描述 + 快速開始（選中時顯示） */}
            <AnimatePresence mode="wait">
              {selectedItem?.type === "persona" && (
                <PersonaDetailPanel
                  key={selectedItem.persona.id}
                  persona={selectedItem.persona}
                  onQuickPrompt={(text) => {
                    if (threadManager.isRunning || submitLockRef.current) return;
                    submitLockRef.current = true;
                    syncConversationExtra();
                    threadManager.processMessage({
                      role: "user",
                      type: "prompt",
                      message: text,
                    });
                    setTimeout(() => { submitLockRef.current = false; }, 0);
                  }}
                />
              )}
              {selectedItem?.type === "skill" && (
                <PersonaDetailPanel
                  key={selectedItem.skill.id}
                  skill={selectedItem.skill}
                  onQuickPrompt={async (text) => {
                    if (submitLockRef.current) return;
                    submitLockRef.current = true;
                    const skill = selectedItem.skill;
                    const skillMsgId = generateUUID();
                    const prefix = `[${skill.display_name}] `;
                    const userMsgContent = text.startsWith(prefix) ? text : `${prefix}${text}`;

                    syncConversationExtra();

                    // 確保 thread 存在（新對話首發技能時建立）
                    let threadId = threadList.selectedThreadId;
                    const isNewSkillThread3 = !threadId;
                    if (!threadId) {
                      const newThread = await threadList.createThread(userMsgContent.slice(0, 30), modelRef.current);
                      threadId = newThread.id;
                      // 不立即 selectThread — useChat id 變更會清空 messages
                      pendingThreadIdRef.current = threadId;
                      window.history.replaceState(null, "", `/chat/${threadId}`);
                      window.dispatchEvent(new CustomEvent("conversation-created"));
                    }

                    // 組裝已有的對話歷史（多輪迭代）
                    const existingMessages = threadManagerRef.current.messages;
                    const messageHistory = existingMessages.map((msg) => {
                      const role = msg.role === "user" ? "User" : "Assistant";
                      const content = msg.parts
                        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
                        .map((p) => p.text)
                        .join("\n") || "";
                      return `${role}: ${content}`;
                    });

                    threadManagerRef.current.appendMessages({
                      id: generateUUID(),
                      role: "user",
                      parts: [{ type: "text", text: userMsgContent }],
                    } as UIMessage);

                    // 插入執行中的進度顯示
                    const loadingMsgId = generateUUID();
                    setSkillExecution({
                      id: loadingMsgId,
                      skillName: skill.display_name,
                      startedAt: Date.now(),
                    });

                    // 通知 sidebar 顯示轉圈動畫
                    const skillStartThreadId3 = threadId;
                    if (skillStartThreadId3) {
                      window.dispatchEvent(new CustomEvent("streaming-state-changed", {
                        detail: { threadId: skillStartThreadId3, isRunning: true },
                      }));
                    }

                    // 標記技能執行中，防止 thread-loader 誤顯示「回覆中斷」
                    if (skillStartThreadId3) {
                      window.localStorage.setItem(`skill-executing-${skillStartThreadId3}`, Date.now().toString());
                    }

                    executeSkill(skill, {
                      conversationId: threadId || undefined,
                      userInput: text,
                      messageId: skillMsgId,
                      userMessageContent: userMsgContent,
                      messageHistory: messageHistory.length > 0 ? messageHistory : undefined,
                    }).then((result) => {
                      setSkillExecution(null);

                      if (result) {
                        // 只有仍在同一 thread 時才更新 UI（背景執行時用戶可能已切換）
                        if (threadIdRef.current === skillStartThreadId3) {
                          threadManagerRef.current.appendMessages({
                            id: skillMsgId,
                            role: "assistant",
                            parts: [{ type: "text", text: result.message }],
                          } as UIMessage);
                        }
                        // 主動回寫到 DB
                        if (threadId) {
                          void fetch(`/api/conversations/${threadId}/messages`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            keepalive: true,
                            body: JSON.stringify({
                              content: result.message,
                              allowUpdate: true,
                            }),
                          }).catch((err) => {
                            console.warn("[Skill] backup persist failed:", err);
                          });
                        }
                      } else {
                        if (threadIdRef.current === skillStartThreadId3) {
                          threadManagerRef.current.appendMessages({
                            id: skillMsgId,
                            role: "assistant",
                            parts: [{ type: "text" as const, text: "⚠️ 技能執行失敗，請稍後再試" }],
                          } as UIMessage);
                        }
                      }
                    }).catch(() => {
                      setSkillExecution(null);
                      if (threadIdRef.current === skillStartThreadId3) {
                        threadManagerRef.current.appendMessages({
                          id: skillMsgId,
                          role: "assistant",
                          parts: [{ type: "text" as const, text: "⚠️ 技能執行失敗，請稍後再試" }],
                        } as UIMessage);
                      }
                    }).finally(() => {
                      // 清除 localStorage 執行中標記
                      if (skillStartThreadId3) {
                        window.localStorage.removeItem(`skill-executing-${skillStartThreadId3}`);
                      }
                      // 停止 sidebar 轉圈動畫
                      if (skillStartThreadId3) {
                        window.dispatchEvent(new CustomEvent("streaming-state-changed", {
                          detail: { threadId: skillStartThreadId3, isRunning: false },
                        }));
                      }
                      submitLockRef.current = false;
                      // 新建的技能對話：執行完成後再切換 sidebar
                      if (isNewSkillThread3 && threadId) {
                        pendingThreadIdRef.current = null;
                        skipChatStoreSwitchRef.current = true;
                        globalSelectedItemCache.set(threadId, selectedItemRef.current);
                        threadList.setSelectedThreadId(threadId);
                      }
                    });
                  }}
                />
              )}
            </AnimatePresence>
            {/* 隱藏 file input（歡迎頁面用） */}
            <input
              ref={imageAttach.fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              onChange={imageAttach.handleFileChange}
              className="hidden"
            />
            {imageAttach.error && (
              <p className="text-center text-xs text-red-500 mt-1">
                {imageAttach.error}
              </p>
            )}
          </div>
        </div>

        <DocumentViewer
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          initialTitle={viewerTitle}
          initialDocId={viewerDocId}
          initialPage={viewerPage}
          onDocumentLoaded={(title) => setViewerTitle(title)}
        />
        {skillOverlays}
      </div>
    );
  }

  // ===主畫面：頂部導航 + 訊息列表 + 底部輸入框 ===
  return (
    <div className="flex h-full bg-background relative">
      {/* 左側：對話面板 */}
      <div
        className={`flex flex-col h-full transition-all duration-300 min-w-0 ${showCanvas ? "w-full md:w-3/5" : "w-full"}`}
      >
        {/* 1. Top Header */}
        {threadManager.messages.length > 0 && (
          <header className="flex-shrink-0 h-14 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-2 md:px-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md z-10 gap-2">
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                NM
              </div>
              <span className="font-semibold text-sm text-foreground hidden md:inline">
                NexusMind
              </span>
            </div>
            <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 mr-1 md:mr-2">
                {selectedItem
                  ? (selectedItem.type === "persona"
                    ? `${getPersonaIconText(selectedItem.persona.icon)} ${selectedItem.persona.name}`
                    : `${getSkillIcon(selectedItem.skill.icon)} ${selectedItem.skill.display_name}`)
                  : `${getPersonaIconText(selectedPersona.icon)} ${selectedPersona.name}`}
              </div>
              <button
                onClick={handleToggleCanvas}
                title={showCanvas ? "關閉對話總結報告生成" : "打開對話總結報告生成"}
                className={`flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 whitespace-nowrap ${showCanvas
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
              >
                {showCanvas ? (
                  <PanelRightClose className="w-3.5 h-3.5" />
                ) : (
                  <PenTool className="w-3.5 h-3.5" />
                )}
                <span className="hidden md:inline">
                  {showCanvas ? "關閉報告" : "對話總結報告生成"}
                </span>
              </button>
            </div>
          </header>
        )}

        {/* 2. Main Content Area */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden px-3 md:px-4 py-4"
          >
            <div className="w-full space-y-6 pb-32">
              {threadManager.isLoadingMessages && (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-2" />
                  <p className="text-sm">載入對話紀錄...</p>
                </div>
              )}

              <AnimatePresence>
                {threadManager.messages.map((message, index) => {
                  const isLastMessage =
                    index === threadManager.messages.length - 1;

                  // 思考動畫期間隱藏最後一則空的 assistant message，避免重複指示器
                  if (chatThinkingVisible && message.role === "assistant" && isLastMessage) {
                    return null;
                  }

                  return (
                    <motion.div
                      key={message.id}
                      data-message-id={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`w-full flex gap-2 md:gap-3 mb-6 transition-all ${message.role === "user"
                        ? "justify-end"
                        : "justify-start"
                        }`}
                    >
                      {message.role === "assistant" && (
                        <div className="mt-1 flex-shrink-0">
                          <BotAvatar size="sm" />
                        </div>
                      )}

                      <div
                        className={`flex flex-col min-w-0 ${message.role === "user" ? "items-end" : "items-start"} ${message.role === "user" ? (showCanvas ? "max-w-[95%]" : "max-w-[85%]") : "max-w-full"}`}
                      >
                        <div
                          className={`relative w-full text-sm leading-relaxed overflow-hidden break-words ${message.role === "user"
                            ? "px-3 md:px-4 py-3 rounded-2xl rounded-tr-sm bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-md shadow-blue-500/20"
                            : "py-1 text-gray-800 dark:text-gray-100"
                            }`}
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {message.role === "assistant" ? (
                            message.id.startsWith("local-executing-") ? (
                              <div className="flex items-center gap-2 py-1 text-sm text-gray-500 dark:text-gray-400">
                                <Loader2 className="w-4 h-4 animate-spin text-blue-500 flex-shrink-0" />
                                <span>生成中...</span>
                              </div>
                            ) : (
                              <AssistantMessageRenderer
                                message={message}
                                conversationId={activeConversationId}
                                isGenerating={
                                  threadManager.isRunning && isLastMessage
                                }
                              />
                            )
                          ) : (
                            <div>
                              {/* 使用者附加的圖片 */}
                              {(() => {
                                const imgParts = (message.parts ?? []).filter(
                                  (p: any) =>
                                    p.type === "file" && typeof p.mediaType === "string" && p.mediaType.startsWith("image/"),
                                ) as unknown as Array<{ type: "file"; data: string; mediaType: string }>;
                                if (imgParts.length === 0) return null;
                                return (
                                  <div className="flex gap-2 mb-2">
                                    {imgParts.map((img, i) => (
                                      <img
                                        key={i}
                                        src={`data:${img.mediaType};base64,${img.data}`}
                                        alt={`附加圖片 ${i + 1}`}
                                        className="w-20 h-20 object-cover rounded-lg border border-white/30"
                                      />
                                    ))}
                                  </div>
                                );
                              })()}
                              {(() => {
                                const textContent = message.parts
                                  ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
                                  .map((p) => p.text)
                                  .join("\n") || "";
                                return textContent ? (
                                  <div className="whitespace-pre-wrap break-words">
                                    {textContent}
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          )}
                        </div>
                        {/* 技能附件卡片 */}
                        {message.role === "assistant" &&
                          (() => {
                            const att = getAttachment(message.id);
                            return att ? (
                              <AttachmentCard attachment={att} />
                            ) : null;
                          })()}
                        {/* 操作按鈕列（生成中佔位符不顯示按鈕） */}
                        {!message.id.startsWith("local-executing-") && (
                          <div className="mt-1 flex items-center gap-1">
                            <CopyButton
                              text={(() => {
                                return extractPlainText(message.parts || []);
                              })()}
                            />
                            {message.role === "assistant" &&
                              activeConversationId && (
                                <ForkButton
                                  conversationId={activeConversationId}
                                  messageIndex={index}
                                />
                              )}
                          </div>
                        )}
                      </div>
                      {message.role === "user" && <UserAvatar />}
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Skill execution progress — Claude Code 風格動畫進度 */}
              {skillExecution && (
                <motion.div
                  key={skillExecution.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full flex gap-2 md:gap-3 mb-6 transition-all justify-start"
                >
                  <div className="mt-1 flex-shrink-0">
                    <BotAvatar size="sm" />
                  </div>
                  <div className={`flex flex-col min-w-0 items-start ${showCanvas ? "max-w-[95%]" : "max-w-[85%]"}`}>
                    <SkillExecutionProgress execution={skillExecution} />
                  </div>
                </motion.div>
              )}

              {/* Thinking process animation — Claude Code 風格（最小顯示 3 秒） */}
              {chatThinkingVisible &&
                (() => {
                  // 找到最近的 user message 判斷搜尋模式
                  const userMsg = [...threadManager.messages]
                    .reverse()
                    .find((m) => m.role === "user");
                  const userContent = userMsg?.parts
                    ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
                    .map((p) => p.text)
                    .join("\n") || "";
                  const isSearchLikely =
                    /202[5-9]|CES|Computex|MWC|最新|新聞|news|latest|today|now/i.test(
                      userContent,
                    );

                  // 從串流中的 assistant message 取得後端真實進度
                  const lastMsg = threadManager.messages[threadManager.messages.length - 1];
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const progressPart = lastMsg?.role === "assistant"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ? (lastMsg.parts?.find((p: any) => (p as any).type === "data-progress") as any)
                    : null;
                  const progressStep: number = progressPart?.data?.step ?? 1;

                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="w-full flex gap-3 mb-6 justify-start"
                    >
                      <div className="mt-1 flex-shrink-0">
                        <BotAvatar size="sm" animate />
                      </div>
                      <div className={`flex flex-col min-w-0 items-start ${showCanvas ? "max-w-[95%]" : "max-w-[85%]"}`}>
                        <ChatThinkingProgress
                          mode={isSearchLikely ? "search" : "default"}
                          isLoading={true}
                          currentStep={progressStep}
                        />
                      </div>
                    </motion.div>
                  );
                })()}
              {/* Skill Lazy Loading Indicator */}
              {loadingSkills.length > 0 && (
                <SkillLoadingIndicator loadingSkills={loadingSkills} />
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          </div>

          {/* Bottom Input Area */}
          <form
            onSubmit={handleSubmit}
            className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md"
          >
            <ImagePreviewBar
              images={imageAttach.images}
              onRemove={imageAttach.removeImage}
            />
            <div className="relative flex flex-col bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={imageAttach.openFilePicker}
                  disabled={!imageAttach.canAddMore}
                  className="mr-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 transition-colors"
                  title="附加圖片"
                >
                  <ImagePlus className="w-4 h-4" />
                </button>
                <div className="relative flex-1">
                  {bottomTextareaHint.showTop && (
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-4 rounded-t-xl bg-gradient-to-b from-black/12 to-transparent dark:from-white/12 z-10" />
                  )}
                  {bottomTextareaHint.showBottom && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 rounded-b-xl bg-gradient-to-t from-black/12 to-transparent dark:from-white/12 z-10" />
                  )}
                  <textarea
                    id="chat-input"
                    name="chat-input"
                    ref={bottomInputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleInputKeyDown}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    onScroll={handleInputScroll}
                    onPaste={imageAttach.handlePasteImages}
                    placeholder={
                      selectedItem
                        ? selectedItem.type === "persona"
                          ? `${selectedItem.persona.name}，發送訊息...`
                          : `${selectedItem.skill.display_name}，發送訊息...`
                        : "輸入訊息..."
                    }
                    rows={1}
                    className="flex-1 w-full bg-transparent text-foreground text-sm focus:outline-none placeholder:text-gray-400 resize-none overflow-y-auto leading-6 max-h-[150px]"
                  />
                </div>
                {threadManager.isRunning ? (
                  <button
                    type="button"
                    onClick={() => threadManager.onCancel()}
                    className="ml-3 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                    title="停止生成"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim() && !imageAttach.hasImages}
                    className="ml-3 p-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white rounded-lg transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-center text-xs text-gray-400 mt-2">
              AI 內容僅供參考，請查核重要資訊。
            </p>
          </form>
          {/* 統一膠囊選擇器：對話開始後隱藏（鎖定） */}
          {/* Removed AssistantSkillSelector from here to lock selected assistant/skill */}

          {/* 隱藏 file input（由 imageAttach.openFilePicker 觸發） */}
          <input
            ref={imageAttach.fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            onChange={imageAttach.handleFileChange}
            className="hidden"
          />
          {imageAttach.error && (
            <p className="text-center text-xs text-red-500 mt-1 px-4">
              {imageAttach.error}
            </p>
          )}
        </div>

        <DocumentViewer
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          initialTitle={viewerTitle}
          initialDocId={viewerDocId}
          initialPage={viewerPage}
          onDocumentLoaded={(title) => setViewerTitle(title)}
        />

        {/* 技能輸入對話框 + 錯誤 toast（共用） */}
        {skillOverlays}
      </div>
      {/* 關閉左側對話面板 */}

      {/* 右側：報告生成面板 */}
      {showCanvas && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background md:relative md:inset-auto md:z-auto md:w-2/5 md:h-full md:border-l border-gray-200 dark:border-gray-700 md:flex-shrink-0">
          {/* 手機端 Canvas 頂部返回列 */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 md:hidden flex-shrink-0">
            <button
              onClick={handleToggleCanvas}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
              返回對話
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <CanvasEditor
              key={activeConversationId || "new"}
              initialContent={canvasInitialContent}
              isGenerating={isGeneratingReport}
              fromConversation
            />
          </div>
        </div>
      )}
    </div>
  );
}
