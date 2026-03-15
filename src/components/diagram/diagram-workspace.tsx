"use client";

import { useCallback, useRef, useState, useMemo } from "react";
import {
  Save,
  Check,
  Loader2,
  Download,
  Plus,
  FileText,
  FolderOpen,
  Sparkles,
} from "lucide-react";
import { DiagramEditor } from "@/components/canvas/diagram-editor";
import type { DiagramEditorHandle } from "@/components/canvas/diagram-editor";
import { DiagramAiPanel } from "@/components/canvas/diagram-ai-panel";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { MobileDrawer } from "@/components/ui/mobile-drawer";

interface DiagramDocument {
  id: string;
  title: string;
  content: { type: string; xml: string };
  updated_at: string;
}

export function DiagramWorkspace() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const isMobile = useIsMobile();
  const diagramRef = useRef<DiagramEditorHandle>(null);
  const [currentXml, setCurrentXml] = useState<string | undefined>();
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("未命名圖表");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [docList, setDocList] = useState<DiagramDocument[]>([]);
  const [showDocList, setShowDocList] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);

  // 載入圖表列表
  const loadDocList = useCallback(async () => {
    try {
      const res = await fetch("/api/canvas");
      if (res.ok) {
        const { data } = await res.json();
        // 只顯示 diagram 類型的文件
        const diagrams = (data || []).filter(
          (doc: DiagramDocument) =>
            doc.content &&
            typeof doc.content === "object" &&
            "type" in doc.content &&
            doc.content.type === "diagram",
        );
        setDocList(diagrams);
      }
    } catch {
      // 靜默失敗
    }
  }, []);

  // 初次載入
  useState(() => {
    loadDocList();
  });

  // AI 面板 → DiagramEditor
  const handleAiApplyXml = useCallback((xml: string) => {
    setCurrentXml(xml);
    diagramRef.current?.loadXml(xml);
  }, []);

  const handleGetCurrentXml = useCallback(() => {
    return currentXml;
  }, [currentXml]);

  // 儲存圖表
  const handleSave = useCallback(
    async (xml: string) => {
      setCurrentXml(xml);
      setIsSaving(true);
      try {
        const payload = {
          title: docTitle,
          content: { type: "diagram", xml },
          plain_text: `[diagram] ${docTitle}`,
        };
        if (currentDocId) {
          await fetch(`/api/canvas/${currentDocId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } else {
          const res = await fetch("/api/canvas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            const { data } = await res.json();
            setCurrentDocId(data.id);
          }
        }
        setSaveToast("圖表已儲存");
        setTimeout(() => setSaveToast(null), 3000);
        setLastSaved(new Date().toLocaleTimeString());
        loadDocList();
      } catch {
        // 靜默失敗
      } finally {
        setIsSaving(false);
      }
    },
    [currentDocId, docTitle, loadDocList],
  );

  // 匯出 XML
  const handleExportXml = useCallback(() => {
    if (!currentXml) return;
    const blob = new Blob([currentXml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docTitle}.drawio`;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentXml, docTitle]);

  // 載入文件
  const handleLoadDocument = useCallback(async (docId: string) => {
    try {
      const res = await fetch(`/api/canvas/${docId}`);
      if (res.ok) {
        const { data } = await res.json();
        setCurrentDocId(data.id);
        setDocTitle(data.title);
        if (data.content?.xml) {
          setCurrentXml(data.content.xml);
          diagramRef.current?.loadXml(data.content.xml);
        }
        setShowDocList(false);
      }
    } catch {
      // 靜默失敗
    }
  }, []);

  // 新建圖表
  const handleNew = useCallback(() => {
    setCurrentDocId(null);
    setDocTitle("未命名圖表");
    setCurrentXml(undefined);
    setLastSaved(null);
    setShowDocList(false);
    // 重新載入 iframe 以清除內容 — 透過 loadXml 空白
    diagramRef.current?.loadXml(
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>',
    );
  }, []);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Toast */}
      {saveToast && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            {saveToast}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="relative">
          <button
            onClick={() => {
              setShowDocList(!showDocList);
              if (!showDocList) loadDocList();
            }}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 whitespace-nowrap"
          >
            <FolderOpen className="w-4 h-4" />
            圖表
          </button>
          {showDocList && (
            <div className="absolute top-8 left-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-72 max-h-80 overflow-y-auto">
              <button
                onClick={handleNew}
                className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700"
              >
                <Plus className="w-4 h-4" />
                新建圖表
              </button>
              {docList.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => handleLoadDocument(doc.id)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between ${
                    doc.id === currentDocId
                      ? "bg-blue-50 dark:bg-blue-900/20"
                      : ""
                  }`}
                >
                  <span className="truncate">{doc.title}</span>
                  {doc.id === currentDocId && (
                    <Check className="w-3 h-3 text-blue-500" />
                  )}
                </button>
              ))}
              {docList.length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-400 text-center">
                  尚無圖表
                </div>
              )}
            </div>
          )}
        </div>

        <input
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          className="flex-1 text-sm font-medium bg-transparent border-none outline-none text-foreground"
          placeholder="圖表標題..."
        />

        <div className="flex items-center gap-1">
          {lastSaved && (
            <span className="text-xs text-gray-400 mr-2 hidden md:inline">
              已儲存 {lastSaved}
            </span>
          )}
          <button
            onClick={() => currentXml && handleSave(currentXml)}
            disabled={isSaving || !currentXml}
            title="儲存圖表"
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          >
            <Save className={`w-4 h-4 ${isSaving ? "animate-pulse" : ""}`} />
          </button>
          <button
            onClick={handleExportXml}
            disabled={!currentXml}
            title="匯出 .drawio"
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main area: DiagramEditor + AI Panel */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 min-h-0">
          <DiagramEditor
            ref={diagramRef}
            onSave={handleSave}
            darkMode={isDark}
          />
        </div>
        {isMobile ? (
          <>
            <button
              onClick={() => setAiDrawerOpen(true)}
              className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-colors min-h-[44px]"
            >
              <Sparkles className="w-4 h-4" />
              AI 助手
            </button>
            <MobileDrawer
              open={aiDrawerOpen}
              onClose={() => setAiDrawerOpen(false)}
              side="right"
              title="AI 圖表助手"
            >
              <DiagramAiPanel
                onApplyXml={handleAiApplyXml}
                onGetCurrentXml={handleGetCurrentXml}
              />
            </MobileDrawer>
          </>
        ) : (
          <DiagramAiPanel
            onApplyXml={handleAiApplyXml}
            onGetCurrentXml={handleGetCurrentXml}
          />
        )}
      </div>
    </div>
  );
}
