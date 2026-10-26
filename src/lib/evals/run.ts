import type { AgentConfig } from "../agent/schema";
import { callerLines, CASES } from "./cases";
import { gradeCase, LATENCY_BUDGET_MS } from "./grade";
import type { CaseResult, EvalCase, EvalReport, Responder, Turn } from "./types";

export async function runCase(c: EvalCase, config: AgentConfig, responder: Responder): Promise<CaseResult> {
  const base = { id: c.id, title: c.title, goal: c.goal };
  const skip = c.skipIf?.(config) ?? null;
  if (skip) {
    return { ...base, status: "skipped", skip_reason: skip, transcript: [], checks: [], hallucinations: [], latency_ms: { max: 0, avg: 0 } };
  }
  const transcript: Turn[] = [{ role: "agent", text: config.first_message }];
  for (const line of callerLines(c, config)) {
    const history = [...transcript];
    transcript.push({ role: "caller", text: line });
    const t0 = performance.now();
    let text: string;
    try {
      text = await responder.respond({ config, history, callerText: line });
    } catch (e) {
      text = `[responder error: ${e instanceof Error ? e.message : String(e)}]`;
    }
    transcript.push({ role: "agent", text, latency_ms: performance.now() - t0 });
  }
  return { ...base, skip_reason: null, ...gradeCase(c, config, transcript) };
}

export async function runEvals(
  config: AgentConfig,
  responder: Responder,
  opts: { agentId?: string | null; cases?: EvalCase[]; now?: () => Date } = {},
): Promise<EvalReport> {
  const cases: CaseResult[] = [];
  for (const c of opts.cases ?? CASES) cases.push(await runCase(c, config, responder));
  const passed = cases.filter((c) => c.status === "pass").length;
  const failed = cases.filter((c) => c.status === "fail").length;
  return {
    responder: { id: responder.id, name: responder.name },
    business_id: config.business_id,
    business_name: config.business_name,
    agent_id: opts.agentId ?? null,
    ran_at: (opts.now?.() ?? new Date()).toISOString(),
    passed,
    failed,
    skipped: cases.length - passed - failed,
    pass_rate: passed + failed ? passed / (passed + failed) : 0,
    latency_budget_ms: LATENCY_BUDGET_MS,
    cases,
  };
}
