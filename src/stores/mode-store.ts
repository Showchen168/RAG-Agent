import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppMode = "chat" | "canvas";

interface CanvasSettings {
  showKnowledgePanel: boolean;
  editorWidth: number; // percentage
  autoComplete: boolean;
  smartCitation: boolean;
}

interface ModeStore {
  mode: AppMode;
  canvasSettings: CanvasSettings;
  setMode: (mode: AppMode) => void;
  setCanvasSettings: (settings: Partial<CanvasSettings>) => void;
  reset: () => void;
}

const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  showKnowledgePanel: true,
  editorWidth: 60,
  autoComplete: true,
  smartCitation: true,
};

export const useModeStore = create<ModeStore>()(
  persist(
    (set) => ({
      mode: "chat",
      canvasSettings: DEFAULT_CANVAS_SETTINGS,
      setMode: (mode) => set({ mode }),
      setCanvasSettings: (settings) =>
        set((state) => ({
          canvasSettings: { ...state.canvasSettings, ...settings },
        })),
      reset: () =>
        set({
          mode: "chat",
          canvasSettings: DEFAULT_CANVAS_SETTINGS,
        }),
    }),
    {
      name: "nexusmind-mode-storage",
    },
  ),
);
