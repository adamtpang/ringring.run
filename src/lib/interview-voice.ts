import { createHash } from "node:crypto";
import { forceDemo } from "./env";
import { cleanMessage, interviewPrompt, type Turn } from "./interview";

// Web voice interview through ElevenLabs Agents (browser mic, no phone line).
// The API key is read from process.env on the server only. The browser gets a
// short-lived signed URL for one conversation, never the key.

const BASE = "https://api.elevenlabs.io/v1/convai";
/** Hard cap on one interview call, in seconds. */
export const MAX_CALL_SECONDS = 300;

export interface VoiceInterviewStatus {
  available: boolean;
  /** Plain reason when voice is off. Names env vars, never values. */
  reason: string | null;
}

export function voiceInterviewStatus(): VoiceInterviewStatus {
  if (forceDemo()) return { available: false, reason: "Demo mode is on, so voice is off. Type your answers instead." };
  if (!(process.env.ELEVENLABS_API_KEY ?? "").trim()) return { available: false, reason: "Voice is not set up on this server (ELEVENLABS_API_KEY is missing). Type your answers instead." };
  if (process.env.INTERVIEW_VOICE === "off") return { available: false, reason: "Voice is switched off on this server (INTERVIEW_VOICE=off). Type your answers instead." };
  return { available: true, reason: null };
}

type Fetch = typeof fetch;
const headers = () => ({ "xi-api-key": process.env.ELEVENLABS_API_KEY as string, "content-type": "application/json" });

/** Agent name carries the business id prefix and a hash of the prompt, so the same questions reuse one agent. */
export function agentName(businessId: string, prompt: string) {
  const h = createHash("sha256").update(prompt).digest("hex").slice(0, 10);
  return `ringring.run interview ${businessId.slice(0, 8)} ${h}`;
}

const cache = new Map<string, string>();

export class VoiceError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export async function ensureInterviewAgent(businessId: string, businessName: string, questions: string[], f: Fetch = fetch): Promise<string> {
  const { prompt, first_message } = interviewPrompt(businessName, questions);
  const name = agentName(businessId, prompt);
  const hit = cache.get(name);
  if (hit) return hit;
  const found = await f(`${BASE}/agents?search=${encodeURIComponent(name)}&page_size=5`, { headers: headers() });
  if (found.ok) {
    const j = (await found.json()) as { agents?: { agent_id: string; name: string }[] };
    const a = j.agents?.find((x) => x.name === name);
    if (a) {
      cache.set(name, a.agent_id);
      return a.agent_id;
    }
  }
  const res = await f(`${BASE}/agents/create`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name,
      conversation_config: {
        agent: {
          first_message,
          language: "en",
          prompt: { prompt, built_in_tools: { end_call: { name: "end_call", description: "End the call after the closing line.", params: { system_tool_type: "end_call" } } } },
        },
        conversation: { max_duration_seconds: MAX_CALL_SECONDS },
      },
    }),
  });
  if (!res.ok) throw new VoiceError(`Could not set up the voice interview (ElevenLabs HTTP ${res.status}).`);
  const { agent_id } = (await res.json()) as { agent_id?: string };
  if (!agent_id) throw new VoiceError("Could not set up the voice interview (no agent id returned).");
  cache.set(name, agent_id);
  return agent_id;
}

export async function signedUrl(agentId: string, f: Fetch = fetch): Promise<string> {
  const res = await f(`${BASE}/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, { headers: headers() });
  if (!res.ok) throw new VoiceError(`Could not start the voice interview (ElevenLabs HTTP ${res.status}).`);
  const { signed_url } = (await res.json()) as { signed_url?: string };
  if (!signed_url) throw new VoiceError("Could not start the voice interview (no signed URL returned).");
  return signed_url;
}

export interface FetchedTranscript {
  status: string;
  turns: Turn[];
  duration_secs: number | null;
}

/**
 * Read a finished conversation from ElevenLabs. The conversation must belong to
 * one of this business's interview agents, so one owner can't read another's call.
 */
export async function fetchTranscript(conversationId: string, businessId: string, f: Fetch = fetch): Promise<FetchedTranscript> {
  const res = await f(`${BASE}/conversations/${encodeURIComponent(conversationId)}`, { headers: headers() });
  if (res.status === 404) throw new VoiceError("Conversation not found.", 404);
  if (!res.ok) throw new VoiceError(`Could not read the conversation (ElevenLabs HTTP ${res.status}).`);
  const j = (await res.json()) as { agent_id?: string; status?: string; transcript?: { role?: string; message?: string | null }[]; metadata?: { call_duration_secs?: number } };
  const agentId = j.agent_id ?? "";
  const owned = [...cache.entries()].some(([n, id]) => id === agentId && n.includes(` ${businessId.slice(0, 8)} `));
  if (!owned) {
    // After a server restart the cache is empty: check the agent's name instead.
    const a = await f(`${BASE}/agents/${encodeURIComponent(agentId)}`, { headers: headers() });
    const name = a.ok ? ((await a.json()) as { name?: string }).name ?? "" : "";
    if (!name.startsWith(`ringring.run interview ${businessId.slice(0, 8)} `)) throw new VoiceError("That conversation is not an interview for this business.", 403);
  }
  const turns: Turn[] = (j.transcript ?? [])
    .map((t) => ({ role: t.role as Turn["role"], message: cleanMessage(t.message) }))
    .filter((t) => (t.role === "agent" || t.role === "user") && t.message);
  return { status: j.status ?? "unknown", turns, duration_secs: j.metadata?.call_duration_secs ?? null };
}
