"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  Heart,
  TrendingUp,
  Search,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { VariableForm } from "./variable-form";
import { PromptEditor } from "./prompt-editor";
import { fillVariables } from "@/lib/prompts/variable-parser";

interface PromptTemplate {
  id: string;
  name: string;
  description?: string;
  icon: string;
  category: string;
  system_prompt: string;
  is_public: boolean;
  is_featured: boolean;
  usage_count: number;
  likes_count: number;
  tags: string[];
  user_id: string | null;
  isFavorited?: boolean;
}

interface PromptMarketplaceProps {
  onApply?: (prompt: string) => void;
}

export function PromptMarketplace({ onApply }: PromptMarketplaceProps) {
  const [scope, setScope] = useState<"mine" | "public" | "featured">("mine");
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] =
    useState<PromptTemplate | null>(null);
  const [showVariableForm, setShowVariableForm] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(
    null,
  );

  useEffect(() => {
    loadTemplates();
  }, [scope]);

  async function loadTemplates() {
    setLoading(true);
    try {
      const res = await fetch(`/api/prompts?scope=${scope}`);
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error("Failed to load templates:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleFavorite(templateId: string) {
    try {
      await fetch(`/api/prompts/${templateId}/favorite`, { method: "POST" });
      await loadTemplates();
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    }
  }

  async function handleUse(template: PromptTemplate) {
    setSelectedTemplate(template);
    setShowVariableForm(true);
  }

  async function handleVariableSubmit(values: Record<string, string>) {
    if (!selectedTemplate) return;

    const filledPrompt = fillVariables(selectedTemplate.system_prompt, values);

    // 記錄使用次數
    await fetch(`/api/prompts/${selectedTemplate.id}/use`, { method: "POST" });

    onApply?.(filledPrompt);
    setShowVariableForm(false);
    setSelectedTemplate(null);
  }

  async function handleDelete(templateId: string, templateName: string) {
    if (!window.confirm(`確定要刪除「${templateName}」嗎？此操作無法復原。`)) {
      return false;
    }
    try {
      const res = await fetch(`/api/prompts/${templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "刪除失敗");
      }
      await loadTemplates();
      window.dispatchEvent(new CustomEvent("personas-updated"));
      return true;
    } catch (error) {
      console.error("Failed to delete template:", error);
      return false;
    }
  }

  async function handleSaveTemplate(data: any) {
    try {
      if (editingTemplate) {
        await fetch(`/api/prompts/${editingTemplate.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } else {
        await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      }

      setShowEditor(false);
      setEditingTemplate(null);
      await loadTemplates();
      // 通知聊天頁膠囊與 PromptLibrary 重新載入
      window.dispatchEvent(new CustomEvent("personas-updated"));
    } catch (error) {
      console.error("Failed to save template:", error);
    }
  }

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tags.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-xl font-semibold">AI 角色商城</h2>
        {scope === "mine" && (
          <button
            onClick={() => {
              setEditingTemplate(null);
              setShowEditor(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新增角色
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setScope("mine")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${scope === "mine"
              ? "bg-blue-500 text-white"
              : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
        >
          我的角色
        </button>
        <button
          onClick={() => setScope("featured")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${scope === "featured"
              ? "bg-blue-500 text-white"
              : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
        >
          <TrendingUp className="w-4 h-4" />
          精選推薦
        </button>
        <button
          onClick={() => setScope("public")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${scope === "public"
              ? "bg-blue-500 text-white"
              : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
        >
          社群角色
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜尋 AI 角色名稱、描述或標籤..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800"
        />
      </div>

      {/* Templates Grid */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            載入中...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Sparkles className="w-12 h-12 mb-3" />
            <p>尚無 AI 角色</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer group"
                onClick={() => handleUse(template)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-500" />
                    <h3 className="font-medium group-hover:text-blue-500 transition-colors">
                      {template.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTemplate(template);
                        setShowEditor(true);
                      }}
                      className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="編輯角色"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(template.id, template.name);
                      }}
                      className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="刪除角色"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {scope === "public" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFavorite(template.id);
                        }}
                        className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${template.isFavorited
                            ? "text-red-500"
                            : "text-gray-400"
                          }`}
                      >
                        <Heart
                          className={`w-4 h-4 ${template.isFavorited ? "fill-current" : ""}`}
                        />
                      </button>
                    )}
                  </div>
                </div>

                {template.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                    {template.description}
                  </p>
                )}

                {template.tags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {template.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded">
                    {template.category}
                  </span>
                  <span>{template.usage_count} 次使用</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Variable Form Modal */}
      {showVariableForm && selectedTemplate && (
        <VariableForm
          template={selectedTemplate.system_prompt}
          onSubmit={handleVariableSubmit}
          onCancel={() => {
            setShowVariableForm(false);
            setSelectedTemplate(null);
          }}
        />
      )}

      {/* Editor Modal */}
      {showEditor && (
        <PromptEditor
          initialData={editingTemplate || undefined}
          onSave={handleSaveTemplate}
          onDelete={
            editingTemplate
              ? async () => {
                const deleted = await handleDelete(editingTemplate.id, editingTemplate.name);
                if (deleted) {
                  setShowEditor(false);
                  setEditingTemplate(null);
                }
              }
              : undefined
          }
          onCancel={() => {
            setShowEditor(false);
            setEditingTemplate(null);
          }}
        />
      )}
    </div>
  );
}
