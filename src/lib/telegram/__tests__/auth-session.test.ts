/**
 * auth-session.test.ts
 * 測試 Telegram 對話自動建立新 session（閒置超時機制）
 */

// 建立鍊式 mock helpers
const mockMaybeSingle = jest.fn();
const mockSingle = jest.fn();
const mockLimit = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockOrder = jest.fn(() => ({ limit: mockLimit }));
const mockEqChain = jest.fn(() => ({
  maybeSingle: mockMaybeSingle,
  order: mockOrder,
}));
const mockSelect = jest.fn(() => ({
  eq: mockEqChain,
  single: mockSingle,
}));
const mockInsert = jest.fn(() => ({ select: mockSelect }));
const mockUpdate = jest.fn(() => ({ eq: jest.fn() }));
const mockUpsert = jest.fn();

const mockFrom = jest.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  upsert: mockUpsert,
}));

const mockCreateUser = jest.fn();
const mockListUsers = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(() => ({
    from: mockFrom,
    auth: {
      admin: {
        createUser: mockCreateUser,
        listUsers: mockListUsers,
      },
    },
  })),
}));

import { getOrCreateTelegramUser, AUTO_NEW_SESSION_IDLE_MS } from "../auth";

describe("getOrCreateTelegramUser - auto new session", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("exports AUTO_NEW_SESSION_IDLE_MS constant (30 minutes)", () => {
    expect(AUTO_NEW_SESSION_IDLE_MS).toBe(30 * 60 * 1000);
  });

  it("reuses existing conversation when last message is recent (< 30 min)", async () => {
    const recentTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago

    // telegram_users query returns existing user with recent last_message_at
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        user_id: "user-123",
        default_conversation_id: "conv-existing",
        last_message_at: recentTime,
      },
      error: null,
    });

    const result = await getOrCreateTelegramUser(12345, "TestUser");

    expect(result.userId).toBe("user-123");
    expect(result.conversationId).toBe("conv-existing");
    // Should NOT have called insert for a new conversation
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("creates new conversation when last message is old (> 30 min)", async () => {
    const oldTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago

    // telegram_users query returns existing user with old last_message_at
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        user_id: "user-456",
        default_conversation_id: "conv-old",
        last_message_at: oldTime,
      },
      error: null,
    });

    // conversations.insert returns new conversation
    mockSingle.mockResolvedValueOnce({
      data: { id: "conv-new" },
      error: null,
    });

    const result = await getOrCreateTelegramUser(67890, "TestUser2");

    expect(result.userId).toBe("user-456");
    expect(result.conversationId).toBe("conv-new");
    // Should have called insert to create new conversation
    expect(mockFrom).toHaveBeenCalledWith("conversations");
    expect(mockInsert).toHaveBeenCalled();
  });

  it("reuses existing conversation when last_message_at is null (first time)", async () => {
    // telegram_users query returns existing user with no last_message_at
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        user_id: "user-789",
        default_conversation_id: "conv-first",
        last_message_at: null,
      },
      error: null,
    });

    const result = await getOrCreateTelegramUser(11111, "NewUser");

    expect(result.userId).toBe("user-789");
    expect(result.conversationId).toBe("conv-first");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("updates default_conversation_id in telegram_users after creating new session", async () => {
    const oldTime = new Date(Date.now() - 45 * 60 * 1000).toISOString(); // 45 min ago

    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        user_id: "user-update",
        default_conversation_id: "conv-old",
        last_message_at: oldTime,
      },
      error: null,
    });

    mockSingle.mockResolvedValueOnce({
      data: { id: "conv-fresh" },
      error: null,
    });

    await getOrCreateTelegramUser(22222, "UpdateUser");

    // Should update telegram_users with new conversation ID
    expect(mockUpdate).toHaveBeenCalled();
  });
});
