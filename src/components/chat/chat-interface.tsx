"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Send, Loader2, BookmarkPlus, Check, X } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import { MarkdownRenderer } from "./markdown-renderer";
import { useChatSession } from "./chat-session-context";
import { SkillButtonPanel } from "./skill-button-panel";
import { SkillInputDialog } from "./skill-input-dialog";
import { AttachmentCard } from "./attachment-card";
import { useSkills } from "@/hooks/use-skills";
import { generateUUID } from "@/lib/uuid";
import type { Skill, ClarificationAnswer } from "@/types/skills";

interface ChatInterfaceProps {
  conversationId?: string;
}

// Avatars are removed in the new design to match the reference screenshot.

/** 儲存為報告按鈕 */
function SaveToReportBtn({
  content,
  conversationId,
}: {
  content: string;
  conversationId?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleSave = async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      const firstLine = content
        .split("\n")
        .find((l) => l.trim())
        ?.replace(/^#+\s*/, "")
        .trim();
      const title = firstLine?.slice(0, 60) || "未命名報告";

      const res = await fetch("/api/reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          markdown_content: content,
          conversation_id: conversationId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "儲存失敗");
      }
      setSaved(true);
      setToast(title);
      window.dispatchEvent(new CustomEvent("reports-updated"));
      // 6 秒後自動關閉 toast
      setTimeout(() => setToast(null), 6000);
    } catch (err) {
      alert(`儲存報告失敗: ${err instanceof Error ? err.message : "未知錯誤"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={handleSave}
        disabled={saving || saved}
        className={`inline-flex items-center gap-1 mt-2 rounded-full border px-2.5 py-1 text-xs transition-colors ${saved
          ? "border-green-300 text-green-600 dark:border-green-700 dark:text-green-400"
          : "border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 dark:border-gray-700 dark:text-gray-400 dark:hover:text-blue-400"
          } disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {saving ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : saved ? (
          <Check className="w-3 h-3" />
        ) : (
          <BookmarkPlus className="w-3 h-3" />
        )}
        {saving ? "儲存中" : saved ? "已儲存到報告" : "儲存為報告"}
      </button>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex items-center gap-3 bg-white dark:bg-gray-800 border border-green-200 dark:border-green-800 rounded-xl shadow-lg shadow-green-500/10 px-4 py-3 max-w-md">
            <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                已儲存「{toast}」
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                前往 知識庫 → 專業報告 查看
              </p>
            </div>
            <button
              onClick={() => {
                window.open("/knowledge?tab=reports", "_blank");
                setToast(null);
              }}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium whitespace-nowrap"
            >
              前往查看
            </button>
            <button
              onClick={() => setToast(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function ChatInterface({
  conversationId: initialConversationId,
}: ChatInterfaceProps) {
  const {
    messages,
    isLoading,
    model,
    input,
    authStatus,
    historyLoading,
    suggestions,
    conversationId,
    sendMessage,
    setModel,
    setInput,
    loadConversation,
  } = useChatSession();

  const { skills, executingSkillId, isClarifying, executeSkill, clarifySkill } =
    useSkills();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastLoadedConvIdRef = useRef<string | undefined>(undefined);

  // 技能輸入對話框狀態
  const [dialogSkill, setDialogSkill] = useState<Skill | null>(null);

  // 技能執行後的訊息 + 附件
  const [skillMessages, setSkillMessages] = useState<
    Array<{ id: string; content: string }>
  >([]);
  const [skillAttachments, setSkillAttachments] = useState<
    Map<
      string,
      {
        id: string;
        fileName: string;
        fileType: string;
        mimeType: string;
        fileSize: number;
        downloadUrl: string;
        previewContent: string | null;
      }
    >
  >(new Map());

  // 當 conversationId 改變時，載入對話歷史
  useEffect(() => {
    if (
      initialConversationId &&
      initialConversationId !== lastLoadedConvIdRef.current
    ) {
      lastLoadedConvIdRef.current = initialConversationId;
      loadConversation(initialConversationId);
    }
  }, [initialConversationId, loadConversation]);

  // 自動捲動到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, skillMessages]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage(input.trim());
    },
    [input, sendMessage],
  );

  // ─── 技能按鈕點擊處理 ──────────────────────────
  const handleSkillClick = useCallback(
    (skill: Skill) => {
      const inputType = skill.skill_config.input.type;
      if (inputType === "user" || inputType === "both") {
        setDialogSkill(skill);
      } else {
        // context 類型 — 直接執行
        const history = messages
          .slice(-10)
          .map((m) => `${m.role}: ${m.content}`);
        const messageId = generateUUID();

        executeSkill(skill, {
          conversationId,
          messageHistory: history,
          messageId,
        }).then((result) => {
          if (result) {
            setSkillMessages((prev) => [
              ...prev,
              { id: messageId, content: result.message },
            ]);
            if (result.attachment) {
              setSkillAttachments((prev) => {
                const next = new Map(prev);
                next.set(messageId, result.attachment!);
                return next;
              });
            }
          }
        });
      }
    },
    [messages, conversationId, executeSkill],
  );

  // ─── 技能對話框提交 ───────────────────────────
  const handleSkillDialogSubmit = useCallback(
    (
      userInput: string,
      clarificationAnswers?: ReadonlyArray<ClarificationAnswer>,
    ) => {
      if (!dialogSkill) return;
      const skill = dialogSkill;
      setDialogSkill(null);

      const history = messages.slice(-10).map((m) => `${m.role}: ${m.content}`);
      const messageId = generateUUID();

      executeSkill(skill, {
        conversationId,
        messageHistory: history,
        userInput,
        messageId,
        clarificationAnswers,
      }).then((result) => {
        if (result) {
          setSkillMessages((prev) => [
            ...prev,
            { id: messageId, content: result.message },
          ]);
          if (result.attachment) {
            setSkillAttachments((prev) => {
              const next = new Map(prev);
              next.set(messageId, result.attachment!);
              return next;
            });
          }
        }
      });
    },
    [dialogSkill, messages, conversationId, executeSkill],
  );

  // ─── 技能釐清問題 ───────────────────────────
  const handleSkillClarify = useCallback(
    async (skill: Skill, userInput: string) => {
      return clarifySkill(skill, userInput);
    },
    [clarifySkill],
  );

  const isNewChat = messages.length === 0 && !historyLoading;

  // 快捷提示 — 直接送出對話
  function handleQuickPrompt(text: string) {
    sendMessage(text);
  }

  // === 新對話歡迎畫面 ===
  if (isNewChat) {
    return (
      <div className="flex flex-col h-full bg-[#f9f9fb] dark:bg-gray-900 items-center justify-center px-4">
        <div className="w-full max-w-3xl flex flex-col items-center">
          <div className="mb-10 text-center space-y-3">
            <h1 className="text-2xl text-foreground">
              我可以為您自動生成專業的內容，請告訴我您的需求。
            </h1>
          </div>

          {/* 技能提示 */}
          <div className="w-full max-w-2xl text-left mb-6">
            <SkillButtonPanel
              skills={skills}
              executingSkillId={executingSkillId}
              onSkillClick={handleSkillClick}
            />
          </div>

          {/* 居中大輸入框 (SendBox Style) */}
          <form onSubmit={handleSubmit} className="w-full max-w-2xl relative">
            <div className="relative flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-[24px] p-4 shadow-sm focus-within:shadow-md focus-within:border-gray-300 transition-all min-h-[120px]">
              <TextareaAutosize
                id="new-chat-input"
                name="new-chat-input"
                value={input}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim() && !isLoading) {
                      sendMessage(input.trim());
                    }
                  }
                }}
                minRows={2}
                maxRows={10}
                placeholder="發送訊息..."
                className="flex-1 bg-transparent text-foreground text-base focus:outline-none placeholder:text-gray-400 resize-none px-2"
                autoFocus
              />
              <div className="flex justify-between items-center mt-2 px-1">
                <div className="flex gap-2 text-gray-400 items-center">
                  <button type="button" className="w-8 h-8 bg-gray-100 text-gray-500 hover:bg-gray-200 rounded-full transition-colors flex items-center justify-center">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  </button>
                  <button type="button" className="px-3 py-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-full text-sm transition-colors">
                    Default
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  {isLoading && <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
                  <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="w-10 h-10 flex items-center justify-center bg-gray-300 hover:bg-gray-400 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed rounded-full transition-all"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            {/* 提示詞 */}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4 text-xs">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleQuickPrompt(s)}
                    className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>

        <SkillInputDialog
          key={dialogSkill?.id ?? "none"}
          skill={dialogSkill}
          onSubmit={handleSkillDialogSubmit}
          onCancel={() => setDialogSkill(null)}
          onClarify={handleSkillClarify}
          isClarifying={isClarifying}
        />
      </div>
    );
  }

  // === 對話模式（有訊息後，標準聊天佈局） ===
  return (
    <div className="flex flex-col h-full bg-[#f9f9fb] dark:bg-gray-900">
      {/* 訊息區域 */}
      <div className="flex-1 overflow-y-auto px-3 py-6 md:px-4 space-y-6">
        {historyLoading && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">載入對話紀錄...</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex max-w-4xl mx-auto w-full px-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={`flex flex-col min-w-0 ${message.role === "user" ? "items-end" : "items-start w-full"}`}>
              {message.role === "assistant" && (
                <div className="flex items-center gap-2 mb-2 text-sm text-gray-500">
                  <span className="font-medium text-gray-700">Auto (Gemini 3)</span>
                </div>
              )}
              <div
                className={`${message.role === "user"
                  ? "bg-[#e2e2e9] text-[#1f2328] px-4 py-2.5 rounded-[20px] rounded-br-[4px] max-w-[85%]"
                  : "text-[#1f2328] w-full"
                  }`}
              >
                {message.role === "assistant" ? (
                  <MarkdownRenderer
                    textMarkdown={message.content}
                    isStreaming={
                      isLoading && message === messages[messages.length - 1]
                    }
                  />
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed text-[15px]">
                    {message.content}
                  </p>
                )}
              </div>
              {/* 附件卡片 */}
              {message.role === "assistant" &&
                skillAttachments.has(message.id) && (
                  <AttachmentCard
                    attachment={skillAttachments.get(message.id)!}
                  />
                )}
              {message.role === "assistant" &&
                !isLoading &&
                message.content.length > 100 && (
                  <SaveToReportBtn
                    content={message.content}
                    conversationId={conversationId}
                  />
                )}
            </div>

          </div>
        ))}

        {/* 技能產出的訊息 */}
        {skillMessages.map((sm) => (
          <div key={sm.id} className="flex max-w-4xl mx-auto w-full px-4 justify-start">
            <div className="flex flex-col min-w-0 w-full">
              <div className="text-foreground w-full">
                <MarkdownRenderer textMarkdown={sm.content} />
              </div>
              {skillAttachments.has(sm.id) && (
                <AttachmentCard attachment={skillAttachments.get(sm.id)!} />
              )}
            </div>
          </div>
        ))}

        {/* 技能執行中 loading */}
        {executingSkillId && (
          <div className="flex max-w-4xl mx-auto w-full px-4">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
              <p className="text-sm text-gray-500">技能執行中...</p>
            </div>
          </div>
        )}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex max-w-4xl mx-auto w-full px-4">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              <p className="text-sm text-gray-500">思考中...</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 底部輸入區域 */}
      <div className="bg-transparent pb-6 pt-2">
        <div className="max-w-4xl mx-auto px-4 w-full">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-[24px] p-3 shadow-sm focus-within:shadow-lg focus-within:border-gray-300 transition-all min-h-[100px]"
          >
            <TextareaAutosize
              id="chat-input"
              name="chat-input"
              value={input}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !isLoading) {
                    sendMessage(input.trim());
                  }
                }
              }}
              minRows={1}
              maxRows={10}
              placeholder="發送訊息..."
              className="flex-1 bg-transparent text-foreground text-base focus:outline-none placeholder:text-gray-400 w-full resize-none px-2"
            />
            <div className="flex justify-between items-center mt-2 px-1">
              <div className="flex gap-2 text-gray-400">
                <button type="button" className="p-1.5 hover:bg-gray-100 rounded-full transition-colors flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
              </div>
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-700 disabled:opacity-40 rounded-full transition-all"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* 技能輸入對話框 */}
      <SkillInputDialog
        skill={dialogSkill}
        onSubmit={handleSkillDialogSubmit}
        onCancel={() => setDialogSkill(null)}
        onClarify={handleSkillClarify}
        isClarifying={isClarifying}
      />
    </div>
  );
}
