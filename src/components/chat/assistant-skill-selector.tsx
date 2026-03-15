"use client";

import React, { memo } from "react";
import { X, Loader2 } from "lucide-react";
import {
  Bot,
  Briefcase,
  Code2,
  PenTool,
  Languages,
  Zap,
  Server,
  Code,
  Terminal,
  CheckSquare,
  Map,
  Megaphone,
  GraduationCap,
  Smartphone,
  Brain,
  Globe,
  Heart,
  PiggyBank,
  Presentation,
  BookOpen,
  Lightbulb,
  Shield,
  Target,
  Palette,
  Music,
  Camera,
  Rocket,
  Star,
  Award,
  Coffee,
  Headphones,
  MessageSquare,
  Sparkles,
  FileText,
  BarChart,
  Wrench,
} from "lucide-react";
import type { CapsulePersona } from "@/hooks/use-capsule-personas";
import type { Skill } from "@/types/skills";

// ─── Lucide 圖標映射（與 prompt-library.tsx 同步） ───
const ICON_MAP: Record<string, React.ElementType> = {
  Bot, Briefcase, Code2, PenTool, Languages, Zap, Server, Code, Terminal,
  CheckSquare, Map, Megaphone, GraduationCap, Smartphone, Brain, Globe,
  Heart, PiggyBank, Presentation, BookOpen, Lightbulb, Shield, Target,
  Palette, Music, Camera, Rocket, Star, Award, Coffee, Headphones,
  MessageSquare, Sparkles, FileText, BarChart, Wrench,
};

/** 渲染 icon：支援 Lucide icon name 和 emoji */
function renderPersonaIcon(iconValue: string, className: string) {
  const LucideIcon = ICON_MAP[iconValue];
  if (LucideIcon) {
    return <LucideIcon className={className} />;
  }
  return <span className="text-base leading-none">{iconValue}</span>;
}

/** 取得 icon 文字（用於 badge 等純文字場景） */
export function getPersonaIconText(iconValue: string): string {
  // Lucide icon → 用 emoji fallback
  const emojiMap: Record<string, string> = {
    Bot: "\u{1F916}", Briefcase: "\u{1F4BC}", Code2: "\u{1F4BB}",
    PenTool: "\u{270F}\u{FE0F}", GraduationCap: "\u{1F393}",
    Presentation: "\u{1F4CA}", Palette: "\u{1F3A8}", Globe: "\u{1F310}",
    Target: "\u{1F3AF}", Zap: "\u26A1", Brain: "\u{1F9E0}",
    Sparkles: "\u2728", Shield: "\u{1F6E1}\u{FE0F}",
    BookOpen: "\u{1F4D6}", Lightbulb: "\u{1F4A1}",
  };
  return emojiMap[iconValue] ?? iconValue;
}

// ─── 技能圖標映射 ────────────────────────────────────
export function getSkillIcon(icon: string): string {
  const emojiMap: Record<string, string> = {
    FileText: "\u{1F4C4}", BarChart: "\u{1F4CA}", Palette: "\u{1F3A8}",
    Wrench: "\u{1F527}", Globe: "\u{1F310}", Code: "\u{1F4BB}",
    BookOpen: "\u{1F4D6}", Zap: "\u26A1", Brain: "\u{1F9E0}",
    Sparkles: "\u2728",
  };
  return emojiMap[icon] ?? "\u{1F50C}";
}

// ─── 統一的選中項目類型 ──────────────────────────────
export type SelectedItem =
  | { type: "persona"; persona: CapsulePersona }
  | { type: "skill"; skill: Skill };

// ─── Props ──────────────────────────────────────────
interface AssistantSkillSelectorProps {
  readonly personas: readonly CapsulePersona[];
  readonly skills: ReadonlyArray<Skill>;
  readonly selectedItem: SelectedItem | null;
  readonly executingSkillId: string | null;
  readonly isLoading: boolean;
  readonly onSelectPersona: (personaId: string) => void;
  readonly onSelectSkill: (skill: Skill) => void;
  readonly onDeselect: () => void;
  readonly onRemovePersona?: (personaId: string) => void;
  readonly onRemoveSkill?: (skillId: string) => void;
}

// ─── 選中標籤（嵌入輸入框內） ─────────────────────────
export function SelectedItemBadge({
  item,
  executingSkillId,
  onDeselect,
}: {
  readonly item: SelectedItem;
  readonly executingSkillId: string | null;
  readonly onDeselect: () => void;
}) {
  const isExecuting =
    item.type === "skill" && executingSkillId === item.skill.id;

  const label =
    item.type === "persona"
      ? `${getPersonaIconText(item.persona.icon)} ${item.persona.name}`
      : `${getSkillIcon(item.skill.icon)} ${item.skill.display_name}`;

  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
        bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300
        border border-violet-300 dark:border-violet-700 flex-shrink-0"
    >
      {isExecuting ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <span className="leading-none">{label}</span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDeselect();
        }}
        className="ml-0.5 p-0.5 rounded-full hover:bg-violet-200 dark:hover:bg-violet-800 transition-colors"
        title="取消選擇"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ─── 膠囊列表（未選擇時顯示全部、選擇後顯示描述）────
export const AssistantSkillSelector = memo(function AssistantSkillSelector({
  personas,
  skills,
  selectedItem,
  executingSkillId,
  isLoading,
  onSelectPersona,
  onSelectSkill,
  onDeselect,
  onRemovePersona,
  onRemoveSkill,
}: AssistantSkillSelectorProps) {
  const hasItems = personas.length > 0 || skills.length > 0;
  if (isLoading || !hasItems) return null;

  // ── 已選中：不再顯示描述（由 PersonaDetailPanel 處理） ──
  if (selectedItem) {
    return null;
  }

  // ── 未選中：分類顯示助手與技能 ──
  const hasPersonas = personas.length > 0;
  const hasSkills = skills.length > 0;

  return (
    <div className="w-full max-w-2xl mx-auto mt-3 space-y-4">
      {/* AI 助手分類 */}
      {hasPersonas && (
        <div>
          <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 mb-2 px-1 tracking-wide uppercase">
            AI 助手
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {personas.map((persona) => (
              <div key={`persona-${persona.id}`} className="relative group">
                <button
                  data-testid={`persona-capsule-${persona.id}`}
                  type="button"
                  onClick={() => onSelectPersona(persona.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
                    bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400
                    hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200
                    transition-all duration-200 cursor-pointer select-none"
                >
                  {renderPersonaIcon(persona.icon, "w-4 h-4")}
                  <span>{persona.name}</span>
                </button>
                {persona.isOwned && onRemovePersona && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePersona(persona.id);
                    }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white
                      opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center
                      hover:bg-red-600 z-10"
                    title="移除此角色"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 技能分類 */}
      {hasSkills && (
        <div>
          <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 mb-2 px-1 tracking-wide uppercase">
            技能
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {skills.map((skill) => {
              const isExecuting = executingSkillId === skill.id;
              return (
                <div key={`skill-${skill.id}`} className="relative group">
                  <button
                    data-testid={`skill-capsule-${skill.id}`}
                    type="button"
                    disabled={executingSkillId !== null}
                    onClick={() => onSelectSkill(skill)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
                      bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400
                      hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400
                      transition-all duration-200 cursor-pointer select-none
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExecuting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    ) : (
                      <span className="text-base leading-none">
                        {getSkillIcon(skill.icon)}
                      </span>
                    )}
                    <span>{skill.display_name}</span>
                  </button>
                  {onRemoveSkill && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveSkill(skill.id);
                      }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white
                        opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center
                        hover:bg-red-600 z-10"
                      title="停用此技能"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
