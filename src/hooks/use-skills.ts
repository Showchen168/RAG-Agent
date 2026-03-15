"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  Skill,
  ClarificationQuestion,
  ClarificationAnswer,
  GeneratedSkillConfig,
} from "@/types/skills";

// ─── Types ──────────────────────────────────────────

/** 技能執行結果中的附件資訊 */
export interface SkillAttachmentInfo {
  readonly id: string;
  readonly fileName: string;
  readonly fileType: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly downloadUrl: string;
  readonly previewContent: string | null;
}

/** 技能執行回應 */
interface SkillExecuteResponse {
  readonly message: string;
  readonly attachment: SkillAttachmentInfo | null;
}

/** 執行技能時的參數 */
export interface ExecuteSkillOptions {
  readonly conversationId?: string;
  readonly messageHistory?: ReadonlyArray<string>;
  readonly userInput?: string;
  readonly messageId?: string;
  /** 使用者訊息文字（用於持久化到 DB） */
  readonly userMessageContent?: string;
  /** 釐清問題的回答（多輪釐清功能） */
  readonly clarificationAnswers?: ReadonlyArray<ClarificationAnswer>;
}

/** 簡化的訊息結構（用於附件匹配） */
export interface SimpleMessage {
  readonly id: string;
  readonly role: string;
  readonly content?: string;
}

/** Hook 回傳值 */
export interface UseSkillsReturn {
  readonly skills: ReadonlyArray<Skill>;
  readonly isLoadingSkills: boolean;
  readonly executingSkillId: string | null;
  readonly isClarifying: boolean;
  readonly isGeneratingSkill: boolean;
  readonly isSavingSkill: boolean;
  readonly skillError: string | null;
  readonly executeSkill: (
    skill: Skill,
    options: ExecuteSkillOptions,
  ) => Promise<SkillExecuteResponse | null>;
  /** 呼叫 Gemini 產生釐清問題 */
  readonly clarifySkill: (
    skill: Skill,
    userInput: string,
  ) => Promise<ReadonlyArray<ClarificationQuestion> | null>;
  readonly getAttachment: (
    messageId: string,
  ) => SkillAttachmentInfo | undefined;
  /** 從 DB 載入指定 message IDs 的技能附件，填充本地快取 */
  readonly loadAttachmentsForMessages: (
    messageIds: ReadonlyArray<string>,
  ) => Promise<void>;
  /** 透過 conversationId 載入附件，並透過 fileName 匹配到可見訊息 */
  readonly loadAttachmentsForConversation: (
    conversationId: string,
    visibleMessages: ReadonlyArray<SimpleMessage>,
  ) => Promise<void>;
  /** 從對話歷史生成 skill config */
  readonly generateSkillFromHistory: (
    conversationHistory: ReadonlyArray<string>,
  ) => Promise<GeneratedSkillConfig | null>;
  /** 儲存生成的 skill config 到 DB */
  readonly saveGeneratedSkill: (
    config: GeneratedSkillConfig,
  ) => Promise<Skill | null>;
  /** 重新載入技能列表 */
  readonly refreshSkills: () => Promise<void>;
  readonly clearSkillError: () => void;
}

// ─── Hook ──────────────────────────────────────────

export function useSkills(): UseSkillsReturn {
  const [skills, setSkills] = useState<ReadonlyArray<Skill>>([]);
  const [isLoadingSkills, setIsLoadingSkills] = useState(true);
  const [executingSkillId, setExecutingSkillId] = useState<string | null>(null);
  const [skillError, setSkillError] = useState<string | null>(null);
  const [isClarifying, setIsClarifying] = useState(false);
  const [isGeneratingSkill, setIsGeneratingSkill] = useState(false);
  const [isSavingSkill, setIsSavingSkill] = useState(false);
  const attachmentsRef = useRef<Map<string, SkillAttachmentInfo>>(new Map());
  const [, forceUpdate] = useState(0);

  // ─── 載入已啟用的技能列表 ────────────────────
  useEffect(() => {
    let ignore = false;

    async function fetchSkills() {
      try {
        const res = await fetch("/api/skills");
        if (!res.ok) {
          setSkills([]);
          return;
        }
        const data = await res.json();
        if (ignore) return;
        const allSkills: Skill[] = data.skills ?? [];
        const enabled = allSkills.filter((s) => s.is_enabled);
        setSkills(enabled);
      } catch {
        if (!ignore) {
          setSkills([]);
        }
      } finally {
        if (!ignore) {
          setIsLoadingSkills(false);
        }
      }
    }

    fetchSkills();
    return () => {
      ignore = true;
    };
  }, []);

  // ─── 輪詢技能執行狀態（超時後的 fallback） ────
  const pollForResult = useCallback(
    async (messageId: string): Promise<SkillExecuteResponse | null> => {
      const MAX_POLL_TIME = 300_000; // 最長輪詢 5 分鐘
      const POLL_INTERVAL = 5_000; // 每 5 秒輪詢一次
      const startTime = Date.now();

      while (Date.now() - startTime < MAX_POLL_TIME) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

        try {
          const res = await fetch(
            `/api/skills/execute/status?messageId=${encodeURIComponent(messageId)}`,
          );
          if (!res.ok) continue;

          const data = await res.json();

          if (data.status === "processing") continue;

          if (data.status === "failed") {
            setSkillError(
              (data as Record<string, string>).error ?? "技能執行失敗",
            );
            return null;
          }

          if (data.status === "completed") {
            const result: SkillExecuteResponse = {
              message: data.message as string,
              attachment: (data.attachment as SkillAttachmentInfo) ?? null,
            };

            // 儲存附件到本地快取
            if (result.attachment) {
              const newMap = new Map(attachmentsRef.current);
              newMap.set(messageId, result.attachment);
              attachmentsRef.current = newMap;
              forceUpdate((n) => n + 1);
            }

            return result;
          }
        } catch {
          // 網路錯誤時繼續重試
          continue;
        }
      }

      setSkillError("技能執行逾時，請稍後重試");
      return null;
    },
    [],
  );

  // ─── 執行技能 ────────────────────────────────
  const executeSkill = useCallback(
    async (
      skill: Skill,
      options: ExecuteSkillOptions,
    ): Promise<SkillExecuteResponse | null> => {
      setExecutingSkillId(skill.id);
      setSkillError(null);

      // 確保有 messageId 用於輪詢（如果前端未提供則自行生成）
      const messageId = options.messageId ?? crypto.randomUUID();

      try {
        // 設定 60 秒超時 — 足夠 Phase 0 釐清問題回應，
        // 但長時間執行（Phase 1+2）會觸發超時後自動切換輪詢模式
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60_000);

        let res: Response;
        try {
          res = await fetch("/api/skills/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              skillId: skill.id,
              conversationId: options.conversationId,
              messageHistory: options.messageHistory,
              userInput: options.userInput,
              messageId,
              userMessageContent: options.userMessageContent,
              clarificationAnswers: options.clarificationAnswers,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (fetchErr) {
          clearTimeout(timeoutId);

          // 超時或網路錯誤 — 切換到輪詢模式
          // （後端仍在執行中，最終會寫入 DB）
          if (options.conversationId) {
            return await pollForResult(messageId);
          }

          const message =
            fetchErr instanceof Error ? fetchErr.message : "技能執行失敗";
          setSkillError(message);
          return null;
        }

        if (!res.ok) {
          const errorBody = await res
            .json()
            .catch(() => ({ error: "技能執行失敗" }));
          const errorMsg =
            (errorBody as Record<string, string>).error ?? "技能執行失敗";
          setSkillError(errorMsg);
          return null;
        }

        const data: SkillExecuteResponse = await res.json();

        // 儲存附件（如果有）
        if (data.attachment) {
          const newMap = new Map(attachmentsRef.current);
          newMap.set(messageId, data.attachment);
          attachmentsRef.current = newMap;
          forceUpdate((n) => n + 1);
        }

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "技能執行失敗";
        setSkillError(message);
        return null;
      } finally {
        setExecutingSkillId(null);
      }
    },
    [pollForResult],
  );

  // ─── 釐清問題 ────────────────────────────────
  const clarifySkill = useCallback(
    async (
      skill: Skill,
      userInput: string,
    ): Promise<ReadonlyArray<ClarificationQuestion> | null> => {
      setIsClarifying(true);
      setSkillError(null);

      try {
        const res = await fetch("/api/skills/clarify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skillId: skill.id,
            userInput,
          }),
        });

        if (!res.ok) {
          const errorBody = await res
            .json()
            .catch(() => ({ error: "釐清問題產生失敗" }));
          const errorMsg =
            (errorBody as Record<string, string>).error ?? "釐清問題產生失敗";
          setSkillError(errorMsg);
          return null;
        }

        const data = await res.json();
        return (data.questions ?? []) as ReadonlyArray<ClarificationQuestion>;
      } catch (err) {
        const message = err instanceof Error ? err.message : "釐清問題產生失敗";
        setSkillError(message);
        return null;
      } finally {
        setIsClarifying(false);
      }
    },
    [],
  );

  // ─── 取得附件 ────────────────────────────────
  const getAttachment = useCallback(
    (messageId: string): SkillAttachmentInfo | undefined => {
      return attachmentsRef.current.get(messageId);
    },
    [],
  );

  // ─── 從 DB 載入技能附件（thread 切換時恢復） ──
  const loadAttachmentsForMessages = useCallback(
    async (messageIds: ReadonlyArray<string>): Promise<void> => {
      if (messageIds.length === 0) return;
      try {
        const res = await fetch("/api/skills/attachments/by-messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageIds }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const items = data.attachments as SkillAttachmentInfo[] | undefined;
        if (!items?.length) return;

        const newMap = new Map(attachmentsRef.current);
        for (const att of items) {
          // API 回傳的 messageId 欄位對應前端的 key
          const msgId = (att as SkillAttachmentInfo & { messageId?: string })
            .messageId;
          if (msgId) {
            newMap.set(msgId, att);
          }
        }
        attachmentsRef.current = newMap;
        forceUpdate((n) => n + 1);
      } catch {
        // 載入失敗不影響主流程
      }
    },
    [],
  );

  // ─── 透過 conversationId 載入附件 ──────────────
  const loadAttachmentsForConversation = useCallback(
    async (
      conversationId: string,
      visibleMessages: ReadonlyArray<SimpleMessage>,
    ): Promise<void> => {
      if (!conversationId) return;
      try {
        const res = await fetch("/api/skills/attachments/by-messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const items = data.attachments as
          | (SkillAttachmentInfo & { messageId?: string })[]
          | undefined;
        if (!items?.length) return;

        // 將附件匹配到可見的 assistant 訊息（透過 fileName 出現在訊息內容中）
        const newMap = new Map(attachmentsRef.current);
        for (const att of items) {
          // 先嘗試直接 messageId 匹配（正常流程中 in-memory 已有的情況）
          const directMatch = visibleMessages.find(
            (m) => m.id === att.messageId,
          );
          if (directMatch) {
            newMap.set(directMatch.id, att);
            continue;
          }

          // fallback: 透過 fileName 匹配可見的 assistant 訊息內容
          const contentMatch = visibleMessages.find((m) => {
            if (m.role !== "assistant") return false;
            const content =
              typeof m.content === "string"
                ? m.content
                : JSON.stringify(m.content ?? "");
            return content.includes(att.fileName);
          });
          if (contentMatch) {
            newMap.set(contentMatch.id, att);
          }
        }
        attachmentsRef.current = newMap;
        forceUpdate((n) => n + 1);
      } catch {
        // 載入失敗不影響主流程
      }
    },
    [],
  );

  // ─── 重新載入技能列表 ────────────────────────
  const refreshSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/skills");
      if (!res.ok) return;
      const data = await res.json();
      const allSkills: Skill[] = data.skills ?? [];
      const enabled = allSkills.filter((s) => s.is_enabled);
      setSkills(enabled);
    } catch {
      // 重新載入失敗不影響主流程
    }
  }, []);

  // ─── 從對話歷史生成 skill config ────────────
  const generateSkillFromHistory = useCallback(
    async (
      conversationHistory: ReadonlyArray<string>,
    ): Promise<GeneratedSkillConfig | null> => {
      setIsGeneratingSkill(true);
      setSkillError(null);

      try {
        const res = await fetch("/api/skills/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationHistory }),
        });

        if (!res.ok) {
          const errorBody = await res
            .json()
            .catch(() => ({ error: "技能生成失敗" }));
          const errorMsg =
            (errorBody as Record<string, string>).error ?? "技能生成失敗";
          setSkillError(errorMsg);
          return null;
        }

        const data = await res.json();
        return (data.config ?? null) as GeneratedSkillConfig | null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "技能生成失敗";
        setSkillError(message);
        return null;
      } finally {
        setIsGeneratingSkill(false);
      }
    },
    [],
  );

  // ─── 儲存生成的 skill config 到 DB ──────────
  const saveGeneratedSkill = useCallback(
    async (config: GeneratedSkillConfig): Promise<Skill | null> => {
      setIsSavingSkill(true);
      setSkillError(null);

      try {
        const res = await fetch("/api/skills/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        });

        if (!res.ok) {
          const errorBody = await res
            .json()
            .catch(() => ({ error: "技能儲存失敗" }));
          const errorMsg =
            (errorBody as Record<string, string>).error ?? "技能儲存失敗";
          setSkillError(errorMsg);
          return null;
        }

        const data = await res.json();
        const savedSkill = (data.skill ?? null) as Skill | null;

        // 儲存成功後重新載入技能列表
        if (savedSkill) {
          await refreshSkills();
        }

        return savedSkill;
      } catch (err) {
        const message = err instanceof Error ? err.message : "技能儲存失敗";
        setSkillError(message);
        return null;
      } finally {
        setIsSavingSkill(false);
      }
    },
    [refreshSkills],
  );

  // ─── 清除錯誤 ────────────────────────────────
  const clearSkillError = useCallback(() => {
    setSkillError(null);
  }, []);

  return {
    skills,
    isLoadingSkills,
    executingSkillId,
    isClarifying,
    isGeneratingSkill,
    isSavingSkill,
    skillError,
    executeSkill,
    clarifySkill,
    getAttachment,
    loadAttachmentsForMessages,
    loadAttachmentsForConversation,
    generateSkillFromHistory,
    saveGeneratedSkill,
    refreshSkills,
    clearSkillError,
  };
}
