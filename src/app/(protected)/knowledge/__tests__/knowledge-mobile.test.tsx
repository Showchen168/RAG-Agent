import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ── Mock: useIsMobile ──
let mockIsMobile = false;
jest.mock("@/hooks/use-is-mobile", () => ({
  useIsMobile: () => mockIsMobile,
}));

// ── Mock: MobileDrawer ──
jest.mock("@/components/ui/mobile-drawer", () => ({
  MobileDrawer: ({
    open,
    onClose,
    title,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="mobile-drawer">
        <span data-testid="drawer-title">{title}</span>
        <button onClick={onClose}>Close</button>
        {children}
      </div>
    ) : null,
}));

// ── Mock: next/navigation ──
jest.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: jest.fn().mockReturnValue(null),
  }),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// ── Mock: heavy child components ──
jest.mock("@/components/knowledge/knowledge-graph", () => ({
  KnowledgeGraph: () => (
    <div data-testid="knowledge-graph">KnowledgeGraph</div>
  ),
}));

jest.mock("@/components/knowledge/version-history", () => ({
  VersionHistory: () => (
    <div data-testid="version-history">VersionHistory</div>
  ),
}));

jest.mock("@/components/knowledge/batch-upload", () => ({
  BatchUpload: () => <div data-testid="batch-upload">BatchUpload</div>,
}));

jest.mock("@/components/knowledge/source-manager", () => ({
  SourceManager: () => <div data-testid="source-manager">SourceManager</div>,
}));

jest.mock("@/components/knowledge/youtube-import", () => ({
  YouTubeImport: () => <div data-testid="youtube-import">YouTubeImport</div>,
}));

jest.mock("@/components/canvas/canvas-editor", () => ({
  CanvasEditor: () => <div data-testid="canvas-editor">CanvasEditor</div>,
}));

jest.mock("@/components/knowledge/floating-knowledge-chat", () => ({
  FloatingKnowledgeChat: () => (
    <div data-testid="floating-chat">FloatingChat</div>
  ),
}));

// ── Mock: fetch API (return documents) ──
const mockDocuments = [
  {
    id: "doc-1",
    user_id: "user-1",
    title: "Test Document A",
    content: "Content A",
    summary: "Summary A preview text",
    tags: ["PDF"],
    enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "doc-2",
    user_id: "user-1",
    title: "Test Document B",
    content: "Content B",
    summary: null,
    tags: ["DOCX"],
    enabled: false,
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
];

beforeEach(() => {
  mockIsMobile = false;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: mockDocuments }),
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

import KnowledgePage from "../page";

describe("KnowledgePage mobile adaptation", () => {
  // ── Desktop baseline ──

  it("desktop: renders knowledge graph tab and tab is clickable", async () => {
    render(<KnowledgePage />);
    await waitFor(() => {
      expect(screen.getByText("Test Document A")).toBeInTheDocument();
    });
    // Tab bar should show "知識圖譜" on desktop
    expect(screen.getByText("知識圖譜")).toBeInTheDocument();
  });

  it("desktop: clicking graph tab renders KnowledgeGraph component", async () => {
    render(<KnowledgePage />);
    await waitFor(() => {
      expect(screen.getByText("Test Document A")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("知識圖譜"));
    expect(screen.getByTestId("knowledge-graph")).toBeInTheDocument();
  });

  it("desktop: page container uses p-6 padding", async () => {
    const { container } = render(<KnowledgePage />);
    await waitFor(() => {
      expect(screen.getByText("Test Document A")).toBeInTheDocument();
    });
    const outerDiv = container.firstElementChild;
    expect(outerDiv?.className).toContain("md:p-6");
  });

  it("desktop: toolbar shows action buttons inline", async () => {
    render(<KnowledgePage />);
    await waitFor(() => {
      expect(screen.getByText("Test Document A")).toBeInTheDocument();
    });
    expect(screen.getByText("上傳檔案")).toBeInTheDocument();
    expect(screen.getByText("批次匯入")).toBeInTheDocument();
    expect(screen.getByText("新增文件")).toBeInTheDocument();
  });

  // ── Mobile ──

  it("mobile: graph tab remains available", async () => {
    mockIsMobile = true;
    render(<KnowledgePage />);
    await waitFor(() => {
      expect(screen.getByText("Test Document A")).toBeInTheDocument();
    });
    expect(screen.getByText("知識圖譜")).toBeInTheDocument();
  });

  it("mobile: renders document cards in list view", async () => {
    mockIsMobile = true;
    render(<KnowledgePage />);
    await waitFor(() => {
      expect(screen.getByText("Test Document A")).toBeInTheDocument();
    });
    expect(screen.getByText("Test Document B")).toBeInTheDocument();
  });

  it("mobile: page container uses responsive padding p-4 md:p-6", async () => {
    mockIsMobile = true;
    const { container } = render(<KnowledgePage />);
    await waitFor(() => {
      expect(screen.getByText("Test Document A")).toBeInTheDocument();
    });
    const outerDiv = container.firstElementChild;
    expect(outerDiv?.className).toContain("p-4");
    expect(outerDiv?.className).toContain("md:p-6");
  });

  it("mobile: clicking document opens MobileDrawer instead of full-screen canvas", async () => {
    mockIsMobile = true;
    render(<KnowledgePage />);
    await waitFor(() => {
      expect(screen.getByText("Test Document A")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Test Document A"));
    await waitFor(() => {
      expect(screen.getByTestId("mobile-drawer")).toBeInTheDocument();
    });
  });

  it("mobile: upload button renders full-width", async () => {
    mockIsMobile = true;
    render(<KnowledgePage />);
    await waitFor(() => {
      expect(screen.getByText("上傳檔案")).toBeInTheDocument();
    });
    const uploadLabel = screen.getByText("上傳檔案").closest("label");
    expect(uploadLabel?.className).toContain("w-full");
  });

  it("mobile: title uses responsive text size", async () => {
    mockIsMobile = true;
    render(<KnowledgePage />);
    await waitFor(() => {
      expect(screen.getByText("知識庫")).toBeInTheDocument();
    });
    const heading = screen.getByText("知識庫");
    expect(heading.className).toContain("text-xl");
    expect(heading.className).toContain("md:text-2xl");
  });
});
