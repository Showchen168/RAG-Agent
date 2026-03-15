"use client";

import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { extractVariables } from "@/lib/prompts/variable-parser";

interface PromptEditorProps {
  initialData?: {
    id?: string;
    name: string;
    description?: string;
    icon?: string;
    category: string;
    system_prompt: string;
    is_public?: boolean;
    tags?: string[];
  };
  onSave: (data: {
    name: string;
    description?: string;
    icon?: string;
    category: string;
    system_prompt: string;
    is_public?: boolean;
    tags?: string[];
    variables?: Array<{ name: string; placeholder?: string }>;
  }) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

const CATEGORIES = [
  { value: "custom", label: "自訂" },
  { value: "writing", label: "寫作" },
  { value: "coding", label: "程式開發" },
  { value: "analysis", label: "分析" },
  { value: "creative", label: "創意" },
  { value: "productivity", label: "生產力" },
];

export function PromptEditor({
  initialData,
  onSave,
  onDelete,
  onCancel,
}: PromptEditorProps) {
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(
    initialData?.description || "",
  );
  const [icon, setIcon] = useState(initialData?.icon || "Sparkles");
  const [category, setCategory] = useState(initialData?.category || "custom");
  const [systemPrompt, setSystemPrompt] = useState(
    initialData?.system_prompt || "",
  );
  const [isPublic, setIsPublic] = useState(initialData?.is_public || false);
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [tagInput, setTagInput] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const variables = extractVariables(systemPrompt);

    onSave({
      name,
      description,
      icon,
      category,
      system_prompt: systemPrompt,
      is_public: isPublic,
      tags,
      variables,
    });
  }

  function addTag() {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-2xl w-full p-4 md:p-6 shadow-2xl my-8 mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">
            {initialData?.id ? "編輯 AI 角色" : "新增 AI 角色"}
          </h2>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 名稱 */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              角色名稱 *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800"
              required
              placeholder="例如：資深技術顧問、創意文案寫手"
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm font-medium mb-1.5">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 resize-none"
              rows={2}
              placeholder="簡述此 AI 角色的專長與特色..."
            />
          </div>

          {/* 分類 */}
          <div>
            <label className="block text-sm font-medium mb-1.5">分類 *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800"
              required
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              角色設定（系統提示詞） *
              <span className="text-xs text-gray-500 ml-2">
                使用 {"{{"} variable_name {"}}"} 定義變數
              </span>
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 font-mono text-sm resize-none"
              rows={8}
              required
              placeholder="你是一位專業的 {{role}}，擅長 {{skill}}..."
            />
            {extractVariables(systemPrompt).length > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                偵測到變數：
                {extractVariables(systemPrompt).map((v) => (
                  <span
                    key={v.name}
                    className="ml-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded"
                  >
                    {v.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 標籤 */}
          <div>
            <label className="block text-sm font-medium mb-1.5">標籤</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800"
                placeholder="輸入標籤後按 Enter"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                新增
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 rounded-full flex items-center gap-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 公開設定 */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-public"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <label
              htmlFor="is-public"
              className="text-sm font-medium cursor-pointer"
            >
              公開分享此角色（其他人可見）
            </label>
          </div>

          {/* 按鈕 */}
          <div className="flex items-center gap-3 pt-4">
            {initialData?.id && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1.5 px-4 py-2 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                刪除
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium transition-colors"
            >
              {initialData?.id ? "更新角色" : "建立角色"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
