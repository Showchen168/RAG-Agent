import { renderHook, act, waitFor } from "@testing-library/react";
import { useSkills } from "../use-skills";
import type { Skill, SkillConfig } from "@/types/skills";

// ─── Mock fetch ──────────────────────────────────────────
const mockFetch = jest.fn();
beforeEach(() => {
  global.fetch = mockFetch;
  mockFetch.mockReset();
});

// ─── Fixtures ─────────────────────────────────────────────
function makeSkillConfig(overrides: Partial<SkillConfig> = {}): SkillConfig {
  return {
    name: "test-skill",
    displayName: "Test Skill",
    description: "A test skill",
    icon: "FileText",
    category: "document",
    input: { type: "context" },
    output: {
      fileType: "md",
      mimeType: "text/markdown",
      previewFormat: "markdown",
    },
    runtime: { baseImage: "node:20", timeout: 30, maxMemory: "256m" },
    ...overrides,
  };
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "skill-1",
    user_id: "user-1",
    name: "test-skill",
    display_name: "Test Skill",
    description: "A test skill",
    icon: "FileText",
    category: "document",
    version: "1.0.0",
    skill_md: "# Test",
    skill_config: makeSkillConfig(),
    storage_path: "/skills/test",
    is_system: false,
    is_enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────
describe("useSkills", () => {
  describe("loadSkills", () => {
    it("fetches enabled skills on mount", async () => {
      const skills = [makeSkill(), makeSkill({ id: "skill-2", name: "other" })];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ skills }),
      });

      const { result } = renderHook(() => useSkills());

      await waitFor(() => {
        expect(result.current.skills).toHaveLength(2);
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/skills");
      // 只回傳 enabled 的
      expect(result.current.skills.every((s) => s.is_enabled)).toBe(true);
    });

    it("filters to enabled skills only", async () => {
      const skills = [
        makeSkill({ id: "skill-1", is_enabled: true }),
        makeSkill({ id: "skill-2", is_enabled: false }),
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ skills }),
      });

      const { result } = renderHook(() => useSkills());

      await waitFor(() => {
        expect(result.current.skills).toHaveLength(1);
      });
      expect(result.current.skills[0].id).toBe("skill-1");
    });

    it("handles fetch error gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useSkills());

      await waitFor(() => {
        expect(result.current.isLoadingSkills).toBe(false);
      });
      expect(result.current.skills).toEqual([]);
    });

    it("handles network error gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useSkills());

      await waitFor(() => {
        expect(result.current.isLoadingSkills).toBe(false);
      });
      expect(result.current.skills).toEqual([]);
    });
  });

  describe("executeSkill", () => {
    it("calls execute API with correct payload for context skill", async () => {
      const skill = makeSkill({
        skill_config: makeSkillConfig({ input: { type: "context" } }),
      });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ skills: [skill] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            message: "Generated report",
            attachment: null,
          }),
        });

      const { result } = renderHook(() => useSkills());
      await waitFor(() => expect(result.current.skills).toHaveLength(1));

      let execResult: { message: string; attachment: unknown } | null = null;
      await act(async () => {
        execResult = await result.current.executeSkill(skill, {
          conversationId: "conv-1",
          messageHistory: ["user: hello", "assistant: hi"],
        });
      });

      expect(execResult).not.toBeNull();
      expect(execResult!.message).toBe("Generated report");
      expect(mockFetch).toHaveBeenLastCalledWith(
        "/api/skills/execute",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    it("calls execute API with userInput for user-type skill", async () => {
      const skill = makeSkill({
        skill_config: makeSkillConfig({
          input: { type: "user", userInputLabel: "Topic" },
        }),
      });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ skills: [skill] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            message: "Created document",
            attachment: {
              id: "att-1",
              fileName: "doc.md",
              fileType: "md",
              mimeType: "text/markdown",
              fileSize: 1024,
              downloadUrl: "/api/skills/attachments/att-1",
              previewContent: "# Hello",
            },
          }),
        });

      const { result } = renderHook(() => useSkills());
      await waitFor(() => expect(result.current.skills).toHaveLength(1));

      let execResult: { message: string; attachment: unknown } | null = null;
      await act(async () => {
        execResult = await result.current.executeSkill(skill, {
          userInput: "Write about AI",
        });
      });

      expect(execResult).not.toBeNull();
      expect(execResult!.attachment).toBeTruthy();

      // 確認 body 中包含 userInput
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1].body);
      expect(body.userInput).toBe("Write about AI");
      expect(body.skillId).toBe(skill.id);
    });

    it("sets executingSkillId during execution", async () => {
      const skill = makeSkill();
      // fetchSkills 回傳
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ skills: [skill] }),
      });

      // execute — 使用延遲 Promise
      let resolveExec: (v: unknown) => void = () => {};
      const execPromise = new Promise((resolve) => {
        resolveExec = resolve;
      });
      mockFetch.mockImplementationOnce(() => execPromise);

      const { result } = renderHook(() => useSkills());
      await waitFor(() => expect(result.current.skills).toHaveLength(1));

      expect(result.current.executingSkillId).toBeNull();

      // 開始執行
      let execDone = false;
      act(() => {
        result.current
          .executeSkill(skill, {
            conversationId: "conv-1",
            messageHistory: ["test"],
          })
          .then(() => {
            execDone = true;
          });
      });

      expect(result.current.executingSkillId).toBe("skill-1");

      // 完成執行
      await act(async () => {
        resolveExec({
          ok: true,
          json: async () => ({ message: "done", attachment: null }),
        });
      });

      await waitFor(() => expect(execDone).toBe(true));
      expect(result.current.executingSkillId).toBeNull();
    });

    it("handles execute API error and exposes skillError", async () => {
      const skill = makeSkill();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ skills: [skill] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: "Execution failed" }),
        });

      const { result } = renderHook(() => useSkills());
      await waitFor(() => expect(result.current.skills).toHaveLength(1));

      let execResult: unknown = null;
      await act(async () => {
        execResult = await result.current.executeSkill(skill, {
          conversationId: "conv-1",
          messageHistory: ["test"],
        });
      });

      expect(execResult).toBeNull();
      expect(result.current.executingSkillId).toBeNull();
      // BUG-2 fix: skillError should contain the error message
      expect(result.current.skillError).toBe("Execution failed");
    });

    it("handles network error and exposes skillError", async () => {
      const skill = makeSkill();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ skills: [skill] }),
        })
        .mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useSkills());
      await waitFor(() => expect(result.current.skills).toHaveLength(1));

      await act(async () => {
        await result.current.executeSkill(skill, {
          messageHistory: ["test"],
        });
      });

      expect(result.current.skillError).toBe("Network error");
    });

    it("clears skillError via clearSkillError", async () => {
      const skill = makeSkill();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ skills: [skill] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: "Some error" }),
        });

      const { result } = renderHook(() => useSkills());
      await waitFor(() => expect(result.current.skills).toHaveLength(1));

      await act(async () => {
        await result.current.executeSkill(skill, { conversationId: "conv-1" });
      });

      expect(result.current.skillError).toBe("Some error");

      act(() => {
        result.current.clearSkillError();
      });

      expect(result.current.skillError).toBeNull();
    });
  });

  describe("skillAttachments", () => {
    it("stores attachment keyed by messageId", async () => {
      const skill = makeSkill();
      const attachment = {
        id: "att-1",
        fileName: "report.md",
        fileType: "md",
        mimeType: "text/markdown",
        fileSize: 2048,
        downloadUrl: "/api/skills/attachments/att-1",
        previewContent: "# Report",
      };
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ skills: [skill] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ message: "Done", attachment }),
        });

      const { result } = renderHook(() => useSkills());
      await waitFor(() => expect(result.current.skills).toHaveLength(1));

      await act(async () => {
        await result.current.executeSkill(skill, {
          conversationId: "conv-1",
          messageHistory: ["test"],
          messageId: "msg-123",
        });
      });

      expect(result.current.getAttachment("msg-123")).toEqual(attachment);
    });

    it("returns undefined for unknown messageId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ skills: [] }),
      });

      const { result } = renderHook(() => useSkills());
      await waitFor(() => expect(result.current.isLoadingSkills).toBe(false));

      expect(result.current.getAttachment("nonexistent")).toBeUndefined();
    });
  });
});
