import {
  google,
  createGoogleGenerativeAI,
  type GoogleLanguageModelOptions,
} from "@ai-sdk/google";
import type { AIModel } from "@/types";

/**
 * 取得 AI Provider (使用 API Key)
 *
 * @param model - AI 模型類型
 * @returns Vercel AI SDK 格式的 Language Model
 * @throws Error 如果 API Key 未設定
 */
export function getProvider(model: AIModel) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY 環境變數未設定");
  }

  const googleProvider = createGoogleGenerativeAI({
    apiKey,
  });

  const modelMap: Record<AIModel, string> = {
    "gemini-flash": "gemini-3-flash-preview",
    "gemini-pro": "gemini-3.1-pro-preview",
    "gemini-flash-lite": "gemini-3.1-flash-lite-preview",
  };

  return googleProvider(modelMap[model]);
}

/**
 * Gemini 3 系列都是 thinking model，需要 thinkingConfig 才能正常回傳 text
 * 不加這個設定，generateText 會回傳空字串
 */
export const THINKING_PROVIDER_OPTIONS = {
  google: {
    thinkingConfig: {
      includeThoughts: true,
    },
  } satisfies GoogleLanguageModelOptions,
};

/**
 * 模型名稱映射（供原生 API 呼叫使用）
 */
export const MODEL_MAP: Record<string, string> = {
  "gemini-flash": "gemini-3-flash-preview",
  "gemini-pro": "gemini-3.1-pro-preview",
  "gemini-flash-lite": "gemini-3.1-flash-lite-preview",
};

/**
 * 直接呼叫 Gemini REST API（繞過 Vercel AI SDK）
 *
 * 用於 Docker 容器環境中 SDK generateText 持續回傳空回應的問題。
 * 直接 HTTP 呼叫在同一容器內正常運作。
 */
export async function generateTextNative(params: {
  model: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  maxOutputTokens?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY 環境變數未設定");
  }

  const modelId = MODEL_MAP[params.model] ?? params.model;

  // 轉換 messages 為 Gemini API 格式
  // Gemini 要求：(1) user/model 必須交替 (2) 第一則必須是 user
  const rawContents = params.messages
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      text: m.content,
    }));

  // 合併連續同角色訊息（Gemini 不允許連續 user 或連續 model）
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const msg of rawContents) {
    const last = contents[contents.length - 1];
    if (last && last.role === msg.role) {
      // 合併到上一則
      last.parts[0].text += "\n" + msg.text;
    } else {
      contents.push({ role: msg.role, parts: [{ text: msg.text }] });
    }
  }

  // 確保第一則是 user（Gemini 強制要求）
  if (contents.length > 0 && contents[0].role !== "user") {
    contents.shift();
  }

  const body = JSON.stringify({
    systemInstruction: {
      parts: [{ text: params.systemPrompt }],
    },
    contents,
    generationConfig: {
      maxOutputTokens: params.maxOutputTokens ?? 4096,
      thinkingConfig: {
        includeThoughts: true,
      },
    },
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini API error ${response.status}: ${errorText.slice(0, 200)}`,
    );
  }

  const json = await response.json();

  // 從 candidates 中提取文字（跳過 thought parts）
  const candidate = json.candidates?.[0];
  const textParts =
    candidate?.content?.parts?.filter(
      (p: { text?: string; thought?: boolean }) => p.text && !p.thought,
    ) ?? [];
  const text = textParts.map((p: { text: string }) => p.text).join("");

  // 診斷：空回應時記錄原始 API 回應
  if (!text) {
    console.warn("[generateTextNative] Empty text extracted. Raw response:", {
      finishReason: candidate?.finishReason,
      partsCount: candidate?.content?.parts?.length ?? 0,
      parts: candidate?.content?.parts?.map((p: { text?: string; thought?: boolean }) => ({
        hasText: !!p.text,
        textLen: p.text?.length ?? 0,
        isThought: !!p.thought,
      })),
      messagesCount: contents.length,
      firstRole: contents[0]?.role,
      lastRole: contents[contents.length - 1]?.role,
    });
  }

  return {
    text,
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

export function getEmbeddingModel() {
  return google.textEmbeddingModel("gemini-embedding-2-preview");
}

// Google embedding 維度設定（需在 embed() 呼叫時透過 providerOptions 傳遞）
// gemini-embedding-2-preview 預設 3072 維，使用完整維度以獲得最佳搜尋精度
export const EMBEDDING_DIMENSION = 3072;

export const EMBEDDING_PROVIDER_OPTIONS = {
  google: { outputDimensionality: EMBEDDING_DIMENSION },
} as const;
