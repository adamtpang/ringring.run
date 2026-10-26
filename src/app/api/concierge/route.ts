import { z } from "zod";
import { json } from "@/lib/api";
import { routeRequest, routeWithLlm } from "@/lib/chat/concierge";
import { createChatLlmClient } from "@/lib/diagnose/llm-client";
import { configured, forceDemo } from "@/lib/env";

export const dynamic = "force-dynamic";

// POST /api/concierge { text } -> { category | query, reply, mode }
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const parsed = z.object({ text: z.string().max(200) }).safeParse(body);
  if (!parsed.success) return json({ error: "Invalid input" }, 400);
  const useLlm = configured().llm && !forceDemo();
  return json(useLlm ? await routeWithLlm(parsed.data.text, createChatLlmClient()) : routeRequest(parsed.data.text));
}
