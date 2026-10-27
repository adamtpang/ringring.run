// Weekly check-in decisions. Pure functions only: no network, no store.
// Pay only for what changed: a light rating + count check every week, new
// reviews only when the count went up, and one deeper refresh a month.

import { isNegative, OWNER_ONLY_PATTERNS, replyStats } from "../gameplan";
import { ALLEGATION_RE } from "../allegations";
import type { Checkin, CheckinKind, CheckinReview, CheckinSnapshot } from "../types";

/** Apify pay-per-event prices for compass~crawler-google-places (read from the actor's pricing, Oct 2026), plus our classifier estimate. */
export const PRICES = {
  actorStart: 0.00005,
  place: 0.004,
  /** Add-on Apify charges when places are looked up directly by place ID. */
  placeDetails: 0.002,
  review: 0.0005,
  /** Estimated LLM cost to classify one review. */
  classify: 0.0007,
} as const;

/** Apify event names mapped to the price we pay for each. */
export const EVENT_PRICES: Record<string, number> = {
  "apify-actor-start": PRICES.actorStart,
  "place-scraped": PRICES.place,
  "place-details-scraped": PRICES.placeDetails,
  "review-scraped": PRICES.review,
  "filter-applied": 0.001,
  "contact-details-scraped": 0.002,
  "image-scraped": 0.0005,
};

/** Apify charges the start event per GB of run memory; our proof run (Oct 26, 2026) logged 4. */
export const ACTOR_START_EVENTS = 4;

export const MAX_NEW_REVIEWS = 10;
export const DEEP_REVIEWS = 20;
export const DEFAULT_MONTHLY_BUDGET_USD = 1;
const TZ = "America/Chicago";

export function monthlyBudget(env: Record<string, string | undefined> = process.env): number {
  const v = Number(env.CHECKIN_MONTHLY_BUDGET_USD);
  return Number.isFinite(v) && v >= 0 && env.CHECKIN_MONTHLY_BUDGET_USD?.trim() ? v : DEFAULT_MONTHLY_BUDGET_USD;
}

const round = (x: number) => Math.round(x * 1e5) / 1e5;

/** Estimated cost of one check-in run. places: how many places share the run (one actor start). */
export function estimateCost(kind: Exclude<CheckinKind, "baseline">, o: { places?: number; reviews?: number; llm?: boolean } = {}): number {
  const places = o.places ?? 1;
  const perPlace = PRICES.place + PRICES.placeDetails;
  const classify = o.llm ? PRICES.classify : 0;
  const start = PRICES.actorStart * ACTOR_START_EVENTS;
  if (kind === "light") return round(start + places * perPlace);
  const n = kind === "deep" ? (o.reviews ?? DEEP_REVIEWS) : Math.min(o.reviews ?? MAX_NEW_REVIEWS, MAX_NEW_REVIEWS);
  return round(start + places * (perPlace + n * (PRICES.review + classify)));
}

/** Actual Apify cost from the run's charged events. Unknown events are returned so they can be logged. */
export function costFromEvents(counts: Record<string, number>): { usd: number; unknown: string[] } {
  let usd = 0;
  const unknown: string[] = [];
  for (const [k, n] of Object.entries(counts)) {
    if (!n) continue;
    const p = EVENT_PRICES[k];
    if (p == null) unknown.push(k);
    else usd += p * n;
  }
  return { usd: round(usd), unknown };
}

// ---------- time (Central Time) ----------

function ctParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, min: Number(p.minute) };
}

/** "2026-10" for the Central Time month of d. */
export function ctMonth(d: Date): string {
  const p = ctParts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}`;
}

/** UTC instant of midnight Central Time on the first of d's CT month. */
export function ctMonthStart(d: Date): Date {
  const { y, m } = ctParts(d);
  // Midnight CT is 05:00 or 06:00 UTC; try both and keep the one that reads as day 1, 00:00 CT.
  for (const h of [5, 6]) {
    const t = new Date(Date.UTC(y, m - 1, 1, h));
    const p = ctParts(t);
    if (p.d === 1 && p.h === 0) return t;
  }
  return new Date(Date.UTC(y, m - 1, 1, 6));
}

/** The cron runs Mondays at 15:00 UTC (9 AM CST, 10 AM CDT). The next run strictly after now. */
export const CRON_SCHEDULE = "0 15 * * 1";
export function nextCheckinDate(now: Date): Date {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 15));
  const add = (1 - t.getUTCDay() + 7) % 7;
  t.setUTCDate(t.getUTCDate() + add);
  if (t <= now) t.setUTCDate(t.getUTCDate() + 7);
  return t;
}

// ---------- budget ----------

/** What check-ins already cost this CT month: actual where known, else the estimate. */
export function monthSpend(checkins: Pick<Checkin, "started_at" | "est_cost_usd" | "actual_cost_usd" | "status">[], now: Date): number {
  const month = ctMonth(now);
  return round(
    checkins
      .filter((c) => c.status !== "skipped_budget" && ctMonth(new Date(c.started_at)) === month)
      .reduce((s, c) => s + (c.actual_cost_usd ?? c.est_cost_usd), 0),
  );
}

export function withinBudget(spent: number, estimate: number, cap: number): boolean {
  return spent + estimate <= cap + 1e-9;
}

// ---------- cadence ----------

export type Cadence = "deep" | "light";

/** Deep on the first check-in of each CT month (no successful deep yet this month), else light. */
export function decideCadence(placeCheckins: Pick<Checkin, "kind" | "status" | "started_at">[], now: Date, opts: { lightOnly?: boolean } = {}): Cadence {
  if (opts.lightOnly) return "light";
  const month = ctMonth(now);
  const hadDeep = placeCheckins.some((c) => c.kind === "deep" && c.status === "ok" && ctMonth(new Date(c.started_at)) === month);
  return hadDeep ? "light" : "deep";
}

export type AfterLight = { action: "none"; reason: string } | { action: "fetch_new"; delta: number; fetch: number };

/** After a light check: fetch new reviews only when the count went up, capped. */
export function afterLight(prevCount: number | null, count: number | null): AfterLight {
  if (count == null) return { action: "none", reason: "The listing did not report a review count." };
  if (prevCount == null) return { action: "none", reason: "No earlier count to compare with." };
  if (count < prevCount) return { action: "none", reason: `Review count fell from ${prevCount} to ${count} (Google removes some reviews); nothing new to read.` };
  if (count === prevCount) return { action: "none", reason: "No new reviews." };
  const delta = count - prevCount;
  return { action: "fetch_new", delta, fetch: Math.min(delta, MAX_NEW_REVIEWS) };
}

// ---------- snapshots and diffs ----------

export const SNAPSHOT_FIELDS = [
  { key: "rating", label: "Google rating" },
  { key: "review_count", label: "Google reviews" },
  { key: "reply_rate", label: "Owner reply rate (reviews read)" },
  { key: "neg_reply_rate", label: "Reply rate to 1-2 star reviews (reviews read)" },
] as const;
export type SnapshotField = (typeof SNAPSHOT_FIELDS)[number]["key"];

export interface Change {
  field: SnapshotField | `complaints:${string}`;
  label: string;
  before: number;
  after: number;
  delta: number;
}

type Snap = Pick<CheckinSnapshot, SnapshotField | "complaint_counts" | "reply_sample" | "neg_sample">;

/** Changes between two snapshots, only for fields measured in both. Never invents a change from a missing value. */
export function diffSnapshots(prev: Snap, cur: Snap): Change[] {
  const out: Change[] = [];
  for (const f of SNAPSHOT_FIELDS) {
    const a = prev[f.key];
    const b = cur[f.key];
    if (a == null || b == null) continue;
    // Rates from different sample sizes under 5 are not comparable.
    if (f.key === "neg_reply_rate" && ((prev.neg_sample ?? 0) < 5 || (cur.neg_sample ?? 0) < 5)) continue;
    if (f.key === "reply_rate" && ((prev.reply_sample ?? 0) < 5 || (cur.reply_sample ?? 0) < 5)) continue;
    if (Math.abs(b - a) > 1e-9) out.push({ field: f.key, label: f.label, before: a, after: b, delta: round(b - a) });
  }
  if (prev.complaint_counts && cur.complaint_counts) {
    for (const k of new Set([...Object.keys(prev.complaint_counts), ...Object.keys(cur.complaint_counts)])) {
      const a = prev.complaint_counts[k] ?? 0;
      const b = cur.complaint_counts[k] ?? 0;
      if (a !== b) out.push({ field: `complaints:${k}`, label: `Reviews read mentioning ${k.replace(/_/g, " ")}`, before: a, after: b, delta: b - a });
    }
  }
  return out;
}

/** Latest earlier snapshot that measured a field. Snapshots newest first. */
export function lastMeasured<K extends keyof CheckinSnapshot>(snaps: CheckinSnapshot[], key: K): CheckinSnapshot | null {
  return snaps.find((s) => s[key] != null) ?? null;
}

// ---------- classifying reviews ----------

/** Reach complaints: the customer could not get through or waited too long for a reply. */
export const REACH_PATTERNS: Record<"missed_calls" | "slow_response", RegExp> = {
  missed_calls: /\b(no one|nobody|never) (answer|answered|picks? up|picked up)\b|\bno answer\b|\bvoice ?mail\b|\bcould(n'?t| not) (reach|get (a hold|ahold|through))\b|\bnever (called|call) (me )?back\b|\bdid(n'?t| not) (call|get back)\b/i,
  slow_response: /\b(took|waited|waiting) (\w+ ){0,2}(days|weeks|forever) (to|for)\b|\bslow to (respond|reply|answer)\b|\bnever (responded|replied|heard back)\b|\bno (response|reply)\b/i,
};

export type ComplaintKind = keyof typeof REACH_PATTERNS | keyof typeof OWNER_ONLY_PATTERNS;

/** Deterministic fallback classifier, free. */
export function classifyByRules(text: string): ComplaintKind[] {
  const out: ComplaintKind[] = [];
  for (const [k, re] of Object.entries({ ...REACH_PATTERNS, ...OWNER_ONLY_PATTERNS }) as [ComplaintKind, RegExp][]) if (re.test(text)) out.push(k);
  return out;
}

export function complaintCounts(labels: string[][]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ks of labels) for (const k of new Set(ks)) out[k] = (out[k] ?? 0) + 1;
  return out;
}

/** Reply figures for a snapshot from the reviews read, using the same rules as the scorecard. */
export function replyFields(reviews: { rating: number | null; owner_response: string | null; text: string }[]) {
  const rs = replyStats(reviews);
  return {
    reply_rate: rs.read ? round(rs.replied / rs.read) : null,
    reply_sample: rs.read,
    neg_reply_rate: rs.neg ? round(rs.negReplied / rs.neg) : null,
    neg_sample: rs.neg,
  };
}

// ---------- what to tell the owner ----------

export interface NewReviewLite {
  rating: number | null;
  text: string;
  published_at: string | null;
  owner_response: string | null;
}

/** The owner's one next step: answer a new unanswered 1-2 star review if there is one, else the plan's first owner step. */
export function ownerNextStep(newReviews: NewReviewLite[], planStep: string | null): string {
  const bad = newReviews
    .filter((r) => isNegative(r) && !r.owner_response?.trim())
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))[0];
  if (bad) {
    const d = bad.published_at ? ` from ${bad.published_at.slice(0, 10)}` : "";
    return `Reply to the new ${bad.rating}-star review${d}. Ringy can draft it for your OK.`;
  }
  return planStep ?? "Nothing new needs you this week.";
}

// ---------- "What changed this week" ----------

export type WeeklyView =
  | { state: "none"; tracked: boolean; next: Date | null }
  | { state: "first"; tracked: boolean; first: string; next: Date | null }
  | {
      state: "changes";
      tracked: boolean;
      since: string;
      latest: string;
      next: Date | null;
      changes: Change[];
      did: string[];
      newReviews: number;
      nextStep: string;
    };

const usd = (n: number) => `$${n.toFixed(n < 0.01 && n > 0 ? 4 : 2)}`;

/** One plain line for what a logged check-in did. */
export function describeCheckin(c: Pick<Checkin, "kind" | "status" | "est_cost_usd" | "actual_cost_usd">): string {
  const cost = c.actual_cost_usd ?? c.est_cost_usd;
  const paid = c.status === "skipped_budget" ? "" : ` (${c.actual_cost_usd != null ? "" : "est. "}${usd(cost)})`;
  if (c.status === "skipped_budget") return `Skipped the ${c.kind.replace("_", " ")} check: the monthly budget cap would have been exceeded.`;
  if (c.status === "error") return `Tried a ${c.kind.replace("_", " ")} check; it failed and will retry next week${paid}.`;
  switch (c.kind) {
    case "baseline":
      return "Recorded the starting point from the first scan (no new cost).";
    case "light":
      return c.status === "no_change" ? `Checked the rating and review count: no new reviews${paid}.` : c.status === "deferred" ? `Checked the rating and review count: new reviews found, not read yet${paid}.` : `Checked the rating and review count${paid}.`;
    case "new_reviews":
      return `Read and sorted the new reviews${paid}.`;
    case "deep":
      return `Monthly refresh of the full profile and a fresh review sample${paid}.`;
  }
}

/**
 * The diagnosis page's check-in section, from stored data only. One snapshot
 * means a starting point, never a change. Snapshots and check-ins newest first.
 */
export function weeklyView(opts: {
  snaps: CheckinSnapshot[];
  checkins: Checkin[];
  reviews: CheckinReview[];
  tracked: boolean;
  now: Date;
  planStep: string | null;
}): WeeklyView {
  const { snaps, tracked } = opts;
  const next = tracked ? nextCheckinDate(opts.now) : null;
  const [latest, ...earlier] = snaps;
  if (!latest) return { state: "none", tracked, next };
  if (!earlier[0]) return { state: "first", tracked, first: latest.taken_at, next };
  // Each field is compared with the last earlier snapshot that measured it.
  const changes: Change[] = [];
  for (const f of SNAPSHOT_FIELDS) {
    const prev = lastMeasured(earlier, f.key);
    if (!prev) continue;
    changes.push(...diffSnapshots({ ...EMPTY, [f.key]: prev[f.key], reply_sample: prev.reply_sample, neg_sample: prev.neg_sample }, { ...EMPTY, [f.key]: latest[f.key], reply_sample: latest.reply_sample, neg_sample: latest.neg_sample }));
  }
  if (latest.complaint_counts) {
    const prev = lastMeasured(earlier, "complaint_counts");
    if (prev) changes.push(...diffSnapshots({ ...EMPTY, complaint_counts: prev.complaint_counts }, { ...EMPTY, complaint_counts: latest.complaint_counts }));
  }
  const since = earlier[0].taken_at;
  const recent = opts.checkins.filter((c) => c.started_at > since);
  const ids = new Set(recent.map((c) => c.id));
  const fresh = opts.reviews.filter((r) => r.checkin_id && ids.has(r.checkin_id) && !ALLEGATION_RE.test(r.text));
  return {
    state: "changes",
    tracked,
    since,
    latest: latest.taken_at,
    next,
    changes,
    did: [...new Set(recent.slice().reverse().map(describeCheckin))],
    newReviews: fresh.length,
    nextStep: ownerNextStep(fresh, opts.planStep),
  };
}

const EMPTY: Snap = { rating: null, review_count: null, reply_rate: null, neg_reply_rate: null, complaint_counts: null, reply_sample: null, neg_sample: null };
