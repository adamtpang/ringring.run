import type { AgentConfig } from "../agent/schema";

export interface Turn {
  role: "agent" | "caller";
  text: string;
  /** Responder time for agent turns, in ms. The first message is scripted and has none. */
  latency_ms?: number;
}

export interface RespondInput {
  config: AgentConfig;
  /** Conversation so far, starting with the agent's first message. */
  history: Turn[];
  callerText: string;
}

export interface Responder {
  id: "fixture" | "llm" | "voice";
  name: string;
  /** Whether this responder can run here, and an honest reason when not. */
  status(): { available: boolean; reason: string | null };
  respond(input: RespondInput): Promise<string>;
}

export interface EvalCase {
  id: string;
  title: string;
  /** What a good agent does, in plain words. Shown on /evals. */
  goal: string;
  caller: string[];
  /** Phrases that must appear in at least one agent reply (facts from the KB). */
  mustInclude?: (config: AgentConfig) => string[];
  mustMatch?: { label: string; re: RegExp }[];
  mustNotMatch?: { label: string; re: RegExp }[];
  /** Return a reason to skip this case for a config (for example no prices on file). */
  skipIf?: (config: AgentConfig) => string | null;
}

export interface CheckResult {
  name: "disclosure" | "facts" | "task" | "hallucination" | "latency";
  pass: boolean;
  detail: string;
}

export interface CaseResult {
  id: string;
  title: string;
  goal: string;
  status: "pass" | "fail" | "skipped";
  skip_reason: string | null;
  transcript: Turn[];
  checks: CheckResult[];
  hallucinations: string[];
  latency_ms: { max: number; avg: number };
}

export interface EvalReport {
  responder: { id: string; name: string };
  business_id: string;
  business_name: string;
  agent_id: string | null;
  ran_at: string;
  passed: number;
  failed: number;
  skipped: number;
  /** passed / (passed + failed), 0..1 */
  pass_rate: number;
  latency_budget_ms: number;
  cases: CaseResult[];
}
