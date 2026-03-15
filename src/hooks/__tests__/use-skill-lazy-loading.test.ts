/**
 * useSkillLazyLoading Hook — Unit tests
 */

import { renderHook, act } from "@testing-library/react";
import { useSkillLazyLoading } from "../use-skill-lazy-loading";

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("useSkillLazyLoading", () => {
  it("should initialize with empty states", () => {
    const { result } = renderHook(() => useSkillLazyLoading());

    expect(result.current.loadingSkills).toEqual([]);
    expect(result.current.loadedSkills).toEqual([]);
    expect(result.current.isLoadingSkill).toBe(false);
  });

  it("should strip LOAD_SKILL markers from text", () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          skill: {
            name: "docx-generator",
            display_name: "Word Generator",
            description: "Generates Word docs",
            skill_md: "# Instructions",
          },
        }),
    });

    const { result } = renderHook(() => useSkillLazyLoading());

    let cleaned = "";
    act(() => {
      cleaned = result.current.processStreamText(
        "Loading skill now. [LOAD_SKILL: docx-generator] Please wait.",
      );
    });

    expect(cleaned).not.toContain("[LOAD_SKILL:");
    expect(cleaned).toContain("Loading skill now.");
    expect(cleaned).toContain("Please wait.");
  });

  it("should trigger skill loading when marker detected", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          skill: {
            name: "docx-generator",
            display_name: "Word Generator",
            description: "Generates Word docs",
            skill_md: "# Instructions",
          },
        }),
    });

    const { result } = renderHook(() => useSkillLazyLoading());

    act(() => {
      result.current.processStreamText("[LOAD_SKILL: docx-generator]");
    });

    // Should have a loading state immediately
    expect(result.current.loadingSkills.length).toBeGreaterThanOrEqual(1);
    expect(result.current.loadingSkills[0].skillName).toBe("docx-generator");
  });

  it("should not re-trigger for already processed markers", () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          skill: {
            name: "docx-generator",
            display_name: "Word Generator",
            description: "Generates Word docs",
            skill_md: "# Instructions",
          },
        }),
    });

    const { result } = renderHook(() => useSkillLazyLoading());

    act(() => {
      result.current.processStreamText("[LOAD_SKILL: docx-generator]");
    });

    const firstCallCount = mockFetch.mock.calls.length;

    act(() => {
      result.current.processStreamText("[LOAD_SKILL: docx-generator]");
    });

    // Should not trigger another fetch
    expect(mockFetch.mock.calls.length).toBe(firstCallCount);
  });

  it("should return original text when no markers present", () => {
    const { result } = renderHook(() => useSkillLazyLoading());

    let cleaned = "";
    act(() => {
      cleaned = result.current.processStreamText("Hello, how can I help?");
    });

    expect(cleaned).toBe("Hello, how can I help?");
    expect(result.current.loadingSkills).toEqual([]);
  });

  it("should clear all states", () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          skill: {
            name: "test-skill",
            display_name: "Test",
            description: "Test",
            skill_md: "",
          },
        }),
    });

    const { result } = renderHook(() => useSkillLazyLoading());

    act(() => {
      result.current.processStreamText("[LOAD_SKILL: test-skill]");
    });

    act(() => {
      result.current.clearLoadingStates();
    });

    expect(result.current.loadingSkills).toEqual([]);
    expect(result.current.loadedSkills).toEqual([]);
  });

  it("should handle fetch returning not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Not found" }),
    });

    const { result } = renderHook(() => useSkillLazyLoading());

    act(() => {
      result.current.processStreamText("[LOAD_SKILL: missing-skill]");
    });

    // Should have triggered a loading state
    expect(result.current.loadingSkills.length).toBe(1);
    expect(result.current.loadingSkills[0].status).toBe("loading");

    // Wait for fetch to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.loadingSkills[0].status).toBe("error");
  });

  it("should handle fetch throwing an error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useSkillLazyLoading());

    act(() => {
      result.current.processStreamText("[LOAD_SKILL: net-fail]");
    });

    // Wait for fetch to reject
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.loadingSkills[0].status).toBe("error");
  });

  it("should handle fetch returning null skill", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ skill: null }),
    });

    const { result } = renderHook(() => useSkillLazyLoading());

    act(() => {
      result.current.processStreamText("[LOAD_SKILL: null-skill]");
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.loadingSkills[0].status).toBe("error");
  });

  it("should handle multiple different skills in one text", () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          skill: {
            name: "skill-a",
            display_name: "Skill A",
            description: "A",
            skill_md: "",
          },
        }),
    });

    const { result } = renderHook(() => useSkillLazyLoading());

    act(() => {
      result.current.processStreamText(
        "[LOAD_SKILL: skill-a] and [LOAD_SKILL: skill-b]",
      );
    });

    expect(result.current.loadingSkills.length).toBe(2);
    expect(result.current.loadingSkills[0].skillName).toBe("skill-a");
    expect(result.current.loadingSkills[1].skillName).toBe("skill-b");
  });

  it("should update loaded skills after successful fetch", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          skill: {
            name: "loaded-skill",
            display_name: "Loaded Skill",
            description: "A loaded skill",
            skill_md: "# Content here",
          },
        }),
    });

    const { result } = renderHook(() => useSkillLazyLoading());

    act(() => {
      result.current.processStreamText("[LOAD_SKILL: loaded-skill]");
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.loadedSkills.length).toBe(1);
    expect(result.current.loadedSkills[0].name).toBe("loaded-skill");
    expect(result.current.loadedSkills[0].skill_md).toBe("# Content here");
  });
});
