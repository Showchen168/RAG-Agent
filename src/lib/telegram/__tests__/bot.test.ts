import https from "https";
import { EventEmitter } from "events";
import { Readable } from "stream";
import {
  markdownToTelegramHtml,
  splitMessage,
  escapeHtml,
  sendMessage,
  sendChatAction,
  telegramPost,
} from "../bot";

// Mock https module
jest.mock("https");
const mockHttpsRequest = https.request as jest.MockedFunction<
  typeof https.request
>;

function createMockResponse(statusCode: number): Readable {
  const res = new Readable({ read() { this.push(null); } });
  Object.assign(res, { statusCode });
  return res;
}

function createMockRequest(): EventEmitter & {
  write: jest.Mock;
  end: jest.Mock;
} {
  const req = new EventEmitter() as EventEmitter & {
    write: jest.Mock;
    end: jest.Mock;
  };
  req.write = jest.fn();
  req.end = jest.fn();
  return req;
}

function setupMockRequest(statusCode: number) {
  const mockReq = createMockRequest();
  const mockRes = createMockResponse(statusCode);
  mockHttpsRequest.mockImplementation((_opts, callback) => {
    process.nextTick(() => (callback as (res: Readable) => void)(mockRes));
    return mockReq as unknown as ReturnType<typeof https.request>;
  });
  return mockReq;
}

describe("telegramPost", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockHttpsRequest.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should send POST with family:4 and correct path", async () => {
    const mockReq = setupMockRequest(200);

    const result = await telegramPost("/bot123/sendMessage", {
      chat_id: 1,
      text: "hi",
    });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);

    const [opts] = mockHttpsRequest.mock.calls[0];
    expect((opts as https.RequestOptions).family).toBe(4);
    expect((opts as https.RequestOptions).path).toBe("/bot123/sendMessage");
    expect((opts as https.RequestOptions).method).toBe("POST");

    const payload = JSON.parse(mockReq.write.mock.calls[0][0]);
    expect(payload.chat_id).toBe(1);
    expect(payload.text).toBe("hi");
  });

  it("should return ok:false for non-2xx status", async () => {
    setupMockRequest(400);
    const result = await telegramPost("/bot123/test", { x: 1 });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it("should reject on network error", async () => {
    const mockReq = createMockRequest();
    mockHttpsRequest.mockImplementation(() => {
      process.nextTick(() => mockReq.emit("error", new Error("ETIMEDOUT")));
      return mockReq as unknown as ReturnType<typeof https.request>;
    });

    await expect(
      telegramPost("/bot123/test", { x: 1 }),
    ).rejects.toThrow("ETIMEDOUT");
  });
});

describe("sendMessage", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, TELEGRAM_BOT_TOKEN: "test-token-123" };
    mockHttpsRequest.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should send message with HTML parse_mode", async () => {
    const mockReq = setupMockRequest(200);

    await sendMessage(12345, "hello");

    expect(mockHttpsRequest).toHaveBeenCalledTimes(1);
    const [opts] = mockHttpsRequest.mock.calls[0];
    expect((opts as https.RequestOptions).path).toContain(
      "test-token-123/sendMessage",
    );

    const body = JSON.parse(mockReq.write.mock.calls[0][0]);
    expect(body.chat_id).toBe(12345);
    expect(body.parse_mode).toBe("HTML");
  });

  it("should fallback to plain text on HTML failure", async () => {
    // First call: 400 (HTML fail), second call: 200 (plain text ok)
    const mockReq = createMockRequest();
    let callCount = 0;
    mockHttpsRequest.mockImplementation((_opts, callback) => {
      callCount++;
      const statusCode = callCount === 1 ? 400 : 200;
      const mockRes = createMockResponse(statusCode);
      process.nextTick(() => (callback as (res: Readable) => void)(mockRes));
      return mockReq as unknown as ReturnType<typeof https.request>;
    });

    await sendMessage(12345, "hello");

    expect(mockHttpsRequest).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(mockReq.write.mock.calls[1][0]);
    expect(secondBody.parse_mode).toBeUndefined();
  });

  it("should throw when TELEGRAM_BOT_TOKEN is not set", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    await expect(sendMessage(12345, "hello")).rejects.toThrow(
      "TELEGRAM_BOT_TOKEN",
    );
  });
});

describe("sendChatAction", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, TELEGRAM_BOT_TOKEN: "test-token-123" };
    mockHttpsRequest.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should send typing action", async () => {
    const mockReq = setupMockRequest(200);

    await sendChatAction(12345);

    expect(mockHttpsRequest).toHaveBeenCalledTimes(1);
    const [opts] = mockHttpsRequest.mock.calls[0];
    expect((opts as https.RequestOptions).path).toContain("/sendChatAction");

    const body = JSON.parse(mockReq.write.mock.calls[0][0]);
    expect(body.action).toBe("typing");
  });

  it("should silently ignore errors", async () => {
    const mockReq = createMockRequest();
    mockHttpsRequest.mockImplementation(() => {
      process.nextTick(() => mockReq.emit("error", new Error("network error")));
      return mockReq as unknown as ReturnType<typeof https.request>;
    });

    // Should not throw
    await sendChatAction(12345);
  });
});

describe("escapeHtml", () => {
  it('should escape & < > "', () => {
    expect(escapeHtml('a < b & c > d "e"')).toBe(
      "a &lt; b &amp; c &gt; d &quot;e&quot;",
    );
  });

  it("should not double-escape", () => {
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });

  it("should handle empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("markdownToTelegramHtml", () => {
  it("should convert bold markdown to HTML", () => {
    expect(markdownToTelegramHtml("**bold**")).toBe("<b>bold</b>");
  });

  it("should convert inline code", () => {
    expect(markdownToTelegramHtml("use `console.log`")).toBe(
      "use <code>console.log</code>",
    );
  });

  it("should escape HTML special characters in plain text", () => {
    const result = markdownToTelegramHtml("a < b & c > d");
    expect(result).toContain("&lt;");
    expect(result).toContain("&amp;");
    expect(result).toContain("&gt;");
  });

  it("should convert code blocks with language", () => {
    const input = '```python\nprint("hello")\n```';
    const result = markdownToTelegramHtml(input);
    expect(result).toContain('<pre><code class="language-python">');
    expect(result).toContain("print(&quot;hello&quot;)");
    expect(result).toContain("</code></pre>");
  });

  it("should convert code blocks without language", () => {
    const input = "```\nsome code\n```";
    const result = markdownToTelegramHtml(input);
    expect(result).toContain("<pre>");
    expect(result).toContain("some code");
    expect(result).toContain("</pre>");
  });

  it("should handle plain text without modification", () => {
    expect(markdownToTelegramHtml("hello world")).toBe("hello world");
  });

  it("should handle mixed formatting", () => {
    const input = "**bold** and `code` text";
    const result = markdownToTelegramHtml(input);
    expect(result).toContain("<b>bold</b>");
    expect(result).toContain("<code>code</code>");
  });

  it("should escape HTML inside inline code", () => {
    const result = markdownToTelegramHtml("use `<div>`");
    expect(result).toContain("<code>&lt;div&gt;</code>");
  });
});

describe("splitMessage", () => {
  it("should not split short messages", () => {
    expect(splitMessage("hello", 4096)).toEqual(["hello"]);
  });

  it("should return single element for message at limit", () => {
    const msg = "a".repeat(4096);
    expect(splitMessage(msg, 4096)).toEqual([msg]);
  });

  it("should split long messages at newlines", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
    const long = lines.join("\n");
    const result = splitMessage(long, 25);
    expect(result.length).toBeGreaterThan(1);
    // All content should be preserved
    expect(result.join("\n")).toContain("line1");
    expect(result.join("\n")).toContain("line10");
  });

  it("should handle message with no newlines", () => {
    const msg = "a".repeat(100);
    const result = splitMessage(msg, 30);
    expect(result.length).toBeGreaterThan(1);
    expect(result.join("")).toBe(msg);
  });

  it("should default to 4096 limit", () => {
    const short = "hello";
    expect(splitMessage(short)).toEqual(["hello"]);
  });
});
