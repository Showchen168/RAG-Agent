"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import type { Profile, AIModel } from "@/types";
import TelegramIntegration from "@/components/settings/telegram-integration";
import TelegramBotConfig from "@/components/settings/telegram-bot-config";
import SkillsManagement from "@/components/settings/skills-management";
import {
  Sparkles,
  User,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Loader2,
  Puzzle,
  // Icon options for picker
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
  Heart as HeartIcon,
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
  type LucideIcon,
} from "lucide-react";

// ========== 可選 Icon Map ==========
const AVAILABLE_ICONS: Record<string, LucideIcon> = {
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
  HeartIcon,
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

// ========== 可選 Emoji ==========
const AVAILABLE_EMOJIS = [
  "💼",
  "✍️",
  "📊",
  "🔍",
  "🎓",
  "🎯",
  "📽️",
  "🎨",
  "🔎",
  "⚡",
  "🤖",
  "💡",
  "🚀",
  "🧠",
  "🛡️",
  "🎵",
  "📸",
  "☕",
  "🎧",
  "💬",
  "🌍",
  "📚",
  "⭐",
  "🏆",
  "🔧",
  "📝",
  "🎮",
  "🩺",
  "📈",
  "🧪",
];

// ========== 分類選項 ==========
const CATEGORIES = [
  { value: "custom", label: "自訂" },
  { value: "professional", label: "專業" },
  { value: "creative", label: "創意" },
  { value: "development", label: "開發" },
  { value: "education", label: "教育" },
  { value: "marketing", label: "行銷" },
  { value: "data", label: "數據" },
  { value: "product", label: "產品" },
  { value: "design", label: "設計" },
  { value: "presentation", label: "簡報" },
];

interface PromptTemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  system_prompt: string;
  is_public: boolean;
  is_featured: boolean;
  usage_count: number;
  likes_count: number;
  tags: string[];
  created_at: string;
  user_id: string | null;
}

interface PersonaFormData {
  name: string;
  description: string;
  icon: string;
  category: string;
  system_prompt: string;
  tags: string[];
}

const DEFAULT_FORM: PersonaFormData = {
  name: "",
  description: "",
  icon: "🤖",
  category: "custom",
  system_prompt: "",
  tags: [],
};

type TabType = "profile" | "prompts" | "integrations" | "skills";

// ========== Icon 選擇器元件 ==========
function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isEmoji = !AVAILABLE_ICONS[value];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-12 h-12 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 flex items-center justify-center text-2xl transition-colors bg-gray-50 dark:bg-gray-800"
      >
        {isEmoji
          ? value
          : (() => {
            const Icon = AVAILABLE_ICONS[value];
            return Icon ? (
              <Icon className="w-6 h-6 text-violet-600 dark:text-violet-400" />
            ) : (
              value
            );
          })()}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-14 left-0 z-50 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 max-h-60 overflow-y-auto">
            <p className="text-xs font-semibold text-gray-500 mb-2">Emoji</p>
            <div className="flex flex-wrap gap-1 mb-3">
              {AVAILABLE_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onChange(emoji);
                    setOpen(false);
                  }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${value === emoji
                    ? "bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-400"
                    : ""
                    }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <p className="text-xs font-semibold text-gray-500 mb-2">
              Lucide Icons
            </p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(AVAILABLE_ICONS).map(([name, Icon]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                  title={name}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${value === name
                    ? "bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-400"
                    : ""
                    }`}
                >
                  <Icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ========== 新增/編輯角色 Modal ==========
function PersonaFormModal({
  editingTemplate,
  onClose,
  onSaved,
}: {
  editingTemplate: PromptTemplate | null; // null = 新增模式
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PersonaFormData>(
    editingTemplate
      ? {
        name: editingTemplate.name,
        description: editingTemplate.description || "",
        icon: editingTemplate.icon,
        category: editingTemplate.category,
        system_prompt: editingTemplate.system_prompt,
        tags: editingTemplate.tags || [],
      }
      : { ...DEFAULT_FORM },
  );
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!editingTemplate;

  const updateField = <K extends keyof PersonaFormData>(
    key: K,
    value: PersonaFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      updateField("tags", [...form.tags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    updateField(
      "tags",
      form.tags.filter((t) => t !== tag),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.system_prompt.trim()) {
      setError("名稱和提示詞為必填");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const url = isEdit
        ? `/api/prompts/${editingTemplate.id}`
        : "/api/prompts";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          icon: form.icon,
          category: form.category,
          system_prompt: form.system_prompt.trim(),
          is_public: false,
          tags: form.tags,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "儲存失敗");
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-foreground">
            {isEdit ? "編輯 AI 角色" : "新增 AI 角色"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Icon + 名稱 */}
          <div className="flex items-start gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                圖示
              </label>
              <IconPicker
                value={form.icon}
                onChange={(v) => updateField("icon", v)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                角色名稱 *
              </label>
              <input
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="例如：資深前端工程師"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={50}
              />
            </div>
          </div>

          {/* 分類 + 描述 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                分類
              </label>
              <select
                value={form.category}
                onChange={(e) => updateField("category", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                簡短描述
              </label>
              <input
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="一句話描述這個角色的用途"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={100}
              />
            </div>
          </div>

          {/* 系統提示詞 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              系統提示詞 *
            </label>
            <p className="text-xs text-gray-400 mb-2">
              定義這個 AI
              角色的行為、專長和回答風格。此提示詞在每次對話開始時發送給 AI。
            </p>
            <textarea
              value={form.system_prompt}
              onChange={(e) => updateField("system_prompt", e.target.value)}
              placeholder={`例如：\n你是一位資深前端工程師，擁有 10 年以上的 React、Next.js、TypeScript 開發經驗。\n\n專業領域:\n- React 生態系統與最佳實踐\n- 效能優化與 Web Vitals\n- 元件設計與架構\n\n回答風格:\n- 使用繁體中文\n- 直接給出程式碼範例\n- 解釋背後的設計原因`}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">
              {form.system_prompt.length} 字
            </p>
          </div>

          {/* 標籤 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              標籤
            </label>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="輸入標籤後按 Enter"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400 transition-colors"
              >
                新增
              </button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs rounded-full"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? "儲存中..." : isEdit ? "更新角色" : "建立角色"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ========== 主頁面 ==========
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("profile");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [preferredModel, setPreferredModel] = useState<AIModel>("gemini-flash");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 主題設定
  const { theme, setTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  useEffect(() => setThemeMounted(true), []);

  // AI 角色商城狀態
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(
    null,
  );
  const [confirmDeletePrompt, setConfirmDeletePrompt] = useState<PromptTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // 固定 supabase client 參考，避免每次 render 重建造成 useEffect 無限觸發
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setEmail(user.email ?? null);
      setCurrentUserId(user.id);

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile(data);
        setDisplayName(data.display_name ?? "");
        setPreferredModel(data.preferred_model ?? "gemini-flash");
        setSystemPrompt(data.system_prompt ?? "");
      }
    }
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 載入 AI 角色（所有公開 + 自己的）
  const loadPrompts = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const query = supabase
        .from("prompt_templates")
        .select("*")
        .or(`is_public.eq.true,user_id.eq.${user.id}`)
        .order("likes_count", { ascending: false })
        .order("created_at", { ascending: false });

      const { data } = await query;

      if (data) {
        setPrompts(data);
      }
    } catch (error) {
      void error;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "prompts") {
      loadPrompts();
    }
  }, [activeTab, loadPrompts]);

  async function performDeleteTemplate(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/prompts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "刪除失敗");
        return;
      }
      // 通知 PromptLibrary 更新
      window.dispatchEvent(new CustomEvent("personas-updated"));
      loadPrompts();
    } catch {
      alert("刪除失敗");
    } finally {
      setDeletingId(null);
      setConfirmDeletePrompt(null);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        preferred_model: preferredModel,
        system_prompt: systemPrompt.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (error) {
      setMessage(`儲存失敗：${error.message}`);
    } else {
      setMessage("設定已儲存");
    }
    setSaving(false);
  }

  // 取得 Icon 渲染
  const renderIcon = (iconValue: string, size = "text-2xl") => {
    const LucideIcon = AVAILABLE_ICONS[iconValue];
    if (LucideIcon) {
      return (
        <LucideIcon
          className={`${size === "text-2xl" ? "w-6 h-6" : "w-4 h-4"} text-violet-600 dark:text-violet-400`}
        />
      );
    }
    return <span className={size}>{iconValue}</span>;
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 md:px-6">
        <h2 className="text-2xl font-bold text-foreground mb-6">設定</h2>

        {/* Tab 切換 */}
        <div className="flex gap-2 overflow-x-auto border-b border-gray-200 dark:border-gray-700 mb-6">
          <button
            onClick={() => setActiveTab("profile")}
            className={`whitespace-nowrap flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "profile"
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
          >
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              個人設定
            </div>
          </button>
          <button
            onClick={() => setActiveTab("prompts")}
            className={`whitespace-nowrap flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "prompts"
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI 角色商城
            </div>
          </button>
          <button
            onClick={() => setActiveTab("integrations")}
            className={`whitespace-nowrap flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "integrations"
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
          >
            <div className="flex items-center gap-2">
              <Puzzle className="w-4 h-4" />
              整合服務
            </div>
          </button>
          <button
            onClick={() => setActiveTab("skills")}
            className={`whitespace-nowrap flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "skills"
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              技能管理
            </div>
          </button>
        </div>

        {/* 個人設定 Tab */}
        {activeTab === "profile" && (
          <form onSubmit={handleSave} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                顯示名稱
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                預設 AI 模型
              </label>
              <select
                value={preferredModel}
                onChange={(e) => setPreferredModel(e.target.value as AIModel)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="gemini-flash">Gemini 3 Flash (Google)</option>
                <option value="gemini-flash-lite">Gemini 3.1 Flash Lite Preview (Google)</option>
                <option value="gemini-pro">Gemini 3.1 Pro Preview (Google)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                外觀主題
              </label>
              {themeMounted ? (
                <select
                  value={theme ?? "system"}
                  onChange={(e) => setTheme(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="light">淺色模式</option>
                  <option value="dark">深色模式</option>
                  <option value="system">跟隨系統</option>
                </select>
              ) : (
                <div className="h-[38px] w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800" />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                全域系統提示詞
              </label>
              <p className="text-xs text-gray-400 mb-2">
                此指令會附加到每次對話的 System Prompt
                中，適合設定語言偏好、回答風格等全域行為。 若同時使用 AI
                角色，角色的提示詞會優先作為主要 persona，此處則作為補充指令。
              </p>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="例如：請始終使用繁體中文回答。回答時附上引用來源。"
                rows={5}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">
                {systemPrompt.length} 字
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Email
              </label>
              <p className="text-sm text-gray-500">{email ?? "載入中..."}</p>
            </div>

            {message && (
              <p
                className={`text-sm ${message.includes("失敗") ? "text-red-500" : "text-green-500"}`}
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
            >
              {saving ? "儲存中..." : "儲存設定"}
            </button>
          </form>
        )}

        {/* AI 角色商城 Tab */}
        {activeTab === "prompts" && (
          <div className="space-y-4">
            {/* 頂部：新增角色按鈕 */}
            <div className="flex items-center justify-end">
              <button
                onClick={() => {
                  setEditingTemplate(null);
                  setShowForm(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                新增角色
              </button>
            </div>

            {/* AI 角色列表 */}
            {loading ? (
              <div className="text-center py-12 text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                載入中...
              </div>
            ) : prompts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-3">沒有找到 AI 角色</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {prompts.map((template) => {
                  const isOwner = template.user_id === currentUserId;

                  return (
                    <div
                      key={template.id}
                      onClick={() => {
                        setEditingTemplate(template);
                        setShowForm(true);
                      }}
                      className="group p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-300 dark:hover:border-blue-600 transition-colors bg-white dark:bg-gray-800/50 cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                            {renderIcon(template.icon)}
                          </div>
                          <div>
                            <h3 className="font-medium text-foreground">
                              {template.name}
                            </h3>
                            <p className="text-xs text-gray-500">
                              {CATEGORIES.find(
                                (c) => c.value === template.category,
                              )?.label || template.category}
                              {isOwner && (
                                <span className="ml-1.5 px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded text-[10px] font-medium">
                                  我的
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* 刪除按鈕 */}
                      </div>

                      {template.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                          {template.description}
                        </p>
                      )}

                      {template.tags && template.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {template.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-3 text-xs">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeletePrompt(template);
                          }}
                          disabled={deletingId === template.id}
                          className="flex items-center gap-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>刪除</span>
                        </button>
                        <div className="flex items-center gap-1 text-blue-500">
                          <Pencil className="w-3 h-3" />
                          <span>編輯</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 整合服務 Tab */}
        {activeTab === "integrations" && (
          <div className="space-y-6 max-w-2xl">
            <TelegramBotConfig />
            <TelegramIntegration />
          </div>
        )}

        {/* 技能管理 Tab */}
        {activeTab === "skills" && <SkillsManagement />}

        {/* 新增/編輯 Modal */}
        {showForm && (
          <PersonaFormModal
            editingTemplate={editingTemplate}
            onClose={() => {
              setShowForm(false);
              setEditingTemplate(null);
            }}
            onSaved={() => {
              loadPrompts();
              window.dispatchEvent(new CustomEvent("personas-updated"));
            }}
          />
        )}

        {/* 版本資訊 */}
        <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-400 text-center">
            NexusMind V1.0
          </p>
        </div>

        {/* 刪除確認對話框 */}
        {confirmDeletePrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-800 animate-in zoom-in-95 duration-200">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                確認刪除
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                確定要刪除「{confirmDeletePrompt.name}」嗎？此操作無法復原。
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDeletePrompt(null)}
                  disabled={deletingId === confirmDeletePrompt.id}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => performDeleteTemplate(confirmDeletePrompt.id)}
                  disabled={deletingId === confirmDeletePrompt.id}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
                >
                  {deletingId === confirmDeletePrompt.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {deletingId === confirmDeletePrompt.id ? "刪除中..." : "確認刪除"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
