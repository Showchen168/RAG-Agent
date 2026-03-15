/**
 * POST /api/skills/execute
 * 技能執行 API：Gemini LLM → Docker Container → 檔案輸出
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handleExecuteSkill } from "@/lib/skills/execute-handler";

/** 允許長時間執行（技能涉及 Gemini API + Docker 容器，通常需要 2-5 分鐘） */
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = await createClient();

  let payload: {
    skillId?: string;
    conversationId?: string;
    messageId?: string;
    messageHistory?: string[];
    userInput?: string;
    userMessageContent?: string;
    clarificationAnswers?: Array<{
      questionId: string;
      question: string;
      answer: string;
    }>;
  };

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await handleExecuteSkill(supabase, {
    skillId: payload.skillId ?? "",
    conversationId: payload.conversationId,
    messageId: payload.messageId,
    messageHistory: payload.messageHistory,
    userInput: payload.userInput,
    userMessageContent: payload.userMessageContent,
    clarificationAnswers: payload.clarificationAnswers,
  });

  return NextResponse.json(result.body, { status: result.status });
}
