"use client";

import { useState, useEffect, useCallback } from "react";
import type { Skill } from "@/types/skills";
import {
  Loader2,
  Zap,
  FileText,
  Database,
  Palette,
  Wrench,
  Shield,
  Pencil,
  Check,
  X,
  type LucideIcon,
} from "lucide-react";

// ========== 分類 Icon Map ==========
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  document: FileText,
  data: Database,
  creative: Palette,
  utility: Wrench,
};

// ========== 分類標籤 ==========
const CATEGORY_LABELS: Record<string, string> = {
  document: "文件",
  data: "資料",
  creative: "創意",
  utility: "工具",
};

interface SkillsManagementProps {
  readonly className?: string;
}

export default function SkillsManagement({ className }: SkillsManagementProps) {
  const [skills, setSkills] = useState<readonly Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<{ id: string; name: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // ========== 載入技能列表 ==========
  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/skills");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load skills");
      }
      const data = await res.json();
      setSkills(data.skills ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // ========== 啟用/停用 ==========
  const handleToggle = useCallback(
    async (skillId: string, currentEnabled: boolean) => {
      setTogglingId(skillId);
      setError(null);

      try {
        const res = await fetch("/api/skills", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: skillId,
            is_enabled: !currentEnabled,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update skill");
        }

        // 使用 immutable 更新
        setSkills((prev) =>
          prev.map((s) =>
            s.id === skillId ? { ...s, is_enabled: !currentEnabled } : s,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
      } finally {
        setTogglingId(null);
      }
    },
    [],
  );

  // ========== 渲染 Icon ==========
  const renderSkillIcon = (icon: string) => {
    const CategoryIcon = CATEGORY_ICONS[icon];
    if (CategoryIcon) {
      return (
        <CategoryIcon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
      );
    }

    if (icon.length <= 2 || /^\p{Emoji}/u.test(icon)) {
      return <span className="text-lg">{icon}</span>;
    }

    return <Zap className="w-5 h-5 text-violet-600 dark:text-violet-400" />;
  };

  // ========== 自動清除訊息 ==========
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // ========== 重新命名 ==========
  const handleRename = useCallback(async () => {
    if (!editingSkill || renamingId) return;
    const newName = editingSkill.name.trim();
    if (!newName) {
      setEditingSkill(null);
      return;
    }

    setRenamingId(editingSkill.id);
    try {
      const res = await fetch("/api/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingSkill.id,
          display_name: newName,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "重新命名失敗");
      }

      setSkills((prev) =>
        prev.map((s) =>
          s.id === editingSkill.id ? { ...s, display_name: newName } : s,
        ),
      );
      setSuccessMsg(`已重新命名為「${newName}」`);
      window.dispatchEvent(new CustomEvent("skills-updated"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setRenamingId(null);
      setEditingSkill(null);
    }
  }, [editingSkill, renamingId]);

  return (
    <div className={`space-y-6 max-w-2xl ${className ?? ""}`}>
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-foreground">
          技能管理
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          開啟或關閉 AI 技能包
        </p>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm">
          {successMsg}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}

      {/* Empty State */}
      {!loading && skills.length === 0 && (
        <div className="text-center py-12 px-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <Zap className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            尚未安裝任何技能
          </p>
        </div>
      )}

      {/* Skills List */}
      {!loading && skills.length > 0 && (
        <div className="space-y-3">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="group flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            >
              {/* Icon */}
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                {renderSkillIcon(skill.icon)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {editingSkill?.id === skill.id ? (
                    /* 編輯中 */
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <input
                        autoFocus
                        type="text"
                        value={editingSkill.name}
                        onChange={(e) =>
                          setEditingSkill({ ...editingSkill, name: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename();
                          if (e.key === "Escape") setEditingSkill(null);
                        }}
                        className="text-sm font-semibold text-foreground bg-transparent border-b-2 border-blue-500 outline-none w-full min-w-0 py-0.5"
                      />
                      <button
                        onClick={handleRename}
                        disabled={renamingId === skill.id}
                        className="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 transition-colors flex-shrink-0"
                        title="確認"
                      >
                        {renamingId === skill.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => setEditingSkill(null)}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
                        title="取消"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    /* 顯示模式 */
                    <>
                      <h4 className="text-sm font-semibold text-foreground truncate">
                        {skill.display_name}
                      </h4>
                      <button
                        onClick={() =>
                          setEditingSkill({ id: skill.id, name: skill.display_name })
                        }
                        className="p-1 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                        title="重新命名"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    v{skill.version}
                  </span>
                  {skill.is_system && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                      <Shield className="w-3 h-3" />
                      System
                    </span>
                  )}
                  <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                    {CATEGORY_LABELS[skill.category] ?? skill.category}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  {skill.description}
                </p>
              </div>

              {/* Toggle Switch */}
              <button
                onClick={() => handleToggle(skill.id, skill.is_enabled)}
                disabled={togglingId === skill.id}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${skill.is_enabled
                  ? "bg-blue-600"
                  : "bg-gray-200 dark:bg-gray-600"
                  } ${togglingId === skill.id ? "opacity-50" : ""}`}
                role="switch"
                aria-checked={skill.is_enabled}
                aria-label={`${skill.is_enabled ? "停用" : "啟用"} ${skill.display_name}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${skill.is_enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
