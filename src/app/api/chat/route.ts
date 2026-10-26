import { z } from "zod";
import { json } from "@/lib/api";
import { chatFirstMessage, chatReply } from "@/lib/chat/chat";
import { resolveChatAgent } from "@/lib/chat/resolve";
import { createLlmClient } from "@/lib/diagnose/llm-client";
import { configured, forceDemo } from "@/lib/env";
import { PlaceSchema } from "@/lib/places/schema";
import { isSuspicious } from "@/lib/untrusted";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  place: PlaceSchema,
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(1000) })).max(30).default([]),
  /** Omit to get the opening message only. */
  message: z.string().max(500).optional(),
});

// POST /api/chat: one turn with a business's AI. Nothing is sent to the business.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid chat input" }, 400);
  const { place, history, message } = parsed.data;
  // The place comes from the browser, so treat it like any other untrusted input.
  if (isSuspicious(place.name)) return json({ error: "Invalid chat input" }, 400);
  const agent = await resolveChatAgent(place);
  const useLlm = configured().llm && !forceDemo();
  const meta = { agent_source: agent.source, business_id: agent.business_id, responder: useLlm ? "llm" : "demo", facts: agent.config.knowledge.length };
  if (!message?.trim()) return json({ ...meta, reply: chatFirstMessage(agent.config), sources: [] });
  const out = await chatReply({ config: agent.config, history, message, llm: useLlm ? createLlmClient() : null });
  return json({ ...meta, ...out });
}
