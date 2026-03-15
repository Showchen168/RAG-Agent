"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { useModeStore } from "@/stores/mode-store";
import { KnowledgePanel } from "./knowledge-panel";
import { CanvasEditor } from "./canvas-editor";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { MobileDrawer } from "@/components/ui/mobile-drawer";

export function CanvasLayout() {
  const { canvasSettings } = useModeStore();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
        <CanvasEditor />
        {canvasSettings.showKnowledgePanel && (
          <>
            <button
              onClick={() => setDrawerOpen(true)}
              className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-full shadow-lg transition-colors min-h-[44px]"
            >
              <BookOpen className="w-4 h-4" />
              知識庫
            </button>
            <MobileDrawer
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              side="right"
              title="知識庫參考"
            >
              <KnowledgePanel />
            </MobileDrawer>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900">
      {/* 左側: 知識庫參考面板 */}
      {canvasSettings.showKnowledgePanel && (
        <div
          className="border-r border-gray-200 dark:border-gray-700 overflow-auto"
          style={{ width: `${100 - canvasSettings.editorWidth}%` }}
        >
          <KnowledgePanel />
        </div>
      )}

      {/* 右側: Markdown 編輯器 */}
      <div
        className="flex-1 overflow-auto"
        style={{
          width: canvasSettings.showKnowledgePanel
            ? `${canvasSettings.editorWidth}%`
            : "100%",
        }}
      >
        <CanvasEditor />
      </div>
    </div>
  );
}
