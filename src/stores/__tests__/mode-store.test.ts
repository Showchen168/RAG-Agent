// Mock zustand persist middleware
jest.mock("zustand/middleware", () => ({
  persist: (fn: Function) => fn,
}));

import { useModeStore } from "../mode-store";

describe("mode-store", () => {
  beforeEach(() => {
    useModeStore.getState().reset();
  });

  it("should have default state", () => {
    const state = useModeStore.getState();
    expect(state.mode).toBe("chat");
    expect(state.canvasSettings.showKnowledgePanel).toBe(true);
    expect(state.canvasSettings.editorWidth).toBe(60);
    expect(state.canvasSettings.autoComplete).toBe(true);
    expect(state.canvasSettings.smartCitation).toBe(true);
  });

  it("should setMode to canvas", () => {
    useModeStore.getState().setMode("canvas");
    expect(useModeStore.getState().mode).toBe("canvas");
  });

  it("should setMode back to chat", () => {
    useModeStore.getState().setMode("canvas");
    useModeStore.getState().setMode("chat");
    expect(useModeStore.getState().mode).toBe("chat");
  });

  it("should update partial canvasSettings immutably", () => {
    const original = useModeStore.getState().canvasSettings;
    useModeStore.getState().setCanvasSettings({ editorWidth: 80 });
    const updated = useModeStore.getState().canvasSettings;
    expect(updated.editorWidth).toBe(80);
    expect(updated.showKnowledgePanel).toBe(true);
    expect(updated).not.toBe(original);
  });

  it("should update multiple canvasSettings at once", () => {
    useModeStore.getState().setCanvasSettings({
      autoComplete: false,
      smartCitation: false,
    });
    const state = useModeStore.getState().canvasSettings;
    expect(state.autoComplete).toBe(false);
    expect(state.smartCitation).toBe(false);
    expect(state.editorWidth).toBe(60);
  });

  it("should reset to defaults", () => {
    useModeStore.getState().setMode("canvas");
    useModeStore.getState().setCanvasSettings({ editorWidth: 100 });
    useModeStore.getState().reset();
    const state = useModeStore.getState();
    expect(state.mode).toBe("chat");
    expect(state.canvasSettings.editorWidth).toBe(60);
  });
});
