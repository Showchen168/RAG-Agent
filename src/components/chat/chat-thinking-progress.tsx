"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Globe, Brain, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────

interface ChatThinkingProgressProps {
  readonly isLoading: boolean;
  readonly mode?: "search" | "default";
  readonly currentStep?: number; // 1-4, from backend real-time progress
}

// ─── Constants ────────────────────────────────────────────────

interface ThinkingStep {
  readonly step: number;
  readonly label: string;
  readonly Icon: LucideIcon;
}

const DEFAULT_STEPS: readonly ThinkingStep[] = [
  { step: 1, label: "解析問題", Icon: Search },
  { step: 2, label: "搜尋知識庫", Icon: Globe },
  { step: 3, label: "分析資訊", Icon: Brain },
  { step: 4, label: "生成回答", Icon: Sparkles },
];

const SEARCH_STEPS: readonly ThinkingStep[] = [
  { step: 1, label: "解析問題", Icon: Search },
  { step: 2, label: "搜尋網路資源", Icon: Globe },
  { step: 3, label: "分析搜尋結果", Icon: Brain },
  { step: 4, label: "整合回答", Icon: Sparkles },
];

const TYPING_SPEED = 120; // ms per character
const CURSOR_BLINK_SPEED = 530; // ms

// ─── Typewriter Hook ─────────────────────────────────────────

function useTypewriter(text: string, speed: number = TYPING_SPEED, loop: boolean = true) {
  const fullText = text + "...";
  const [displayed, setDisplayed] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const indexRef = useRef(0);
  const pauseRef = useRef(false);

  useEffect(() => {
    setDisplayed("");
    setIsTyping(true);
    indexRef.current = 0;
    pauseRef.current = false;

    const timer = setInterval(() => {
      if (pauseRef.current) return;

      indexRef.current += 1;
      if (indexRef.current <= fullText.length) {
        setDisplayed(fullText.slice(0, indexRef.current));
      } else if (loop) {
        // Keep showing full text during pause (no blank flash)
        pauseRef.current = true;
        setTimeout(() => {
          indexRef.current = 0;
          setDisplayed("");
          pauseRef.current = false;
        }, 800);
      } else {
        setIsTyping(false);
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [fullText, speed, loop]);

  return { displayed, isTyping };
}

// ─── Blinking Cursor ─────────────────────────────────────────

function BlinkingCursor() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(
      () => setVisible((v) => !v),
      CURSOR_BLINK_SPEED,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <span
      className="inline-block w-[2px] h-4 bg-blue-500 dark:bg-blue-400 ml-0.5 align-middle"
      style={{ opacity: visible ? 1 : 0 }}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────

export function ChatThinkingProgress({
  isLoading,
  mode = "default",
  currentStep = 0,
}: ChatThinkingProgressProps) {
  const steps = mode === "search" ? SEARCH_STEPS : DEFAULT_STEPS;

  if (!isLoading) return null;

  // Find current step data, fallback to "思考中"
  const activeStep = steps.find((s) => s.step === currentStep);
  const label = activeStep?.label ?? "思考中";
  const Icon = activeStep?.Icon;

  return (
    <div className="w-full py-1">
      <div className="flex items-center gap-2 h-7 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex items-center gap-1.5"
          >
            {Icon && (
              <Icon className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            )}
            <TypewriterLabel label={label} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Typewriter Label Sub-component ──────────────────────────

function TypewriterLabel({ label }: { label: string }) {
  const { displayed, isTyping } = useTypewriter(label, TYPING_SPEED, true);

  return (
    <span className="text-sm font-medium bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 bg-clip-text text-transparent bg-[length:200%_auto] animate-[gradient-shift_3s_ease-in-out_infinite]">
      {displayed}
      {isTyping && <BlinkingCursor />}
    </span>
  );
}
