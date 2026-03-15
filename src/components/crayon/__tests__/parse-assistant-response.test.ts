import { parseAssistantResponseParts } from "@/lib/crayon/message-parser";

describe("parseAssistantResponseParts", () => {
  // ─── 正常路徑 ───────────────────────────────────────────
  it("plain JSON → returns response parts", () => {
    const content = JSON.stringify({
      response: [{ type: "text", text: "hello" }],
    });
    const parts = parseAssistantResponseParts(content);
    expect(parts).toEqual([{ type: "text", text: "hello" }]);
  });

  // ─── Bare Object 支持 (Gemini Flash/Pro 容錯) ───────────
  it("bare object template → returns response parts array", () => {
    const content = JSON.stringify({
      type: "template",
      name: "suggestions",
      templateProps: { suggestions: ["What is quantum physics?"] }
    });
    const parts = parseAssistantResponseParts(content);
    expect(parts).toEqual([{
      type: "template",
      name: "suggestions",
      templateProps: { suggestions: ["What is quantum physics?"] }
    }]);
  });

  it("hybrid: real text prefix before bare object template → keeps prefix as text part", () => {
    const content = 'You should consider:\n{"type":"template","name":"data_table"}';
    const parts = parseAssistantResponseParts(content);

    expect(parts).not.toBeNull();
    expect(parts![0]).toEqual({ type: "text", text: "You should consider:" });
    expect(parts![1]).toEqual({ type: "template", name: "data_table" });
  });

  // ─── BUG 重現：code fence prefix 洩漏 ───────────────────
  it("BUG: should NOT leak ```json code fence as prefix text part", () => {
    // 這是 onFinish 可能存入 DB 的格式
    const content =
      '```json\n{"response":[{"type":"text","text":"1 + 1 的答案是 **2**。"}]}\n```';
    const parts = parseAssistantResponseParts(content);

    expect(parts).not.toBeNull();
    expect(Array.isArray(parts)).toBe(true);

    // 不應該有任何 part 包含 backtick 或 "json"
    const texts = parts!.map(
      (p: { type: string; text?: string }) => p.text ?? "",
    );
    const joined = texts.join("");
    expect(joined).not.toContain("```");
    expect(joined).not.toContain("json");

    // 實際的文字 part 應該是乾淨的
    expect(parts).toEqual([{ type: "text", text: "1 + 1 的答案是 **2**。" }]);
  });

  it("BUG: should NOT leak ``` (no language) code fence as prefix text part", () => {
    const content =
      '```\n{"response":[{"type":"text","text":"答案是 2"}]}\n```';
    const parts = parseAssistantResponseParts(content);

    expect(parts).not.toBeNull();
    const texts = parts!
      .map((p: { type: string; text?: string }) => p.text ?? "")
      .join("");
    expect(texts).not.toContain("```");
    expect(parts).toEqual([{ type: "text", text: "答案是 2" }]);
  });

  // ─── 合法的混合格式（前綴是真實文字）應保留 ────────────────
  it("hybrid: real text prefix before JSON → keeps prefix as text part", () => {
    const content =
      'Here is the plan:\n{"response":[{"type":"text","text":"step 1"}]}';
    const parts = parseAssistantResponseParts(content);

    expect(parts).not.toBeNull();
    // 第一個 part 應是前綴文字
    expect(parts![0]).toEqual({ type: "text", text: "Here is the plan:" });
    expect(parts![1]).toEqual({ type: "text", text: "step 1" });
  });

  // ─── 邊界情況 ─────────────────────────────────────────────
  it("null / empty → returns null", () => {
    expect(parseAssistantResponseParts(null)).toBeNull();
    expect(parseAssistantResponseParts("")).toBeNull();
    expect(parseAssistantResponseParts("   ")).toBeNull();
  });

  it("truncated JSON → returns interrupted placeholder", () => {
    expect(parseAssistantResponseParts("{")).toEqual([
      { type: "text", text: "（回覆中斷，內容未完整儲存）" },
    ]);
  });

  it("plain text (no JSON structure) → returns null", () => {
    expect(parseAssistantResponseParts("just plain text")).toBeNull();
  });
});
