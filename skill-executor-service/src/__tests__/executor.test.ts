/**
 * Skill Executor - Docker Container Management Tests
 * TDD: Mock Dockerode, test container lifecycle
 */

import { DockerExecutor } from "../executor";
import type { ExecuteRequest } from "../types";

// ========== Mock Dockerode ==========

const mockWait = jest.fn();
const mockRemove = jest.fn();
const mockStart = jest.fn();
const mockLogs = jest.fn();
const mockGetArchive = jest.fn();
const mockPutArchive = jest.fn();

const mockKill = jest.fn();

const mockContainer = {
  id: "container-abc123",
  start: mockStart,
  wait: mockWait,
  remove: mockRemove,
  logs: mockLogs,
  getArchive: mockGetArchive,
  putArchive: mockPutArchive,
  kill: mockKill,
};

const mockCreateContainer = jest.fn();
const mockPing = jest.fn();

jest.mock("dockerode", () => {
  return jest.fn().mockImplementation(() => ({
    createContainer: mockCreateContainer,
    ping: mockPing,
  }));
});

// ========== Fixtures ==========

const defaultRequest: ExecuteRequest = {
  scriptsPath: "/data/skills/user-001/test-skill/scripts",
  llmOutput: "# Generated Document\nContent here",
  baseImage: "node:20-slim",
  timeout: 60,
  maxMemory: "512m",
  entrypoint: "entrypoint.sh",
};

// ========== Tests ==========

describe("DockerExecutor", () => {
  let executor: DockerExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    executor = new DockerExecutor();

    // Default mocks: successful execution
    mockCreateContainer.mockResolvedValue(mockContainer);
    mockStart.mockResolvedValue(undefined);
    mockWait.mockResolvedValue({ StatusCode: 0 });
    mockRemove.mockResolvedValue(undefined);
    mockKill.mockResolvedValue(undefined);
    mockPing.mockResolvedValue("OK");

    // Mock logs as a buffer
    mockLogs.mockResolvedValue(Buffer.from("Execution completed successfully"));
  });

  describe("healthCheck", () => {
    it("should return ok when Docker is available", async () => {
      const result = await executor.healthCheck();

      expect(result.status).toBe("ok");
      expect(result.dockerAvailable).toBe(true);
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it("should return error when Docker ping fails", async () => {
      mockPing.mockRejectedValue(new Error("Cannot connect to Docker"));

      const result = await executor.healthCheck();

      expect(result.status).toBe("error");
      expect(result.dockerAvailable).toBe(false);
    });
  });

  describe("execute", () => {
    it("should create container with correct configuration", async () => {
      // Mock getArchive to return empty tar
      mockGetArchive.mockRejectedValue(new Error("no such file"));
      mockPutArchive.mockResolvedValue(undefined);

      await executor.execute(defaultRequest);

      expect(mockCreateContainer).toHaveBeenCalledTimes(1);
      const createArgs = mockCreateContainer.mock.calls[0][0];

      // Verify image
      expect(createArgs.Image).toBe("node:20-slim");

      // Verify command
      expect(createArgs.Cmd).toEqual(["/bin/sh", "/scripts/entrypoint.sh"]);

      // Verify host config
      expect(createArgs.HostConfig.Binds).toContain(
        "/data/skills/user-001/test-skill/scripts:/scripts:ro",
      );
      expect(createArgs.HostConfig.NetworkMode).toBe("none");
      expect(createArgs.HostConfig.ReadonlyRootfs).toBe(false);

      // Verify memory limit (512m = 512 * 1024 * 1024)
      expect(createArgs.HostConfig.Memory).toBe(512 * 1024 * 1024);

      // Verify capabilities dropped
      expect(createArgs.HostConfig.CapDrop).toEqual(["ALL"]);
    });

    it("should start container and wait for completion", async () => {
      mockGetArchive.mockRejectedValue(new Error("no such file"));
      mockPutArchive.mockResolvedValue(undefined);

      await executor.execute(defaultRequest);

      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(mockWait).toHaveBeenCalledTimes(1);
    });

    it("should pass LLM output as /input/llm_output.txt via putArchive", async () => {
      mockGetArchive.mockRejectedValue(new Error("no such file"));
      mockPutArchive.mockResolvedValue(undefined);

      await executor.execute(defaultRequest);

      // putArchive should be called to write llm_output.txt
      expect(mockPutArchive).toHaveBeenCalledTimes(1);
      const putArgs = mockPutArchive.mock.calls[0];
      expect(putArgs[1]).toEqual({ path: "/input" });
    });

    it("should collect output files from /output directory", async () => {
      // Mock getArchive for /output - return a stream-like object
      // Use Readable-compatible mock that has pipe method
      const { Readable } = require("stream");
      const readableStream = new Readable({
        read() {
          this.push(null); // Empty stream, no tar entries
        },
      });
      readableStream.pipe = jest
        .fn()
        .mockImplementation((dest: NodeJS.WritableStream) => {
          // Simulate empty tar archive by ending immediately
          process.nextTick(() => dest.emit("finish"));
          return dest;
        });
      mockGetArchive.mockResolvedValue(readableStream);
      mockPutArchive.mockResolvedValue(undefined);

      const result = await executor.execute(defaultRequest);

      expect(result.success).toBe(true);
      expect(result.logs).toBeDefined();
    });

    it("should always remove container after execution (cleanup)", async () => {
      mockGetArchive.mockRejectedValue(new Error("no such file"));
      mockPutArchive.mockResolvedValue(undefined);

      await executor.execute(defaultRequest);

      expect(mockRemove).toHaveBeenCalledWith({ force: true, v: true });
    });

    it("should cleanup container even when execution fails", async () => {
      mockStart.mockRejectedValue(new Error("Cannot start container"));
      mockPutArchive.mockResolvedValue(undefined);

      await expect(executor.execute(defaultRequest)).rejects.toThrow(
        "Cannot start container",
      );

      expect(mockRemove).toHaveBeenCalledWith({ force: true, v: true });
    });

    it("should handle non-zero exit code", async () => {
      mockWait.mockResolvedValue({ StatusCode: 1 });
      mockGetArchive.mockRejectedValue(new Error("no such file"));
      mockPutArchive.mockResolvedValue(undefined);

      const result = await executor.execute(defaultRequest);

      expect(result.success).toBe(false);
      expect(result.logs).toBeDefined();
    });

    it("should enforce timeout by killing container", async () => {
      // Simulate a long-running container
      mockWait.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ StatusCode: 0 }), 10000);
          }),
      );
      mockPutArchive.mockResolvedValue(undefined);

      const shortTimeoutRequest = { ...defaultRequest, timeout: 1 };

      const result = await executor.execute(shortTimeoutRequest);

      expect(result.success).toBe(false);
      expect(result.logs).toContain("timeout");
    }, 10000);

    it("should parse maxMemory string to bytes", () => {
      expect(executor.parseMemoryString("256m")).toBe(256 * 1024 * 1024);
      expect(executor.parseMemoryString("1g")).toBe(1024 * 1024 * 1024);
      expect(executor.parseMemoryString("512M")).toBe(512 * 1024 * 1024);
      expect(executor.parseMemoryString("2G")).toBe(2 * 1024 * 1024 * 1024);
    });

    it("should reject invalid memory strings", () => {
      expect(() => executor.parseMemoryString("invalid")).toThrow();
      expect(() => executor.parseMemoryString("")).toThrow();
    });
  });
});
