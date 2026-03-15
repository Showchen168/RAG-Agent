import { renderHook, act } from "@testing-library/react";
import { useThreadLoader } from "../use-thread-loader";

describe("useThreadLoader", () => {
  const mockSetMessages = jest.fn();
  const mockLoadThread = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function render(chatStoreId: string) {
    return renderHook(
      ({ id }) =>
        useThreadLoader({
          chatStoreId: id,
          loadThread: mockLoadThread,
          setMessages: mockSetMessages,
        }),
      { initialProps: { id: chatStoreId } },
    );
  }

  // --- 基本行為 ---

  it("calls loadThread on mount when chatStoreId is a real thread id", async () => {
    mockLoadThread.mockResolvedValueOnce([{ id: "m1", role: "user", content: "hi" }]);

    const { result } = render("thread-abc");
    // Effect 觸發後 loadThread 應被呼叫
    await act(async () => {});

    expect(mockLoadThread).toHaveBeenCalledWith("thread-abc");
    expect(mockSetMessages).toHaveBeenCalledWith([{ id: "m1", role: "user", content: "hi" }]);
    expect(result.current.isLoadingMessages).toBe(false);
    expect(result.current.loadedChatStoreId).toBe("thread-abc");
    expect(result.current.loadError).toBeNull();
  });

  it("does NOT call loadThread when chatStoreId is 'new-chat'", async () => {
    const { result } = render("new-chat");
    await act(async () => {});

    expect(mockLoadThread).not.toHaveBeenCalled();
    expect(mockSetMessages).toHaveBeenCalledWith([]);
    expect(result.current.isLoadingMessages).toBe(false);
    expect(result.current.loadedChatStoreId).toBe("new-chat");
  });

  it("reloads when chatStoreId changes to a different thread", async () => {
    mockLoadThread
      .mockResolvedValueOnce([{ id: "m1", role: "user", content: "hi" }])
      .mockResolvedValueOnce([{ id: "m2", role: "user", content: "yo" }]);

    const { result, rerender } = render("thread-abc");
    await act(async () => {});

    expect(mockLoadThread).toHaveBeenCalledWith("thread-abc");

    // 切換到另一個對話
    rerender({ id: "thread-def" });
    await act(async () => {});

    expect(mockLoadThread).toHaveBeenCalledWith("thread-def");
    expect(result.current.loadedChatStoreId).toBe("thread-def");
  });

  // --- 🐛 BUG: loadThread 失敗不應標記為已載入成功 ---

  it("sets loadError when loadThread fails, does NOT mark as successfully loaded", async () => {
    mockLoadThread.mockRejectedValueOnce(new Error("Network error"));

    const { result } = render("thread-abc");
    await act(async () => {});

    expect(result.current.loadError).toBe("Network error");
    expect(result.current.isLoadingMessages).toBe(false);
    // 🎯 核心：loadedChatStoreId 不應該等於 chatStoreId（因為載入失敗了）
    expect(result.current.loadedChatStoreId).not.toBe("thread-abc");
  });

  // --- 🐛 BUG: 重新掛載同一 chatStoreId 時仍需載入 ---

  it("loads thread on remount even if chatStoreId is the same", async () => {
    mockLoadThread
      .mockResolvedValueOnce([{ id: "m1", role: "user", content: "hi" }])
      .mockResolvedValueOnce([{ id: "m1", role: "user", content: "hi" }]);

    // 第一次掛載
    const { unmount } = render("thread-abc");
    await act(async () => {});
    expect(mockLoadThread).toHaveBeenCalledTimes(1);

    // 卸載（模擬導航離開）
    unmount();

    // 第二次掛載（模擬導航回來）
    const { result } = render("thread-abc");
    await act(async () => {});

    // 🎯 核心：即使 chatStoreId 相同，重新掛載仍應觸發 loadThread
    expect(mockLoadThread).toHaveBeenCalledTimes(2);
    expect(result.current.loadedChatStoreId).toBe("thread-abc");
  });

  // --- retry 機制 ---

  it("retryLoad reloads the current thread after a failure", async () => {
    mockLoadThread
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValueOnce([{ id: "m1", role: "user", content: "hi" }]);

    const { result } = render("thread-abc");
    await act(async () => {});

    // 第一次失敗
    expect(result.current.loadError).toBe("Timeout");
    expect(result.current.loadedChatStoreId).not.toBe("thread-abc");

    // 手動重試
    await act(async () => {
      result.current.retryLoad();
    });
    await act(async () => {});

    // 重試成功
    expect(result.current.loadError).toBeNull();
    expect(result.current.loadedChatStoreId).toBe("thread-abc");
    expect(mockSetMessages).toHaveBeenCalledWith([{ id: "m1", role: "user", content: "hi" }]);
  });

  // --- isLoading 狀態 ---

  it("sets isLoadingMessages to true while loading", async () => {
    let resolveLoad: (value: unknown[]) => void;
    mockLoadThread.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );

    const { result } = render("thread-abc");

    // Effect 已排程但 promise 尚未 resolve
    await act(async () => {});
    expect(result.current.isLoadingMessages).toBe(true);

    // Resolve promise
    await act(async () => {
      resolveLoad!([{ id: "m1", role: "user", content: "hello" }]);
    });

    expect(result.current.isLoadingMessages).toBe(false);
  });

  // --- Effect cleanup（防止 stale state） ---

  it("ignores result of previous loadThread when chatStoreId changes quickly", async () => {
    let resolveFirst: (value: unknown[]) => void;
    mockLoadThread
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce([{ id: "m2", role: "user", content: "second" }]);

    const { result, rerender } = render("thread-abc");
    await act(async () => {});

    // 快速切換到另一個對話
    rerender({ id: "thread-def" });
    await act(async () => {});

    // 第一個 promise 晚到 — 應該被忽略
    await act(async () => {
      resolveFirst!([{ id: "m1", role: "user", content: "first" }]);
    });

    // 最終結果應該是第二個對話的訊息
    expect(result.current.loadedChatStoreId).toBe("thread-def");
    expect(mockSetMessages).toHaveBeenLastCalledWith([
      { id: "m2", role: "user", content: "second" },
    ]);
  });
});
