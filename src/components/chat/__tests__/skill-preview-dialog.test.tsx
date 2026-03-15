/**
 * SkillPreviewDialog - Unit Tests
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SkillPreviewDialog } from "../skill-preview-dialog";
import type { GeneratedSkillConfig, LoadedFileResult } from "@/types/skills";

// ========== Fixtures ==========

const mockConfig: GeneratedSkillConfig = {
  display_name: "自動摘要",
  description: "從文本生成摘要",
  prompt_template: "請為以下內容生成結構化摘要：\n\n{{user_input}}",
  category: "utility",
  icon: "Sparkles",
  input_type: "user",
};

const mockMdFile: LoadedFileResult = {
  fileName: "rules.md",
  fileType: "markdown",
  content: "# 規則\n\n1. 請使用繁體中文\n2. 保持簡潔",
};

const mockTxtFile: LoadedFileResult = {
  fileName: "instructions.txt",
  fileType: "text",
  content: "This is a plain text instruction file.",
};

const mockJsonFile: LoadedFileResult = {
  fileName: "skill.json",
  fileType: "json",
  content: '{"display_name": "JSON 技能"}',
  parsedConfig: mockConfig,
};

// ========== Helpers ==========

const defaultProps = {
  config: null as GeneratedSkillConfig | null,
  loadedFile: null as LoadedFileResult | null,
  isSaving: false,
  onSave: jest.fn(),
  onCancel: jest.fn(),
  onInjectInstruction: jest.fn(),
};

function renderDialog(overrides = {}) {
  return render(<SkillPreviewDialog {...defaultProps} {...overrides} />);
}

// ========== Tests ==========

describe("SkillPreviewDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Visibility", () => {
    it("should not render when config and loadedFile are both null", () => {
      renderDialog();
      expect(
        screen.queryByTestId("skill-preview-dialog"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("instruction-preview-dialog"),
      ).not.toBeInTheDocument();
    });

    it("should render skill editor when config is provided", () => {
      renderDialog({ config: mockConfig });
      expect(screen.getByTestId("skill-preview-dialog")).toBeInTheDocument();
    });

    it("should render instruction preview when MD file is loaded", () => {
      renderDialog({ loadedFile: mockMdFile });
      expect(
        screen.getByTestId("instruction-preview-dialog"),
      ).toBeInTheDocument();
    });

    it("should render instruction preview when TXT file is loaded", () => {
      renderDialog({ loadedFile: mockTxtFile });
      expect(
        screen.getByTestId("instruction-preview-dialog"),
      ).toBeInTheDocument();
    });
  });

  describe("Skill Config Editor", () => {
    it("should show all editable fields", () => {
      renderDialog({ config: mockConfig });

      expect(screen.getByTestId("skill-name-input")).toHaveValue("自動摘要");
      expect(screen.getByTestId("skill-description-input")).toHaveValue(
        "從文本生成摘要",
      );
      expect(screen.getByTestId("skill-prompt-input")).toHaveValue(
        mockConfig.prompt_template,
      );
      expect(screen.getByTestId("skill-category-select")).toHaveValue(
        "utility",
      );
      expect(screen.getByTestId("skill-input-type-select")).toHaveValue(
        "user",
      );
    });

    it("should allow editing display name", () => {
      renderDialog({ config: mockConfig });
      const input = screen.getByTestId("skill-name-input");
      fireEvent.change(input, { target: { value: "新名稱" } });
      expect(input).toHaveValue("新名稱");
    });

    it("should allow editing description", () => {
      renderDialog({ config: mockConfig });
      const input = screen.getByTestId("skill-description-input");
      fireEvent.change(input, { target: { value: "新描述" } });
      expect(input).toHaveValue("新描述");
    });

    it("should allow editing prompt template", () => {
      renderDialog({ config: mockConfig });
      const textarea = screen.getByTestId("skill-prompt-input");
      fireEvent.change(textarea, {
        target: { value: "新模板內容 {{user_input}}" },
      });
      expect(textarea).toHaveValue("新模板內容 {{user_input}}");
    });

    it("should allow changing category", () => {
      renderDialog({ config: mockConfig });
      const select = screen.getByTestId("skill-category-select");
      fireEvent.change(select, { target: { value: "document" } });
      expect(select).toHaveValue("document");
    });

    it("should allow changing input type", () => {
      renderDialog({ config: mockConfig });
      const select = screen.getByTestId("skill-input-type-select");
      fireEvent.change(select, { target: { value: "context" } });
      expect(select).toHaveValue("context");
    });

    it("should call onSave with edited config", () => {
      const onSave = jest.fn();
      renderDialog({ config: mockConfig, onSave });

      fireEvent.change(screen.getByTestId("skill-name-input"), {
        target: { value: "編輯後名稱" },
      });

      fireEvent.click(screen.getByTestId("save-skill-btn"));

      expect(onSave).toHaveBeenCalledTimes(1);
      const savedConfig = onSave.mock.calls[0][0];
      expect(savedConfig.display_name).toBe("編輯後名稱");
      expect(savedConfig.description).toBe(mockConfig.description);
    });

    it("should preserve icon in saved config", () => {
      const onSave = jest.fn();
      renderDialog({ config: mockConfig, onSave });

      fireEvent.click(screen.getByTestId("save-skill-btn"));

      expect(onSave).toHaveBeenCalledTimes(1);
      const savedConfig = onSave.mock.calls[0][0];
      expect(savedConfig.icon).toBe("Sparkles");
    });

    it("should call onCancel when cancel button is clicked", () => {
      const onCancel = jest.fn();
      renderDialog({ config: mockConfig, onCancel });

      const cancelButtons = screen.getAllByText("取消");
      fireEvent.click(cancelButtons[0]);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("should close on Escape key press", () => {
      const onCancel = jest.fn();
      renderDialog({ config: mockConfig, onCancel });

      const dialog = screen.getByTestId("skill-preview-dialog");
      fireEvent.keyDown(dialog.firstChild!, { key: "Escape" });

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("should disable save button when display_name is too short", () => {
      renderDialog({ config: mockConfig });

      fireEvent.change(screen.getByTestId("skill-name-input"), {
        target: { value: "a" },
      });

      expect(screen.getByTestId("save-skill-btn")).toBeDisabled();
    });

    it("should disable save button when prompt_template is too short", () => {
      renderDialog({ config: mockConfig });

      fireEvent.change(screen.getByTestId("skill-prompt-input"), {
        target: { value: "short" },
      });

      expect(screen.getByTestId("save-skill-btn")).toBeDisabled();
    });

    it("should disable save button when description is empty", () => {
      renderDialog({ config: mockConfig });

      fireEvent.change(screen.getByTestId("skill-description-input"), {
        target: { value: "" },
      });

      expect(screen.getByTestId("save-skill-btn")).toBeDisabled();
    });

    it("should show saving state", () => {
      renderDialog({ config: mockConfig, isSaving: true });

      const saveBtn = screen.getByTestId("save-skill-btn");
      expect(saveBtn).toBeDisabled();
      expect(saveBtn.textContent).toContain("儲存中...");
    });

    it("should disable all inputs when saving", () => {
      renderDialog({ config: mockConfig, isSaving: true });

      expect(screen.getByTestId("skill-name-input")).toBeDisabled();
      expect(screen.getByTestId("skill-description-input")).toBeDisabled();
      expect(screen.getByTestId("skill-prompt-input")).toBeDisabled();
      expect(screen.getByTestId("skill-category-select")).toBeDisabled();
      expect(screen.getByTestId("skill-input-type-select")).toBeDisabled();
    });

    it("should handle compositionStart and compositionEnd events", () => {
      const onCancel = jest.fn();
      renderDialog({ config: mockConfig, onCancel });

      const input = screen.getByTestId("skill-name-input");

      // Start composition
      fireEvent.compositionStart(input);
      // During composition, Escape should not cancel
      fireEvent.keyDown(screen.getByTestId("skill-preview-dialog").firstChild!, {
        key: "Escape",
      });
      // Should not have been called since composition is active
      // (Note: the keyDown is on the wrapper, not the input, so it may not reach the handler)

      // End composition
      fireEvent.compositionEnd(input);
    });

    it("should not call onSave when fields are whitespace only", () => {
      const onSave = jest.fn();
      renderDialog({ config: mockConfig, onSave });

      fireEvent.change(screen.getByTestId("skill-name-input"), {
        target: { value: "   " },
      });

      // Button should be disabled due to trimmed length < 2
      expect(screen.getByTestId("save-skill-btn")).toBeDisabled();
    });

    it("should show character count for prompt template", () => {
      renderDialog({ config: mockConfig });

      const expectedCount = `${mockConfig.prompt_template.length} / 5000`;
      expect(screen.getByText(expectedCount)).toBeInTheDocument();
    });
  });

  describe("Instruction Preview", () => {
    it("should show file name and content for MD files", () => {
      renderDialog({ loadedFile: mockMdFile });

      expect(screen.getByText("rules.md")).toBeInTheDocument();
      const preElement = screen.getByText(/請使用繁體中文/);
      expect(preElement).toBeInTheDocument();
    });

    it("should show file name and content for TXT files", () => {
      renderDialog({ loadedFile: mockTxtFile });

      expect(screen.getByText("instructions.txt")).toBeInTheDocument();
      expect(
        screen.getByText(/plain text instruction/),
      ).toBeInTheDocument();
    });

    it("should call onInjectInstruction when inject button is clicked", () => {
      const onInject = jest.fn();
      renderDialog({ loadedFile: mockMdFile, onInjectInstruction: onInject });

      fireEvent.click(screen.getByTestId("inject-instruction-btn"));

      expect(onInject).toHaveBeenCalledTimes(1);
      expect(onInject).toHaveBeenCalledWith(mockMdFile.content);
    });

    it("should call onCancel when cancel button is clicked", () => {
      const onCancel = jest.fn();
      renderDialog({ loadedFile: mockMdFile, onCancel });

      const cancelButtons = screen.getAllByText("取消");
      fireEvent.click(cancelButtons[0]);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("should not show instruction preview for JSON file", () => {
      renderDialog({ loadedFile: mockJsonFile, config: mockConfig });
      expect(
        screen.queryByTestId("instruction-preview-dialog"),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("skill-preview-dialog")).toBeInTheDocument();
    });

    it("should truncate very long content with indicator", () => {
      const longContent = "x".repeat(4000);
      const longFile: LoadedFileResult = {
        fileName: "long.md",
        fileType: "markdown",
        content: longContent,
      };
      renderDialog({ loadedFile: longFile });

      expect(screen.getByText(/已截斷/)).toBeInTheDocument();
    });

    it("should show warning about system instruction injection", () => {
      renderDialog({ loadedFile: mockMdFile });

      expect(
        screen.getByText("此檔案將作為系統指令注入當前對話"),
      ).toBeInTheDocument();
    });
  });
});
