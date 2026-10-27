import { z } from "zod";
import coachingJson from "@/data/coaching.json";
import { ALLEGATION_RE } from "./allegations";
import { buildBoard, type Board, type SubjectInput } from "./peers";
import { INTERVIEW } from "./prescription";
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
  replies: "Owner replies to 1 or 2 star reviews",
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
  evidence: EvidenceLine[];
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

  const checks: Check[] = [];
  const add = (id: CheckId, status: CheckStatus, detail: string, evidence: EvidenceLine[] = []) => checks.push({ id, label: CHECK_LABEL[id], status, detail, evidence });

  add("listing", b.place_id ? "pass" : "unknown", b.place_id ? `Found on Google Maps${b.category ? ` as ${b.category}` : ""}.` : "We could not confirm a Google listing.", b.maps_url ? [listingLine(b.name)] : []);

  add("hours", b.opening_hours.length ? "pass" : "gap", b.opening_hours.length ? `${plural(b.opening_hours.length, "day")} listed${b.opening_hours[0] ? `, e.g. ${b.opening_hours[0].day}: ${b.opening_hours[0].hours}` : ""}.` : "The listing shows no hours.");

  if (b.rating == null && b.review_count == null) add("rating_reviews", "gap", "The listing shows no rating and no reviews.");
  else {
    const n = b.review_count ?? 0;
    const ok = b.rating != null && b.rating >= MIN_RATING && n >= MIN_REVIEWS;
    add("rating_reviews", ok ? "pass" : "gap", `${b.rating ?? "No"} stars from ${plural(n, "review")}.`, [listingLine(`${b.rating ?? "n/a"} stars, ${n} reviews`)]);
  }

  if (read.length === 0) add("replies", "unknown", "No reviews were read, so replies are unknown.");
  else if (neg.length === 0) add("replies", "unknown", `None of the ${read.length} reviews read has 1 or 2 stars, so there is nothing to measure yet.`);
  else if (unreplied.length === 0) add("replies", "pass", `All ${plural(neg.length, "review")} with 1 or 2 stars that Ringy read have a reply.`);
  else
    add(
      "replies",
      "gap",
      `${unreplied.length} of the ${plural(neg.length, "review")} with 1 or 2 stars that Ringy read ${unreplied.length === 1 ? "has" : "have"} no reply.`,
      unreplied.slice(0, 2).map((r) => reviewLine(r, citedQuote.get(r.id) ?? snippet(r.text, /./), b.maps_url)),
    );

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
  effects: { money: Effect; time: Effect; rating: Effect; reviews: Effect; quality: Effect };
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

/** Effect on the average rating if these reviews had been 5 stars. Traceable: listing rating, count and the cited stars. */
export function ratingHeadroom(ratings: number[], reviewCount: number | null): number | null {
  if (!reviewCount || reviewCount <= 0 || ratings.length === 0) return null;
  return Math.round((ratings.reduce((s, r) => s + (5 - r), 0) / reviewCount) * 100) / 100;
}

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
}

function candidates(p: PlanInput, checks: Check[]): Candidate[] {
  const b = p.business;
  const reviewsById = new Map(p.reviews.map((r) => [r.id, r]));
  const out: Candidate[] = p.findings.map((f) => ({ kind: f.kind, finding: f, evidence: findingLines(f, reviewsById, b), title: f.title, detail: f.detail }));
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
    });
    have.add(kind);
  }

  // Gaps from the scorecard.
  for (const ch of checks) {
    const kind = CHECK_KIND[ch.id];
    if (ch.status !== "gap" || !kind || have.has(kind)) continue;
    if (ch.id === "reach") continue; // only raised by findings, which are already in
    const c = COACHING.kinds[kind];
    out.push({ kind, finding: null, evidence: ch.evidence, title: c.label, detail: ch.detail });
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
    const monthly = roi ? roi.monthly_value : null;

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

    const ratings = evReviews.map((r) => r.rating).filter((x): x is number => x != null);
    const head = ratingHeadroom(ratings, b.review_count);
    const assumptions = roi?.assumptions ?? [];
    const fromListing = assumptions.filter((a) => a.source === "listing").length;

    const effects: PlanItem["effects"] = {
      money: monthly != null
        ? { value: `${usd(monthly)}/mo at risk`, basis: `Estimate: ${plural(assumptions.length, "editable assumption")} multiplied, ${fromListing} from the listing. Change them on the problem card.` }
        : { value: null, basis: "Not estimated: no traceable dollar figure for this one." },
      time: coach.owner_time ? { value: coach.owner_time.replace(/\s*\(assumption\)\.?$/, ""), basis: "Your time. Assumption, not measured." } : { value: null, basis: "Not estimated." },
      rating: head != null
        ? { value: `up to +${head.toFixed(2)} stars`, basis: `If the ${plural(ratings.length, "review")} cited here had been 5 stars instead, across your ${b.review_count} reviews. Google rounds the shown rating.` }
        : { value: null, basis: "Not estimated: no rated reviews cited." },
      reviews: c.kind === "few_reviews" && peerMedian != null
        ? { value: `peers' median is ${peerMedian}`, basis: `You have ${b.review_count ?? 0}. From the peer benchmark.` }
        : { value: null, basis: "Not estimated." },
      quality: ids.length && readCount
        ? { value: `${ids.length} of ${readCount} reviews read`, basis: "Reviews that mention this, out of those Ringy read." }
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
}

export function bindingConstraint(checks: Check[], b: Business): Binding {
  const gap = checks.find((c) => c.status === "gap");
  if (!gap) return { check: null, sentence: "Nothing in Ringy's fixed checks is a gap. The plan below works on what the reviews say.", evidence: [] };
  const ev = gap.evidence[0];
  const s: Record<CheckId, string> = {
    listing: "Ringy could not confirm a Google listing, so customers may not find you.",
    hours: "Your Google listing shows no hours, so customers cannot tell when you are open.",
    rating_reviews: `With ${b.rating ?? "no"} stars from ${plural(b.review_count ?? 0, "review")}, new customers have little to go on.`,
    replies: `${gap.detail.replace(/\.$/, "")}${ev ? (gap.detail.startsWith("1 of") ? `: the one from ${ev.date ?? "the scan"} says "${ev.text}"` : `, including the newest${ev.date ? ` (${ev.date})` : ""}: "${ev.text}"`) : ""}.`,
    reach: `Customers say they could not reach you${ev ? `: "${ev.text}"` : ""}.`,
    website: "There is no website on your listing, so customers who want details have nowhere to go.",
    phone: "There is no phone number on your listing, so customers cannot call you.",
    prices: "Customers cannot see prices before they call.",
    booking: "Customers cannot book online.",
  };
  return { check: gap.id, sentence: s[gap.id], evidence: gap.evidence };
}

// ---------- prognosis ----------

export interface Prognosis {
  metric: string;
  now: string;
  ifNothing: string;
  ifPlan: string;
  note: string;
}

function rescore(subject: SubjectInput | null, change: (s: SubjectInput) => SubjectInput): Board | null {
  return subject ? buildBoard(change(subject)) : null;
}

const tierText = (bd: Board | null) => (bd?.status === "ok" ? `peer tier ${bd.subject.tier} (#${bd.subject.rank} of ${bd.rows.length}, score ${bd.subject.score})` : null);

export function prognosis(p: PlanInput, binding: Binding, items: PlanItem[], checks: Check[]): Prognosis {
  const b = p.business;
  const aItems = items.filter((i) => i.tier === "A");
  const aMoney = aItems.reduce((s, i) => s + (i.monthly ?? 0), 0);
  const aUnpriced = aItems.filter((i) => i.monthly == null).length;
  const moneyLine = aItems.length
    ? aMoney > 0
      ? `an estimated ${usd(aMoney)}/mo tied to the A items${aUnpriced ? ` (${aUnpriced} not estimated)` : ""}`
      : "the A items, which Ringy did not price"
    : null;
  const nowTier = tierText(p.board);
  const read = p.reviews.filter(quotable);
  const neg = read.filter(isNegative);
  const replied = neg.filter((r) => r.owner_response?.trim()).length;
  const note =
    "Estimate, not a promise. Built from the reviews Ringy read on the scan date, the listing, the editable cost assumptions, and the peer benchmark. Dollar figures can overlap between problems. The peer tier only counts reviews, so call fixes show up there only as new reviews come in.";

  let metric: string;
  let now: string;
  let after: string;
  let afterBoard: Board | null = null;

  const check = binding.check;
  if (check === "replies" || (check == null && neg.length > 0)) {
    metric = "Reply rate to 1 or 2 star reviews";
    now = `${pct(replied / neg.length)} (${replied} of ${neg.length})`;
    after = `100% (${neg.length} of ${neg.length})`;
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
  };
}

// ---------- interview ----------

/** A check's question is skipped when a plan item already asks about the same thing. */
const CHECK_QUESTION_KIND: Partial<Record<CheckId, PlanKind>> = { booking: "booking_friction", reach: "missed_calls", replies: "unanswered_reviews" };

export function pickQuestions(items: PlanItem[], checks: Check[], min = 3, max = 5): string[] {
  const out: string[] = [];
  const push = (q: string | undefined) => {
    if (q && !out.includes(q) && out.length < max) out.push(q);
  };
  for (const i of items) push(INTERVIEW[i.kind][0]);
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
