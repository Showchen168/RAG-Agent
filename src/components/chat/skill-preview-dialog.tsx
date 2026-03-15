"use client";

import { useState, useCallback, useRef } from "react";
import { X, Save, Loader2, Wand2, FileText, AlertTriangle } from "lucide-react";
import type {
  GeneratedSkillConfig,
  SkillCategory,
  SkillInputType,
  LoadedFileResult,
} from "@/types/skills";

// ─── Constants ──────────────────────────────────────

const CATEGORY_OPTIONS: ReadonlyArray<{
  readonly value: SkillCategory;
  readonly label: string;
}> = [
  { value: "document", label: "文件" },
  { value: "data", label: "數據" },
  { value: "creative", label: "創作" },
  { value: "utility", label: "工具" },
];

const INPUT_TYPE_OPTIONS: ReadonlyArray<{
  readonly value: SkillInputType;
  readonly label: string;
  readonly desc: string;
}> = [
  { value: "context", label: "僅上下文", desc: "不需要額外輸入" },
  { value: "user", label: "使用者輸入", desc: "需要使用者提供內容" },
  { value: "both", label: "兩者皆需", desc: "使用上下文 + 使用者輸入" },
];

// ─── Props ──────────────────────────────────────────

interface SkillPreviewDialogProps {
  /** 生成的 skill config（null 時不顯示） */
  readonly config: GeneratedSkillConfig | null;
  /** 載入的檔案結果（用於顯示 MD/TXT 內容預覽） */
  readonly loadedFile: LoadedFileResult | null;
  /** 是否正在儲存 */
  readonly isSaving: boolean;
  /** 確認儲存 */
  readonly onSave: (config: GeneratedSkillConfig) => void;
  /** 取消 / 關閉 */
  readonly onCancel: () => void;
  /** 注入 system instruction（MD/TXT 檔案用） */
  readonly onInjectInstruction?: (content: string) => void;
}

// ─── Component ──────────────────────────────────────

export function SkillPreviewDialog({
  config,
  loadedFile,
  isSaving,
  onSave,
  onCancel,
  onInjectInstruction,
}: SkillPreviewDialogProps) {
  // 如果是 MD/TXT 檔案載入，顯示內容預覽模式
  const isInstructionMode =
    loadedFile !== null &&
    (loadedFile.fileType === "markdown" || loadedFile.fileType === "text");

  const isVisible = config !== null || isInstructionMode;

  if (!isVisible) return null;

  if (isInstructionMode && loadedFile && onInjectInstruction) {
    return (
      <InstructionPreview
        loadedFile={loadedFile}
        onInject={onInjectInstruction}
        onCancel={onCancel}
      />
    );
  }

  if (config) {
    return (
      <SkillConfigEditor
        initialConfig={config}
        isSaving={isSaving}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
  }

  return null;
}

// ─── Sub: Instruction Preview ───────────────────────

function InstructionPreview({
  loadedFile,
  onInject,
  onCancel,
}: {
  readonly loadedFile: LoadedFileResult;
  readonly onInject: (content: string) => void;
  readonly onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      data-testid="instruction-preview-dialog"
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">載入規則檔案</h3>
              <p className="text-xs text-gray-500">{loadedFile.fileName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Content Preview */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                此檔案將作為系統指令注入當前對話
              </p>
            </div>
            <p className="text-xs text-gray-500">
              檔案內容將作為 AI 的行為規則，影響後續回覆。
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 max-h-60 overflow-y-auto">
            <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed">
              {loadedFile.content.slice(0, 3000)}
              {loadedFile.content.length > 3000 && (
                <span className="text-gray-400">
                  {"\n\n...（已截斷，共 "}
                  {loadedFile.content.length}
                  {" 字元）"}
                </span>
              )}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onInject(loadedFile.content)}
            data-testid="inject-instruction-btn"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-md shadow-blue-500/25"
          >
            注入對話
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub: Skill Config Editor ───────────────────────

function SkillConfigEditor({
  initialConfig,
  isSaving,
  onSave,
  onCancel,
}: {
  readonly initialConfig: GeneratedSkillConfig;
  readonly isSaving: boolean;
  readonly onSave: (config: GeneratedSkillConfig) => void;
  readonly onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState(initialConfig.display_name);
  const [description, setDescription] = useState(initialConfig.description);
  const [promptTemplate, setPromptTemplate] = useState(
    initialConfig.prompt_template,
  );
  const [category, setCategory] = useState<SkillCategory>(
    initialConfig.category,
  );
  const [inputType, setInputType] = useState<SkillInputType>(
    initialConfig.input_type,
  );

  // IME 防護
  const isComposingRef = useRef(false);
  const compositionJustEndedRef = useRef(false);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    compositionJustEndedRef.current = true;
    setTimeout(() => {
      compositionJustEndedRef.current = false;
    }, 50);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && !isComposingRef.current) {
        onCancel();
      }
    },
    [onCancel],
  );

  const handleSave = useCallback(() => {
    const trimmedName = displayName.trim();
    const trimmedDesc = description.trim();
    const trimmedTemplate = promptTemplate.trim();

    if (!trimmedName || !trimmedDesc || !trimmedTemplate) return;

    onSave({
      display_name: trimmedName,
      description: trimmedDesc,
      prompt_template: trimmedTemplate,
      category,
      icon: initialConfig.icon,
      input_type: inputType,
    });
  }, [
    displayName,
    description,
    promptTemplate,
    category,
    inputType,
    initialConfig.icon,
    onSave,
  ]);

  const isValid =
    displayName.trim().length >= 2 &&
    description.trim().length >= 1 &&
    promptTemplate.trim().length >= 10;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      data-testid="skill-preview-dialog"
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">預覽生成的技能</h3>
              <p className="text-xs text-gray-500">
                確認或編輯後儲存為可用技能
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* 顯示名稱 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              技能名稱
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              maxLength={50}
              disabled={isSaving}
              data-testid="skill-name-input"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 transition-all"
              placeholder="例如：自動摘要生成器"
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              描述
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              maxLength={200}
              disabled={isSaving}
              data-testid="skill-description-input"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 transition-all"
              placeholder="簡短描述此技能的功能"
            />
          </div>

          {/* 分類 + 輸入類型 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                分類
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SkillCategory)}
                disabled={isSaving}
                data-testid="skill-category-select"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 transition-all"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                輸入模式
              </label>
              <select
                value={inputType}
                onChange={(e) => setInputType(e.target.value as SkillInputType)}
                disabled={isSaving}
                data-testid="skill-input-type-select"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 transition-all"
              >
                {INPUT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} — {opt.desc}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 提示詞模板 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              提示詞模板
            </label>
            <p className="text-xs text-gray-500 mb-2">
              {"使用 {{user_input}} 作為使用者輸入的佔位符"}
            </p>
            <textarea
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              maxLength={5000}
              rows={8}
              disabled={isSaving}
              data-testid="skill-prompt-input"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 resize-y leading-relaxed transition-all"
              placeholder="在此輸入技能的提示詞模板..."
            />
            <p className="text-xs text-gray-400 mt-1 text-right">
              {promptTemplate.length} / 5000
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isValid}
            data-testid="save-skill-btn"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white transition-all shadow-md shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                儲存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                儲存技能
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
