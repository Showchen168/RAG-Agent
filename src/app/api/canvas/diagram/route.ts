import { createClient } from "@/lib/supabase/server";
import { generateDiagram } from "@/lib/ai/diagram-generator";
import type { DiagramType } from "@/lib/ai/diagram-generator";
import { analyzeDiagram } from "@/lib/ai/diagram-analyzer";

interface DiagramRequest {
  action: "generate" | "analyze" | "modify";
  prompt?: string;
  xml?: string;
  diagramType?: string;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "未登入" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await req.json()) as DiagramRequest;

  if (!["generate", "analyze", "modify"].includes(body.action)) {
    return new Response(JSON.stringify({ error: "無效的 action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (body.action === "analyze") {
      if (!body.xml) {
        return new Response(JSON.stringify({ error: "分析需要提供 xml" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const analysis = await analyzeDiagram(body.xml);
      return Response.json(analysis);
    }

    // generate or modify
    if (!body.prompt) {
      return new Response(
        JSON.stringify({ error: "生成/修改需要提供 prompt" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const result = await generateDiagram({
      prompt: body.prompt,
      existingXml: body.action === "modify" ? body.xml : undefined,
      diagramType: (body.diagramType as DiagramType | undefined) ?? "general",
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "圖表操作失敗";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
