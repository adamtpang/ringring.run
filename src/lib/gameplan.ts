import { z } from "zod";
import coachingJson from "@/data/coaching.json";
import { ALLEGATION_RE } from "./allegations";
import { buildBoard, type Board, type SubjectInput } from "./peers";
import { INTERVIEW } from "./prescription";
import { ASSUMPTION_LABEL, dedupMonthly, type FigureTrace, moneyTrace, OVERLAP_RULE, traceLine } from "./roi";
import { PLAN_KINDS, type Business, type Finding, type KnowledgeFact, type PlanKind, type Review, type RoiEstimate } from "./types";

// Ringy's game plan. Deterministic code decides everything here: which checks
// run (always the same ones, in the same order), pass/gap/unknown, the binding
// constraint, the A/B/C tiers, who does each step, and the prognosis numbers.
// Every number comes from the listing, the scanned reviews, the editable ROI
// assumptions, or the peer benchmark. Anything we could not read is "unknown"
// or "not estimated", never a guess.

// ---------- coaching data ----------

export const ACTORS = ["ringy", "ringy_after_ok", "you"] as const;
export type Actor = (typeof ACTORS)[number];
export const ACTOR_LABEL: Record<Actor, string> = {
  ringy: "Ringy does this",
  ringy_after_ok: "Ringy does this after your OK",
  you: "You do this",
};

/** What an agent can actually do. Anything else is the owner's job. */
export const CAPABILITIES = ["build_agent", "set_up_tool", "draft_replies", "draft_content", "research", "monitor"] as const;
export type Capability = (typeof CAPABILITIES)[number];
/** Capabilities that put something in front of customers: they always need the owner's OK. */
export const NEEDS_OK: Capability[] = ["build_agent", "set_up_tool", "draft_replies"];
/** Capabilities that actually fix a problem. Without one of these, the owner leads and Ringy supports. */
export const FIX_CAPABILITIES: Capability[] = ["build_agent", "set_up_tool", "draft_replies"];
/** On problems only the owner can fix (quality, staff, price, refunds), Ringy only supports: it never "fixes" them with a tool or agent. */
export const SUPPORT_ONLY: Capability[] = ["draft_replies", "draft_content", "research", "monitor"];

const Source = z.object({ label: z.string().min(1), url: z.string().regex(/^https:\/\/[^\s]+$/) });
const RingyStep = z.object({ actor: z.enum(["ringy", "ringy_after_ok"]), capability: z.enum(CAPABILITIES), text: z.string().min(10) });
const CheckStep = z.object({ week: z.number().int().min(1).max(4), who: z.enum(ACTORS), text: z.string().min(5) });
const KindCoaching = z.object({
  label: z.string().min(1),
  severity: z.number().int().min(1).max(5),
  owner_only: z.boolean(),
  why: z.string().min(10),
  unlocks: z.string().min(10),
  ringy: z.array(RingyStep).min(1),
  you: z.array(z.string().min(10)).min(1),
  checklist: z.array(CheckStep).min(2),
  owner_time: z.string().nullable(),
  sources: z.array(Source),
});
export type KindCoaching = z.infer<typeof KindCoaching>;
export const CoachingSchema = z
  .object({
    note: z.string(),
    checked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    kinds: z.record(z.enum(PLAN_KINDS), KindCoaching),
    check_questions: z.record(z.string(), z.string().min(10)),
  })
  .superRefine((c, ctx) => {
    for (const [k, v] of Object.entries(c.kinds)) {
      for (const s of v.ringy) {
        if (NEEDS_OK.includes(s.capability) && s.actor !== "ringy_after_ok") ctx.addIssue({ code: "custom", message: `${k}: ${s.capability} needs the owner's OK` });
        if (v.owner_only && !SUPPORT_ONLY.includes(s.capability)) ctx.addIssue({ code: "custom", message: `${k}: owner-only problems cannot be fixed with ${s.capability}` });
      }
    }
  });
export type Coaching = z.infer<typeof CoachingSchema>;
export const COACHING: Coaching = CoachingSchema.parse(coachingJson);

// ---------- small helpers ----------

const DAY = 86_400_000;
export const RECENT_DAYS = 180;
export const MIN_REVIEWS = 25;
export const MIN_RATING = 4.0;
export const IMPORTANT_MONTHLY_USD = 1000;
/** Below this many reviews a share is shown with a "small sample" note and never decides a check on its own. */
export const MIN_SAMPLE = 5;
/** Reply rate at or above this passes the replies check. */
export const REPLY_TARGET = 0.8;

export function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
}
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One quotable sentence around a match, trimmed. */
export function snippet(text: string, re: RegExp, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const sentences = flat.split(/(?<=[.!?])\s+/);
  const hit = sentences.find((s) => re.test(s)) ?? flat;
  return hit.length > max ? `${hit.slice(0, max - 1).trimEnd()}…` : hit;
}

export const isNegative = (r: Pick<Review, "rating">) => r.rating != null && r.rating <= 2;
/** Reviews we never quote or count: anything alleging discrimination. */
export const quotable = (r: Pick<Review, "text">) => !ALLEGATION_RE.test(r.text);

// ---------- owner-only problems read from reviews ----------

export const OWNER_ONLY_PATTERNS: Record<"work_quality" | "staff_attitude" | "pricing" | "refunds", RegExp> = {
  work_quality: /\b(poor|bad|shoddy|sloppy|terrible|awful) (work|job|workmanship|quality|install(ation)?|repair)\b|\bdid(n'?t| not) (fix|work)\b|\bstill (broken|not working|leaking)\b|\bhad to (come back|redo|re-do)\b|\bbotched\b|\bdamaged (my|our|the)\b|\bundercooked\b|\bcold food\b/i,
  staff_attitude: /\brude\b|\bunprofessional\b|\bdisrespect|\bcondescend|\byell(ed|ing)? at\b|\bhung up on\b|\bdismissive\b/i,
  pricing: /\boverpriced\b|\bover ?charg|\btoo expensive\b|\brip ?off\b|\bprice goug|\bhidden fees?\b|\bcharged (me |us )?(extra|more than)\b/i,
  refunds: /\brefund|\bmoney back\b|\bcharge ?back\b/i,
};

// ---------- evidence ----------

export interface EvidenceLine {
  text: string;
  /** Short attribution, e.g. "Google review, 1 of 5 stars, May 11, 2026". */
  cite: string;
  url: string | null;
  date: string | null;
  reviewId: string | null;
  rating: number | null;
}

function reviewLine(r: Review, quote: string, mapsUrl: string | null): EvidenceLine {
  const date = fmtDate(r.published_at);
  return {
    text: quote,
    cite: ["Google review", r.rating != null ? `${r.rating} of 5 stars` : null, date].filter(Boolean).join(", "),
    url: mapsUrl,
    date,
    reviewId: r.id,
    rating: r.rating,
  };
}

function findingLines(f: Finding, reviews: Map<string, Review>, b: Business): EvidenceLine[] {
  const out: EvidenceLine[] = [];
  for (const e of f.evidence) {
    if (e.source === "review") {
      const r = reviews.get(e.review_id);
      if (r && !quotable(r)) continue;
      if (r) out.push(reviewLine(r, e.quote, b.maps_url));
      else out.push({ text: e.quote, cite: `Google review${e.rating != null ? `, ${e.rating} of 5 stars` : ""}`, url: b.maps_url, date: null, reviewId: e.review_id, rating: e.rating });
    } else if (e.source === "listing") {
      out.push({ text: e.value, cite: "Google listing", url: b.maps_url, date: null, reviewId: null, rating: null });
    } else {
      out.push({ text: e.quote, cite: "Their website", url: e.url, date: null, reviewId: null, rating: null });
    }
  }
  return out;
}

// ---------- scorecard ----------

export const CHECK_IDS = ["listing", "hours", "rating_reviews", "replies", "reach", "website", "phone", "prices", "booking"] as const;
export type CheckId = (typeof CHECK_IDS)[number];
export type CheckStatus = "pass" | "gap" | "unknown";
export const CHECK_LABEL: Record<CheckId, string> = {
  listing: "Google listing found",
  hours: "Hours listed",
  rating_reviews: `Rating ${MIN_RATING.toFixed(1)}+ with ${MIN_REVIEWS}+ reviews`,
  replies: `Owner replies to ${Math.round(REPLY_TARGET * 100)}%+ of reviews`,
  reach: "No can't-reach complaints",
  website: "Website on the listing",
  phone: "Phone on the listing",
  prices: "Prices or menu visible",
  booking: "A way to book online",
};
/** Which plan item fixes a gap in each check. */
export const CHECK_KIND: Partial<Record<CheckId, PlanKind>> = {
  hours: "no_hours",
  rating_reviews: "few_reviews",
  replies: "unanswered_reviews",
  reach: "missed_calls",
  website: "no_website",
  phone: "no_phone",
};

export interface Check {
  id: CheckId;
  label: string;
  status: CheckStatus;
  /** Plain words: what Ringy saw, or why it is unknown. */
  detail: string;
  /** A secondary reading shown under the detail, e.g. the 1-2 star reply share with a small-sample note. */
  note?: string;
  evidence: EvidenceLine[];
  /** Where the reading came from, so every figure in the detail traces to data. */
  source: string;
}

const BOOK_RE = /\b(book|schedul\w*|request (an? )?(appointment|service|visit))\b[^.]{0,30}\b(online|now|here)\b|\bonline (booking|scheduling)\b/i;
const REACH_KINDS = new Set(["missed_calls", "slow_response"]);

export interface PlanInput {
  business: Business;
  findings: Finding[];
  roi: RoiEstimate[];
  reviews: Review[];
  knowledge: KnowledgeFact[];
  /** Peer board, or null when it is still loading or not available. */
  board: Board | null;
  /** The same input the board was built from, so the prognosis can rescore one change. */
  subject: SubjectInput | null;
  /** When the scan ran (ISO). Recency is measured from here, not from today. */
  scanDate: string;
}

export interface ReplyRate {
  basis: "negative" | "all";
  replied: number;
  n: number;
  rate: number;
}

export interface ReplyStats {
  read: number;
  replied: number;
  neg: number;
  negReplied: number;
  /** The figure that decides the check: the 1-2 star share when there are at least MIN_SAMPLE of those, else the share across all reviews read (at least MIN_SAMPLE), else null. */
  primary: ReplyRate | null;
}

/**
 * Reply rates from the reviews Ringy read. Google's listing does not expose an
 * owner response rate through our scraper, so every figure here is Ringy's own
 * sample and is labeled that way. Small samples never decide the check.
 */
export function replyStats(reviews: Pick<Review, "rating" | "owner_response" | "text">[]): ReplyStats {
  const read = reviews.filter(quotable);
  const has = (r: Pick<Review, "owner_response">) => !!r.owner_response?.trim();
  const neg = read.filter(isNegative);
  const replied = read.filter(has).length;
  const negReplied = neg.filter(has).length;
  const primary: ReplyRate | null =
    neg.length >= MIN_SAMPLE
      ? { basis: "negative", replied: negReplied, n: neg.length, rate: negReplied / neg.length }
      : read.length >= MIN_SAMPLE
        ? { basis: "all", replied, n: read.length, rate: replied / read.length }
        : null;
  return { read: read.length, replied, neg: neg.length, negReplied, primary };
}

const smallNote = (n: number) => (n < MIN_SAMPLE ? ` (small sample, under ${MIN_SAMPLE})` : "");

export function runChecks(p: PlanInput): Check[] {
  const b = p.business;
  const listingLine = (text: string): EvidenceLine => ({ text, cite: "Google listing", url: b.maps_url, date: null, reviewId: null, rating: null });
  const read = p.reviews.filter(quotable);
  const neg = read.filter(isNegative);
  const unreplied = neg.filter((r) => !r.owner_response?.trim()).sort((x, y) => (y.published_at ?? "").localeCompare(x.published_at ?? ""));
  const reachFindings = p.findings.filter((f) => REACH_KINDS.has(f.kind));
  const reviewsById = new Map(p.reviews.map((r) => [r.id, r]));
  const prices = p.knowledge.filter((k) => k.kind === "price");
  const booking = p.knowledge.find((k) => BOOK_RE.test(`${k.label} ${k.value} ${k.quote ?? ""}`));
  const howToBook = p.knowledge.find((k) => /book/i.test(k.label));
  // Quote a review by the line the diagnosis already cited, when there is one.
  const citedQuote = new Map<string, string>();
  for (const f of p.findings) for (const e of f.evidence) if (e.source === "review" && !citedQuote.has(e.review_id)) citedQuote.set(e.review_id, e.quote);

  const day = p.scanDate.slice(0, 10);
  const checkSource = (id: CheckId): string =>
    id === "replies" || id === "reach"
      ? `Ringy's sample: the ${plural(read.length, "review")} Ringy read on ${day} (not a Google figure).${id === "replies" ? ` The ${pct(REPLY_TARGET)} target is Ringy's rule of thumb.` : ""}`
      : id === "prices" || id === "booking"
        ? `The Google listing and website Ringy read on ${day}.`
        : `The Google listing, read on ${day}.`;
  const checks: Check[] = [];
  const add = (id: CheckId, status: CheckStatus, detail: string, evidence: EvidenceLine[] = [], note?: string) =>
    checks.push({ id, label: CHECK_LABEL[id], status, detail, evidence, source: checkSource(id), ...(note ? { note } : {}) });

  add("listing", b.place_id ? "pass" : "unknown", b.place_id ? `Found on Google Maps${b.category ? ` as ${b.category}` : ""}.` : "We could not confirm a Google listing.", b.maps_url ? [listingLine(b.name)] : []);

  add("hours", b.opening_hours.length ? "pass" : "gap", b.opening_hours.length ? `${plural(b.opening_hours.length, "day")} listed${b.opening_hours[0] ? `, e.g. ${b.opening_hours[0].day}: ${b.opening_hours[0].hours}` : ""}.` : "The listing shows no hours.");

  if (b.rating == null && b.review_count == null) add("rating_reviews", "gap", "The listing shows no rating and no reviews.");
  else {
    const n = b.review_count ?? 0;
    const ok = b.rating != null && b.rating >= MIN_RATING && n >= MIN_REVIEWS;
    add("rating_reviews", ok ? "pass" : "gap", `${b.rating ?? "No"} stars from ${plural(n, "review")}.`, [listingLine(`${b.rating ?? "n/a"} stars, ${n} reviews`)]);
  }

  const rs = replyStats(p.reviews);
  const unrepliedLines = unreplied.slice(0, 2).map((r) => reviewLine(r, citedQuote.get(r.id) ?? snippet(r.text, /./), b.maps_url));
  const negNote =
    rs.primary?.basis === "negative" || rs.neg === 0
      ? undefined
      : `${unreplied.length} of the ${plural(rs.neg, "review")} with 1 or 2 stars ${unreplied.length === 1 ? "has" : "have"} no reply${smallNote(rs.neg)}.`;
  if (read.length === 0) add("replies", "unknown", "No reviews were read, so replies are unknown.");
  else if (!rs.primary)
    add("replies", "unknown", `Ringy read only ${plural(read.length, "review")}, too few to judge replies (needs ${MIN_SAMPLE}).`, unrepliedLines, negNote);
  else {
    const { basis, replied, n, rate } = rs.primary;
    const what = basis === "negative" ? `the ${n} reviews with 1 or 2 stars` : `the ${n} newest reviews`;
    const detail = `The owner replied to ${replied} of ${what} Ringy read (${pct(rate)}; Ringy's sample, not a Google figure). Target: ${pct(REPLY_TARGET)}+.`;
    add("replies", rate >= REPLY_TARGET ? "pass" : "gap", detail, unrepliedLines, negNote);
  }

  if (reachFindings.length) {
    const lines = reachFindings.flatMap((f) => findingLines(f, reviewsById, b)).filter((l, i, a) => a.findIndex((x) => x.text === l.text) === i);
    add("reach", "gap", `${plural(new Set(lines.map((l) => l.reviewId ?? l.text)).size, "review")} describe calls or follow-ups that went unanswered.`, lines.slice(0, 2));
  } else if (read.length === 0) add("reach", "unknown", "No reviews were read.");
  else add("reach", "pass", `None found in the ${plural(read.length, "review")} read.`);

  add("website", b.website ? "pass" : "gap", b.website ? "A website is linked from the listing." : "No website on the listing.", b.website ? [{ text: b.website.replace(/[?#].*$/, ""), cite: "Their website", url: b.website, date: null, reviewId: null, rating: null }] : []);
  add("phone", b.phone ? "pass" : "gap", b.phone ? `Phone listed: ${b.phone}.` : "No phone on the listing.");

  if (prices.length) {
    const k = prices[0]!;
    add("prices", "pass", "Ringy found pricing on what it read.", [{ text: k.quote ?? k.value, cite: k.source_type === "website" ? "Their website" : "Google listing", url: k.source_type === "website" ? b.website : b.maps_url, date: null, reviewId: null, rating: null }]);
  } else add("prices", "unknown", "Ringy did not find prices in what it read; that does not mean there are none.");

  if (booking) add("booking", "pass", "Ringy found a way to book online.", [{ text: booking.quote ?? booking.value, cite: booking.source_type === "website" ? "Their website" : "Google listing", url: booking.source_type === "website" ? b.website : b.maps_url, date: null, reviewId: null, rating: null }]);
  else add("booking", "unknown", howToBook ? `Their website says to book by: "${howToBook.value}". Ringy did not find an online booking link, but may have missed one.` : "Ringy did not find an online booking link, but may have missed one.");

  return checks;
}

// ---------- plan items ----------

export type PlanTier = "A" | "B" | "C";

export interface Effect {
  /** Display value, or null for "not estimated". */
  value: string | null;
  basis: string;
  /** The inputs and math behind a dollar value. */
  trace?: FigureTrace;
  /** Where a non-dollar value came from. */
  source?: string;
}

export interface PlanItem {
  kind: PlanKind;
  findingId: string | null;
  label: string;
  title: string;
  detail: string;
  tier: PlanTier;
  recommended: boolean;
  lead: Actor;
  severity: number;
  urgent: boolean;
  important: boolean;
  urgentWhy: string;
  importantWhy: string;
  evidence: EvidenceLine[];
  monthly: number | null;
  /** "How we got this": each input marked assumed or sourced, then the math. Null when not estimated. */
  moneyInputs: string | null;
  /** The structured trace behind `monthly`. Null when not estimated. */
  moneyTrace: FigureTrace | null;
  /** Where the title and detail came from. */
  source: string;
  /** Assumption keys behind the dollar figure that are still defaults, for the interview. */
  defaultKeys: string[];
  effects: { money: Effect; time: Effect; reviews: Effect; quality: Effect };
  why: string;
  unlocks: string;
  ringy: { actor: Actor; capability: Capability; text: string }[];
  you: string[];
  checklist: { week: number; who: Actor; text: string }[];
  sources: { label: string; url: string }[];
  ownerOnly: boolean;
}

/** Which peer-score metric an item moves, for "important because it moves your tier". */
const MOVE_KIND: Record<string, PlanKind[]> = { reply: ["unanswered_reviews"], reviews: ["few_reviews"], reach: ["missed_calls", "slow_response"] };

export function tierOf(urgent: boolean, important: boolean): PlanTier {
  return urgent && important ? "A" : important ? "B" : "C";
}

/** Lead label for an item: owner-only problems, and anything Ringy can only support, are "You do this". */
export function leadActor(c: Pick<KindCoaching, "owner_only" | "ringy">): Actor {
  if (c.owner_only || !c.ringy.some((s) => FIX_CAPABILITIES.includes(s.capability))) return "you";
  return c.ringy.some((s) => s.actor === "ringy_after_ok") ? "ringy_after_ok" : "ringy";
}

interface Candidate {
  kind: PlanKind;
  finding: Finding | null;
  evidence: EvidenceLine[];
  title: string;
  detail: string;
  source: string;
}

function candidates(p: PlanInput, checks: Check[]): Candidate[] {
  const b = p.business;
  const reviewsById = new Map(p.reviews.map((r) => [r.id, r]));
  const fromReviews = `The Google reviews and listing Ringy read on ${p.scanDate.slice(0, 10)}.`;
  const out: Candidate[] = p.findings.map((f) => ({ kind: f.kind, finding: f, evidence: findingLines(f, reviewsById, b), title: f.title, detail: f.detail, source: fromReviews }));
  const have = new Set<PlanKind>(out.map((c) => c.kind));

  // Owner-only problems from 1-3 star reviews.
  const low = p.reviews.filter((r) => r.rating != null && r.rating <= 3 && quotable(r));
  for (const [kind, re] of Object.entries(OWNER_ONLY_PATTERNS) as [PlanKind, RegExp][]) {
    const hits = low.filter((r) => re.test(r.text));
    if (!hits.length || have.has(kind)) continue;
    const c = COACHING.kinds[kind];
    out.push({
      kind,
      finding: null,
      evidence: hits.slice(0, 3).map((r) => reviewLine(r, snippet(r.text, re), b.maps_url)),
      title: c.label,
      detail: `${plural(hits.length, "1 to 3 star review")} read ${hits.length === 1 ? "mentions" : "mention"} this. Ringy can help, but this one is yours to fix.`,
      source: fromReviews,
    });
    have.add(kind);
  }

  // Gaps from the scorecard.
  for (const ch of checks) {
    const kind = CHECK_KIND[ch.id];
    if (ch.status !== "gap" || !kind || have.has(kind)) continue;
    if (ch.id === "reach") continue; // only raised by findings, which are already in
    const c = COACHING.kinds[kind];
    out.push({ kind, finding: null, evidence: ch.evidence, title: c.label, detail: ch.detail, source: ch.source });
    have.add(kind);
  }
  return out;
}

const KIND_ORDER = new Map(PLAN_KINDS.map((k, i) => [k, i]));

export function buildItems(p: PlanInput, checks: Check[], binding: CheckId | null): PlanItem[] {
  const b = p.business;
  const scan = new Date(p.scanDate).getTime();
  const roiByFinding = new Map(p.roi.map((r) => [r.finding_id, r]));
  const reviewsById = new Map(p.reviews.map((r) => [r.id, r]));
  const readCount = p.reviews.filter(quotable).length;
  const moves = p.board?.status === "ok" ? p.board.moves : [];
  const peerMedian = (() => {
    if (p.board?.status !== "ok") return null;
    const v = p.board.rows.filter((r) => r.id !== "subject").map((r) => r.metrics.reviews).filter((x): x is number => x != null).sort((x, y) => x - y);
    return v.length ? v[Math.floor(v.length / 2)]! : null;
  })();

  const items = candidates(p, checks).map((c): PlanItem => {
    const coach = COACHING.kinds[c.kind];
    const severity = c.finding?.severity ?? coach.severity;
    const roi = c.finding ? roiByFinding.get(c.finding.id) ?? null : null;
    // A dollar figure is shown only when its inputs are on file, and it is always the product of those inputs.
    const trace = roi ? moneyTrace(roi.assumptions) : null;
    const monthly = trace ? trace.result : null;

    const ids = [...new Set(c.evidence.map((e) => e.reviewId).filter((x): x is string => !!x))];
    const evReviews = ids.map((id) => reviewsById.get(id)).filter((r): r is Review => !!r);
    const newest = evReviews.map((r) => (r.published_at ? new Date(r.published_at).getTime() : NaN)).filter((t) => !Number.isNaN(t)).sort((x, y) => y - x)[0];
    const ageDays = newest != null ? Math.floor((scan - newest) / DAY) : null;

    const recent = ageDays != null && ageDays <= RECENT_DAYS;
    const blocksContact = c.kind === "no_phone";
    const urgent = recent || blocksContact;
    const urgentWhy = recent
      ? `Newest evidence is ${ageDays} days old (under ${RECENT_DAYS}).`
      : blocksContact
        ? "Customers cannot call you at all."
        : ageDays != null
          ? `Newest evidence is ${ageDays} days old (over ${RECENT_DAYS}).`
          : "No dated review evidence.";
    const movesTier = moves.find((m) => (MOVE_KIND[m.metric] ?? []).includes(c.kind) && m.reachesNextTier);
    const reasons: string[] = [];
    if (severity >= 4) reasons.push(`severity ${severity} of 5`);
    if (monthly != null && monthly >= IMPORTANT_MONTHLY_USD) reasons.push(`about ${usd(monthly)}/mo at stake (estimate)`);
    if (movesTier) reasons.push(`fixing it alone moves your peer tier to ${movesTier.tier}`);
    const important = reasons.length > 0;
    const importantWhy = important ? `Important: ${reasons.join("; ")}.` : `Not marked important: severity ${severity} of 5${monthly != null ? `, about ${usd(monthly)}/mo (estimate)` : ""}.`;

    const assumptions = roi?.assumptions ?? [];
    const defaults = assumptions.filter((a) => a.source === "assumption" && a.note !== "Edited by user." && a.unit !== "multiplier");
    const moneyInputs = trace ? traceLine(trace) : null;

    const effects: PlanItem["effects"] = {
      money: monthly != null
        ? {
            value: `${usd(monthly)}/mo at risk`,
            basis: `How we got this: ${moneyInputs}.${defaults.length ? ` ${defaults.length === assumptions.filter((a) => a.unit !== "multiplier").length ? "Every input" : `${defaults.length} inputs`} marked assumed ${defaults.length === 1 ? "is a" : "are a"} ${ASSUMPTION_LABEL}.` : ""} Change them on the problem card.`,
            trace: trace!,
          }
        : { value: null, basis: "Not estimated: no traceable dollar figure for this one." },
      time: coach.owner_time ? { value: coach.owner_time.replace(/\s*\(assumption\)\.?$/, ""), basis: "Your time. Assumption, not measured." } : { value: null, basis: "Not estimated." },
      reviews: c.kind === "few_reviews" && peerMedian != null
        ? { value: `peers' median is ${peerMedian}`, basis: `You have ${b.review_count ?? 0}. From the peer benchmark.`, source: "Google listings of the anonymized peers Ringy read" }
        : { value: null, basis: "Not estimated." },
      quality: ids.length && readCount
        ? { value: `${ids.length} of ${readCount} reviews read`, basis: "Reviews that mention this, out of those Ringy read.", source: "Google reviews Ringy read" }
        : { value: null, basis: "Not estimated." },
    };

    return {
      kind: c.kind,
      findingId: c.finding?.id ?? null,
      label: coach.label,
      title: c.title,
      detail: c.detail,
      tier: tierOf(urgent, important),
      recommended: false,
      lead: leadActor(coach),
      severity,
      urgent,
      important,
      urgentWhy,
      importantWhy,
      evidence: c.evidence,
      monthly,
      moneyInputs,
      moneyTrace: trace,
      source: c.source,
      defaultKeys: monthly != null ? defaults.map((a) => a.key) : [],
      effects,
      why: coach.why,
      unlocks: coach.unlocks,
      ringy: coach.ringy,
      you: coach.you,
      checklist: [...coach.checklist].sort((x, y) => x.week - y.week),
      sources: coach.sources,
      ownerOnly: coach.owner_only,
    };
  });

  items.sort(
    (x, y) =>
      x.tier.localeCompare(y.tier) ||
      y.severity - x.severity ||
      (y.monthly ?? -1) - (x.monthly ?? -1) ||
      y.evidence.length - x.evidence.length ||
      (KIND_ORDER.get(x.kind) ?? 0) - (KIND_ORDER.get(y.kind) ?? 0),
  );

  // One recommended pick: the item that fixes the binding constraint, else the first item.
  const bindKind = binding ? CHECK_KIND[binding] : undefined;
  const pick = items.find((i) => i.kind === bindKind) ?? items[0];
  if (pick) pick.recommended = true;
  return items;
}

// ---------- binding constraint ----------

export interface Binding {
  check: CheckId | null;
  sentence: string;
  evidence: EvidenceLine[];
  /** Where the sentence's figures came from (the check's source). */
  source: string;
}

export function bindingConstraint(checks: Check[], b: Business): Binding {
  const gap = checks.find((c) => c.status === "gap");
  if (!gap) return { check: null, sentence: "Nothing in Ringy's fixed checks is a gap. The plan below works on what the reviews say.", evidence: [], source: "Ringy's fixed checks" };
  const ev = gap.evidence[0];
  const s: Record<CheckId, string> = {
    listing: "Ringy could not confirm a Google listing, so customers may not find you.",
    hours: "Your Google listing shows no hours, so customers cannot tell when you are open.",
    rating_reviews: `With ${b.rating ?? "no"} stars from ${plural(b.review_count ?? 0, "review")}, new customers have little to go on.`,
    replies: `${gap.detail.replace(/ Target:.*$/, "").replace(/\.$/, "")}, under the ${pct(REPLY_TARGET)} target${ev ? `. The newest unanswered low review${ev.date ? ` (${ev.date})` : ""} says "${ev.text}"` : ""}.`,
    reach: `Customers say they could not reach you${ev ? `: "${ev.text}"` : ""}.`,
    website: "There is no website on your listing, so customers who want details have nowhere to go.",
    phone: "There is no phone number on your listing, so customers cannot call you.",
    prices: "Customers cannot see prices before they call.",
    booking: "Customers cannot book online.",
  };
  return { check: gap.id, sentence: s[gap.id], evidence: gap.evidence, source: gap.source };
}

// ---------- prognosis ----------

export interface Prognosis {
  metric: string;
  now: string;
  ifNothing: string;
  ifPlan: string;
  note: string;
  /** Where the metric's reading came from. */
  source: string;
  /** How the A-item dollar total was built: each kept estimate with its own trace, and what overlap left out. Null when no A item is priced. */
  money: { total: number; kept: { kind: string; label: string; trace: FigureTrace }[]; dropped: { kind: string; label: string; monthly: number; keptKind: string; keptLabel: string }[]; rule: string | null } | null;
}

function rescore(subject: SubjectInput | null, change: (s: SubjectInput) => SubjectInput): Board | null {
  return subject ? buildBoard(change(subject)) : null;
}

const tierText = (bd: Board | null) => (bd?.status === "ok" ? `peer tier ${bd.subject.tier} (#${bd.subject.rank} of ${bd.rows.length}, score ${bd.subject.score})` : null);

export function prognosis(p: PlanInput, binding: Binding, items: PlanItem[], checks: Check[]): Prognosis {
  const b = p.business;
  const aItems = items.filter((i) => i.tier === "A");
  // Overlapping estimates (e.g. missed calls and slow replies) share the same lost jobs: count them once.
  const dedup = dedupMonthly(aItems.map((i) => ({ kind: i.kind, monthly: i.monthly })));
  const aMoney = dedup.total;
  const labelOf = (k: string) => aItems.find((i) => i.kind === k)?.label ?? k;
  const aUnpriced = aItems.filter((i) => i.monthly == null).length;
  const moneyLine = aItems.length
    ? aMoney > 0
      ? `about ${usd(aMoney)}/mo tied to the A items (estimate${dedup.dropped.length ? ", overlaps counted once" : ""})${aUnpriced ? ` (${aUnpriced} not estimated)` : ""}`
      : "the A items, which Ringy did not price"
    : null;
  const nowTier = tierText(p.board);
  const read = p.reviews.filter(quotable);
  const rs = replyStats(p.reviews);
  const note = [
    "Estimate, not a promise. Built from the reviews Ringy read on the scan date, the listing, the cost assumptions (defaults until the owner corrects them), and the peer benchmark.",
    dedup.dropped.length ? OVERLAP_RULE : null,
    "The peer tier only counts reviews, so call fixes show up there only as new reviews come in.",
  ]
    .filter(Boolean)
    .join(" ");

  let metric: string;
  let now: string;
  let after: string;
  let afterBoard: Board | null = null;

  const check = binding.check;
  if (rs.primary && (check === "replies" || (check == null && rs.primary.rate < 1))) {
    const { basis, replied, n, rate } = rs.primary;
    metric = basis === "negative" ? "Reply rate to 1 or 2 star reviews" : "Owner reply rate on recent reviews";
    now = `${pct(rate)} (${replied} of ${n} read)`;
    after = `100% (${n} of ${n})`;
    afterBoard = rescore(p.subject, (s) => ({ ...s, reviews: s.reviews.map((r) => (r.rating != null && r.rating <= 2 ? { ...r, owner_replied: true } : r)) }));
  } else if (check === "reach") {
    const reach = checks.find((c) => c.id === "reach");
    const n = new Set(reach?.evidence.map((e) => e.reviewId ?? e.text)).size;
    metric = "Can't-reach complaints in recent reviews";
    now = `${n} in the ${read.length} reviews read`;
    after = "no new ones in the next rescan";
  } else if (check === "rating_reviews") {
    metric = "Google rating and review count";
    now = `${b.rating ?? "no"} stars, ${b.review_count ?? 0} reviews`;
    after = `more recent reviews, toward ${MIN_REVIEWS}+`;
  } else if (check === "hours" || check === "phone" || check === "website") {
    const done = checks.filter((c) => ["hours", "phone", "website"].includes(c.id) && c.status === "pass").length;
    metric = "Listing basics shown (hours, phone, website)";
    now = `${done} of 3`;
    after = "3 of 3";
  } else {
    metric = "Google rating";
    now = b.rating != null ? `${b.rating} stars from ${b.review_count ?? 0} reviews` : "unknown";
    after = "held or rising on the next rescan";
  }

  const afterTier = tierText(afterBoard);
  const ifNothing = [`${metric.toLowerCase()} stays at ${now}`, nowTier ? `you stay around ${nowTier}` : null, moneyLine ? `${moneyLine} stays at risk` : null].filter(Boolean).join("; ");
  const ifPlan = [
    `${metric.toLowerCase()} goes to ${after}`,
    afterTier && afterTier !== nowTier ? `the peer estimate moves to ${afterTier}` : null,
    moneyLine && aMoney > 0 ? `and you address ${moneyLine}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  return {
    metric,
    now,
    ifNothing: `If nothing changes: ${ifNothing}.`,
    ifPlan: `If you do the A items in the next 30 days: ${ifPlan}.`,
    note,
    source: (check && checks.find((c) => c.id === check)?.source) || checks.find((c) => c.id === "rating_reviews")?.source || "The Google listing",
    money:
      aMoney > 0
        ? {
            total: aMoney,
            kept: aItems
              .filter((i) => i.moneyTrace && !dedup.dropped.some((d) => d.kind === i.kind))
              .map((i) => ({ kind: i.kind, label: i.label, trace: i.moneyTrace! })),
            dropped: dedup.dropped.map((d) => ({ ...d, label: labelOf(d.kind), keptLabel: labelOf(d.keptKind) })),
            rule: dedup.dropped.length ? OVERLAP_RULE : null,
          }
        : null,
  };
}

// ---------- interview ----------

/** A check's question is skipped when a plan item already asks about the same thing. */
const CHECK_QUESTION_KIND: Partial<Record<CheckId, PlanKind>> = { booking: "booking_friction", reach: "missed_calls", replies: "unanswered_reviews" };

/** Questions that replace a default dollar assumption with the owner's own number. */
export const ASSUMPTION_QUESTIONS: Record<string, string> = {
  avg_ticket: "What is a typical job worth to you, roughly, in dollars?",
  missed_calls_per_week: "In a normal week, about how many calls go unanswered or to voicemail?",
  monthly_inquiries: "About how many new customers call, text or message you in a month?",
  close_rate: "Out of 10 people who ask for a quote, about how many book?",
  monthly_booking_attempts: "About how many people try to book with you in a month?",
  monthly_profile_views: "Do you know how many people view your Google profile in a month? (It is in your Google Business Profile.)",
};

export function pickQuestions(items: PlanItem[], checks: Check[], min = 3, max = 5): string[] {
  const out: string[] = [];
  const push = (q: string | undefined) => {
    if (q && !out.includes(q) && out.length < max) out.push(q);
  };
  for (const i of items) push(INTERVIEW[i.kind][0]);
  // The dollar figures rest on defaults: ask for the two inputs that move the biggest A figure most.
  const priced = items.filter((i) => i.monthly != null && i.defaultKeys.length).sort((x, y) => x.tier.localeCompare(y.tier) || (y.monthly ?? 0) - (x.monthly ?? 0))[0];
  if (priced) {
    const order = ["avg_ticket", "missed_calls_per_week", "monthly_inquiries", "monthly_booking_attempts", "close_rate", "monthly_profile_views"];
    for (const k of order.filter((k) => priced.defaultKeys.includes(k)).slice(0, 2)) {
      const q = ASSUMPTION_QUESTIONS[k];
      // Skip when an existing question already asks for the same number.
      const dup = k === "missed_calls_per_week" && out.some((x) => /unanswered|voicemail|miss/i.test(x));
      if (!dup) push(q);
    }
  }
  const kinds = new Set(items.map((i) => i.kind));
  for (const c of checks) {
    const covered = CHECK_QUESTION_KIND[c.id];
    if (c.status !== "pass" && !(covered && kinds.has(covered))) push(COACHING.check_questions[c.id]);
  }
  for (let round = 1; out.length < min && round < 5; round++) for (const i of items) if (out.length < min) push(INTERVIEW[i.kind][round]);
  for (const k of ["missed_calls", "few_reviews"] as const) for (const q of INTERVIEW[k]) if (out.length < min) push(q);
  return out;
}

// ---------- the whole plan ----------

export interface GamePlan {
  checks: Check[];
  binding: Binding;
  items: PlanItem[];
  prognosis: Prognosis;
  questions: string[];
  firstRingyStep: { item: PlanItem; step: PlanItem["ringy"][number] } | null;
}

export function buildGamePlan(p: PlanInput): GamePlan {
  const checks = runChecks(p);
  const binding = bindingConstraint(checks, p.business);
  const items = buildItems(p, checks, binding.check);
  const rec = items.find((i) => i.recommended) ?? null;
  return {
    checks,
    binding,
    items,
    prognosis: prognosis(p, binding, items, checks),
    questions: pickQuestions(items, checks),
    firstRingyStep: rec && rec.ringy[0] ? { item: rec, step: rec.ringy[0] } : null,
  };
}
