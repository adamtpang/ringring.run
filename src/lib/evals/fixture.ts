import type { AgentRecord } from "../types";
import { stubDiagnoser } from "../diagnose";
import { createRun, executeRun } from "../pipeline";
import { fixtureScraper } from "../scraper";
import { createLocalStore } from "../store/local";

/**
 * Builds the demo business ("Example Plumbing Co", Austin TX) end to end in
 * memory with fixture data and the stub diagnoser. Nothing is persisted and no
 * network is used. Used by `pnpm eval` and as the /evals fallback.
 */
export async function fixtureAgent(name = "Example Plumbing Co", city = "Austin TX"): Promise<AgentRecord> {
  const deps = {
    store: createLocalStore({ file: null }),
    scraper: fixtureScraper(),
    diagnoser: stubDiagnoser(),
    mode: { scraper: "fixture", diagnoser: "stub", store: "local", llm_model: null } as const,
    retry: { baseDelayMs: 0, jitter: false },
  };
  const run = await createRun({ kind: "name", category: name, city, maxCount: 1 }, deps);
  await executeRun(run.id, deps);
  const [b] = await deps.store.listBusinesses({ runId: run.id });
  const agent = b ? await deps.store.getAgentForBusiness(b.id) : null;
  if (!agent) throw new Error("Fixture pipeline did not produce an agent");
  return agent;
}
