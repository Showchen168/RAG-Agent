/**
 * Skill Executor - Docker Container Lifecycle Management
 * 使用 Dockerode 管理臨時容器的建立、執行、取回輸出、清理
 */

import Docker from "dockerode";
import * as tar from "tar-stream";
import type {
  ExecuteRequest,
  ExecuteResult,
  HealthStatus,
  OutputFile,
} from "./types";

const startTime = Date.now();

export class DockerExecutor {
  private readonly docker: Docker;

  constructor(socketPath = "/var/run/docker.sock") {
    this.docker = new Docker({ socketPath });
  }

  /**
   * 健康檢查：確認 Docker daemon 可用
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      await this.docker.ping();
      return {
        status: "ok",
        dockerAvailable: true,
        uptime: Math.floor((Date.now() - startTime) / 1000),
      };
    } catch {
      return {
        status: "error",
        dockerAvailable: false,
        uptime: Math.floor((Date.now() - startTime) / 1000),
      };
    }
  }

  /**
   * 執行技能容器
   * @param request - 執行請求參數
   * @returns 執行結果（檔案列表 + 日誌）
   */
  async execute(request: ExecuteRequest): Promise<ExecuteResult> {
    const memoryBytes = this.parseMemoryString(request.maxMemory);
    const containerName = `skill-exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 決定 entrypoint 路徑：有動態腳本用 /input/，否則用 /scripts/
    const entrypointPath = request.entrypointScript
      ? "/input/entrypoint.sh"
      : `/scripts/${request.entrypoint}`;

    const container = await this.docker.createContainer({
      Image: request.baseImage,
      name: containerName,
      Cmd: ["/bin/sh", entrypointPath],
      WorkingDir: "/output",
      HostConfig: {
        Binds: [`${request.scriptsPath}:/scripts:ro`],
        Memory: memoryBytes,
        MemorySwap: memoryBytes, // 禁止 swap
        NetworkMode: "none",
        ReadonlyRootfs: false, // /output 需要可寫
        CapDrop: ["ALL"],
        // 不使用 Tmpfs：putArchive 在 start() 前寫入 /input，
        // getArchive 在 stop() 後讀取 /output，
        // tmpfs 在這兩種情況下都會導致資料遺失。
        // 安全仍由 NetworkMode:none + CapDrop:ALL 保護。
      },
    });

    try {
      // 寫入 LLM 輸出到 /input/llm_output.txt（via tar archive）
      await this.writeLlmOutput(container, request.llmOutput);

      // 寫入動態 entrypoint 腳本（如有提供）
      if (request.entrypointScript) {
        await this.writeInputFile(
          container,
          "entrypoint.sh",
          request.entrypointScript,
        );
      }

      // 啟動容器
      await container.start();

      // 等待完成（含超時處理）
      const { exitCode, timedOut } = await this.waitWithTimeout(
        container,
        request.timeout,
      );

      // 取得日誌
      const logs = await this.getContainerLogs(container);
      const logText = timedOut
        ? `Container execution timeout after ${request.timeout}s\n${logs}`
        : logs;

      // 如果執行失敗
      if (exitCode !== 0 || timedOut) {
        return {
          success: false,
          files: [],
          logs: logText,
        };
      }

      // 嘗試取回 /output 的檔案
      const files = await this.collectOutputFiles(container);

      return {
        success: true,
        files,
        logs: logText,
      };
    } finally {
      // 始終清理容器
      await container.remove({ force: true, v: true }).catch(() => {
        // 忽略清理失敗（容器可能已不存在）
      });
    }
  }

  /**
   * 將 LLM 輸出寫入容器的 /input/llm_output.txt
   */
  private async writeLlmOutput(
    container: Docker.Container,
    content: string,
  ): Promise<void> {
    const pack = tar.pack();
    pack.entry({ name: "llm_output.txt" }, content);
    pack.finalize();

    // 將 tar stream 轉為 Buffer
    const chunks: Buffer[] = [];
    for await (const chunk of pack) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const tarBuffer = Buffer.concat(chunks);

    await container.putArchive(tarBuffer, { path: "/input" });
  }

  /**
   * 將任意檔案寫入容器的 /input/ 目錄
   */
  private async writeInputFile(
    container: Docker.Container,
    fileName: string,
    content: string,
  ): Promise<void> {
    const pack = tar.pack();
    pack.entry({ name: fileName }, content);
    pack.finalize();

    const chunks: Buffer[] = [];
    for await (const chunk of pack) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const tarBuffer = Buffer.concat(chunks);

    await container.putArchive(tarBuffer, { path: "/input" });
  }

  /**
   * 等待容器完成，含超時處理
   */
  private async waitWithTimeout(
    container: Docker.Container,
    timeoutSeconds: number,
  ): Promise<{ exitCode: number; timedOut: boolean }> {
    return new Promise((resolve) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // 強制殺死容器
          container.kill().catch(() => {});
          resolve({ exitCode: -1, timedOut: true });
        }
      }, timeoutSeconds * 1000);

      container
        .wait()
        .then((data: { StatusCode: number }) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve({ exitCode: data.StatusCode, timedOut: false });
          }
        })
        .catch(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve({ exitCode: -1, timedOut: false });
          }
        });
    });
  }

  /**
   * 取得容器日誌
   */
  private async getContainerLogs(container: Docker.Container): Promise<string> {
    try {
      const logBuffer = await container.logs({
        stdout: true,
        stderr: true,
        follow: false,
        tail: 200,
      });

      // Dockerode 回傳的可能是 Buffer 或 stream
      if (Buffer.isBuffer(logBuffer)) {
        return this.stripDockerLogHeaders(logBuffer);
      }

      return String(logBuffer);
    } catch {
      return "(unable to retrieve logs)";
    }
  }

  /**
   * 移除 Docker log stream 的 8-byte header
   * Docker multiplexed stream 每個 frame 前有 8 bytes header
   */
  private stripDockerLogHeaders(buf: Buffer): string {
    const lines: string[] = [];
    let offset = 0;

    while (offset < buf.length) {
      if (offset + 8 > buf.length) {
        // 剩餘不足 8 bytes，當作一般文字
        lines.push(buf.subarray(offset).toString("utf8"));
        break;
      }

      const size = buf.readUInt32BE(offset + 4);

      if (offset + 8 + size > buf.length) {
        // 剩餘不足，當作一般文字
        lines.push(buf.subarray(offset + 8).toString("utf8"));
        break;
      }

      lines.push(buf.subarray(offset + 8, offset + 8 + size).toString("utf8"));
      offset += 8 + size;
    }

    return lines.join("");
  }

  /**
   * 從容器 /output 目錄收集輸出檔案
   */
  private async collectOutputFiles(
    container: Docker.Container,
  ): Promise<OutputFile[]> {
    try {
      const stream = await container.getArchive({ path: "/output" });

      return new Promise((resolve) => {
        const files: OutputFile[] = [];
        const extract = tar.extract();

        extract.on("entry", (header, entryStream, next) => {
          const chunks: Buffer[] = [];

          entryStream.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
          });

          entryStream.on("end", () => {
            // 跳過目錄 entry 和隱藏檔案
            if (
              header.type === "file" &&
              header.name &&
              !header.name.startsWith(".")
            ) {
              const fileName = header.name.replace(/^output\//, "");
              if (fileName) {
                const content = Buffer.concat(chunks);
                files.push({
                  name: fileName,
                  path: `/output/${fileName}`,
                  size: header.size ?? content.length,
                  contentBase64: content.toString("base64"),
                });
              }
            }
            next();
          });

          entryStream.resume();
        });

        extract.on("finish", () => {
          resolve(files);
        });

        extract.on("error", () => {
          resolve([]);
        });

        stream.pipe(extract);
      });
    } catch {
      return [];
    }
  }

  /**
   * 解析記憶體字串（如 "512m"、"1g"）為 bytes
   */
  parseMemoryString(memory: string): number {
    const match = memory.trim().match(/^(\d+)\s*([mMgG])$/i);
    if (!match) {
      throw new Error(
        `Invalid memory format: "${memory}". Expected format: "512m" or "1g"`,
      );
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (unit === "m") {
      return value * 1024 * 1024;
    }
    if (unit === "g") {
      return value * 1024 * 1024 * 1024;
    }

    throw new Error(`Unknown memory unit: ${unit}`);
  }
}
