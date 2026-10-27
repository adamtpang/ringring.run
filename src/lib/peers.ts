// Peer benchmark: a transparent tier score (S/A/B/C/D) for a business among
// its local peers in the same industry. Pure functions; data in src/data/peers.json.
import peersJson from "@/data/peers.json";
import { ALLEGATION_RE } from "./allegations";
import type { FindingKind } from "./types";

export { ALLEGATION_RE };

export const INDUSTRIES = ["hvac_plumbing", "cafe", "music_shop", "restaurant", "dentist", "salon"] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const METRIC_KEYS = ["rating", "reviews", "reply", "complaints", "reach"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export interface MetricDef {
  key: MetricKey;
  label: string;
  /** Share of the score. Weights sum to 1. */
  weight: number;
  better: "higher" | "lower";
  how: string;
  /** Diagnosis problem kinds whose prescription moves this metric. */
  fixes: FindingKind[];
}

export const METRICS: MetricDef[] = [
  {
    key: "rating",
    label: "Google rating",
    weight: 0.3,
    better: "higher",
    how: `Stars on the Google listing, steadied for small review counts: (stars × reviews + group average × ${10}) ÷ (reviews + ${10}).`,
    fixes: [],
  },
  { key: "reviews", label: "Review count", weight: 0.2, better: "higher", how: "Total Google reviews on the listing.", fixes: [] },
  {
    key: "reply",
    label: "Replies to 1-2 star reviews",
    weight: 0.2,
    better: "higher",
    how: `Share of the 1-2 star reviews in our sample that have an owner reply. Needs at least ${2} such reviews.`,
    fixes: ["unanswered_reviews"],
  },
  {
    key: "complaints",
    label: "Reviews with a complaint",
    weight: 0.15,
    better: "lower",
    how: "Share of sampled reviews with text that contain a complaint.",
    fixes: [],
  },
  {
    key: "reach",
    label: "Hard-to-reach complaints",
    weight: 0.15,
    better: "lower",
    how: "Share of sampled reviews with text that complain about unanswered phones, no callback, or poor follow-up.",
    fixes: ["missed_calls", "slow_response"],
  },
];

export const MIN_PEERS = 5;
/** Reviews of weight given to the group's average rating, so 3 five-star reviews don't outrank 300 at 4.9. */
export const RATING_PRIOR_REVIEWS = 10;
export const MIN_NEGATIVE_FOR_REPLY = 2;

export const TIERS = [
  { tier: "S", min: 80 },
  { tier: "A", min: 65 },
  { tier: "B", min: 50 },
  { tier: "C", min: 35 },
  { tier: "D", min: 0 },
] as const;
export type Tier = (typeof TIERS)[number]["tier"];

export function tierFor(score: number): Tier {
  return TIERS.find((t) => score >= t.min)?.tier ?? "D";
}

export type Metrics = Record<MetricKey, number | null>;

export interface Entry {
  id: string;
  metrics: Metrics;
}

export interface Scored extends Entry {
  /** 0-100, null when rating or review count is missing. */
  score: number | null;
  tier: Tier | null;
  /** Standard competition rank (ties share a rank). */
  rank: number | null;
  tied: boolean;
  /** 1-based position in the sorted list (unique); used for anonymous labels. */
  position: number;
  /** Per-metric percentile 0-1 among entries that have that metric, or null if not used. */
  parts: Record<MetricKey, number | null>;
  /** Sum of weights actually used. */
  coverage: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Rating pulled toward the group average by RATING_PRIOR_REVIEWS phantom reviews. */
export function adjustedRating(rating: number, reviews: number, prior: number): number {
  return (rating * reviews + prior * RATING_PRIOR_REVIEWS) / (reviews + RATING_PRIOR_REVIEWS);
}

/** Percentile of v among values (v included): below + half of the other equals, over n-1. Higher-is-better. */
export function percentile(v: number, values: number[]): number {
  if (values.length <= 1) return 0.5;
  let below = 0;
  let equal = 0;
  for (const x of values) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return (below + (equal - 1) / 2) / (values.length - 1);
}

/** Score, tier and rank every entry against the whole group. */
export function scoreGroup(entries: Entry[]): Scored[] {
  const ratings = entries.map((e) => e.metrics.rating).filter((x): x is number => x != null && Number.isFinite(x));
  const prior = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  const ranked = (e: Entry, k: MetricKey): number | null => {
    const v = e.metrics[k];
    if (v == null || !Number.isFinite(v)) return null;
    if (k !== "rating") return v;
    const n = e.metrics.reviews;
    return n == null || !Number.isFinite(n) ? null : adjustedRating(v, n, prior);
  };
  const values: Record<MetricKey, number[]> = { rating: [], reviews: [], reply: [], complaints: [], reach: [] };
  for (const e of entries) for (const k of METRIC_KEYS) {
    const v = ranked(e, k);
    if (v != null) values[k].push(v);
  }

  const scored = entries.map((e) => {
    const parts = { rating: null, reviews: null, reply: null, complaints: null, reach: null } as Record<MetricKey, number | null>;
    let sum = 0;
    let coverage = 0;
    for (const m of METRICS) {
      const v = ranked(e, m.key);
      if (v == null || values[m.key].length < 2) continue;
      const p = m.better === "higher" ? percentile(v, values[m.key]) : percentile(-v, values[m.key].map((x) => -x));
      parts[m.key] = p;
      sum += m.weight * p;
      coverage += m.weight;
    }
    const scorable = parts.rating != null && parts.reviews != null;
    const score = scorable ? round1((100 * sum) / coverage) : null;
    return { ...e, score, tier: score == null ? null : tierFor(score), rank: null as number | null, tied: false, position: 0, parts, coverage: round1(coverage * 100) / 100 };
  });

  scored.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.id.localeCompare(b.id));
  scored.forEach((s, i) => {
    s.position = i + 1;
    if (s.score == null) return;
    const first = scored.findIndex((x) => x.score === s.score);
    s.rank = first + 1;
    s.tied = scored.filter((x) => x.score === s.score).length > 1;
  });
  return scored;
}

export interface Move {
  metric: MetricKey;
  from: number;
  to: number;
  /** Score after the change, with everyone else unchanged. */
  score: number;
  tier: Tier;
  reachesNextTier: boolean;
  gain: number;
}

const TIER_ORDER: Tier[] = TIERS.map((t) => t.tier);
const better = (t: Tier, than: Tier) => TIER_ORDER.indexOf(t) < TIER_ORDER.indexOf(than);

/** Signals a business can work on. Rating is left out: it follows from the others. */
export const MOVABLE: MetricKey[] = ["reply", "reach", "complaints", "reviews"];

/**
 * For each movable metric the subject has, the smallest change to a value a peer already has that lifts
 * the subject a tier. If no peer value does, the change to the best peer value. Best two first.
 */
export function movesUp(entries: Entry[], subjectId: string, limit = 2): Move[] {
  const base = scoreGroup(entries).find((s) => s.id === subjectId);
  if (!base || base.score == null || base.tier == null || base.tier === "S") return [];
  const subject = entries.find((e) => e.id === subjectId)!;
  const moves: Move[] = [];
  for (const m of METRICS) {
    const from = subject.metrics[m.key];
    if (from == null || !MOVABLE.includes(m.key)) continue;
    const isBetter = (x: number) => (m.better === "higher" ? x > from : x < from);
    const candidates = [...new Set(entries.filter((e) => e.id !== subjectId).map((e) => e.metrics[m.key]).filter((x): x is number => x != null && isBetter(x)))]
      .sort((a, b) => Math.abs(a - from) - Math.abs(b - from));
    let pick: Move | null = null;
    for (const to of candidates) {
      const trial = entries.map((e) => (e.id === subjectId ? { ...e, metrics: { ...e.metrics, [m.key]: to } } : e));
      const s = scoreGroup(trial).find((x) => x.id === subjectId)!;
      const mv: Move = { metric: m.key, from, to, score: s.score!, tier: s.tier!, reachesNextTier: better(s.tier!, base.tier), gain: round1(s.score! - base.score) };
      pick = mv;
      if (mv.reachesNextTier) break;
    }
    if (pick && pick.gain > 0) moves.push(pick);
  }
  return moves
    .sort((a, b) => Number(b.reachesNextTier) - Number(a.reachesNextTier) || b.gain - a.gain || MOVABLE.indexOf(a.metric) - MOVABLE.indexOf(b.metric))
    .slice(0, limit);
}

// ---------- benchmark data ----------

export interface PeerRow {
  key: string;
  industry: Industry;
  /** First 12 hex chars of sha256(place_id), only to avoid counting a business as its own peer. */
  place_hash: string;
  rating: number | null;
  total_reviews: number | null;
  sampled_reviews: number;
  text_reviews: number;
  negative_reviews: number;
  negative_replied: number;
  complaint_reviews: number;
  reach_complaint_reviews: number;
}

export interface IndustryMeta {
  label: string;
  plural: string;
  singular: string;
  sample: string;
}

export interface PeerData {
  scan_date: string;
  city: string;
  source: string;
  excluded_allegation_reviews: number;
  industries: Record<Industry, IndustryMeta>;
  peers: PeerRow[];
}

export const PEERS = peersJson as PeerData;

export function rowMetrics(r: PeerRow): Metrics {
  return {
    rating: r.rating,
    reviews: r.total_reviews,
    reply: r.negative_reviews >= MIN_NEGATIVE_FOR_REPLY ? r.negative_replied / r.negative_reviews : null,
    complaints: r.text_reviews > 0 ? r.complaint_reviews / r.text_reviews : null,
    reach: r.text_reviews > 0 ? r.reach_complaint_reviews / r.text_reviews : null,
  };
}

/** Benchmark industry for a Google category, only when the mapping is clear and the city matches. */
export function industryFor(category: string | null | undefined, city: string | null | undefined, data: PeerData = PEERS): Industry | null {
  if (!category || !city || city.trim().toLowerCase() !== data.city.toLowerCase()) return null;
  const c = category.toLowerCase();
  if (/hvac|heating|air condition|plumb/.test(c)) return "hvac_plumbing";
  if (/dent|orthodont/.test(c)) return "dentist";
  if (/hair salon|nail salon|beauty salon/.test(c)) return "salon";
  if (/coffee|^cafe$|caf[eé]\b|bakery|pastry|bubble tea/.test(c)) return "cafe";
  if (/music|instrument|guitar|violin|piano/.test(c)) return "music_shop";
  if (/restaurant/.test(c)) return "restaurant";
  return null;
}

export interface SubjectInput {
  id: string;
  name: string;
  category: string | null;
  city: string | null;
  rating: number | null;
  review_count: number | null;
  place_hash?: string | null;
  /** Star ratings and whether the owner replied, for the reviews in the scan. Text is only used to screen out allegations. */
  reviews: { rating: number | null; owner_replied: boolean; text: string }[];
}

export type Board =
  | { status: "no_industry"; reason: string }
  | { status: "not_enough_peers"; industry: Industry; meta: IndustryMeta; peerCount: number }
  | { status: "not_scored"; industry: Industry; meta: IndustryMeta; peerCount: number; reason: string }
  | {
      status: "ok";
      industry: Industry;
      meta: IndustryMeta;
      peerCount: number;
      subject: Scored;
      rows: Scored[];
      moves: Move[];
      /** Metrics the subject could not be measured on. */
      missing: MetricKey[];
    };

/** Metrics for a live-scanned business. Complaint shares need the benchmark's classifier, so they stay null. */
export function subjectMetrics(s: SubjectInput): Metrics {
  const neg = s.reviews.filter((r) => r.rating != null && r.rating <= 2 && !ALLEGATION_RE.test(r.text));
  return {
    rating: s.rating,
    reviews: s.review_count,
    reply: neg.length >= MIN_NEGATIVE_FOR_REPLY ? neg.filter((r) => r.owner_replied).length / neg.length : null,
    complaints: null,
    reach: null,
  };
}

export const SUBJECT_ID = "subject";

export function buildBoard(s: SubjectInput, data: PeerData = PEERS): Board {
  const industry = industryFor(s.category, s.city, data);
  if (!industry) {
    return { status: "no_industry", reason: `No ${data.city} benchmark covers "${s.category ?? "unknown category"}"${s.city && s.city.toLowerCase() !== data.city.toLowerCase() ? ` in ${s.city}` : ""} yet.` };
  }
  const meta = data.industries[industry];
  const peers = data.peers.filter((p) => p.industry === industry && (!s.place_hash || p.place_hash !== s.place_hash));
  if (peers.length < MIN_PEERS) return { status: "not_enough_peers", industry, meta, peerCount: peers.length };
  const metrics = subjectMetrics(s);
  if (metrics.rating == null || metrics.reviews == null) {
    return { status: "not_scored", industry, meta, peerCount: peers.length, reason: "Needs a Google rating and review count." };
  }
  const entries: Entry[] = [{ id: SUBJECT_ID, metrics }, ...peers.map((p) => ({ id: p.key, metrics: rowMetrics(p) }))];
  const rows = scoreGroup(entries);
  const subject = rows.find((r) => r.id === SUBJECT_ID)!;
  return {
    status: "ok",
    industry,
    meta,
    peerCount: peers.length,
    subject,
    rows,
    moves: movesUp(entries, SUBJECT_ID),
    missing: METRIC_KEYS.filter((k) => subject.parts[k] == null),
  };
}
