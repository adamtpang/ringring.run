import { validateFindings } from "./citations";
import { configured, llmConfig, runtimeMode } from "./env";
import { llmDiagnoser, stubDiagnoser, type Diagnoser } from "./diagnose";
import { errorMessage, withRetry, type RetryOptions } from "./retry";
import { computeMonthlyValue, defaultAssumptions, formulaFor, opportunityScore } from "./roi";
import { apifyScraper, fixtureScraper, type Scraper } from "./scraper";
import { dedupePlaces, normalizePlace } from "./scraper/normalize";
import { getStore, type Store } from "./store";
import type { Business, Run, RunMode, RunStep, ScanInput, StepStatus } from "./types";

// The scan pipeline. One run = scrape, store, then per business:
// diagnose -> validate citations -> ROI. A failing business is marked failed
// and logged; it never stops the run.

export interface PipelineDeps {
  store: Store;
  scraper: Scraper;
  diagnoser: Diagnoser;
  mode: RunMode;
  concurrency?: number;
  retry?: RetryOptions;
  log?: (line: string) => void;
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
          log?.(`  ${step.padEnd(9)} ${status.padEnd(5)} ${msg}`);
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
      log?.(`  ${step.padEnd(9)} ${status.padEnd(5)} ${message}`);
      await safe(() =>
        store.addStep({ run_id: runId, business_id: businessId, step, status, message, attempt: 1, duration_ms: 0 }),
      );
    },
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
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
}

export async function executeRun(runId: string, deps: PipelineDeps): Promise<RunSummary> {
  const { store, scraper, diagnoser, log } = deps;
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
  };

  const run = await store.getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  const input: ScanInput = { category: run.category, city: run.city, maxCount: run.max_count };
  await store.updateRun(runId, { status: "running", started_at: new Date().toISOString() });

  try {
    // 1. Scrape
    const scrapeStep = await steps.start(
      "scrape",
      scraper.mode === "apify"
        ? `Starting Apify Google Maps scrape: "${input.category}" in ${input.city}, up to ${input.maxCount}`
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
    const unique = dedupePlaces(items).slice(0, input.maxCount);
    await scrapeStep.update("ok", `Scraped ${unique.length} places`);

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
        businesses.push(b);
      } catch (e) {
        await steps.event("store", "warn", `Could not save "${item.title ?? "unknown"}": ${errorMessage(e)}`);
      }
    }
    summary.businessCount = businesses.length;
    await store.updateRun(runId, { business_count: businesses.length });
    await storeStep.update("ok", `Saved ${businesses.length} businesses`);

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
        ? `Ranked ${ranked.length} businesses. Top: ${top.name} (est. $${top.est_monthly_value.toLocaleString("en-US")}/mo)`
        : `Ranked ${ranked.length} businesses`,
    );

    summary.status = summary.failedCount > 0 ? "completed_with_errors" : "completed";
    await store.updateRun(runId, {
      status: summary.status,
      finished_at: new Date().toISOString(),
      error: summary.failedCount > 0 ? `${summary.failedCount} business(es) failed diagnosis` : null,
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

    const dStep = await steps.start(
      "diagnose",
      diagnoser.mode === "llm"
        ? `${b.name}: asking ${diagnoser.model} with ${reviews.length} reviews`
        : `${b.name}: demo keyword diagnoser on ${reviews.length} reviews`,
      b.id,
    );
    let result;
    try {
      result = await withRetry(() => diagnoser.diagnose(b, reviews), {
        ...retry,
        onRetry: ({ attempt, error, delayMs }) =>
          dStep.update("retry", `${b.name}: attempt ${attempt} failed (${errorMessage(error)}). Retrying in ${delayMs} ms`, attempt + 1),
      });
    } catch (e) {
      const msg = errorMessage(e);
      await dStep.update("error", `${b.name}: diagnosis failed after retries: ${msg}`);
      await store.updateBusiness(b.id, { diagnosis_status: "failed", diagnosis_error: msg });
      return false;
    }
    await dStep.update("ok", `${b.name}: ${plural(result.diagnosis.findings.length, "candidate finding")}`);

    const { kept, dropped } = validateFindings(result.diagnosis, b, reviews, result.aliasMap);
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

    let total = 0;
    for (const f of kept) {
      const finding = await store.insertFinding({ ...f, business_id: b.id, run_id: run.id });
      const assumptions = defaultAssumptions(f.kind, { ...b, searchCategory: run.category });
      const monthly = computeMonthlyValue(assumptions);
      total += monthly;
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
    return true;
  } catch (e) {
    const msg = errorMessage(e);
    await steps.event("diagnose", "error", `${b.name}: unexpected error: ${msg}`, b.id);
    await store.updateBusiness(b.id, { diagnosis_status: "failed", diagnosis_error: msg }).catch(() => undefined);
    return false;
  }
}

/** Recompute a business's totals from its ROI rows (after an edit). */
export async function recomputeBusinessTotals(store: Store, businessId: string) {
  const rows = await store.listRoi(businessId);
  const total = rows.reduce((s, r) => s + r.monthly_value, 0);
  await store.updateBusiness(businessId, { est_monthly_value: total, opportunity_score: opportunityScore(total) });
  return total;
}
