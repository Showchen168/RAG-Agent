/**
 * Skill Executor Service - Type Definitions
 */

/** 執行請求的輸入 */
export interface ExecuteRequest {
  readonly scriptsPath: string;
  readonly llmOutput: string;
  readonly baseImage: string;
  readonly timeout: number;
  readonly maxMemory: string;
  readonly entrypoint: string;
  /** 動態 entrypoint 腳本內容（可選）。提供時會寫入 /input/entrypoint.sh 並使用它，忽略 scripts 目錄中的 entrypoint */
  readonly entrypointScript?: string;
}

/** 輸出檔案資訊 */
export interface OutputFile {
  readonly name: string;
  readonly path: string;
  readonly size: number;
  /** 檔案內容（base64 編碼） */
  readonly contentBase64: string;
}

/** 執行結果 */
export interface ExecuteResult {
  readonly success: boolean;
  readonly files: ReadonlyArray<OutputFile>;
  readonly logs: string;
}

/** 健康檢查結果 */
export interface HealthStatus {
  readonly status: "ok" | "error";
  readonly dockerAvailable: boolean;
  readonly uptime: number;
}
