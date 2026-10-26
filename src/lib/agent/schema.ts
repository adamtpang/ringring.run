import { z } from "zod";
import { KNOWLEDGE_KINDS } from "../types";

// Provider-agnostic phone agent config. Generated deterministically from
// stored, cited data (listing, website, reviews). Validated with Zod before
// it is stored, shown, evaluated, or sent to any voice provider.

/** Matches an explicit AI disclosure: "AI", "artificial intelligence", or "virtual assistant". */
export const AI_DISCLOSURE = /\b(AI|artificial intelligence|virtual assistant)\b/;

export const KnowledgeItemSchema = z.object({
  id: z.string().regex(/^k\d+$/),
  kind: z.enum(KNOWLEDGE_KINDS),
  label: z.string().min(1).max(160),
  value: z.string().min(1).max(500),
  source_type: z.enum(["listing", "website", "review", "owner"]),
  /** Listing field name, web_pages id, or reviews id. */
  source_ref: z.string().min(1),
  /** Verbatim supporting text for website and review sources. */
  quote: z.string().nullable(),
});
export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>;

export const AgentConfigSchema = z.object({
  schema_version: z.literal(1),
  business_id: z.string().min(1),
  business_name: z.string().min(1),
  generated_at: z.string(),
  language: z.literal("en"),
  system_prompt: z
    .string()
    .min(200)
    .refine((s) => AI_DISCLOSURE.test(s.split("\n")[0] ?? ""), "The first line of the system prompt must disclose that the agent is an AI"),
  first_message: z.string().min(20).max(400).refine((s) => AI_DISCLOSURE.test(s), "The first message must disclose that the caller is talking to an AI"),
  knowledge: z.array(KnowledgeItemSchema).min(1),
  hours: z.array(z.object({ day: z.string(), hours: z.string() })),
  policies: z.object({
    unknown_answer: z.string().min(1),
    handoff: z.string().min(1),
    booking: z.string().min(1),
    after_hours: z.string().min(1),
    safety: z.string().min(1),
  }),
  /** What the agent collects for an owner callback. */
  callback_fields: z.array(z.string()).min(2),
  /** Findings this agent is meant to fix. Shown to the owner only, never to callers. */
  built_for: z.array(z.object({ kind: z.string(), title: z.string() })),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
