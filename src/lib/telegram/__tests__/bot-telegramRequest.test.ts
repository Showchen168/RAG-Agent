/**
 * 測試 bot.ts 的 telegramRequest<T> 函數
 * telegramRequest 是 telegramPost 的擴充版，會回傳 response body
 */
import { telegramRequest } from "../bot";

// Mock https module
jest.mock("https", () => {
  const { PassThrough } = require("stream");
  return {
    request: jest.fn((_options: unknown, callback: (res: unknown) => void) => {
      const res = new PassThrough();
      (res as Record<string, unknown>).statusCode = 200;
      // Simulate async response
      setTimeout(() => {
        res.write(
          JSON.stringify({ ok: true, result: { id: 123, is_bot: true, first_name: "TestBot", username: "test_bot" } }),
        );
        res.end();
        callback(res);
      }, 0);
      const req = new PassThrough();
      (req as Record<string, unknown>).end = jest.fn();
      (req as Record<string, unknown>).write = jest.fn();
      (req as Record<string, unknown>).on = jest.fn();
      return req;
    }),
  };
});

// Mock dns module
jest.mock("dns", () => ({
  Resolver: jest.fn().mockImplementation(() => ({
    setServers: jest.fn(),
    resolve4: jest.fn((_hostname: string, cb: (err: null, addresses: string[]) => void) => {
      cb(null, ["149.154.167.220"]);
    }),
  })),
}));

describe("telegramRequest", () => {
  it("should be exported as a function", () => {
    expect(typeof telegramRequest).toBe("function");
  });
});
