"use client";

import { Loader2 } from "lucide-react";
import type { Skill } from "@/types/skills";

// ─── 技能圖標映射（emoji fallback） ─────────────────
function getSkillIcon(icon: string): string {
  const emojiMap: Record<string, string> = {
    FileText: "\u{1F4C4}",
    BarChart: "\u{1F4CA}",
    Palette: "\u{1F3A8}",
    Wrench: "\u{1F527}",
    Globe: "\u{1F310}",
    Code: "\u{1F4BB}",
    BookOpen: "\u{1F4D6}",
    Zap: "\u26A1",
    Brain: "\u{1F9E0}",
    Sparkles: "\u2728",
  };
  return emojiMap[icon] ?? "\u{1F50C}";
}

// ─── Props ──────────────────────────────────────────

interface SkillButtonPanelProps {
  readonly skills: ReadonlyArray<Skill>;
  readonly executingSkillId: string | null;
  readonly onSkillClick: (skill: Skill) => void;
}

// ─── Component ──────────────────────────────────────

export function SkillButtonPanel({
  skills,
  executingSkillId,
  onSkillClick,
}: SkillButtonPanelProps) {
  if (skills.length === 0) return null;

  const isExecuting = executingSkillId !== null;

  return (
    <div
      data-testid="skill-button-panel"
      className="flex gap-1 overflow-x-auto scrollbar-hide"
    >
      {skills.map((skill) => {
        const isThisExecuting = executingSkillId === skill.id;

        return (
          <button
            key={skill.id}
            type="button"
            data-testid={`skill-button-${skill.id}`}
            disabled={isExecuting}
            onClick={() => onSkillClick(skill)}
            className="inline-flex items-center gap-1 px-2 md:px-2.5 py-1 md:py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title={skill.display_name}
          >
            {isThisExecuting ? (
              <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
            ) : (
              <span className="text-xs leading-none">
                {getSkillIcon(skill.icon)}
              </span>
            )}
            <span className="hidden md:inline">{skill.display_name}</span>
          </button>
        );
      })}
    </div>
  );
}
