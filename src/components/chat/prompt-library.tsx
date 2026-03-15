"use client";

import React from "react";
import {
  Sparkles,
  Bot,
  Briefcase,
  Code2,
  PenTool,
  Languages,
  ChevronDown,
  Check,
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
} from "lucide-react";
import { type Persona, DEFAULT_PERSONA } from "@/lib/crayon/prompts";
import * as Popover from "@radix-ui/react-popover";

interface PromptLibraryProps {
  selectedPersonaId: string;
  onSelect: (persona: Persona) => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
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
};

interface DbTemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  system_prompt: string;
  user_id: string | null;
}

/** 將資料庫模板轉換為 Persona 格式 */
function templateToPersona(t: DbTemplate): Persona & { isOwned: boolean } {
  return {
    id: t.id,
    name: t.name,
    description: t.description || "",
    icon: t.icon,
    systemPrompt: t.system_prompt,
    isOwned: t.user_id !== null,
  };
}

export function PromptLibrary({
  selectedPersonaId,
  onSelect,
}: PromptLibraryProps) {
  const [open, setOpen] = React.useState(false);
  const [personas, setPersonas] = React.useState<
    (Persona & { isOwned: boolean })[]
  >([]);
  const [loaded, setLoaded] = React.useState(false);

  // 載入所有角色（公開 + 自訂）
  const loadPersonas = React.useCallback(async () => {
    try {
      const res = await fetch("/api/prompts?scope=chat", {
        credentials: "include",
      });
      if (res.ok) {
        const { templates } = await res.json();
        if (Array.isArray(templates)) {
          setPersonas(templates.map(templateToPersona));
        }
      }
    } catch {
      // 靜默失敗，使用 fallback
    } finally {
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    loadPersonas();
  }, [loadPersonas]);

  // 監聽角色更新事件（從設定頁 CRUD 操作觸發）
  React.useEffect(() => {
    const handler = () => loadPersonas();
    window.addEventListener("personas-updated", handler);
    return () => window.removeEventListener("personas-updated", handler);
  }, [loadPersonas]);

  // 分組：我的角色 / 內建角色
  const myPersonas = React.useMemo(
    () => personas.filter((p) => p.isOwned),
    [personas],
  );
  const builtinPersonas = React.useMemo(
    () => personas.filter((p) => !p.isOwned),
    [personas],
  );

  const selectedPersona =
    personas.find((p) => p.id === selectedPersonaId) ||
    DEFAULT_PERSONA;

  // 載入後自動同步：若父層 selectedPersonaId 不在資料庫中，
  // 推送解析後的預設角色（一般助理）回父層
  const prevSyncedId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!loaded || personas.length === 0) return;
    const matchInDb = personas.some((p) => p.id === selectedPersonaId);
    if (!matchInDb && selectedPersona.id !== prevSyncedId.current) {
      prevSyncedId.current = selectedPersona.id;
      onSelect(selectedPersona);
    }
  }, [loaded, personas, selectedPersonaId, selectedPersona, onSelect]);

  // 渲染 icon（支援 Lucide icon name 和 emoji）
  const renderIcon = (iconValue: string, className: string) => {
    const LucideIcon = ICON_MAP[iconValue];
    if (LucideIcon) {
      return <LucideIcon className={className} />;
    }
    return <span className="text-sm">{iconValue}</span>;
  };

  const SelectedIconElement = renderIcon(
    selectedPersona.icon,
    "w-4 h-4 text-violet-600 dark:text-violet-400",
  );

  const handleSelect = (persona: Persona) => {
    onSelect(persona);
    setOpen(false);
  };

  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        className="flex items-center gap-1.5 md:gap-2 pl-2 md:pl-3 pr-1.5 md:pr-2 py-2 bg-gray-100/50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800 rounded-xl text-xs md:text-sm font-medium text-foreground transition-colors focus:outline-none min-w-0 md:min-w-[140px]"
        aria-label="Select persona"
      >
        {SelectedIconElement}
        <span className="flex-1 text-left truncate">{selectedPersona.name}</span>
        <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
      </button>
    );
  }

  const hasCustom = myPersonas.length > 0;

  /** 渲染單一角色項目 */
  const renderPersonaItem = (persona: Persona & { isOwned: boolean }) => {
    const isSelected = selectedPersonaId === persona.id;
    return (
      <button
        key={persona.id}
        onClick={() => handleSelect(persona)}
        className={`flex items-start gap-3 p-2 rounded-lg text-left transition-colors ${isSelected
            ? "bg-violet-50 dark:bg-violet-900/20"
            : "hover:bg-gray-100 dark:hover:bg-gray-700"
          }`}
      >
        <div
          className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected
              ? "bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
              : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
            }`}
        >
          {renderIcon(persona.icon, "w-4 h-4")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span
              className={`text-sm font-medium ${isSelected
                  ? "text-violet-700 dark:text-violet-300"
                  : "text-gray-900 dark:text-gray-100"
                }`}
            >
              {persona.name}
            </span>
            {isSelected && (
              <Check className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
            {persona.description}
          </p>
        </div>
      </button>
    );
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="flex items-center gap-1.5 md:gap-2 pl-2 md:pl-3 pr-1.5 md:pr-2 py-2 bg-gray-100/50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800 rounded-xl text-xs md:text-sm font-medium text-foreground transition-colors focus:outline-none min-w-0 md:min-w-[140px]"
          aria-label="Select persona"
        >
          {SelectedIconElement}
          <span className="flex-1 text-left truncate">{selectedPersona.name}</span>
          <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="z-50 w-72 max-h-[50vh] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-1 animate-in fade-in zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
          sideOffset={5}
          align="start"
          collisionPadding={10}
        >
          <div className="flex flex-col gap-1">
            {/* 我的角色區塊 */}
            {hasCustom && (
              <>
                <div className="px-3 py-2 text-xs font-semibold text-violet-500 uppercase tracking-wider">
                  我的角色
                </div>
                {myPersonas.map(renderPersonaItem)}
                <div className="mx-3 my-1 h-px bg-gray-200 dark:bg-gray-700" />
              </>
            )}

            {/* 內建角色 */}
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {hasCustom ? "內建角色" : "選擇 AI 角色"}
            </div>
            {builtinPersonas.map(renderPersonaItem)}

            {/* 載入中 / 空狀態 */}
            {loaded &&
              builtinPersonas.length === 0 &&
              myPersonas.length === 0 && (
                <div className="px-3 py-4 text-sm text-gray-400 text-center">
                  尚未載入角色
                </div>
              )}

            {/* 底部提示 */}
            {loaded && (
              <div className="px-3 py-2 text-[10px] text-gray-400 text-center border-t border-gray-100 dark:border-gray-700 mt-1">
                前往「設定 → AI 角色商城」管理與新增角色
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
