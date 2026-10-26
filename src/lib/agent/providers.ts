import { forceDemo } from "../env";
import { AgentConfigSchema, type AgentConfig } from "./schema";

// Voice provider adapters. The agent config is provider-agnostic; an adapter
// turns it into a live phone agent. Every adapter checks its env vars first
// and is a no-op with a clear "not configured" status when they are missing.

export interface ProviderStatus {
  id: string;
  name: string;
  configured: boolean;
  /** Env var NAMES that are missing. Never values. */
  missing: string[];
  reason: string | null;
}

export type DeployResult =
  | { ok: true; provider: string; external_agent_id: string; phone_number_id: string | null; message: string }
  | { ok: false; provider: string; status: "not_configured" | "error"; message: string; missing?: string[] };

export interface VoiceAgentProvider {
  id: string;
  name: string;
  status(): ProviderStatus;
  deploy(config: AgentConfig, opts?: { fetch?: typeof fetch }): Promise<DeployResult>;
}

const has = (n: string) => (process.env[n] ?? "").trim().length > 0;

export const ELEVENLABS_ENV = ["ELEVENLABS_API_KEY", "ELEVENLABS_PHONE_NUMBER_ID"] as const;
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1/convai";

/**
 * ElevenLabs Agents adapter: create an agent from the config, then point an
 * already-imported phone number at it. Written against the public API docs
 * (POST /v1/convai/agents/create, PATCH /v1/convai/phone-numbers/{id});
 * not yet exercised against the live API.
 */
export const elevenLabsProvider: VoiceAgentProvider = {
  id: "elevenlabs",
  name: "ElevenLabs Agents",
  status() {
    const missing = ELEVENLABS_ENV.filter((n) => !has(n));
    const demo = forceDemo();
    return {
      id: this.id,
      name: this.name,
      configured: missing.length === 0 && !demo,
      missing: [...missing],
      reason: demo
        ? "Demo mode (FORCE_DEMO) is on, so nothing is deployed."
        : missing.length
          ? `Voice is not configured: set ${missing.join(" and ")} to deploy.`
          : null,
    };
  },
  async deploy(config, opts = {}) {
    const st = this.status();
    if (!st.configured) return { ok: false, provider: this.id, status: "not_configured", message: st.reason ?? "Not configured", missing: st.missing };
    const cfg = AgentConfigSchema.parse(config);
    const doFetch = opts.fetch ?? fetch;
    const headers = { "xi-api-key": process.env.ELEVENLABS_API_KEY as string, "content-type": "application/json" };
    try {
      const create = await doFetch(`${ELEVENLABS_BASE}/agents/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: `ringring.run: ${cfg.business_name}`.slice(0, 100),
          conversation_config: {
            agent: { first_message: cfg.first_message, language: cfg.language, prompt: { prompt: cfg.system_prompt } },
          },
        }),
      });
      if (!create.ok) return { ok: false, provider: this.id, status: "error", message: `Create agent failed: HTTP ${create.status}` };
      const { agent_id } = (await create.json()) as { agent_id?: string };
      if (!agent_id) return { ok: false, provider: this.id, status: "error", message: "Create agent returned no agent_id" };
      const phoneId = process.env.ELEVENLABS_PHONE_NUMBER_ID as string;
      const assign = await doFetch(`${ELEVENLABS_BASE}/phone-numbers/${encodeURIComponent(phoneId)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ agent_id }),
      });
      if (!assign.ok) {
        return { ok: false, provider: this.id, status: "error", message: `Agent ${agent_id} created, but assigning the phone number failed: HTTP ${assign.status}` };
      }
      return { ok: true, provider: this.id, external_agent_id: agent_id, phone_number_id: phoneId, message: "Agent created and phone number assigned" };
    } catch (e) {
      return { ok: false, provider: this.id, status: "error", message: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const PROVIDERS: VoiceAgentProvider[] = [elevenLabsProvider];

export function getProvider(id = "elevenlabs"): VoiceAgentProvider | null {
  return PROVIDERS.find((p) => p.id === id) ?? null;
}
