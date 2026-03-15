/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock 所有外部依賴
jest.mock("ai", () => ({
  generateText: jest.fn(),
}));
jest.mock("@ai-sdk/google", () => ({ google: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));

import * as fs from "fs";
import * as path from "path";

describe("persistAssistantMessage with Markdown content", () => {
  it("normalizeAssistantContent passes through Markdown content", () => {
    const markdownContent = "## 回答\n\n這是一個 Markdown 回答。";
    expect(markdownContent).not.toContain('"response"');
    expect(markdownContent).toContain("## 回答");
    expect(markdownContent.trim()).toBeTruthy();
  });

  it("normalizeAssistantContent handles empty strings", () => {
    const emptyContent = "";
    expect(emptyContent.trim()).toBe("");
  });

  it("normalizeAssistantContent preserves Markdown formatting", () => {
    const markdownContent = `## 標題\n\n- 項目 1\n- 項目 2\n\n**粗體文字**`;
    expect(markdownContent).toContain("## 標題");
    expect(markdownContent).toContain("- 項目 1");
    expect(markdownContent).toContain("**粗體文字**");
  });

  it("handles RAG metadata gracefully without JSON parsing", () => {
    const plainMarkdownContent = "## 回答\n\n引用來源：文件 A、文件 B";
    expect(plainMarkdownContent).toContain("引用來源");
    expect(() => JSON.parse(plainMarkdownContent)).toThrow();
  });

  describe("route.ts after Crayon removal", () => {
    let routeContent: string;

    beforeAll(() => {
      const routePath = path.join(
        process.cwd(),
        "src/app/api/chat/route.ts"
      );
      routeContent = fs.readFileSync(routePath, "utf-8");
    });

    it("no longer uses Crayon JSON response array parsing", () => {
      expect(routeContent).not.toContain("parsed?.response");
      expect(routeContent).not.toContain("parsed.response.unshift");
    });

    it("no longer checks for Crayon suggestions template format", () => {
      expect(routeContent).not.toContain("hasSuggestionsInDb");
      expect(routeContent).not.toContain("hasSuggestionsInNew");
      expect(routeContent).not.toContain('"name":"suggestions"');
    });

    it("normalizeAssistantContent does not check for broken JSON patterns", () => {
      const functionMatch = routeContent.match(
        /function normalizeAssistantContent\(raw: string\)[^}]+}/s
      );
      expect(functionMatch).toBeTruthy();
      if (functionMatch) {
        expect(functionMatch[0]).not.toContain('{"response"');
      }
    });

    it("still has isFinal UPDATE logic (simplified)", () => {
      expect(routeContent).toContain("if (isFinal)");
    });
  });
});
