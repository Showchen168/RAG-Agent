import { render, screen } from "@testing-library/react";
import { CanvasLayout } from "../canvas-layout";
import { useModeStore } from "@/stores/mode-store";

jest.mock("@/stores/mode-store");
jest.mock("@/hooks/use-is-mobile", () => ({
  useIsMobile: () => false,
}));
jest.mock("@/components/ui/mobile-drawer", () => ({
  MobileDrawer: () => null,
}));
jest.mock("../knowledge-panel", () => ({
  KnowledgePanel: () => (
    <div data-testid="knowledge-panel">Knowledge Panel</div>
  ),
}));
jest.mock("../canvas-editor", () => ({
  CanvasEditor: () => <div data-testid="canvas-editor">Canvas Editor</div>,
}));

describe("CanvasLayout", () => {
  it("should render knowledge panel and editor", () => {
    (useModeStore as unknown as jest.Mock).mockReturnValue({
      canvasSettings: {
        showKnowledgePanel: true,
        editorWidth: 60,
      },
    });

    render(<CanvasLayout />);
    expect(screen.getByTestId("knowledge-panel")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-editor")).toBeInTheDocument();
  });

  it("should apply correct width ratio", () => {
    (useModeStore as unknown as jest.Mock).mockReturnValue({
      canvasSettings: {
        showKnowledgePanel: true,
        editorWidth: 60,
      },
    });

    const { container } = render(<CanvasLayout />);
    const editorWrapper = container.querySelector('[style*="width: 60%"]');
    expect(editorWrapper).toBeInTheDocument();
  });
});
