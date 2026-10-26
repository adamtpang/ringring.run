import { stubDiagnoser } from "@/lib/diagnose";
import { createRun, executeRun, type PipelineDeps } from "@/lib/pipeline";
import { fixtureScraper } from "@/lib/scraper";
import { createLocalStore } from "@/lib/store/local";

export function deps(): PipelineDeps {
  return {
    store: createLocalStore({ file: null }),
    scraper: fixtureScraper(),
    diagnoser: stubDiagnoser(),
    mode: { scraper: "fixture", diagnoser: "stub", store: "local", llm_model: null },
    retry: { baseDelayMs: 0, jitter: false },
  };
}

export async function exampleAgent() {
  const d = deps();
  const run = await createRun({ kind: "name", category: "Example Plumbing Co", city: "Austin TX", maxCount: 1 }, d);
  const summary = await executeRun(run.id, d);
  const [b] = await d.store.listBusinesses({ runId: run.id });
  const agent = await d.store.getAgentForBusiness(b!.id);
  return { d, run: await d.store.getRun(run.id), summary, agent: agent!, business: b! };
}

