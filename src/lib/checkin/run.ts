// Runs weekly check-ins against the store. Network goes through a Checker
// (Apify or a free fixture) and a Classifier (LLM or free rules), so tests and
// demo mode never spend money. Every attempt is logged, including no-change
// runs ($0 or the light-check cost) and runs skipped by the budget cap.

import { ALLEGATION_RE } from "../allegations";
import { ApifyNotStartedError, runApifyActor } from "../scraper";
import type { ApifyPlaceItem, ApifyReviewItem } from "../scraper/apify-types";
import type { Store } from "../store/types";
import type { Business, Checkin, CheckinKind, CheckinSnapshot, CheckinStatus, CheckinTrigger } from "../types";
import {
  afterLight,
  classifyByRules,
  complaintCounts,
  costFromEvents,
  ctMonthStart,
  DEEP_REVIEWS,
  decideCadence,
  estimateCost,
  monthlyBudget,
  monthSpend,
  PRICES,
  replyFields,
  withinBudget,
  type ComplaintKind,
} from "./logic";

// ---------- checkers ----------

export interface PlaceResult {
  placeId: string;
  rating: number | null;
  reviewCount: number | null;
  reviews: ApifyReviewItem[];
}

export interface CheckResult {
  places: Map<string, PlaceResult>;
  runId: string | null;
  /** Actual cost of the whole run (from the run's charged events), or null when unknown. */
  costUsd: number | null;
  note?: string;
}

export interface Checker {
  mode: "apify" | "fixture";
  /** Rating and review count only, no reviews. One run for all places. */
  light(placeIds: string[]): Promise<CheckResult>;
  /** Newest reviews first, capped at max. */
  reviews(placeIds: string[], max: number): Promise<CheckResult>;
}

function toResults(items: ApifyPlaceItem[]): Map<string, PlaceResult> {
  const m = new Map<string, PlaceResult>();
  for (const it of items) {
    if (!it.placeId || m.has(it.placeId)) continue;
    m.set(it.placeId, {
      placeId: it.placeId,
      rating: typeof it.totalScore === "number" ? it.totalScore : null,
      reviewCount: typeof it.reviewsCount === "number" ? it.reviewsCount : null,
      reviews: it.reviews ?? [],
    });
  }
  return m;
}

export function placeInput(placeIds: string[], maxReviews: number) {
  return {
    placeIds,
    maxReviews,
    reviewsSort: "newest",
    language: "en",
    scrapeReviewsPersonalData: false,
    scrapePlaceDetailPage: false,
    maxImages: 0,
    scrapeContacts: false,
    maximumLeadsEnrichmentRecords: 0,
  };
}

export function apifyChecker(token: string, opts: { onProgress?: (m: string) => void; maxChargeUsd?: (placeCount: number, reviews: number) => number } = {}): Checker {
  async function go(placeIds: string[], maxReviews: number, cap: number): Promise<CheckResult> {
    const r = await runApifyActor(token, placeInput(placeIds, maxReviews), { pollMs: 3000, timeoutSecs: 240, maxTotalChargeUsd: cap, onProgress: opts.onProgress });
    const cost = costFromEvents(r.chargedEventCounts);
    return { places: toResults(r.items), runId: r.runId, costUsd: cost.usd, note: cost.unknown.length ? `Unpriced Apify events: ${cost.unknown.join(", ")}` : undefined };
  }
  return {
    mode: "apify",
    // Apify stops charging at maxTotalChargeUsd (it accepts no less than $0.50 a run). The real bound is the
    // input: maxReviews caps what a run can charge, and the monthly cap is checked before every run.
    light: (ids) => go(ids, 0, estimateCost("light", { places: ids.length }) * 1.5),
    reviews: (ids, max) => go(ids, max, estimateCost(max > 10 ? "deep" : "new_reviews", { places: ids.length, reviews: max }) * 1.5),
  };
}

/** Demo checker: reports what the store already knows (no change) and costs nothing. */
export function fixtureChecker(known: Map<string, { rating: number | null; reviewCount: number | null }>): Checker {
  const run = (ids: string[]): CheckResult => ({
    places: new Map(ids.flatMap((id) => (known.has(id) ? [[id, { placeId: id, rating: known.get(id)!.rating, reviewCount: known.get(id)!.reviewCount, reviews: [] }] as const] : []))),
    runId: null,
    costUsd: 0,
    note: "Demo mode: no Apify call, so nothing changed.",
  });
  return { mode: "fixture", light: async (ids) => run(ids), reviews: async (ids) => run(ids) };
}

// ---------- classifiers ----------

export interface Classifier {
  mode: "llm" | "rules";
  classify(texts: string[]): Promise<ComplaintKind[][]>;
}

export const rulesClassifier: Classifier = { mode: "rules", classify: async (t) => t.map(classifyByRules) };

// ---------- runner ----------

export interface Target {
  business: Business;
  /** Reviews stored with the scan, used for the free baseline snapshot. */
  reviews: { external_id: string | null; rating: number | null; owner_response: string | null; text: string; published_at: string | null }[];
}

export interface RunOptions {
  store: Store;
  checker: Checker;
  classifier?: Classifier;
  trigger: CheckinTrigger;
  targets: Target[];
  now?: Date;
  /** Monthly cap in USD for check-in spend. Defaults to CHECKIN_MONTHLY_BUDGET_USD or $1.00. */
  cap?: number;
  /** Record a count change but do not fetch the new reviews (the proof run). */
  lightOnly?: boolean;
  /** Stop starting new paid work after this time (ms epoch). */
  deadline?: number;
  log?: (m: string) => void;
}

export interface PlaceOutcome {
  placeId: string;
  name: string;
  kind: CheckinKind;
  status: CheckinStatus;
  estCostUsd: number;
  actualCostUsd: number | null;
  message: string;
}

export interface RunSummary {
  cap: number;
  spentBefore: number;
  spentAfter: number;
  outcomes: PlaceOutcome[];
}

const clean = (r: ApifyReviewItem) => ({
  external_id: r.reviewId ?? null,
  rating: r.stars ?? r.rating ?? null,
  text: (r.text ?? r.textTranslated ?? "").trim(),
  published_at: r.publishedAtDate ?? null,
  owner_response: r.responseFromOwnerText?.trim() || null,
});

export async function runCheckins(o: RunOptions): Promise<RunSummary> {
  const { store, checker, trigger } = o;
  const classifier = o.classifier ?? rulesClassifier;
  const llm = classifier.mode === "llm";
  const now = o.now ?? new Date();
  const cap = o.cap ?? monthlyBudget();
  const log = o.log ?? (() => {});
  const iso = () => (o.now ? now.toISOString() : new Date().toISOString());
  const past = () => o.deadline != null && Date.now() > o.deadline;

  const monthCheckins = await store.listCheckins({ since: ctMonthStart(now).toISOString() });
  const spentBefore = monthSpend(monthCheckins, now);
  let spent = spentBefore;
  const outcomes: PlaceOutcome[] = [];

  async function record(t: Target, kind: CheckinKind, status: CheckinStatus, est: number, actual: number | null, message: string, runId: string | null = null): Promise<Checkin> {
    const c = await store.insertCheckin({
      place_id: t.business.place_id,
      business_id: t.business.id,
      kind,
      trigger,
      status,
      est_cost_usd: est,
      actual_cost_usd: actual,
      apify_run_id: runId,
      message,
      started_at: iso(),
      finished_at: iso(),
    });
    outcomes.push({ placeId: t.business.place_id, name: t.business.name, kind, status, estCostUsd: est, actualCostUsd: actual, message });
    if (status !== "skipped_budget") spent += actual ?? est;
    log(`${t.business.name}: ${kind} ${status} (est $${est.toFixed(4)}${actual != null ? `, actual $${actual.toFixed(4)}` : ""}) ${message}`);
    return c;
  }

  async function snapshot(t: Target, checkin: Checkin | null, kind: CheckinKind, fields: Partial<CheckinSnapshot>) {
    await store.insertSnapshot({
      place_id: t.business.place_id,
      business_id: t.business.id,
      checkin_id: checkin?.id ?? null,
      kind,
      rating: null,
      review_count: null,
      reply_rate: null,
      reply_sample: null,
      neg_reply_rate: null,
      neg_sample: null,
      complaint_counts: null,
      new_reviews: 0,
      taken_at: iso(),
      ...fields,
    });
  }

  const usable = (rs: Target["reviews"]) => rs.filter((r) => r.text.length > 0 && !ALLEGATION_RE.test(r.text));

  async function storeNew(t: Target, checkin: Checkin, reviews: ApifyReviewItem[], given?: Map<string, ComplaintKind[]>) {
    const known = new Set([...t.reviews.map((r) => r.external_id), ...(await store.listCheckinReviews(t.business.place_id)).map((r) => r.external_id)].filter(Boolean));
    const fresh = reviews.map(clean).filter((r) => r.external_id && !known.has(r.external_id));
    // Allegation reviews are never classified, counted or quoted.
    const toClassify = fresh.filter((r) => r.text && !ALLEGATION_RE.test(r.text));
    const todo = given ? [] : toClassify;
    const labels = todo.length ? await classifier.classify(todo.map((r) => r.text)) : [];
    const byId = given ?? new Map(todo.map((r, i) => [r.external_id!, labels[i] ?? []]));
    const rows = await store.insertCheckinReviews(
      fresh.map((r) => ({
        place_id: t.business.place_id,
        checkin_id: checkin.id,
        external_id: r.external_id!,
        rating: r.rating,
        text: r.text,
        published_at: r.published_at,
        owner_response: r.owner_response,
        complaints: byId.get(r.external_id!) ?? [],
        classified_by: classifier.mode,
      })),
    );
    return { fresh: rows, classified: todo.length };
  }

  // 1. Free baseline from the scan, once per place.
  const prevCount = new Map<string, number | null>();
  const cadence = new Map<string, "deep" | "light">();
  for (const t of o.targets) {
    const snaps = await store.listSnapshots(t.business.place_id, 20);
    if (snaps.length === 0) {
      const rs = usable(t.reviews);
      const c = await record(t, "baseline", "ok", 0, 0, `Baseline from the scan of ${t.business.created_at.slice(0, 10)}, no new call.`);
      await snapshot(t, c, "baseline", {
        rating: t.business.rating,
        review_count: t.business.review_count,
        ...replyFields(rs),
        complaint_counts: complaintCounts(rs.map((r) => classifyByRules(r.text))),
        taken_at: t.business.created_at,
      });
      prevCount.set(t.business.place_id, t.business.review_count);
    } else {
      prevCount.set(t.business.place_id, snaps.find((s) => s.review_count != null)?.review_count ?? null);
    }
    const history = monthCheckins.filter((c) => c.place_id === t.business.place_id);
    cadence.set(t.business.place_id, decideCadence(history, now, { lightOnly: o.lightOnly }));
  }

  // 2. Deep refresh (first run of the CT month): full place plus a fresh capped review sample.
  const deep: Target[] = [];
  const light: Target[] = [];
  for (const t of o.targets) {
    if (cadence.get(t.business.place_id) === "deep") {
      const est = estimateCost("deep", { reviews: DEEP_REVIEWS, llm });
      if (withinBudget(spent + deep.length * est, est, cap)) deep.push(t);
      else light.push(t); // too dear this month: fall back to the light check
    } else light.push(t);
  }
  for (const t of deep) {
    const est = estimateCost("deep", { reviews: DEEP_REVIEWS, llm });
    if (past()) {
      await record(t, "deep", "error", 0, 0, "Stopped before the deadline; will retry next week.");
      continue;
    }
    if (!withinBudget(spent, est, cap)) {
      await record(t, "deep", "skipped_budget", est, 0, `Monthly cap $${cap.toFixed(2)} would be exceeded ($${spent.toFixed(4)} spent).`);
      continue;
    }
    try {
      const r = await checker.reviews([t.business.place_id], DEEP_REVIEWS);
      const p = r.places.get(t.business.place_id);
      if (!p) throw new Error("place not returned");
      const reviews = p.reviews.map(clean).filter((x) => x.text);
      const rs = usable(reviews);
      // Classify the sample once; new reviews reuse these labels.
      const labels = rs.length ? await classifier.classify(rs.map((x) => x.text)) : [];
      const actual = r.costUsd == null ? null : Math.round((r.costUsd + (llm ? rs.length * PRICES.classify : 0)) * 1e5) / 1e5;
      const c = await record(t, "deep", "ok", est, actual, `Monthly refresh: ${p.rating ?? "n/a"} stars, ${p.reviewCount ?? "n/a"} reviews, ${reviews.length} newest read.${r.note ? ` ${r.note}` : ""}`, r.runId);
      const given = new Map(rs.flatMap((x, i) => (x.external_id ? [[x.external_id, labels[i] ?? []] as const] : [])));
      const { fresh } = await storeNew(t, c, p.reviews, given);
      await snapshot(t, c, "deep", {
        rating: p.rating,
        review_count: p.reviewCount,
        ...replyFields(rs),
        complaint_counts: complaintCounts(labels),
        new_reviews: fresh.length,
      });
    } catch (e) {
      await record(t, "deep", "error", est, e instanceof ApifyNotStartedError ? 0 : null, `Deep refresh failed: ${(e as Error).message.replace(/\s+/g, " ").slice(0, 160)}`);
    }
  }

  // 3. Light check for the rest, batched into one run, only for places that fit the cap.
  const perPlace = estimateCost("light", { places: 1 });
  const fit: Target[] = [];
  for (const t of light) {
    if (withinBudget(spent, estimateCost("light", { places: fit.length + 1 }), cap)) fit.push(t);
    else await record(t, "light", "skipped_budget", perPlace, 0, `Monthly cap $${cap.toFixed(2)} would be exceeded ($${spent.toFixed(4)} spent).`);
  }
  if (fit.length && past()) {
    for (const t of fit) await record(t, "light", "error", 0, 0, "Stopped before the deadline; will retry next week.");
    fit.length = 0;
  }
  if (fit.length) {
    const batchEst = estimateCost("light", { places: fit.length });
    let r: CheckResult | null = null;
    let err: string | null = null;
    let notStarted = false;
    try {
      r = await checker.light(fit.map((t) => t.business.place_id));
    } catch (e) {
      err = (e as Error).message.replace(/\s+/g, " ").slice(0, 160);
      notStarted = e instanceof ApifyNotStartedError;
    }
    const share = (x: number | null) => (x == null ? null : Math.round((x / fit.length) * 1e5) / 1e5);
    for (const t of fit) {
      const est = Math.round((batchEst / fit.length) * 1e5) / 1e5;
      const p = r?.places.get(t.business.place_id);
      if (!r || !p) {
        // A run that never started cost nothing; otherwise count the estimate until the actual is known.
        await record(t, "light", "error", est, notStarted ? 0 : share(r?.costUsd ?? null), err ? `Light check failed${notStarted ? " (no run started, $0)" : ""}: ${err}` : "Place not returned by the light check.", r?.runId ?? null);
        continue;
      }
      const next = afterLight(prevCount.get(t.business.place_id) ?? null, p.reviewCount);
      const status: CheckinStatus = next.action === "none" ? "no_change" : o.lightOnly ? "deferred" : "ok";
      const msg =
        next.action === "none"
          ? `${p.rating ?? "n/a"} stars, ${p.reviewCount ?? "n/a"} reviews. ${next.reason}`
          : `${p.rating ?? "n/a"} stars, ${p.reviewCount} reviews: ${next.delta} new.${o.lightOnly ? " New reviews not fetched (light-only run)." : ""}`;
      const c = await record(t, "light", status, est, share(r.costUsd), `${msg}${r.note ? ` ${r.note}` : ""}`, r.runId);
      await snapshot(t, c, "light", { rating: p.rating, review_count: p.reviewCount });

      // 4. Only when the count went up: fetch just the new reviews, newest first, capped.
      if (next.action !== "fetch_new" || o.lightOnly) continue;
      const nEst = estimateCost("new_reviews", { reviews: next.fetch, llm });
      if (past()) {
        await record(t, "new_reviews", "error", 0, 0, "Stopped before the deadline; will fetch next week.");
        continue;
      }
      if (!withinBudget(spent, nEst, cap)) {
        await record(t, "new_reviews", "skipped_budget", nEst, 0, `Monthly cap $${cap.toFixed(2)} would be exceeded ($${spent.toFixed(4)} spent); ${next.delta} new reviews not read.`);
        continue;
      }
      try {
        const rr = await checker.reviews([t.business.place_id], next.fetch);
        const pp = rr.places.get(t.business.place_id);
        const nc = await record(t, "new_reviews", "ok", nEst, rr.costUsd, `Read the ${next.fetch} newest of ${next.delta} new reviews.${rr.note ? ` ${rr.note}` : ""}`, rr.runId);
        const { fresh, classified } = await storeNew(t, nc, pp?.reviews ?? []);
        // Classification cost is our estimate; Apify's part is the actual charge.
        if (llm && classified) {
          spent += classified * PRICES.classify;
          if (rr.costUsd != null) await store.updateCheckin(nc.id, { actual_cost_usd: Math.round((rr.costUsd + classified * PRICES.classify) * 1e5) / 1e5 });
        }
        await snapshot(t, nc, "new_reviews", { rating: pp?.rating ?? p.rating, review_count: pp?.reviewCount ?? p.reviewCount, new_reviews: fresh.length });
      } catch (e) {
        await record(t, "new_reviews", "error", nEst, e instanceof ApifyNotStartedError ? 0 : null, `New-review fetch failed: ${(e as Error).message.replace(/\s+/g, " ").slice(0, 160)}`);
      }
    }
  }

  return { cap, spentBefore, spentAfter: Math.round(spent * 1e5) / 1e5, outcomes };
}
