/**
 * Skills API handlers - Unit tests
 * 測試 skills API 的核心邏輯函式（不含 Next.js route handler 包裝）
 */

import JSZip from "jszip";
import {
  handleGetSkills,
  handleUploadSkill,
  handlePatchSkill,
  handleDeleteSkill,
} from "../api-handlers";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

/**
 * 建立一個通用的可鏈式 mock，每次呼叫方法都回傳自己（self），
 * 最終 resolve 指定的結果。
 */
function createChainMock(resolvedValue: unknown) {
  const chain: Record<string, jest.Mock> = {};
  const handler: ProxyHandler<Record<string, jest.Mock>> = {
    get(_target, prop: string) {
      if (prop === "then") {
        // Make it thenable: resolve with the specified value
        return (resolve: (v: unknown) => void) => resolve(resolvedValue);
      }
      if (!chain[prop]) {
        chain[prop] = jest.fn().mockReturnValue(new Proxy({}, handler));
      }
      return chain[prop];
    },
  };
  return new Proxy({}, handler);
}

function createMockSupabase(
  overrides: {
    user?: { id: string } | null;
    authError?: Error | null;
    queryResult?: { data: unknown; error: unknown };
  } = {},
) {
  const {
    user = { id: "user-123" },
    authError = null,
    queryResult = { data: [], error: null },
  } = overrides;

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user },
        error: authError,
      }),
    },
    from: jest.fn().mockReturnValue(createChainMock(queryResult)),
  };
}

describe("handleGetSkills", () => {
  it("should return 401 when user is not authenticated", async () => {
    const supabase = createMockSupabase({ user: null });
    const result = await handleGetSkills(supabase as never);

    expect(result.status).toBe(401);
    expect(result.body.error).toBeDefined();
  });

  it("should return skills list for authenticated user", async () => {
    const mockSkills = [
      {
        id: "skill-1",
        name: "test-skill",
        display_name: "Test",
        is_enabled: true,
      },
    ];
    const supabase = createMockSupabase({
      queryResult: { data: mockSkills, error: null },
    });

    const result = await handleGetSkills(supabase as never);

    expect(result.status).toBe(200);
    expect(result.body.skills).toBeDefined();
  });

  it("should return 500 on database error", async () => {
    const supabase = createMockSupabase({
      queryResult: { data: null, error: { message: "DB connection failed" } },
    });

    const result = await handleGetSkills(supabase as never);

    expect(result.status).toBe(500);
  });
});

describe("handleUploadSkill", () => {
  it("should return 401 when user is not authenticated", async () => {
    const supabase = createMockSupabase({ user: null });

    const result = await handleUploadSkill(
      supabase as never,
      Buffer.from(""),
      "/tmp",
    );

    expect(result.status).toBe(401);
  });

  it("should return 400 when ZIP buffer is empty", async () => {
    const supabase = createMockSupabase();

    const result = await handleUploadSkill(
      supabase as never,
      Buffer.from(""),
      "/tmp",
    );

    expect(result.status).toBe(400);
  });

  it("should return 400 when ZIP exceeds size limit", async () => {
    const supabase = createMockSupabase();
    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

    const result = await handleUploadSkill(
      supabase as never,
      oversizedBuffer,
      "/tmp",
    );

    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/too large/i);
  });

  it("should return 400 for invalid ZIP (not a zip)", async () => {
    const supabase = createMockSupabase();
    const notAZip = Buffer.from("this is not a zip file, just text");

    const result = await handleUploadSkill(supabase as never, notAZip, "/tmp");

    expect(result.status).toBe(400);
  });

  it("should successfully upload a valid ZIP and save to DB", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-test-"));

    try {
      const zip = new JSZip();
      zip.file(
        "skill.json",
        JSON.stringify({
          name: "test-upload",
          displayName: "Test Upload",
          description: "A test skill for upload",
          icon: "Zap",
          category: "utility",
          input: { type: "context" },
          output: {
            fileType: "md",
            mimeType: "text/markdown",
            previewFormat: "markdown",
          },
          runtime: {
            baseImage: "node:20-slim",
            timeout: 60,
            maxMemory: "512m",
          },
        }),
      );
      zip.file("SKILL.md", "# Test Upload Skill");
      zip.file("scripts/entrypoint.sh", "#!/bin/bash\necho hello");

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

      const supabase = createMockSupabase({
        queryResult: {
          data: { id: "new-skill-id", name: "test-upload" },
          error: null,
        },
      });

      const result = await handleUploadSkill(
        supabase as never,
        zipBuffer,
        tmpDir,
      );

      expect(result.status).toBe(200);
      expect(result.body.skill).toBeDefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("should return 400 for ZIP missing required files", async () => {
    const zip = new JSZip();
    zip.file("README.md", "Just a readme");
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    const supabase = createMockSupabase();
    const result = await handleUploadSkill(
      supabase as never,
      zipBuffer,
      "/tmp",
    );

    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/SKILL\.md/);
  });
});

describe("handlePatchSkill", () => {
  it("should return 401 when user is not authenticated", async () => {
    const supabase = createMockSupabase({ user: null });

    const result = await handlePatchSkill(supabase as never, {
      id: "skill-1",
      is_enabled: false,
    });

    expect(result.status).toBe(401);
  });

  it("should return 400 when id is missing", async () => {
    const supabase = createMockSupabase();

    const result = await handlePatchSkill(
      supabase as never,
      {
        is_enabled: false,
      } as never,
    );

    expect(result.status).toBe(400);
  });

  it("should update skill is_enabled", async () => {
    const supabase = createMockSupabase({
      queryResult: { data: { id: "skill-1", is_enabled: false }, error: null },
    });

    const result = await handlePatchSkill(supabase as never, {
      id: "skill-1",
      is_enabled: false,
    });

    expect(result.status).toBe(200);
  });

  it("should return 400 when is_enabled is missing", async () => {
    const supabase = createMockSupabase();

    const result = await handlePatchSkill(
      supabase as never,
      {
        id: "skill-1",
      } as never,
    );

    expect(result.status).toBe(400);
  });
});

describe("handleDeleteSkill", () => {
  it("should return 401 when user is not authenticated", async () => {
    const supabase = createMockSupabase({ user: null });

    const result = await handleDeleteSkill(supabase as never, "skill-1");

    expect(result.status).toBe(401);
  });

  it("should return 400 when id is missing", async () => {
    const supabase = createMockSupabase();

    const result = await handleDeleteSkill(supabase as never, "");

    expect(result.status).toBe(400);
  });

  it("should delete skill successfully when skill exists and is not system", async () => {
    const supabase = createMockSupabase({
      queryResult: {
        data: { id: "skill-1", is_system: false, storage_path: "" },
        error: null,
      },
    });

    const result = await handleDeleteSkill(supabase as never, "skill-1");

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
  });

  it("should return 404 when skill is not found", async () => {
    const supabase = createMockSupabase({
      queryResult: { data: null, error: { message: "not found" } },
    });

    const result = await handleDeleteSkill(supabase as never, "nonexistent");

    expect(result.status).toBe(404);
  });
});
