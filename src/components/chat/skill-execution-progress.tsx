"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  Search,
  Globe,
  FileText,
  Cog,
  Sparkles,
  X,
  AlertCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────

export interface SkillExecutionState {
  readonly id: string;
  readonly skillName: string;
  readonly startedAt: number;
  readonly error?: string;
}

interface SkillExecutionProgressProps {
  readonly execution: SkillExecutionState;
  readonly onCancel?: () => void;
}

// ─── Constants ────────────────────────────────────────────────

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface ExecutionStep {
  readonly threshold: number;
  readonly label: string;
  readonly Icon: LucideIcon;
}

const EXECUTION_STEPS: readonly ExecutionStep[] = [
  { threshold: 0, label: "初始化技能環境", Icon: Settings },
  { threshold: 5, label: "分析輸入需求", Icon: Search },
  { threshold: 15, label: "搜尋相關資料", Icon: Globe },
  { threshold: 40, label: "生成報告內容", Icon: FileText },
  { threshold: 90, label: "執行文件處理", Icon: Cog },
  { threshold: 150, label: "最終整理中", Icon: Sparkles },
];

// ─── Internal Components ──────────────────────────────────────

function BrailleSpinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setFrame((f) => (f + 1) % BRAILLE_FRAMES.length),
      80,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="text-blue-400 dark:text-blue-300 font-mono w-3 inline-block text-center">
      {BRAILLE_FRAMES[frame]}
    </span>
  );
}

function ElapsedTimer({ startedAt }: { readonly startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <span className="font-mono text-xs text-gray-400 dark:text-gray-500 tabular-nums">
      {formatted}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────

export function SkillExecutionProgress({
  execution,
  onCancel,
}: SkillExecutionProgressProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - execution.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [execution.startedAt]);

  const visibleSteps = EXECUTION_STEPS.filter((s) => elapsed >= s.threshold);
  const currentStepIndex = visibleSteps.length - 1;
  const hasError = Boolean(execution.error);

  return (
    <div className="w-full py-1">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm">⚡</span>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {execution.skillName}
        </span>
        <ElapsedTimer startedAt={execution.startedAt} />
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            title="取消"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Steps */}
      <div className="space-y-0">
        <AnimatePresence mode="popLayout">
          {visibleSteps.map((step, index) => {
            const isDone = index < currentStepIndex;
            const isActive = index === currentStepIndex && !hasError;

            return (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, x: -8, height: 0 }}
                animate={{ opacity: 1, x: 0, height: "auto" }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="flex items-center gap-2.5 py-1.5 font-mono text-xs"
              >
                {/* Status icon */}
                <div className="w-3.5 flex-shrink-0 flex items-center justify-center">
                  {isDone && (
                    <span className="text-green-500 dark:text-green-400">
                      ✓
                    </span>
                  )}
                  {isActive && <BrailleSpinner />}
                  {hasError && index === currentStepIndex && (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  )}
                </div>

                {/* Step icon */}
                <step.Icon
                  className={`w-3.5 h-3.5 flex-shrink-0 ${
                    isDone
                      ? "text-green-500/60 dark:text-green-400/50"
                      : isActive
                        ? "text-blue-500 dark:text-blue-400"
                        : "text-red-400"
                  }`}
                />

                {/* Label */}
                <span
                  className={
                    isDone
                      ? "text-gray-400 dark:text-gray-500"
                      : isActive
                        ? "text-blue-600 dark:text-blue-300"
                        : "text-red-500 dark:text-red-400"
                  }
                >
                  {step.label}
                  {isActive && (
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="ml-0.5"
                    >
                      ...
                    </motion.span>
                  )}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Error message */}
        {hasError && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 pt-2 mt-1 border-t border-red-200/50 dark:border-red-800/30"
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
            <span className="text-xs text-red-500 dark:text-red-400">
              {execution.error}
            </span>
          </motion.div>
        )}
      </div>
    </div>
  );
}
