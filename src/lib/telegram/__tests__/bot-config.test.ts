import {
  verifyBotToken,
  getActiveBotToken,
  getEncryptionKey,
  getBotConfig,
  saveBotConfig,
} from "../bot-config";

// Mock telegramRequest
jest.mock("../bot", () => ({
  telegramRequest: jest.fn(),
}));

// Configurable mock for supabase - tracks all operations
const mockOperations: string[] = [];
let mockSelectResult: { data: unknown; error: unknown } = { data: null, error: null };
let mockInsertResult: { error: unknown } = { error: null };
let mockUpdateResult: { error: unknown } = { error: null };

const createMockChain = () => {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn(() => { mockOperations.push("select"); return chain; });
  chain.insert = jest.fn(() => { mockOperations.push("insert"); return chain; });
  chain.update = jest.fn(() => { mockOperations.push("update"); return chain; });
  chain.delete = jest.fn(() => { mockOperations.push("delete"); return chain; });
  chain.eq = jest.fn(() => chain);
  chain.neq = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(() => mockSelectResult);
  // For insert/update terminal - return the result based on last operation
  chain.then = undefined; // Make it thenable-safe
  Object.defineProperty(chain, "error", {
    get: () => {
      const lastOp = mockOperations[mockOperations.length - 1];
      if (lastOp === "insert") return mockInsertResult.error;
      if (lastOp === "update") return mockUpdateResult.error;
      return null;
    },
  });
  return chain;
};

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => createMockChain()),
  })),
  createClient: jest.fn(),
}));

// Mock crypto module
jest.mock("../crypto", () => ({
  encryptToken: jest.fn((token: string) => `encrypted_${token}`),
  decryptToken: jest.fn((encrypted: string) => encrypted.replace("encrypted_", "")),
  maskToken: jest.fn((token: string) => `${token.slice(0, 4)}***`),
}));

describe("bot-config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("getEncryptionKey", () => {
    it("should return the encryption key from env var", () => {
      process.env.BOT_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
      expect(getEncryptionKey()).toBe("a".repeat(64));
    });

    it("should throw if env var is not set", () => {
      delete process.env.BOT_TOKEN_ENCRYPTION_KEY;
      expect(() => getEncryptionKey()).toThrow("BOT_TOKEN_ENCRYPTION_KEY");
    });
  });

  describe("verifyBotToken", () => {
    it("should return bot info on valid token", async () => {
      const { telegramRequest } = require("../bot");
      (telegramRequest as jest.Mock).mockResolvedValueOnce({
        ok: true,
        statusCode: 200,
        result: {
          id: 123456,
          is_bot: true,
          first_name: "TestBot",
          username: "test_bot",
        },
      });

      const result = await verifyBotToken("fake-token");
      expect(result.ok).toBe(true);
      expect(result.bot?.id).toBe(123456);
      expect(result.bot?.username).toBe("test_bot");
    });

    it("should return error on invalid token", async () => {
      const { telegramRequest } = require("../bot");
      (telegramRequest as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusCode: 401,
      });

      const result = await verifyBotToken("bad-token");
      expect(result.ok).toBe(false);
      expect(result.bot).toBeUndefined();
    });
  });

  describe("getActiveBotToken", () => {
    it("should fallback to env var when no DB config and key is missing", async () => {
      process.env.TELEGRAM_BOT_TOKEN = "env-token-123";
      delete process.env.BOT_TOKEN_ENCRYPTION_KEY;

      const token = await getActiveBotToken();
      expect(token).toBe("env-token-123");
    });

    it("should return null when no DB config and no env var", async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.BOT_TOKEN_ENCRYPTION_KEY;

      const token = await getActiveBotToken();
      expect(token).toBeNull();
    });
  });

  describe("getBotConfig", () => {
    it("should return null when no config exists", async () => {
      const config = await getBotConfig();
      expect(config).toBeNull();
    });
  });

  describe("saveBotConfig - upsert safety", () => {
    const mockBot = {
      id: 123456,
      is_bot: true as const,
      first_name: "TestBot",
      username: "test_bot",
    };

    beforeEach(() => {
      mockOperations.length = 0;
      mockSelectResult = { data: null, error: null };
      mockInsertResult = { error: null };
      mockUpdateResult = { error: null };
      process.env.BOT_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    });

    it("should NOT use delete operation (upsert pattern instead)", async () => {
      // 不管有沒有現有記錄，saveBotConfig 都不應該用 delete
      await saveBotConfig("token123", mockBot, "user-1");

      expect(mockOperations).not.toContain("delete");
    });

    it("should insert when no existing config", async () => {
      mockSelectResult = { data: null, error: null };
      mockInsertResult = { error: null };

      const result = await saveBotConfig("token123", mockBot, "user-1");

      expect(result.success).toBe(true);
      expect(mockOperations).toContain("select"); // 先查
      expect(mockOperations).toContain("insert"); // 沒有就插入
      expect(mockOperations).not.toContain("delete"); // 不刪
    });

    it("should update when config already exists", async () => {
      mockSelectResult = {
        data: { id: "existing-uuid", is_active: true },
        error: null,
      };
      mockUpdateResult = { error: null };

      const result = await saveBotConfig("token123", mockBot, "user-1");

      expect(result.success).toBe(true);
      expect(mockOperations).toContain("select"); // 先查
      expect(mockOperations).toContain("update"); // 有就更新
      expect(mockOperations).not.toContain("delete"); // 不刪
    });

    it("should return error without data loss when insert fails", async () => {
      mockSelectResult = { data: null, error: null };
      mockInsertResult = { error: { message: "DB connection lost" } };

      const result = await saveBotConfig("token123", mockBot, "user-1");

      expect(result.success).toBe(false);
      expect(mockOperations).not.toContain("delete"); // 最重要：失敗也不刪資料
    });
  });
});
