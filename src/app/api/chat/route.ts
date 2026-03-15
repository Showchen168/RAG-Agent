import {
  streamText,
  smoothStream,
  generateText,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ModelMessage,
} from "ai";

// Gemini Pro（thinking model）的推理時間可能超過 90 秒，設為 300 秒避免 Next.js 提前切斷請求
export const maxDuration = 300;
import { google } from "@ai-sdk/google";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getProvider, THINKING_PROVIDER_OPTIONS } from "@/lib/ai/providers";
import {
  extractFreshnessAnchors,
  docMatchesFreshnessAnchors,
} from "@/lib/chat/citation-guards";
import {
  inferResponseStyleMode,
  buildResponseStylePrompt,
} from "@/lib/chat/response-style";
import { buildMarkdownFormatPrompt } from "@/lib/chat/structured-output";
import { executeAdaptiveRAG } from "@/lib/rag/adaptive-rag";
import {
  retrieveMemories,
  extractMemories,
  deduplicateMemories,
  createMemory,
  getUserMemories,
} from "@/lib/memory";
import {
  truncateContext,
  MAX_CONTEXT_CHARS_WEB,
} from "@/lib/rag/context-truncation";
import {
  buildSkillsIndexText,
  toSkillIndexEntry,
} from "@/lib/skills/skill-index";
import { buildSkillSystemMessage } from "@/lib/skills/lazy-loader";
import type { AIModel } from "@/types";

interface RAGMetadataForStream {
  originalQuery: string;
  finalQuery: string;
  rewrites: number;
  relevanceScore: number;
  relevanceVerdict: string;
  retrievalMethod: string;
  documents: Array<{
    title: string;
    similarity: number;
    sourceType: string;
  }>;
  hasGraphContext: boolean;
}

interface KnowledgeQualityItem {
  title: string;
  sourceType: "內部" | "外部" | "未知";
  confidence: "高" | "中" | "低";
  freshness: "最新" | "近期" | "偏舊";
  updatedAt: string;
}

export function inferSourceType(
  tags: string[] | null | undefined,
): "內部" | "外部" | "未知" {
  if (!tags || tags.length === 0) return "內部";
  const normalized = tags.map((t) => t.toUpperCase());
  if (
    normalized.some(
      (t) =>
        t.includes("WEB") ||
        t.includes("NEWS") ||
        t.includes("EXTERNAL") ||
        t.includes("RSS") ||
        t.includes("MONITOR"),
    )
  ) {
    return "外部";
  }
  return "內部";
}

export function getConfidenceLabel(
  similarity: number,
  sourceType: "內部" | "外部" | "未知",
): "高" | "中" | "低" {
  const sourceBoost =
    sourceType === "內部" ? 0.04 : sourceType === "外部" ? -0.02 : 0;
  const adjusted = similarity + sourceBoost;
  if (adjusted >= 0.82) return "高";
  if (adjusted >= 0.7) return "中";
  return "低";
}

export function getFreshnessLabel(
  updatedAt: string | null,
): "最新" | "近期" | "偏舊" {
  if (!updatedAt) return "偏舊";
  const updatedMs = new Date(updatedAt).getTime();
  const nowMs = Date.now();
  if (!Number.isFinite(updatedMs)) return "偏舊";
  const days = Math.floor((nowMs - updatedMs) / (1000 * 60 * 60 * 24));
  if (days <= 30) return "最新";
  if (days <= 180) return "近期";
  return "偏舊";
}

export function toZhDate(iso: string | null): string {
  if (!iso) return "未知";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "未知";
  return d.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Taipei",
  });
}

export function buildKnowledgeQualitySignals(params: {
  items: KnowledgeQualityItem[];
  possibleConflict: boolean;
}): string {
  const { items, possibleConflict } = params;
  const lines = items.map(
    (item, idx) =>
      `${idx + 1}. ${item.title}｜來源:${item.sourceType}｜可信度:${item.confidence}｜新鮮度:${item.freshness}｜更新:${item.updatedAt}`,
  );
  return [
    "[KNOWLEDGE QUALITY SIGNALS — Internal Reference Only]",
    "以下是知識品質評估結果，僅供你內部參考，用於判斷回答時的引用優先順序。",
    "不要在回覆中輸出此區塊內容。",
    "可信度定義：高=語意高度吻合；中=相關但非核心；低=可能僅部分相關。",
    "新鮮度定義：最新<=30天、近期<=180天、偏舊>180天。",
    `疑似衝突訊號：${possibleConflict ? "是（可能存在版本或數值差異，需明確標註）" : "否（未偵測到明顯衝突）"}`,
    ...lines,
  ].join("\n");
}

export function toTextContent(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text")
      .map((part) => (part as { text: string }).text)
      .join("\n");
  }
  return "";
}

async function persistAssistantMessage(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  conversationId?: string;
  messages: ModelMessage[];
  text: string;
  ragMetadata?: RAGMetadataForStream | null;
  isFinal?: boolean;
}) {
  const { supabase, conversationId, messages, text, ragMetadata, isFinal } =
    params;
  if (!conversationId) return;

  // Markdown 純文字內容，不再嵌入 Crayon JSON 格式
  const normalizedText = normalizeAssistantContent(text);
  const contentToSave = normalizedText;

  // 先查最新一筆訊息，避免 client 保底 POST 已搶先 INSERT 後，
  // server onFinish 又 INSERT 造成重複 assistant message，導致 suggestions 被覆蓋。
  // 規則：
  //   - 最新訊息為 user（或無訊息）→ 正常 INSERT（含 RAG metadata）
  //   - 最新訊息為 assistant 且已有完整內容 → 跳過（client 保底已持久化，避免覆蓋已注入的 suggestions）
  //   - 最新訊息為 assistant 但內容為空 → UPDATE（補齊）
  const { data: latestMsg } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 將 RAG metadata 序列化為 JSONB（只在有資料時存入）
  const metadataToSave = ragMetadata
    ? { rag_transparency: ragMetadata }
    : undefined;

  if (
    latestMsg?.role === "assistant" &&
    String(latestMsg.content ?? "").trim()
  ) {
    // 已有完整 assistant message — isFinal 時以 server 最終結果覆寫
    if (isFinal) {
      const { error: updateErr } = await supabase
        .from("messages")
        .update({
          content: contentToSave,
          ...(metadataToSave ? { metadata: metadataToSave } : {}),
        })
        .eq("id", latestMsg.id)
        .eq("conversation_id", conversationId);
      if (updateErr) console.warn(`[persist] UPDATE(isFinal) failed: ${updateErr.message}`);
    } else {
      // assistant already has content, not isFinal — skip
    }
  } else if (
    latestMsg?.role === "assistant" &&
    !String(latestMsg.content ?? "").trim()
  ) {
    // assistant 存在但內容為空 → UPDATE 補齊
    const { error: updateErr } = await supabase
      .from("messages")
      .update({
        content: contentToSave,
        ...(metadataToSave ? { metadata: metadataToSave } : {}),
      })
      .eq("id", latestMsg.id)
      .eq("conversation_id", conversationId);
    if (updateErr) console.warn(`[persist] UPDATE(empty) failed: ${updateErr.message}`);
  } else {
    // 最新訊息為 user（或無訊息）→ INSERT
    const primary = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: contentToSave,
      ...(metadataToSave ? { metadata: metadataToSave } : {}),
    });
    if (primary.error) {
      console.warn(`[persist] INSERT failed: ${primary.error.message}, falling back without metadata`);
      // 保底：若帶有結構化 metadata 的內容寫入失敗，退回純文字再試一次，避免整段回覆遺失
      const fallbackContent = normalizeAssistantContent(
        normalizedText.trim() || contentToSave,
      );
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: fallbackContent,
      });
    }
  }

  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  const isFirstExchange = (count ?? 0) <= 2;

  if (isFirstExchange) {
    try {
      const userText =
        typeof messages[messages.length - 1]?.content === "string"
          ? (messages[messages.length - 1].content as string)
          : "";

      const { text: generatedTitle } = await generateText({
        model: google("gemini-3-flash-preview"),
        prompt: `根據以下對話內容，生成一個簡短的對話標題（10字以內，不要引號）：\n\n使用者：${userText}\n助手：${normalizedText.slice(0, 200)}`,
        providerOptions: THINKING_PROVIDER_OPTIONS,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "chat-generate-title",
          metadata: { feature: "chat-title", conversationId },
        },
      });

      const cleanTitle = generatedTitle
        .trim()
        .replace(/^["']|["']$/g, "")
        .slice(0, 30);

      if (cleanTitle) {
        await supabase
          .from("conversations")
          .update({ title: cleanTitle, updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      }
    } catch {
      // 標題生成失敗不影響對話
    }
  } else {
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
  }
}

const INTERRUPTED_ASSISTANT_PLACEHOLDER = "（回覆中斷，內容未完整儲存）";

function normalizeAssistantContent(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return raw;
}

export async function POST(req: Request) {
  try {
    // 1. Gateway: Auth 驗證
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. 解析請求
    const body = await req.json();
    // AI SDK v6: useChat sends UIMessage with parts, normalize to content for downstream
    const messages: ModelMessage[] = (
      body.messages as Array<Record<string, unknown>>
    ).map((msg) => {
      if (msg.content !== undefined) return msg as ModelMessage;
      if (Array.isArray(msg.parts)) {
        const parts = msg.parts as Array<{ type: string; text?: string }>;
        const text = parts
          .filter((p) => p.type === "text")
          .map((p) => p.text ?? "")
          .join("\n");
        return { ...msg, content: text } as ModelMessage;
      }
      return msg as ModelMessage;
    });
    const model: AIModel = body.model ?? "gemini-flash";
    const conversationId: string | undefined = body.conversationId;
    const docId: string | undefined = body.docId; // Optional: restrict RAG to specific document
    const docIds: string[] | undefined = body.docIds; // Optional: multi-doc RAG (知識圖譜關聯文件)
    // Skill Lazy Loading: validate loadedSkillNames (max 5, each max 50 chars, [a-z0-9-] format)
    const VALID_SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
    const rawLoadedSkillNames: unknown = body.loadedSkillNames;
    const loadedSkillNames: string[] | undefined = Array.isArray(
      rawLoadedSkillNames,
    )
      ? (rawLoadedSkillNames as unknown[])
        .filter(
          (n): n is string =>
            typeof n === "string" &&
            n.length > 0 &&
            n.length <= 50 &&
            VALID_SKILL_NAME_RE.test(n),
        )
        .slice(0, 5)
      : undefined;
    const sessionSystemPrompt: string | undefined = body.systemPrompt;
    const lastUserText = toTextContent(messages[messages.length - 1]?.content);
    const responseStyleMode = inferResponseStyleMode(lastUserText);
    const responseStylePrompt = buildResponseStylePrompt(responseStyleMode);
    const isFreshnessQuery =
      /202[5-9]|CES|Computex|MWC|最新|新聞|news|latest|today|now|trending|trend|熱門|排行|排名|GitHub|github|開源|open.?source|popular|hot|本[日週周月]|today|this week|today's/i.test(
        lastUserText,
      );

    // 2.5 並行啟動：RAG 查詢 + 儲存使用者訊息（兩者互不依賴）
    const lastUserMsg = messages[messages.length - 1];
    const queryText =
      lastUserMsg?.role === "user" ? toTextContent(lastUserMsg.content) : "";

    const RAG_TIMEOUT_MS = 12000;
    const ragPromise =
      lastUserMsg?.role === "user" && queryText.length > 2
        ? (() => {
          let timeoutId: ReturnType<typeof setTimeout>;
          return Promise.race([
            executeAdaptiveRAG({
              userQuery: queryText,
              conversationHistory: messages,
              userId: user.id,
              supabase,
              docId,
              docIds,
            }).then((result) => {
              clearTimeout(timeoutId);
              return result;
            }),
            new Promise<null>((resolve) => {
              timeoutId = setTimeout(() => {
                console.warn(
                  `[AdaptiveRAG] Timeout after ${RAG_TIMEOUT_MS}ms, proceeding without knowledge context`,
                );
                resolve(null);
              }, RAG_TIMEOUT_MS);
            }),
          ]).catch((ragError) => {
            clearTimeout(timeoutId!);
            console.error(
              "[AdaptiveRAG] Knowledge search failed:",
              ragError instanceof Error ? ragError.message : ragError,
            );
            return null;
          });
        })()
        : Promise.resolve(null);

    const saveUserMsgPromise =
      conversationId && lastUserMsg?.role === "user"
        ? supabase.from("messages").insert({
          conversation_id: conversationId,
          role: "user",
          content:
            typeof lastUserMsg.content === "string"
              ? lastUserMsg.content
              : JSON.stringify(lastUserMsg.content),
        })
        : Promise.resolve(null);

    // 2.6 Memory retrieval（與 RAG 平行，不阻塞主流程）
    const MEMORY_TIMEOUT_MS = 5000;
    const memoryPromise =
      queryText.length > 2
        ? (() => {
          let retrieved = false;
          return Promise.race([
            retrieveMemories({
              userId: user.id,
              query: queryText,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              supabase: supabase as any,
            }).then((r) => {
              retrieved = true;
              return r;
            }),
            new Promise<null>((resolve) => {
              setTimeout(() => {
                if (!retrieved) {
                  console.warn(
                    `[Memory] Timeout after ${MEMORY_TIMEOUT_MS}ms, proceeding without memory context`,
                  );
                }
                resolve(null);
              }, MEMORY_TIMEOUT_MS);
            }),
          ]).catch((err) => {
            console.error(
              "[Memory] Retrieval failed:",
              err instanceof Error ? err.message : err,
            );
            return null;
          });
        })()
        : Promise.resolve(null);

    // ===== 即時進度推送：在 await 前建立串流，讓前端立即收到進度事件 =====
    const uiStream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: "start" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        writer.write({ type: "data-progress" as any, id: "progress", data: { step: 1 } });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        writer.write({ type: "data-progress" as any, id: "progress", data: { step: 2 } });

    const [ragResult, _savedMsg, memoryResult] = await Promise.all([
      ragPromise,
      saveUserMsgPromise,
      memoryPromise,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writer.write({ type: "data-progress" as any, id: "progress", data: { step: 3 } });

    // 3. 選擇 LLM Provider（使用 API Key）
    const provider = getProvider(model);
    console.log(`[Chat] Model: ${model} → ${model === "gemini-pro" ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview"}`);

    // 4. Adaptive RAG 結果處理（已在上方並行查詢完成）
    let knowledgeContext = "";
    let hasKnowledgeContext = false;
    let knowledgeQualitySignals = "";
    let ragRetrievalMethod: "local" | "web" | "hybrid" = "local";
    if (ragResult) {
      ragRetrievalMethod = ragResult.retrievalMethod;

      if (ragResult.relevantDocIds.length > 0 && ragResult.knowledgeContext) {
        // 套用 Freshness Filter（保留原有過濾邏輯）
        const freshnessAnchors = isFreshnessQuery
          ? extractFreshnessAnchors(queryText)
          : [];
        const filteredDocIds = isFreshnessQuery
          ? ragResult.relevantDocIds.filter((id) =>
            docMatchesFreshnessAnchors({
              title: ragResult.docTitleMap.get(id) ?? "未知文件",
              tags: ragResult.docTagsMap.get(id) ?? [],
              chunks: ragResult.chunksByDoc.get(id)?.map((c) => c.text) ?? [],
              anchors: freshnessAnchors,
            }),
          )
          : ragResult.relevantDocIds;

        // 重新組合 context（套用 freshness filter 後可能文件數有變）
        const contextParts: string[] = [];
        for (const id of filteredDocIds) {
          const chunks = ragResult.chunksByDoc.get(id) ?? [];
          const title = ragResult.docTitleMap.get(id) ?? "未知文件";
          for (const chunk of chunks) {
            const pageInfo = chunk.metadata?.page
              ? ` (Page ${chunk.metadata.page})`
              : "";
            contextParts.push(`(文件：${title}${pageInfo})\n${chunk.text}`);
          }
        }

        // 計算知識品質信號
        const qualityItems: KnowledgeQualityItem[] = filteredDocIds.map(
          (id) => {
            const similarity = ragResult.docSimilarityMap.get(id) ?? 0;
            const updatedAt = ragResult.docUpdatedAtMap.get(id) ?? null;
            const sourceType = inferSourceType(
              ragResult.docTagsMap.get(id) ?? [],
            );
            return {
              title: ragResult.docTitleMap.get(id) ?? "未知文件",
              sourceType,
              confidence: getConfidenceLabel(similarity, sourceType),
              freshness: getFreshnessLabel(updatedAt),
              updatedAt: toZhDate(updatedAt),
            };
          },
        );

        if (qualityItems.length > 0 && contextParts.length > 0) {
          const confidenceSet = new Set(qualityItems.map((i) => i.confidence));
          const freshnessSet = new Set(qualityItems.map((i) => i.freshness));
          const possibleConflict =
            qualityItems.length >= 2 &&
            (confidenceSet.size >= 2 || freshnessSet.size >= 2);
          knowledgeQualitySignals = buildKnowledgeQualitySignals({
            items: qualityItems,
            possibleConflict,
          });

          knowledgeContext = truncateContext(
            ragResult.knowledgeContext,
            MAX_CONTEXT_CHARS_WEB,
          );
          hasKnowledgeContext = true;
        }

        if (isFreshnessQuery) {
          console.info("[RAG AUDIT][FreshnessQuery]", {
            query: queryText,
            anchors: freshnessAnchors,
            matchedDocs: ragResult.relevantDocIds.length,
            passedAnchorFilter: filteredDocIds.length,
            usedAsKnowledgeContext:
              qualityItems.length > 0 && contextParts.length > 0,
            selectedTitles: filteredDocIds.map(
              (id) => ragResult.docTitleMap.get(id) ?? "未知文件",
            ),
          });
        }
      }
    }

    // 6. 讀取使用者自訂系統提示詞 + 顯示名稱
    const { data: profile } = await supabase
      .from("profiles")
      .select("system_prompt, display_name")
      .eq("id", user.id)
      .single();

    const userSystemPrompt = profile?.system_prompt?.trim() ?? "";
    const userDisplayName = profile?.display_name?.trim() ?? "";

    // 7. 組合完整 system prompt（注入當前日期 + 使用者自訂指令）
    const now = new Date();
    const dateStr = now.toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
      timeZone: "Asia/Taipei",
    });

    const defaultPersona = `You are NexusMind, an intelligent knowledge assistant. Respond in the same language the user uses (Traditional Chinese used in Taiwan).`;
    const personaInstruction = sessionSystemPrompt ?? defaultPersona;
    // 提供 YYYY/MM/DD 格式日期，供 timeline 模板直接使用
    const isoDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
    const basePrompt = `[SYSTEM DATE] 今天是 ${dateStr}（${isoDate}）。所有涉及日期的回答都必須以此為準。生成 timeline 模板時，必須使用 ${isoDate} 作為基準日期（例如：兩天一夜行程 Day 1 = ${isoDate}）。

${personaInstruction}

Grounding policy:
- Prioritize the user's knowledge-base context ONLY when it is directly relevant to the question.
- If a knowledge-base document is about an unrelated topic, COMPLETELY IGNORE it. Do not force connections or mix unrelated content into your answer.
- Do not introduce topics that are unrelated to the user's question.
- If knowledge-base context is available but insufficient, clearly state what is missing instead of guessing.

Web search policy:
- You have access to Google Search. Use it when the user asks for latest/current/news/web information, or when the knowledge base is insufficient for a specific query about recent events (e.g. CES 2026, latest stock prices).
- If the user query is clearly about external live events or news, prefer Google Search over RAG context if RAG seems outdated.`;
    const knowledgePrompt = hasKnowledgeContext
      ? `\n\nKnowledge context is present in this turn. Prefer knowledge-grounded answers and avoid external assumptions.
When your answer references knowledge-base documents, list the referenced document titles at the END of your response in this format:
---
📚 **參考來源**
- Document Title 1
- Document Title 2
Only list documents you actually referenced in your answer. Do not list all available documents.`
      : "";
    // 知識品質信號作為 LLM 內部參考（不要求 LLM 輸出知識品質摘要區塊）
    const knowledgeQualityPrompt =
      hasKnowledgeContext && knowledgeQualitySignals
        ? `\n\n${knowledgeQualitySignals}\n注意：不需要輸出「知識品質摘要」區塊。直接回答問題即可。`
        : "";
    const userIdentityPrompt = userDisplayName
      ? `\n\n[USER IDENTITY]\nThe current user's display name is "${userDisplayName}". Use this name when the user asks about their identity or when personalization is appropriate.`
      : "";
    const customPrompt = userSystemPrompt
      ? `\n\nUser custom instructions:\n${userSystemPrompt}`
      : "";
    // 7.5 記憶上下文注入
    const memoryContextPrompt = memoryResult?.formattedContext
      ? `\n\n[USER MEMORY CONTEXT]\nThe following are stored facts, preferences, and behaviors about this user. Use them to personalize your response when relevant. Do not explicitly mention that you are using stored memories.\n${memoryResult.formattedContext}`
      : "";
    if (memoryResult && memoryResult.totalCount > 0) {
      console.log(
        `[Memory] Retrieved ${memoryResult.totalCount} memories for query "${queryText.slice(0, 50)}"`,
      );
    }
    const markdownFormatPrompt = buildMarkdownFormatPrompt();

    // 7.6 技能索引注入（Lazy Loading）
    // 查詢使用者已啟用的技能，生成輕量索引文字注入 systemPrompt
    // AI 需要時會在回覆中輸出 [LOAD_SKILL: name] 觸發按需載入
    let skillsIndexPrompt = "";
    try {
      // 查詢所有技能（全域共享）
      const { data: allSkills } = await supabase
        .from("skills")
        .select("id, name, display_name, description, is_enabled");

      // 查詢用戶偏好
      const { data: prefs } = await supabase
        .from("user_skill_preferences")
        .select("skill_id, is_enabled")
        .eq("user_id", user.id);

      const prefMap = new Map(
        (prefs ?? []).map((p: { skill_id: string; is_enabled: boolean }) => [p.skill_id, p.is_enabled])
      );

      // 合併偏好：用戶偏好 > 全域預設
      const userSkills = (allSkills ?? []).filter((s: { id: string; is_enabled: boolean }) =>
        prefMap.has(s.id) ? prefMap.get(s.id) : s.is_enabled
      );

      if (userSkills.length > 0) {
        const indexEntries = userSkills.map(toSkillIndexEntry);
        skillsIndexPrompt = "\n\n" + buildSkillsIndexText(indexEntries);
      }
    } catch {
      // 技能索引查詢失敗不影響主對話流程
    }

    // 7.7 載入已請求的技能完整內容（Skill Lazy Loading — 按需注入）
    // 當 AI 之前的回覆中包含 [LOAD_SKILL: name] 標記時，前端會透過 API 載入完整內容，
    // 並在下一次對話中傳回 loadedSkillNames，讓 server 注入完整技能到 systemPrompt
    let loadedSkillsPrompt = "";
    if (loadedSkillNames && loadedSkillNames.length > 0) {
      try {
        // 查詢技能完整內容（全域共享，不篩選 user_id）
        const { data: fullSkills } = await supabase
          .from("skills")
          .select("id, name, display_name, description, skill_md, is_enabled")
          .in("name", loadedSkillNames);

        if (fullSkills && fullSkills.length > 0) {
          // 使用已有的 prefMap 或重新查詢用戶偏好
          const { data: skillPrefs } = await supabase
            .from("user_skill_preferences")
            .select("skill_id, is_enabled")
            .eq("user_id", user.id);

          const skillPrefMap = new Map(
            (skillPrefs ?? []).map((p: { skill_id: string; is_enabled: boolean }) => [p.skill_id, p.is_enabled])
          );

          const enabledSkills = fullSkills.filter((s: { id: string; is_enabled: boolean }) =>
            skillPrefMap.has(s.id) ? skillPrefMap.get(s.id) : s.is_enabled
          );

          loadedSkillsPrompt = enabledSkills
            .map((s) => "\n\n" + buildSkillSystemMessage(s))
            .join("");
        }
      } catch {
        // 技能載入失敗不影響主對話流程
      }
    }

    // 🔥 FRESHNESS / RAG FALLBACK OVERRIDE: Force Google Search when needed
    // RSS 優先路由命中且有知識上下文 → 不強制 Google Search（優先使用監控源內容）
    const rssHit = Boolean(ragResult?.rssSourceMatch && hasKnowledgeContext);
    const needsWebSearch = rssHit
      ? false
      : isFreshnessQuery || ragRetrievalMethod === "web";
    const isTrendingQuery = /trending|trend|熱門|排行|排名|GitHub/i.test(
      lastUserText,
    );
    const trendingDepthInstruction = isTrendingQuery
      ? "\n\nIMPORTANT: When reporting trending/popular items, provide a DETAILED analysis for each item, including: project name, description (2-3 sentences minimum), star count, programming language, key features, and why it is trending. Do NOT just list names with one-line descriptions. Users expect comprehensive summaries."
      : "";
    const freshnessInstruction = needsWebSearch
      ? `\n\n[MANDATORY SEARCH OVERRIDE]\n${ragRetrievalMethod === "web" ? "The knowledge base did not contain sufficiently relevant information for this query. " : ""}${isFreshnessQuery ? `The user is asking about a specific recent/future event or explicitly wants latest info ("${lastUserText}"). ` : ""}YOU MUST USE THE 'googleSearch' TOOL to find relevant information. Do not rely solely on training data.${trendingDepthInstruction}`
      : "";

    const systemPrompt =
      basePrompt +
      userIdentityPrompt +
      responseStylePrompt +
      knowledgePrompt +
      knowledgeQualityPrompt +
      customPrompt +
      memoryContextPrompt +
      knowledgeContext +
      skillsIndexPrompt +
      loadedSkillsPrompt +
      freshnessInstruction +
      "\n\n" +
      markdownFormatPrompt;

    // 組建 RAG metadata 供前端透明度面板 + DB 持久化使用
    // 必須在 streamText() 之前構建，讓 onFinish 閉包能存取
    // 僅在有本地知識庫命中時才發送 RAG metadata 給前端
    // retrievalMethod === "web" 且無文件命中 = 純網路搜尋，不顯示 RAG 面板
    const ragDocuments = ragResult
      ? ragResult.relevantDocIds.map((id) => ({
        title: ragResult.docTitleMap.get(id) ?? "未知文件",
        similarity: ragResult.docSimilarityMap.get(id) ?? 0,
        sourceType: inferSourceType(ragResult.docTagsMap.get(id) ?? []),
      }))
      : [];

    const ragStreamMetadata: RAGMetadataForStream | null =
      ragResult && ragDocuments.length > 0
        ? {
          originalQuery: ragResult.metadata.originalQuery,
          finalQuery: ragResult.metadata.finalQuery,
          rewrites: ragResult.metadata.rewrites,
          relevanceScore: ragResult.metadata.relevanceScore,
          relevanceVerdict: ragResult.metadata.relevanceVerdict,
          retrievalMethod: ragRetrievalMethod,
          documents: ragDocuments,
          hasGraphContext: !!ragResult.graphContext,
        }
        : null;

    let streamedText = "";
    let assistantPersisted = false;
    const persistOnce = async (
      finalText: string,
      opts?: { allowPlaceholder?: boolean; isFinal?: boolean },
    ) => {
      if (assistantPersisted) return;
      if (!opts?.allowPlaceholder && !finalText.trim()) return;
      assistantPersisted = true;

      // 使用 admin client 繞過 RLS，確保在 Request context 關閉後仍能寫入資料庫
      const supabaseAdmin = createAdminClient();
      await persistAssistantMessage({
        supabase: supabaseAdmin,
        conversationId,
        messages,
        text: finalText,
        ragMetadata: ragStreamMetadata,
        isFinal: opts?.isFinal,
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writer.write({ type: "data-progress" as any, id: "progress", data: { step: 4 } });
    // 發送 RAG metadata（在文字串流前）
    if (ragStreamMetadata) {
      writer.write({
        type: "data-rag-transparency",
        id: "rag-meta",
        data: ragStreamMetadata,
      });
    }

    const result = streamText({
      model: provider,
      system: systemPrompt,
      messages,
      providerOptions: THINKING_PROVIDER_OPTIONS,
      abortSignal: req.signal,
      experimental_transform: smoothStream({
        delayInMs: 5, // P2: 降低延遲（原 10ms），讓文字出現速度更快
        // 使用 Intl.Segmenter 做 grapheme 分割，確保中文字元也能逐字串流
        // word regex (/\S+\s+/) 對中文無效（中文無空格分詞）
        chunking: new Intl.Segmenter(),
      }),
      // @ts-expect-error ai sdk v6 streamText type defs may lag maxSteps support
      maxSteps: 5,
      tools: {
        googleSearch: google.tools.googleSearch({}),
      },
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          userId: user.id,
          conversationId: conversationId ?? "none",
          model,
          ragMethod: ragRetrievalMethod,
        },
      },
      onChunk({ chunk }) {
        if (chunk.type === "text-delta" && chunk.text) {
          streamedText += chunk.text;
        }
      },
      async onAbort({ steps }) {
        const stepsText = steps.map((s) => s.text).join("");
        // 優先使用 onChunk 累積的真實串流輸出，因為 Vercel SDK 有時會遺失 tool call 之間的內容
        const partial = streamedText.trim() || stepsText.trim();
        await persistOnce(partial, { allowPlaceholder: true });
      },
      async onFinish({ text }) {
        // 正常結束：必須優先使用 manually accumulated 的 streamedText。
        // AI SDK 的 onFinish({ text }) 在混合 tool calls 時可能會發生截斷。
        const finalText = streamedText.trim() || text.trim();
        await persistOnce(finalText, { allowPlaceholder: true, isFinal: true });

        // 非同步記憶萃取（不阻塞回應串流）
        try {
          const extraction = await extractMemories({
            userMessage: queryText,
            assistantResponse: finalText,
            conversationId,
          });
          if (extraction.shouldStore) {
            const supabaseAdmin = createAdminClient();
            const { data: existing } = await getUserMemories(
              user.id,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              supabaseAdmin as any,
              { limit: 50 },
            );
            const existingContents = (existing ?? []).map((m) => m.content);
            const deduped = deduplicateMemories(
              existingContents,
              extraction.memories,
            );
            let savedCount = 0;
            for (const memory of deduped) {
              const result = await createMemory(
                user.id,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                supabaseAdmin as any,
                {
                  ...memory,
                  source_conversation_id: conversationId,
                  source_type: "auto",
                },
              );
              if (result.error) {
                console.error(
                  `[Memory] Failed to save memory "${memory.content.slice(0, 50)}":`,
                  result.error.message,
                );
              } else {
                savedCount++;
              }
            }
            if (deduped.length > 0) {
              console.log(
                `[Memory] Extracted ${deduped.length}, saved ${savedCount} memories for conversation ${conversationId}`,
              );
            }
          }
        } catch (memErr) {
          console.error(
            "[Memory] Extraction failed:",
            memErr instanceof Error ? memErr.message : memErr,
          );
        }
      },
    });

    // 合併 AI 文字串流（sendStart: false 避免重複 start 事件）
    writer.merge(result.toUIMessageStream({ sendStart: false }));
      },
    });
    return createUIMessageStreamResponse({ stream: uiStream });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // 檢查是否為 OAuth 初始化錯誤
    if (
      message.includes("Failed to initialize TokenManager") ||
      message.includes("gemini init")
    ) {
      return Response.json(
        { error: '請先執行 "gemini init" 完成 Google OAuth 授權' },
        { status: 401 },
      );
    }

    return Response.json({ error: message }, { status: 500 });
  }
}
