/**
 * Skill Executor Service - HTTP Server
 * Express HTTP API for managing Docker skill execution
 */

import express from "express";
import { DockerExecutor } from "./executor";
import { z } from "zod";
import type { ExecuteRequest } from "./types";

const PORT = parseInt(process.env.PORT ?? "8003", 10);

const app: ReturnType<typeof express> = express();
app.use(express.json({ limit: "10mb" }));

const executor = new DockerExecutor();

// ========== Request Validation ==========

const executeRequestSchema = z.object({
  scriptsPath: z.string().min(1),
  llmOutput: z.string().min(1),
  baseImage: z.string().min(1),
  timeout: z.number().int().min(1).max(300).default(60),
  maxMemory: z.string().default("512m"),
  entrypoint: z.string().default("entrypoint.sh"),
  entrypointScript: z.string().optional(),
});

// ========== Routes ==========

/** GET /health - 健康檢查 */
app.get("/health", async (_req, res) => {
  try {
    const health = await executor.healthCheck();
    const statusCode = health.status === "ok" ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(503).json({ status: "error", error: message });
  }
});

/** POST /execute - 執行技能容器 */
app.post("/execute", async (req, res) => {
  // 驗證請求
  const parsed = executeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: `Invalid request: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
    });
    return;
  }

  const request: ExecuteRequest = parsed.data;

  // 安全性：驗證 scriptsPath 不含路徑穿越
  if (
    request.scriptsPath.includes("..") ||
    !request.scriptsPath.startsWith("/")
  ) {
    res.status(400).json({
      error: 'Invalid scriptsPath: must be an absolute path without ".."',
    });
    return;
  }

  // 安全性：限制允許的 base image
  const allowedImagePrefixes = [
    "node:",
    "python:",
    "alpine:",
    "ubuntu:",
    "nexusmind-skill-runtime:",
  ];
  const isAllowedImage = allowedImagePrefixes.some((prefix) =>
    request.baseImage.startsWith(prefix),
  );
  if (!isAllowedImage) {
    res.status(400).json({
      error: `Invalid baseImage: "${request.baseImage}". Allowed prefixes: ${allowedImagePrefixes.join(", ")}`,
    });
    return;
  }

  try {
    const result = await executor.execute(request);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Execution failed";
    res.status(500).json({ error: message });
  }
});

// ========== Start Server ==========

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    process.stdout.write(`Skill Executor Service running on port ${PORT}\n`);
  });
}

export { app };
