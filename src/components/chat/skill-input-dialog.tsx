"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { X, Play, Loader2, ArrowLeft } from "lucide-react";
import type { Skill } from "@/types/skills";
import type {
  ClarificationQuestion,
  ClarificationAnswer,
  SkillDialogPhase,
} from "@/types/skills";

// ─── Props ──────────────────────────────────────────

interface SkillInputDialogProps {
  readonly skill: Skill | null;
  readonly onSubmit: (
    input: string,
    clarificationAnswers?: ReadonlyArray<ClarificationAnswer>,
  ) => void;
  readonly onCancel: () => void;
  readonly onClarify: (
    skill: Skill,
    userInput: string,
  ) => Promise<ReadonlyArray<ClarificationQuestion> | null>;
  readonly isClarifying?: boolean;
}

// ─── Component ──────────────────────────────────────

export function SkillInputDialog({
  skill,
  onSubmit,
  onCancel,
  onClarify,
  isClarifying = false,
}: SkillInputDialogProps) {
  const [inputValue, setInputValue] = useState("");
  const [phase, setPhase] = useState<SkillDialogPhase>("initial");
  const [questions, setQuestions] = useState<
    ReadonlyArray<ClarificationQuestion>
  >([]);
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // IME 組合輸入追蹤（防止中文選字時 Enter 誤送出）
  const isComposingRef = useRef(false);
  const compositionJustEndedRef = useRef(false);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
    compositionJustEndedRef.current = false;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    compositionJustEndedRef.current = true;
    setTimeout(() => {
      compositionJustEndedRef.current = false;
    }, 50);
  }, []);

  // 開啟時聚焦到輸入框 + 重置狀態
  useEffect(() => {
    if (skill) {
      setPhase("initial");
      setInputValue("");
      setQuestions([]);
      setAnswers(new Map());
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [skill]);

  // document 級別的 Escape 監聽
  useEffect(() => {
    if (!skill) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (phase === "clarifying") {
          setPhase("initial");
        } else {
          onCancel();
        }
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [skill, onCancel, phase]);

  // ─── Phase: initial → clarifying ──────────────
  const handleInitialSubmit = useCallback(async () => {
    if (isComposingRef.current || compositionJustEndedRef.current) return;
    const trimmed = inputValue.trim();
    if (!trimmed || !skill) return;

    setPhase("submitting");
    const result = await onClarify(skill, trimmed);

    if (result && result.length > 0) {
      setQuestions(result);
      setPhase("clarifying");
    } else {
      // 沒有釐清問題 → 直接提交
      onSubmit(trimmed);
      setInputValue("");
    }
  }, [inputValue, skill, onClarify, onSubmit]);

  // ─── Phase: clarifying → final submit ─────────
  const handleFinalSubmit = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    const clarificationAnswers: ReadonlyArray<ClarificationAnswer> =
      questions.map((q) => ({
        questionId: q.id,
        question: q.question,
        answer: answers.get(q.id) ?? "",
      }));

    onSubmit(trimmed, clarificationAnswers);
    setInputValue("");
  }, [inputValue, questions, answers, onSubmit]);

  // ─── Answer handlers ─────────────────────────
  const updateAnswer = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => {
      const next = new Map(prev);
      next.set(questionId, value);
      return next;
    });
  }, []);

  const toggleMultiSelectOption = useCallback(
    (questionId: string, option: string) => {
      setAnswers((prev) => {
        const next = new Map(prev);
        const current = next.get(questionId) ?? "";
        const selected = current ? current.split("|||") : [];
        const idx = selected.indexOf(option);
        if (idx >= 0) {
          selected.splice(idx, 1);
        } else {
          selected.push(option);
        }
        next.set(questionId, selected.join("|||"));
        return next;
      });
    },
    [],
  );

  // ─── KeyDown handler for initial phase ────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
        handleInitialSubmit();
      }
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [handleInitialSubmit, onCancel],
  );

  if (!skill) return null;

  const inputLabel = skill.skill_config.input.userInputLabel ?? "輸入內容";
  const allAnswered = questions.every((q) => {
    const a = answers.get(q.id);
    return a && a.trim().length > 0;
  });

  return (
    <div
      data-testid="skill-input-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            {phase === "clarifying" && (
              <button
                type="button"
                onClick={() => setPhase("initial")}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="返回"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {skill.display_name}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {phase === "clarifying"
                  ? "請回答以下問題以生成更精確的內容"
                  : skill.description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="關閉"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {/* ─── Initial Phase ───────────────────── */}
          {(phase === "initial" || phase === "submitting") && (
            <>
              <label
                htmlFor="skill-input"
                className="block text-sm font-medium text-foreground mb-2"
              >
                {inputLabel}
              </label>
              <textarea
                ref={inputRef}
                id="skill-input"
                role="textbox"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                placeholder="請輸入..."
                rows={3}
                disabled={phase === "submitting"}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-foreground placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all disabled:opacity-50"
              />
              {phase === "submitting" && (
                <div
                  data-testid="skill-clarifying-loader"
                  className="flex items-center gap-2 mt-3 text-sm text-gray-400"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在分析您的需求...</span>
                </div>
              )}
            </>
          )}

          {/* ─── Clarifying Phase ────────────────── */}
          {phase === "clarifying" && (
            <div data-testid="skill-clarification-form" className="space-y-5">
              {/* 顯示使用者的初始輸入 */}
              <div className="px-3 py-2 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/30">
                <p className="text-xs text-violet-500 dark:text-violet-400 mb-1">
                  您的主題
                </p>
                <p className="text-sm text-foreground">{inputValue}</p>
              </div>

              {/* 釐清問題表單 */}
              {questions.map((q, idx) => (
                <div key={q.id} className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    {idx + 1}. {q.question}
                  </label>

                  {/* text 類型 */}
                  {q.type === "text" && (
                    <textarea
                      data-testid={`clarify-input-${q.id}`}
                      value={answers.get(q.id) ?? ""}
                      onChange={(e) => updateAnswer(q.id, e.target.value)}
                      onKeyDown={handleKeyDown}
                      onCompositionStart={handleCompositionStart}
                      onCompositionEnd={handleCompositionEnd}
                      placeholder={q.placeholder ?? "請輸入..."}
                      rows={2}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-foreground placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
                    />
                  )}

                  {/* select 類型 */}
                  {q.type === "select" && q.options && (
                    <div
                      data-testid={`clarify-select-${q.id}`}
                      className="space-y-1.5"
                    >
                      {q.options.map((opt) => (
                        <label
                          key={opt}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors text-sm"
                        >
                          <input
                            type="radio"
                            name={`clarify-${q.id}`}
                            value={opt}
                            checked={answers.get(q.id) === opt}
                            onChange={() => updateAnswer(q.id, opt)}
                            className="accent-violet-600"
                          />
                          <span className="text-foreground">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* multiselect 類型 */}
                  {q.type === "multiselect" && q.options && (
                    <div
                      data-testid={`clarify-multiselect-${q.id}`}
                      className="space-y-1.5"
                    >
                      {q.options.map((opt) => {
                        const selected = (answers.get(q.id) ?? "")
                          .split("|||")
                          .filter(Boolean);
                        return (
                          <label
                            key={opt}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(opt)}
                              onChange={() =>
                                toggleMultiSelectOption(q.id, opt)
                              }
                              className="accent-violet-600"
                            />
                            <span className="text-foreground">{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button
            type="button"
            data-testid="skill-dialog-cancel-btn"
            onClick={
              phase === "clarifying" ? () => setPhase("initial") : onCancel
            }
            className="px-4 py-2 text-sm font-medium rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={phase === "clarifying" ? "返回" : "取消"}
          >
            {phase === "clarifying" ? "返回" : "取消"}
          </button>

          {/* Initial / Submitting phase: 「下一步」按鈕 */}
          {(phase === "initial" || phase === "submitting") && (
            <button
              type="button"
              data-testid="skill-dialog-submit-btn"
              onClick={handleInitialSubmit}
              disabled={
                !inputValue.trim() || phase === "submitting" || isClarifying
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white shadow-sm shadow-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              aria-label="下一步"
            >
              {phase === "submitting" || isClarifying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {phase === "submitting" || isClarifying ? "分析中..." : "下一步"}
            </button>
          )}

          {/* Clarifying phase: 「生成」按鈕 */}
          {phase === "clarifying" && (
            <button
              type="button"
              data-testid="skill-dialog-generate-btn"
              onClick={handleFinalSubmit}
              disabled={!allAnswered}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white shadow-sm shadow-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              aria-label="生成"
            >
              <Play className="w-3.5 h-3.5" />
              生成
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
