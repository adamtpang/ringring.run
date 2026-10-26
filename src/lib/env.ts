import type { RunMode } from "./types";

// Reads configuration from process.env. Only reports whether a variable is set;
// never returns or logs secret values to callers outside the server modules
// that need them.

function has(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

export const DEFAULT_LLM_MODEL = "grok-4.7";
export const DEFAULT_LLM_BASE_URL = "https://api.x.ai/v1";

export function forceDemo(): boolean {
  return process.env.FORCE_DEMO === "1" || process.env.FORCE_DEMO === "true";
}

export function configured() {
  return {
    apify: has("APIFY_TOKEN"),
    supabase: has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY"),
    llm: has("XAI_API_KEY") || has("LLM_API_KEY"),
  };
}

export function llmConfig() {
  return {
    baseUrl: (process.env.LLM_BASE_URL || DEFAULT_LLM_BASE_URL).replace(/\/$/, ""),
    model: process.env.LLM_MODEL || DEFAULT_LLM_MODEL,
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
