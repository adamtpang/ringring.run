import { FIXTURE_PLACES } from "../fixtures/google-places.fixture";
import { NonRetryableError, withRetry, type RetryOptions } from "../retry";
import type { ScanInput } from "../types";
import type { ApifyPlaceItem } from "./apify-types";

export interface Scraper {
  mode: "apify" | "fixture";
  scrape(input: ScanInput, hooks?: ScrapeHooks): Promise<ApifyPlaceItem[]>;
}

export interface ScrapeHooks {
  onProgress?: (message: string) => void | Promise<void>;
  retry?: RetryOptions;
}

export const APIFY_ACTOR_ID = "compass~crawler-google-places";
const APIFY_BASE = "https://api.apify.com/v2";

export function fixtureScraper(): Scraper {
  return {
    mode: "fixture",
    async scrape(input, hooks) {
      if (input.kind === "name") {
        const match = findFixtureByName(input.category);
        if (match) {
          await hooks?.onProgress?.(`Demo mode: found fictional fixture "${match.title}"`);
          return [structuredClone(match)];
        }
        await hooks?.onProgress?.(
          `Demo mode cannot look up real businesses. No fictional fixture matches "${input.category}", so this shows a fictional sample. Add APIFY_TOKEN for live lookups.`,
        );
        return FIXTURE_PLACES.slice(0, 1).map((p) => structuredClone(p));
      }
      await hooks?.onProgress?.(`Demo mode: loading ${FIXTURE_PLACES.length} fictional fixture places`);
      return FIXTURE_PLACES.slice(0, input.maxCount).map((p) => structuredClone(p));
    },
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function findFixtureByName(name: string): ApifyPlaceItem | null {
  const q = norm(name);
  if (!q) return null;
  return FIXTURE_PLACES.find((p) => norm(p.title ?? "").includes(q) || q.includes(norm(p.title ?? ""))) ?? null;
}

export function apifyInput(input: ScanInput) {
  const byName = input.kind === "name";
  return {
    // By name: the business name is the search string and we keep the top match.
    searchStringsArray: [input.category],
    locationQuery: input.city,
    maxCrawledPlacesPerSearch: byName ? 1 : input.maxCount,
    language: "en",
    maxReviews: Number(process.env.APIFY_MAX_REVIEWS || 20),
    reviewsSort: "newest",
    scrapeReviewsPersonalData: false,
    skipClosedPlaces: true,
    scrapePlaceDetailPage: false,
    maxImages: 0,
    scrapeContacts: false,
    maximumLeadsEnrichmentRecords: 0,
  };
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function apifyFetch(token: string, path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${APIFY_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    const err = new HttpError(res.status, `Apify ${res.status}: ${body}`);
    // Auth and validation errors will not fix themselves.
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
      throw new NonRetryableError(err.message);
    }
    throw err;
  }
  return res.json();
}

export interface ApifyRunResult {
  runId: string;
  items: ApifyPlaceItem[];
  /** Pay-per-event charges Apify recorded for the run, by event name (e.g. place-scraped). */
  chargedEventCounts: Record<string, number>;
  /** Apify's own usage figure for the run, when it reports one. */
  usageTotalUsd: number | null;
}

/** Start an actor run with any input, poll until it finishes, then fetch the dataset items and the run's charges. */
/** The run was never created, so nothing was charged. */
export class ApifyNotStartedError extends Error {}

/** Apify rejects a per-run maxTotalChargeUsd below this. */
export const APIFY_MIN_RUN_CAP_USD = 0.5;

export async function runApifyActor(
  token: string,
  input: Record<string, unknown>,
  opts: { pollMs?: number; timeoutSecs?: number; maxTotalChargeUsd?: number; onProgress?: (m: string) => void | Promise<void>; retry?: RetryOptions } = {},
): Promise<ApifyRunResult> {
  const pollMs = opts.pollMs ?? 5000;
  const timeoutSecs = opts.timeoutSecs ?? Number(process.env.APIFY_TIMEOUT_SECS || 600);
  const retry = { retries: 3, baseDelayMs: 1000, ...(opts.retry ?? {}) };
  // maxTotalChargeUsd makes Apify itself stop charging past the cap (pay-per-event actors).
  const cap = opts.maxTotalChargeUsd != null ? `&maxTotalChargeUsd=${Math.max(APIFY_MIN_RUN_CAP_USD, opts.maxTotalChargeUsd).toFixed(4)}` : "";
  let started: { data: { id: string; defaultDatasetId: string; status: string } };
  try {
    started = (await withRetry(
      () => apifyFetch(token, `/acts/${APIFY_ACTOR_ID}/runs?timeout=${timeoutSecs}${cap}`, { method: "POST", body: JSON.stringify(input) }),
      retry,
    )) as typeof started;
  } catch (e) {
    throw new ApifyNotStartedError((e as Error).message);
  }
  const runId = started.data.id;
  const datasetId = started.data.defaultDatasetId;
  await opts.onProgress?.(`Apify run ${runId} started`);

  const deadline = Date.now() + (timeoutSecs + 60) * 1000;
  let run: { status: string; chargedEventCounts?: Record<string, number>; usageTotalUsd?: number } = { status: started.data.status };
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
    if (Date.now() > deadline) throw new Error(`Apify run ${runId} did not finish in time`);
    await new Promise((r) => setTimeout(r, pollMs));
    run = ((await withRetry(() => apifyFetch(token, `/actor-runs/${runId}`), retry)) as { data: typeof run }).data;
    await opts.onProgress?.(`Apify run ${runId}: ${run.status}`);
  }
  if (run.status !== "SUCCEEDED") throw new NonRetryableError(`Apify run ${runId} ended with ${run.status}`);
  const items = (await withRetry(() => apifyFetch(token, `/datasets/${datasetId}/items?clean=true&format=json`), retry)) as ApifyPlaceItem[];
  // Charges can settle after SUCCEEDED (our first proof run read only the start event). Re-read until
  // every returned place shows up as charged, or the counts stop changing.
  const charged = (r: typeof run) => (r.chargedEventCounts?.["place-scraped"] ?? 0);
  for (let i = 0; i < 5 && (!run.chargedEventCounts || charged(run) < items.length); i++) {
    const before = JSON.stringify(run.chargedEventCounts ?? null);
    await new Promise((r) => setTimeout(r, Math.min(pollMs, 2000)));
    run = ((await withRetry(() => apifyFetch(token, `/actor-runs/${runId}`), retry)) as { data: typeof run }).data;
    if (i > 1 && JSON.stringify(run.chargedEventCounts ?? null) === before) break;
  }
  return { runId, items, chargedEventCounts: run.chargedEventCounts ?? {}, usageTotalUsd: typeof run.usageTotalUsd === "number" ? run.usageTotalUsd : null };
}

/** Start an actor run, poll until it finishes, then fetch the dataset items. */
export function apifyScraper(token: string, opts: { pollMs?: number; timeoutSecs?: number } = {}): Scraper {
  return {
    mode: "apify",
    async scrape(input, hooks) {
      const r = await runApifyActor(token, apifyInput(input), { ...opts, onProgress: hooks?.onProgress, retry: hooks?.retry });
      return r.items;
    },
  };
}
