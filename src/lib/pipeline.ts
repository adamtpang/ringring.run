import { validateFindings } from "./citations";
import { configured, llmConfig, runtimeMode } from "./env";
import { llmDiagnoser, stubDiagnoser, type Diagnoser } from "./diagnose";
import { errorMessage, withRetry, type RetryOptions } from "./retry";
import { businessMonthly, computeMonthlyValue, defaultAssumptions, formulaFor, opportunityScore } from "./roi";
import { apifyScraper, findFixtureByName, fixtureScraper, type Scraper } from "./scraper";
import { dedupePlaces, normalizePlace } from "./scraper/normalize";
import { getStore, type Store } from "./store";
import { listingKnowledge, websiteKnowledge } from "./knowledge";
import { readWebsite, type WebsiteReadResult } from "./website";
import { generateAgentConfig } from "./agent/generate";
import type { Business, Run, RunMode, RunStep, ScanInput, StepStatus, WebPage } from "./types";

// The scan pipeline. One run = scrape, dedupe, store, then per business:
// read website -> diagnose -> validate citations -> ROI -> phone agent config.
// A failing business is marked failed and logged; it never stops the run.
// Stopwatch: run.agent_ready_ms is the time from run created (business named)
// to the first agent config that passed validation.

export interface PipelineDeps {
  store: Store;
  scraper: Scraper;
  diagnoser: Diagnoser;
  mode: RunMode;
  concurrency?: number;
  retry?: RetryOptions;
  log?: (line: string) => void;
  /** Reads a business homepage. Defaults to fixture text for demo businesses and a real fetch otherwise. */
  readSite?: (b: Business) => Promise<WebsiteReadResult>;
}

/** Demo businesses never touch the network: their "homepage" is fictional fixture text. */
export async function fixtureSiteReader(b: Business): Promise<WebsiteReadResult> {
  const site = (b.raw as { fixtureWebsite?: { title: string; text: string } | { error: string } }).fixtureWebsite;
  const base = { url: b.website ?? "", final_url: b.website, http_status: null, title: null, text: "" };
  if (!b.website) return { ...base, final_url: null, status: "skipped", error: "No website on the listing" };
  if (!site) return { ...base, status: "skipped", error: "Demo mode: no fixture page for this business" };
  if ("error" in site) return { ...base, status: "failed", error: site.error };
  return { ...base, status: "ok", http_status: 200, title: site.title, text: site.text, error: null };
}

export function defaultSiteReader(b: Business): Promise<WebsiteReadResult> {
  return b.is_fixture ? fixtureSiteReader(b) : readWebsite(b.website, { timeoutMs: 8000 });
}

export function defaultDeps(): PipelineDeps {
  const mode = runtimeMode();
  const c = configured();
  return {
    store: getStore(),
    scraper: mode.scraper === "apify" && c.apify ? apifyScraper(process.env.APIFY_TOKEN as string) : fixtureScraper(),
    diagnoser: mode.diagnoser === "llm" ? llmDiagnoser() : stubDiagnoser(),
    mode: { ...mode, llm_model: mode.diagnoser === "llm" ? llmConfig().model : null },
  };
}

export async function createRun(input: ScanInput, deps: Pick<PipelineDeps, "store" | "mode">): Promise<Run> {
  return deps.store.createRun({
    search_kind: input.kind ?? "category",
    category: input.category,
    city: input.city,
    max_count: input.maxCount,
    status: "queued",
    mode: deps.mode,
    business_count: 0,
    diagnosed_count: 0,
    failed_count: 0,
    error: null,
    started_at: null,
    finished_at: null,
    agent_ready_at: null,
    agent_ready_ms: null,
  });
}

/** Step logger that never throws: a logging failure must not crash the run. */
function stepLogger(store: Store, runId: string, log?: (l: string) => void) {
  async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (e) {
      log?.(`[log-error] ${errorMessage(e)}`);
      return null;
    }
  }
  return {
    async start(step: string, message: string, businessId: string | null = null) {
      const t0 = Date.now();
      const row = await safe(() =>
        store.addStep({ run_id: runId, business_id: businessId, step, status: "running", message, attempt: 1, duration_ms: null }),
      );
      return {
        async update(status: StepStatus, msg: string, attempt?: number) {
          log?.(`  ${step.padEnd(9)} ${status.padEnd(7)} ${msg}`);
          if (row) {
            await safe(() =>
              store.updateStep(row.id, {
                status,
                message: msg,
                ...(attempt ? { attempt } : {}),
                ...(status === "running" || status === "retry" ? {} : { duration_ms: Date.now() - t0 }),
              } as Partial<RunStep>),
            );
          }
        },
      };
    },
    async event(step: string, status: StepStatus, message: string, businessId: string | null = null) {
      log?.(`  ${step.padEnd(9)} ${status.padEnd(7)} ${message}`);
      await safe(() =>
        store.addStep({ run_id: runId, business_id: businessId, step, status, message, attempt: 1, duration_ms: 0 }),
      );
    },
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : /s$/.test(word) ? "es" : "s"}`;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
}

export interface RunSummary {
  runId: string;
  status: Run["status"];
  businessCount: number;
  diagnosedCount: number;
  failedCount: number;
  droppedFindings: number;
  findingCount: number;
  agentsReady: number;
  /** Stopwatch: ms from run created to the first agent ready. */
  agentReadyMs: number | null;
}

export async function executeRun(runId: string, deps: PipelineDeps): Promise<RunSummary> {
  const { store, scraper, log } = deps;
  const steps = stepLogger(store, runId, log);
  const retry: RetryOptions = { retries: 2, baseDelayMs: 800, ...(deps.retry ?? {}) };
  const summary: RunSummary = {
    runId,
    status: "running",
    businessCount: 0,
    diagnosedCount: 0,
    failedCount: 0,
    droppedFindings: 0,
    findingCount: 0,
    agentsReady: 0,
    agentReadyMs: null,
  };

  const run = await store.getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  const input: ScanInput = { kind: run.search_kind ?? "category", category: run.category, city: run.city, maxCount: run.max_count };
  const byName = input.kind === "name";
  await store.updateRun(runId, { status: "running", started_at: new Date().toISOString() });

  try {
    // 1. Scrape
    const scrapeStep = await steps.start(
      "scrape",
      scraper.mode === "apify"
        ? byName
          ? `Looking up "${input.category}" in ${input.city} on Google Maps via Apify`
          : `Starting Apify Google Maps scrape: "${input.category}" in ${input.city}, up to ${input.maxCount}`
        : byName
          ? `Demo mode: looking up "${input.category}" in ${input.city} among fictional fixtures`
          : `Demo mode: loading fictional fixture places for "${input.category}" in ${input.city}`,
    );
    let items;
    try {
      items = await withRetry(
        () => scraper.scrape(input, { onProgress: (m) => scrapeStep.update("running", m), retry }),
        {
          ...retry,
          // Apify HTTP calls retry inside the scraper; do not restart a paid actor run.
          retries: scraper.mode === "apify" ? 0 : retry.retries,
          onRetry: ({ attempt, error, delayMs }) =>
            scrapeStep.update("retry", `Attempt ${attempt} failed: ${errorMessage(error)}. Retrying in ${delayMs} ms`, attempt + 1),
        },
      );
    } catch (e) {
      await scrapeStep.update("error", `Scrape failed: ${errorMessage(e)}`);
      throw e;
    }
    if (byName && scraper.mode === "fixture" && !findFixtureByName(input.category)) {
      await steps.event(
        "scrape",
        "warn",
        `Demo mode cannot look up real businesses. No fictional fixture matches "${input.category}", so this run shows a fictional sample instead.`,
      );
    }
    const unique = dedupePlaces(items).slice(0, input.maxCount);
    const dupes = items.length - dedupePlaces(items).length;
    await scrapeStep.update(
      unique.length ? "ok" : "warn",
      unique.length
        ? `Scraped ${plural(unique.length, "place")}${dupes ? `, removed ${plural(dupes, "duplicate")} by Google place id` : ""}`
        : byName
          ? `No Google Maps match for "${input.category}" in ${input.city}`
          : "No places found",
    );

    // 2. Store
    const storeStep = await steps.start("store", `Saving ${unique.length} businesses and their reviews`);
    const businesses: Business[] = [];
    for (const item of unique) {
      try {
        const norm = normalizePlace(item);
        if (!norm) {
          await steps.event("store", "warn", `Skipped an item without a name or place id`);
          continue;
        }
        const b = await store.insertBusiness({ ...norm.business, run_id: runId });
        await store.insertReviews(norm.reviews.map((r) => ({ ...r, business_id: b.id })));
        await store.insertKnowledgeFacts(listingKnowledge(b).map((k) => ({ ...k, business_id: b.id })));
        businesses.push(b);
      } catch (e) {
        await steps.event("store", "warn", `Could not save "${item.title ?? "unknown"}": ${errorMessage(e)}`);
      }
    }
    summary.businessCount = businesses.length;
    await store.updateRun(runId, { business_count: businesses.length });
    await storeStep.update("ok", `Saved ${plural(businesses.length, "business")}`);

    // 3. Per business: diagnose, validate, ROI
    await mapLimit(businesses, deps.concurrency ?? 3, async (b) => {
      const ok = await processBusiness(b, run, deps, steps, retry, summary);
      if (ok) summary.diagnosedCount++;
      else summary.failedCount++;
      await store
        .updateRun(runId, { diagnosed_count: summary.diagnosedCount, failed_count: summary.failedCount })
        .catch(() => undefined);
    });

    // 4. Rank
    const ranked = await store.listBusinesses({ runId });
    const top = ranked[0];
    await steps.event(
      "rank",
      "ok",
      top && top.est_monthly_value > 0
        ? `Ranked ${plural(ranked.length, "business")}. Top: ${top.name} (est. $${top.est_monthly_value.toLocaleString("en-US")}/mo)`
        : `Ranked ${plural(ranked.length, "business")}`,
    );

    summary.status = summary.failedCount > 0 ? "completed_with_errors" : "completed";
    await store.updateRun(runId, {
      status: summary.status,
      finished_at: new Date().toISOString(),
      error: summary.failedCount > 0 ? `${plural(summary.failedCount, "business")} failed diagnosis` : null,
    });
  } catch (e) {
    summary.status = "failed";
    await store
      .updateRun(runId, { status: "failed", error: errorMessage(e), finished_at: new Date().toISOString() })
      .catch(() => undefined);
  }
  return summary;
}

async function processBusiness(
  b: Business,
  run: Run,
  deps: PipelineDeps,
  steps: ReturnType<typeof stepLogger>,
  retry: RetryOptions,
  summary: RunSummary,
): Promise<boolean> {
  const { store, diagnoser } = deps;
  try {
    await store.updateBusiness(b.id, { diagnosis_status: "running" });
    const reviews = await store.listReviews(b.id);
    const pages = await readSiteStep(b, deps, steps);

    const dStep = await steps.start(
      "diagnose",
      diagnoser.mode === "llm"
        ? `${b.name}: asking ${diagnoser.model} with ${plural(reviews.length, "review")}${pages.some((p) => p.status === "ok") ? " and website text" : ""}`
        : `${b.name}: demo keyword diagnoser on ${plural(reviews.length, "review")}${pages.some((p) => p.status === "ok") ? " and website text" : ""}`,
      b.id,
    );
    let result;
    try {
      result = await withRetry(() => diagnoser.diagnose(b, reviews, pages), {
        ...retry,
        onRetry: ({ attempt, error, delayMs }) =>
          dStep.update("retry", `${b.name}: attempt ${attempt} failed (${errorMessage(error)}). Retrying in ${delayMs} ms`, attempt + 1),
      });
    } catch (e) {
      const msg = errorMessage(e);
      await dStep.update("error", `${b.name}: diagnosis failed after retries: ${msg}`);
      await store.updateBusiness(b.id, { diagnosis_status: "failed", diagnosis_error: msg });
      // The agent only needs stored facts, so it is still built when diagnosis fails.
      await agentStep(b, run, [], deps, steps, summary);
      return false;
    }
    await dStep.update("ok", `${b.name}: ${plural(result.diagnosis.findings.length, "candidate finding")}`);

    const { kept, dropped } = validateFindings(result.diagnosis, b, reviews, result.aliasMap, pages);
    for (const d of dropped) {
      await steps.event("validate", "warn", `${b.name}: dropped "${d.title}" (${d.kind}): ${d.reason}`, b.id);
    }
    summary.droppedFindings += dropped.length;
    await steps.event(
      "validate",
      "ok",
      `${b.name}: ${plural(kept.length, "finding")} passed citation checks, ${dropped.length} dropped`,
      b.id,
    );

    const priced: { kind: string; monthly: number }[] = [];
    const builtFor: { kind: string; title: string }[] = [];
    for (const f of kept) {
      builtFor.push({ kind: f.kind, title: f.title });
      const finding = await store.insertFinding({ ...f, business_id: b.id, run_id: run.id });
      const assumptions = defaultAssumptions(f.kind, { ...b, searchCategory: byNameRun(run) ? undefined : run.category });
      const monthly = computeMonthlyValue(assumptions);
      priced.push({ kind: f.kind, monthly });
      await store.insertRoi({
        finding_id: finding.id,
        business_id: b.id,
        assumptions,
        formula: formulaFor(assumptions),
        monthly_value: monthly,
        is_edited: false,
      });
    }
    summary.findingCount += kept.length;
    // Overlapping problems (e.g. missed calls and slow replies) are counted once.
    const total = businessMonthly(priced);
    await store.updateBusiness(b.id, {
      diagnosis_status: "ok",
      diagnosis_summary: result.diagnosis.summary,
      diagnosis_error: null,
      est_monthly_value: total,
      opportunity_score: opportunityScore(total),
    });
    await steps.event(
      "roi",
      "ok",
      `${b.name}: est. $${total.toLocaleString("en-US")}/mo across ${plural(kept.length, "finding")} (editable assumptions)`,
      b.id,
    );
    await agentStep(b, run, builtFor, deps, steps, summary);
    return true;
  } catch (e) {
    const msg = errorMessage(e);
    await steps.event("diagnose", "error", `${b.name}: unexpected error: ${msg}`, b.id);
    await store.updateBusiness(b.id, { diagnosis_status: "failed", diagnosis_error: msg }).catch(() => undefined);
    return false;
  }
}

const byNameRun = (run: Run) => run.search_kind === "name";

/** Build and store the phone agent config. Never throws. Updates the run stopwatch on the first success. */
async function agentStep(
  b: Business,
  run: Run,
  builtFor: { kind: string; title: string }[],
  deps: PipelineDeps,
  steps: ReturnType<typeof stepLogger>,
  summary: RunSummary,
) {
  const { store } = deps;
  const step = await steps.start("agent", `${b.name}: building phone agent from stored facts`, b.id);
  try {
    const [facts, reviews] = await Promise.all([store.listKnowledgeFacts(b.id), store.listReviews(b.id)]);
    const config = generateAgentConfig({ business: b, facts, reviews, findings: builtFor });
    const readyAt = new Date();
    const readyMs = readyAt.getTime() - Date.parse(run.created_at);
    await store.insertAgent({
      business_id: b.id,
      run_id: run.id,
      status: "ready",
      config,
      ready_ms: readyMs,
      provider: null,
      external_agent_id: null,
      deploy_message: null,
    });
    summary.agentsReady++;
    if (summary.agentReadyMs === null) {
      summary.agentReadyMs = readyMs;
      await store.updateRun(run.id, { agent_ready_ms: readyMs, agent_ready_at: readyAt.toISOString() }).catch(() => undefined);
    }
    await step.update("ok", `${b.name}: agent ready with ${plural(config.knowledge.length, "cited fact")} (${(readyMs / 1000).toFixed(1)} s since the run started)`);
  } catch (e) {
    await step.update("warn", `${b.name}: agent not built: ${errorMessage(e)}`);
  }
}

/** Read website step. Never throws: a failed read is logged and the business continues with reviews and listing data. */
async function readSiteStep(b: Business, deps: PipelineDeps, steps: ReturnType<typeof stepLogger>): Promise<WebPage[]> {
  const { store } = deps;
  if (!b.website) {
    await steps.event("website", "skipped", `${b.name}: no website on the listing`, b.id);
    return [];
  }
  const step = await steps.start("website", `${b.name}: reading ${b.website}`, b.id);
  try {
    const r = await (deps.readSite ?? defaultSiteReader)(b);
    const page = await store.insertWebPage({
      business_id: b.id,
      url: r.url || b.website,
      final_url: r.final_url,
      status: r.status,
      http_status: r.http_status,
      title: r.title,
      text: r.text,
      error: r.error,
    });
    if (r.status === "ok") {
      const facts = websiteKnowledge(page);
      if (facts.length) await store.insertKnowledgeFacts(facts.map((k) => ({ ...k, business_id: b.id })));
      await step.update("ok", `${b.name}: read ${r.text.length.toLocaleString("en-US")} characters of homepage text`);
    } else {
      await step.update(r.status === "skipped" ? "skipped" : "warn", `${b.name}: website not read (${r.error}). Continuing with reviews and listing`);
    }
    return [page];
  } catch (e) {
    await step.update("warn", `${b.name}: website not read (${errorMessage(e)}). Continuing with reviews and listing`);
    return [];
  }
}

/** Recompute a business's totals from its ROI rows (after an edit). */
export async function recomputeBusinessTotals(store: Store, businessId: string) {
  const [rows, findings] = await Promise.all([store.listRoi(businessId), store.listFindings(businessId)]);
  const kindOf = new Map(findings.map((f) => [f.id, f.kind]));
  const total = businessMonthly(rows.map((r) => ({ kind: kindOf.get(r.finding_id) ?? r.finding_id, monthly: r.monthly_value })));
  await store.updateBusiness(businessId, { est_monthly_value: total, opportunity_score: opportunityScore(total) });
  return total;
}
