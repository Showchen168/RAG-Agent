import { render, screen, act } from "@testing-library/react";
import { DiagramEditor } from "../diagram-editor";

describe("DiagramEditor", () => {
  it("should render iframe with draw.io src", () => {
    render(<DiagramEditor />);
    const iframe = screen.getByTitle("draw.io");
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute("src")).toContain("embed.diagrams.net");
  });

  it("should show loading state initially", () => {
    render(<DiagramEditor />);
    expect(screen.getByText(/載入/)).toBeInTheDocument();
  });

  it("should call onSave when iframe sends save event", async () => {
    const onSave = jest.fn();
    render(<DiagramEditor onSave={onSave} />);

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({ event: "save", xml: "<mxGraphModel />" }),
          origin: "https://embed.diagrams.net",
        }),
      );
    });

    expect(onSave).toHaveBeenCalledWith("<mxGraphModel />");
  });

  it("should call onReady on init event", async () => {
    const onReady = jest.fn();
    render(<DiagramEditor onReady={onReady} />);

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({ event: "init" }),
          origin: "https://embed.diagrams.net",
        }),
      );
    });

    expect(onReady).toHaveBeenCalled();
  });

  it("should ignore messages from other origins", async () => {
    const onSave = jest.fn();
    render(<DiagramEditor onSave={onSave} />);

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({ event: "save", xml: "<bad />" }),
          origin: "https://evil.com",
        }),
      );
    });

    expect(onSave).not.toHaveBeenCalled();
  });
});
