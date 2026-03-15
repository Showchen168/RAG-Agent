import { describe, it, expect, beforeEach } from "@jest/globals";

// Mock createAdminClient before importing the module under test
const mockSupabase = {
  from: jest.fn(),
};

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => mockSupabase,
}));

// Import after mocks are set up
import {
  generateRandomCode,
  createLinkCode,
  verifyAndLink,
  getTelegramStatus,
  unlinkTelegram,
} from "../link";

// ========== Helper to build fluent Supabase mock chains ==========
function mockChain(finalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const handler = {
    get(_: unknown, prop: string) {
      if (prop === "then") return undefined; // prevent Promise detection
      // Only create mock if not already defined (preserve terminal overrides)
      if (!(prop in chain)) {
        chain[prop] = jest.fn().mockReturnValue(new Proxy(chain, handler));
      }
      return chain[prop];
    },
  };

  // Set terminal methods FIRST — they resolve with the final result
  chain["single"] = jest.fn().mockResolvedValue(finalResult);
  chain["maybeSingle"] = jest.fn().mockResolvedValue(finalResult);

  const proxy = new Proxy(chain, handler);
  return { proxy, chain };
}

describe("generateRandomCode", () => {
  it("should return a code starting with NM-", () => {
    const code = generateRandomCode();
    expect(code).toMatch(/^NM-/);
  });

  it("should return a code with 6 characters after prefix", () => {
    const code = generateRandomCode();
    const suffix = code.replace("NM-", "");
    expect(suffix).toHaveLength(6);
  });

  it("should only contain allowed characters (A-Z, 2-9, excluding O/I/L)", () => {
    // Run multiple times to increase coverage
    for (let i = 0; i < 100; i++) {
      const code = generateRandomCode();
      const suffix = code.replace("NM-", "");
      expect(suffix).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
    }
  });

  it("should not contain ambiguous characters (0, 1, O, I, L)", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRandomCode();
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it("should generate unique codes", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateRandomCode());
    }
    // Should have high uniqueness (allowing for rare collisions)
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe("createLinkCode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return existing unexpired code if one exists", async () => {
    const existingCode = {
      code: "NM-ABC234",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    };

    // First call: check existing codes (returns existing)
    const checkChain = mockChain({ data: existingCode, error: null });
    // Second call: cleanup old codes (no-op)
    const cleanupChain = mockChain({ data: null, error: null });

    let callCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "telegram_link_codes") {
        callCount++;
        if (callCount === 1) return checkChain.proxy;
        return cleanupChain.proxy;
      }
      return checkChain.proxy;
    });

    const result = await createLinkCode("user-123");
    expect(result.code).toBe("NM-ABC234");
  });

  it("should create a new code when no existing code found", async () => {
    // First call: check existing codes (none found)
    const checkChain = mockChain({ data: null, error: null });
    // Second call: cleanup old codes
    const cleanupChain = mockChain({ data: null, error: null });
    // Third call: insert new code
    const insertChain = mockChain({
      data: {
        code: "NM-XYZ789",
        expires_at: new Date(Date.now() + 600_000).toISOString(),
      },
      error: null,
    });

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return checkChain.proxy;
      if (callCount === 2) return cleanupChain.proxy;
      return insertChain.proxy;
    });

    const result = await createLinkCode("user-123");
    expect(result.code).toBeDefined();
    expect(result.expires_at).toBeDefined();
  });
});

describe("verifyAndLink", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return error for invalid code format", async () => {
    const result = await verifyAndLink("INVALID", 12345);
    expect(result.success).toBe(false);
    expect(result.error).toContain("格式");
  });

  it("should return error for expired code", async () => {
    const expiredCode = {
      id: "code-id",
      code: "NM-ABC234",
      user_id: "user-123",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      used: false,
    };

    const findChain = mockChain({ data: expiredCode, error: null });
    mockSupabase.from.mockReturnValue(findChain.proxy);

    const result = await verifyAndLink("NM-ABC234", 12345);
    expect(result.success).toBe(false);
    expect(result.error).toContain("過期");
  });

  it("should return error for already used code", async () => {
    const usedCode = {
      id: "code-id",
      code: "NM-ABC234",
      user_id: "user-123",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      used: true,
    };

    const findChain = mockChain({ data: usedCode, error: null });
    mockSupabase.from.mockReturnValue(findChain.proxy);

    const result = await verifyAndLink("NM-ABC234", 12345);
    expect(result.success).toBe(false);
    expect(result.error).toContain("已使用");
  });

  it("should return error for non-existent code", async () => {
    const findChain = mockChain({ data: null, error: null });
    mockSupabase.from.mockReturnValue(findChain.proxy);

    const result = await verifyAndLink("NM-ABC234", 12345);
    expect(result.success).toBe(false);
    expect(result.error).toContain("無效");
  });

  it("should succeed for valid, unexpired, unused code", async () => {
    const validCode = {
      id: "code-id",
      code: "NM-ABC234",
      user_id: "user-123",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      used: false,
    };

    // Mock sequence: find code → mark used → upsert telegram_users
    let callCount = 0;
    const findChain = mockChain({ data: validCode, error: null });
    const updateChain = mockChain({ data: null, error: null });
    const upsertChain = mockChain({ data: null, error: null });

    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return findChain.proxy;
      if (callCount === 2) return updateChain.proxy;
      return upsertChain.proxy;
    });

    const result = await verifyAndLink("NM-ABC234", 12345);
    expect(result.success).toBe(true);
    expect(result.userId).toBe("user-123");
  });
});

describe("getTelegramStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return linked: false when no binding exists", async () => {
    const findChain = mockChain({ data: null, error: null });
    mockSupabase.from.mockReturnValue(findChain.proxy);

    const result = await getTelegramStatus("user-123");
    expect(result.linked).toBe(false);
  });

  it("should return linked: true with chat info when binding exists", async () => {
    const binding = {
      telegram_chat_id: 12345,
      telegram_username: "testuser",
      telegram_first_name: "Test",
    };

    const findChain = mockChain({ data: binding, error: null });
    mockSupabase.from.mockReturnValue(findChain.proxy);

    const result = await getTelegramStatus("user-123");
    expect(result.linked).toBe(true);
    expect(result.telegramUsername).toBe("testuser");
    expect(result.telegramFirstName).toBe("Test");
  });
});

describe("unlinkTelegram", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return success: false when no binding exists", async () => {
    const findChain = mockChain({ data: null, error: null });
    mockSupabase.from.mockReturnValue(findChain.proxy);

    const result = await unlinkTelegram("user-123");
    expect(result.success).toBe(false);
    expect(result.error).toContain("未綁定");
  });

  it("should successfully unlink existing binding", async () => {
    const binding = {
      id: "binding-id",
      telegram_chat_id: 12345,
    };

    let callCount = 0;
    const findChain = mockChain({ data: binding, error: null });
    const deleteChain = mockChain({ data: null, error: null });

    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return findChain.proxy;
      return deleteChain.proxy;
    });

    const result = await unlinkTelegram("user-123");
    expect(result.success).toBe(true);
  });
});
