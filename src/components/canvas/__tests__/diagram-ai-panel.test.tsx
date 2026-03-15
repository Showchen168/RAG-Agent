import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DiagramAiPanel } from "../diagram-ai-panel";

// Mock fetch
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe("DiagramAiPanel", () => {
  const mockOnApplyXml = jest.fn();
  const mockOnGetCurrentXml = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnGetCurrentXml.mockReturnValue(
      '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>',
    );
  });

  it("should render generate tab by default", () => {
    render(
      <DiagramAiPanel
        onApplyXml={mockOnApplyXml}
        onGetCurrentXml={mockOnGetCurrentXml}
      />,
    );
    expect(screen.getByPlaceholderText(/描述/)).toBeInTheDocument();
  });

  it("should render analyze and modify tabs", () => {
    render(
      <DiagramAiPanel
        onApplyXml={mockOnApplyXml}
        onGetCurrentXml={mockOnGetCurrentXml}
      />,
    );
    expect(screen.getByText("生成")).toBeInTheDocument();
    expect(screen.getByText("分析")).toBeInTheDocument();
    expect(screen.getByText("修改")).toBeInTheDocument();
  });

  it("should show diagram type selector in generate tab", () => {
    render(
      <DiagramAiPanel
        onApplyXml={mockOnApplyXml}
        onGetCurrentXml={mockOnGetCurrentXml}
      />,
    );
    expect(screen.getByText("流程圖")).toBeInTheDocument();
  });

  it("should call API on generate submit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ xml: "<mxGraphModel><root></root></mxGraphModel>" }),
    } as Response);

    render(
      <DiagramAiPanel
        onApplyXml={mockOnApplyXml}
        onGetCurrentXml={mockOnGetCurrentXml}
      />,
    );

    const input = screen.getByPlaceholderText(/描述/);
    fireEvent.change(input, { target: { value: "畫一個流程圖" } });

    const submitBtn = screen.getByRole("button", { name: /生成圖表/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/canvas/diagram",
        expect.any(Object),
      );
    });
  });

  it("should call onApplyXml after successful generation", async () => {
    const xml = '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ xml }),
    } as Response);

    render(
      <DiagramAiPanel
        onApplyXml={mockOnApplyXml}
        onGetCurrentXml={mockOnGetCurrentXml}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/描述/), {
      target: { value: "流程圖" },
    });
    fireEvent.click(screen.getByRole("button", { name: /生成圖表/ }));

    await waitFor(() => {
      expect(mockOnApplyXml).toHaveBeenCalledWith(xml);
    });
  });
});
