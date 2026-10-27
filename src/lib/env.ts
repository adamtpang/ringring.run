import type { RunMode } from "./types";

// Reads configuration from process.env. Only reports whether a variable is set;
// never returns or logs secret values to callers outside the server modules
// that need them.

function has(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

export const DEFAULT_LLM_MODEL = "grok-4.7";
/** Fast non-reasoning model for live conversation turns (chat, simulated calls). Reasoning models miss the 3 s turn budget. */
export const DEFAULT_LLM_CHAT_MODEL = "grok-4.20-0309-non-reasoning";
export const DEFAULT_LLM_BASE_URL = "https://api.x.ai/v1";

export function forceDemo(): boolean {
  return process.env.FORCE_DEMO === "1" || process.env.FORCE_DEMO === "true";
}

/** Every env var the app reads. /health reports presence (true/false) for these names only. */
export const ENV_KEYS = [
  { name: "APIFY_TOKEN", required: true, purpose: "Live Google Maps scraping" },
  { name: "XAI_API_KEY", required: true, purpose: "Live LLM diagnosis" },
  { name: "LLM_MODEL", required: false, purpose: "LLM model id (default grok-4.7)" },
  { name: "LLM_CHAT_MODEL", required: false, purpose: "Model for chat and simulated call turns (default grok-4.20-0309-non-reasoning)" },
  { name: "LLM_BASE_URL", required: false, purpose: "OpenAI-compatible endpoint (default https://api.x.ai/v1)" },
  { name: "LLM_API_STYLE", required: false, purpose: "responses or chat" },
  { name: "LLM_API_KEY", required: false, purpose: "Key for a non-xAI endpoint (overrides XAI_API_KEY)" },
  { name: "LLM_REASONING_EFFORT", required: false, purpose: "Optional reasoning effort" },
  { name: "SUPABASE_URL", required: true, purpose: "Postgres storage" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", required: true, purpose: "Server-side Postgres writes" },
  { name: "NEXT_PUBLIC_SUPABASE_URL", required: false, purpose: "Reserved for browser reads (unused in Phase 1)" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: false, purpose: "Reserved for browser reads (unused in Phase 1)" },
  { name: "APIFY_MAX_REVIEWS", required: false, purpose: "Reviews per place (default 20)" },
  { name: "APIFY_TIMEOUT_SECS", required: false, purpose: "Apify run timeout" },
  { name: "ELEVENLABS_API_KEY", required: false, purpose: "Deploy phone agents to ElevenLabs Agents (Next: not live tested)" },
  { name: "ELEVENLABS_PHONE_NUMBER_ID", required: false, purpose: "ElevenLabs phone number to assign the agent to" },
  { name: "OVERPASS_URL", required: false, purpose: "Overpass endpoint(s) for /find, comma separated, tried in order (default: private.coffee, then maps.mail.ru)" },
  { name: "FORCE_DEMO", required: false, purpose: "Force demo mode even with keys" },
  { name: "LOCAL_DB_PATH", required: false, purpose: "Local demo store file" },
  { name: "CRON_SECRET", required: false, purpose: "Bearer secret Vercel Cron sends to /api/cron/checkin (route returns 503 without it)" },
  { name: "CHECKIN_MONTHLY_BUDGET_USD", required: false, purpose: "Hard monthly cap on check-in spend (default 1.00)" },
] as const;

/** Names to booleans. Never includes values. */
export function envPresence(): Record<string, boolean> {
  return Object.fromEntries(ENV_KEYS.map((k) => [k.name, has(k.name)]));
}

export function configured() {
  return {
    apify: has("APIFY_TOKEN"),
    supabase: has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY"),
    llm: has("XAI_API_KEY") || has("LLM_API_KEY"),
    voice: has("ELEVENLABS_API_KEY") && has("ELEVENLABS_PHONE_NUMBER_ID"),
  };
}

export function llmConfig() {
  return {
    baseUrl: (process.env.LLM_BASE_URL || DEFAULT_LLM_BASE_URL).replace(/\/$/, ""),
    model: process.env.LLM_MODEL || DEFAULT_LLM_MODEL,
    chatModel: process.env.LLM_CHAT_MODEL || DEFAULT_LLM_CHAT_MODEL,
    apiKey: process.env.LLM_API_KEY || process.env.XAI_API_KEY || "",
    // "responses" (xAI and OpenAI Responses API) or "chat" (any OpenAI-compatible chat/completions endpoint)
    apiStyle: (process.env.LLM_API_STYLE === "chat" ? "chat" : "responses") as "chat" | "responses",
    reasoningEffort: process.env.LLM_REASONING_EFFORT || null,
  };
}

export function runtimeMode(): RunMode {
  const c = configured();
  const demo = forceDemo();
  return {
    scraper: c.apify && !demo ? "apify" : "fixture",
    diagnoser: c.llm && !demo ? "llm" : "stub",
    store: c.supabase && !demo ? "supabase" : "local",
    llm_model: c.llm && !demo ? llmConfig().model : null,
  };
}

export function isDemo(mode: RunMode): boolean {
  return mode.scraper === "fixture" || mode.diagnoser === "stub" || mode.store === "local";
}
