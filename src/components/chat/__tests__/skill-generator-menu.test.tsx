/**
 * SkillGeneratorMenu - Unit Tests
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SkillGeneratorMenu } from "../skill-generator-menu";

// ========== Helpers ==========

const defaultProps = {
  isGenerating: false,
  onGenerateFromHistory: jest.fn(),
  onLoadFile: jest.fn(),
  hasHistory: true,
};

function renderMenu(overrides = {}) {
  return render(<SkillGeneratorMenu {...defaultProps} {...overrides} />);
}

// ========== Tests ==========

describe("SkillGeneratorMenu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render the trigger button", () => {
    renderMenu();
    const trigger = screen.getByTestId("skill-generator-trigger");
    expect(trigger).toBeInTheDocument();
  });

  it("should not show dropdown initially", () => {
    renderMenu();
    expect(
      screen.queryByTestId("skill-generator-dropdown"),
    ).not.toBeInTheDocument();
  });

  it("should show dropdown when trigger is clicked", () => {
    renderMenu();
    fireEvent.click(screen.getByTestId("skill-generator-trigger"));
    expect(screen.getByTestId("skill-generator-dropdown")).toBeInTheDocument();
  });

  it("should show two menu items in dropdown", () => {
    renderMenu();
    fireEvent.click(screen.getByTestId("skill-generator-trigger"));

    expect(screen.getByTestId("generate-from-history-btn")).toBeInTheDocument();
    expect(screen.getByTestId("load-file-btn")).toBeInTheDocument();
  });

  it("should close dropdown and call onGenerateFromHistory", () => {
    const onGenerate = jest.fn();
    renderMenu({ onGenerateFromHistory: onGenerate });

    fireEvent.click(screen.getByTestId("skill-generator-trigger"));
    fireEvent.click(screen.getByTestId("generate-from-history-btn"));

    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId("skill-generator-dropdown"),
    ).not.toBeInTheDocument();
  });

  it("should disable generate button when hasHistory is false", () => {
    renderMenu({ hasHistory: false });
    fireEvent.click(screen.getByTestId("skill-generator-trigger"));

    const btn = screen.getByTestId("generate-from-history-btn");
    expect(btn).toBeDisabled();
  });

  it("should disable trigger button when isGenerating is true", () => {
    renderMenu({ isGenerating: true });
    const trigger = screen.getByTestId("skill-generator-trigger");
    expect(trigger).toBeDisabled();
  });

  it("should not open dropdown when isGenerating is true", () => {
    renderMenu({ isGenerating: true });
    fireEvent.click(screen.getByTestId("skill-generator-trigger"));
    expect(
      screen.queryByTestId("skill-generator-dropdown"),
    ).not.toBeInTheDocument();
  });

  it("should close dropdown on Escape key", () => {
    renderMenu();
    fireEvent.click(screen.getByTestId("skill-generator-trigger"));
    expect(screen.getByTestId("skill-generator-dropdown")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByTestId("skill-generator-dropdown"),
    ).not.toBeInTheDocument();
  });

  it("should close dropdown on outside click", () => {
    renderMenu();
    fireEvent.click(screen.getByTestId("skill-generator-trigger"));
    expect(screen.getByTestId("skill-generator-dropdown")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(
      screen.queryByTestId("skill-generator-dropdown"),
    ).not.toBeInTheDocument();
  });

  it("should have hidden file input for file loading", () => {
    renderMenu();
    const fileInput = screen.getByTestId("file-input");
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveClass("hidden");
  });

  it("should show loading state when generating", () => {
    renderMenu({ isGenerating: true });
    const trigger = screen.getByTestId("skill-generator-trigger");
    expect(trigger.textContent).toContain("生成中...");
  });

  it("should toggle dropdown on repeated clicks", () => {
    renderMenu();
    const trigger = screen.getByTestId("skill-generator-trigger");

    fireEvent.click(trigger);
    expect(screen.getByTestId("skill-generator-dropdown")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(
      screen.queryByTestId("skill-generator-dropdown"),
    ).not.toBeInTheDocument();
  });

  it("should close dropdown when load file button is clicked", () => {
    renderMenu();
    fireEvent.click(screen.getByTestId("skill-generator-trigger"));
    fireEvent.click(screen.getByTestId("load-file-btn"));

    expect(
      screen.queryByTestId("skill-generator-dropdown"),
    ).not.toBeInTheDocument();
  });

  it("should call onLoadFile when file is selected", () => {
    const onLoadFile = jest.fn();
    renderMenu({ onLoadFile });

    const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
    const file = new File(["test content"], "test.md", {
      type: "text/markdown",
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(onLoadFile).toHaveBeenCalledTimes(1);
    expect(onLoadFile).toHaveBeenCalledWith(file);
  });

  it("should not call onLoadFile when no file is selected", () => {
    const onLoadFile = jest.fn();
    renderMenu({ onLoadFile });

    const fileInput = screen.getByTestId("file-input") as HTMLInputElement;

    fireEvent.change(fileInput, { target: { files: [] } });

    expect(onLoadFile).not.toHaveBeenCalled();
  });

  it("should call onFileError when file exceeds 1MB", () => {
    const onLoadFile = jest.fn();
    const onFileError = jest.fn();
    renderMenu({ onLoadFile, onFileError });

    const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
    const largeContent = new Array(1_100_000).fill("a").join("");
    const file = new File([largeContent], "large.txt", { type: "text/plain" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(onFileError).toHaveBeenCalledWith("檔案大小超過 1MB 上限");
    expect(onLoadFile).not.toHaveBeenCalled();
  });

  it("should show helper text for hasHistory=false", () => {
    renderMenu({ hasHistory: false });
    fireEvent.click(screen.getByTestId("skill-generator-trigger"));

    expect(screen.getByText("需要先有對話內容")).toBeInTheDocument();
  });

  it("should show helper text for hasHistory=true", () => {
    renderMenu({ hasHistory: true });
    fireEvent.click(screen.getByTestId("skill-generator-trigger"));

    expect(screen.getByText("分析當前對話，自動建立技能")).toBeInTheDocument();
  });
});
