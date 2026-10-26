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
      await hooks?.onProgress?.(`Demo mode: loading ${FIXTURE_PLACES.length} fictional fixture places`);
      return FIXTURE_PLACES.slice(0, input.maxCount).map((p) => structuredClone(p));
    },
  };
}

export function apifyInput(input: ScanInput) {
  return {
    searchStringsArray: [input.category],
    locationQuery: input.city,
    maxCrawledPlacesPerSearch: input.maxCount,
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

/** Start an actor run, poll until it finishes, then fetch the dataset items. */
export function apifyScraper(token: string, opts: { pollMs?: number; timeoutSecs?: number } = {}): Scraper {
  const pollMs = opts.pollMs ?? 5000;
  const timeoutSecs = opts.timeoutSecs ?? Number(process.env.APIFY_TIMEOUT_SECS || 600);
  return {
    mode: "apify",
    async scrape(input, hooks) {
      const retry = { retries: 3, baseDelayMs: 1000, ...(hooks?.retry ?? {}) };
      const started = (await withRetry(
        () =>
          apifyFetch(token, `/acts/${APIFY_ACTOR_ID}/runs?timeout=${timeoutSecs}`, {
            method: "POST",
            body: JSON.stringify(apifyInput(input)),
          }),
        retry,
      )) as { data: { id: string; defaultDatasetId: string; status: string } };
      const runId = started.data.id;
      const datasetId = started.data.defaultDatasetId;
      await hooks?.onProgress?.(`Apify run ${runId} started`);

      const deadline = Date.now() + (timeoutSecs + 60) * 1000;
      let status = started.data.status;
      while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
        if (Date.now() > deadline) throw new Error(`Apify run ${runId} did not finish in time`);
        await new Promise((r) => setTimeout(r, pollMs));
        const s = (await withRetry(() => apifyFetch(token, `/actor-runs/${runId}`), retry)) as {
          data: { status: string; stats?: { durationMillis?: number } };
        };
        status = s.data.status;
        await hooks?.onProgress?.(`Apify run ${runId}: ${status}`);
      }
      if (status !== "SUCCEEDED") throw new NonRetryableError(`Apify run ${runId} ended with ${status}`);

      const items = (await withRetry(
        () => apifyFetch(token, `/datasets/${datasetId}/items?clean=true&format=json`),
        retry,
      )) as ApifyPlaceItem[];
      return items;
    },
  };
}
