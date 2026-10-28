import type { AgentRecord, Business } from "../types";
import { stubDiagnoser } from "../diagnose";
import { createRun, executeRun } from "../pipeline";
import { fixtureScraper } from "../scraper";
import { createLocalStore } from "../store/local";
import type { Store } from "../store/types";

export interface FixtureRun {
  store: Store;
  runId: string;
  business: Business;
  agent: AgentRecord;
}

/**
 * Runs the full pipeline for the demo business ("Example Plumbing Co", Austin TX)
 * in memory with fixture data and the stub diagnoser. Nothing is persisted and
 * no network is used. The returned store holds the run's steps, findings, ROI
 * and knowledge facts.
 */
export async function fixtureRun(name = "Example Plumbing Co", city = "Austin TX"): Promise<FixtureRun> {
  const deps = {
    store: createLocalStore({ file: null }),
    scraper: fixtureScraper(),
    diagnoser: stubDiagnoser(),
    mode: { scraper: "fixture", diagnoser: "stub", store: "local", llm_model: null } as const,
    retry: { baseDelayMs: 0, jitter: false },
  };
  const run = await createRun({ kind: "name", category: name, city, maxCount: 1 }, deps);
  await executeRun(run.id, deps);
  const [business] = await deps.store.listBusinesses({ runId: run.id });
  const agent = business ? await deps.store.getAgentForBusiness(business.id) : null;
  if (!business || !agent) throw new Error("Fixture pipeline did not produce an agent");
  return { store: deps.store, runId: run.id, business, agent };
}

/** The demo business's agent. Used by `pnpm eval` and as the /evals fallback. */
export async function fixtureAgent(name = "Example Plumbing Co", city = "Austin TX"): Promise<AgentRecord> {
  return (await fixtureRun(name, city)).agent;
}
