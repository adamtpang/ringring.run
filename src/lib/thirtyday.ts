// The 30-day plan: the game plan's own week 1-4 checklists, merged across the top fixes,
// each step tagged with who does it and the one metric it is meant to move.
// Pure: no new advice is written here; every step text comes from coaching.json via PlanItem.checklist.
import { type Actor, type PlanItem, replyStats } from "./gameplan";
import type { Business, PlanKind, Review } from "./types";

export const METRICS = ["rating", "review_count", "reply_rate", "revenue_estimate", "listing_basics"] as const;
export type Metric = (typeof METRICS)[number];
export const METRIC_LABEL: Record<Metric, string> = {
  rating: "Google rating",
  review_count: "Review count",
  reply_rate: "Reply rate",
  revenue_estimate: "Revenue estimate",
  listing_basics: "Listing basics",
};

/** The metric each kind of fix is meant to move. Owner-only problems show up in what customers write, so in the rating. */
export const METRIC_OF: Record<PlanKind, Metric> = {
  missed_calls: "revenue_estimate",
  slow_response: "revenue_estimate",
  booking_friction: "revenue_estimate",
  no_website: "revenue_estimate",
  no_phone: "revenue_estimate",
  unanswered_reviews: "reply_rate",
  few_reviews: "review_count",
  work_quality: "rating",
  staff_attitude: "rating",
  pricing: "rating",
  refunds: "rating",
  no_hours: "listing_basics",
};

export type Who = "ringy" | "you";
export const WHO_LABEL: Record<Who, string> = { ringy: "Ringy does this", you: "You do this" };
export const whoOf = (a: Actor): Who => (a === "you" ? "you" : "ringy");

export interface MetricNow {
  metric: Metric;
  label: string;
  /** Today's value, or null when there is nothing traceable to show. */
  now: string | null;
  /** Where `now` comes from. */
  source: string;
  estimate: boolean;
}

export interface PlanStep {
  week: number;
  who: Who;
  /** Ringy drafts or sets it up, but nothing goes live until the owner says OK. */
  afterOk: boolean;
  text: string;
  kind: PlanKind;
  itemLabel: string;
  metric: Metric;
}

export interface ThirtyDayPlan {
  focus: PlanItem[];
  later: PlanItem[];
  weeks: { week: number; steps: PlanStep[]; note: string | null }[];
  metrics: MetricNow[];
  counts: Record<Who, number>;
}

export const MAX_FOCUS = 3;
export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function metricNow(metric: Metric, items: PlanItem[], business: Business, reviews: Pick<Review, "rating" | "owner_response" | "text">[]): MetricNow {
  const label = METRIC_LABEL[metric];
  switch (metric) {
    case "rating":
      return { metric, label, now: business.rating != null ? `${business.rating} stars` : null, source: "Google listing", estimate: false };
    case "review_count":
      return { metric, label, now: business.review_count != null ? `${business.review_count.toLocaleString("en-US")} reviews` : null, source: "Google listing", estimate: false };
    case "reply_rate": {
      const p = replyStats(reviews).primary;
      return {
        metric,
        label,
        now: p ? `${Math.round(p.rate * 100)}%` : null,
        source: p ? `${p.replied} of ${p.n} ${p.basis === "negative" ? "1-2 star " : ""}reviews Ringy read have an owner reply (Ringy's sample)` : "too few reviews read to measure",
        estimate: false,
      };
    }
    case "revenue_estimate": {
      const m = items.filter((i) => METRIC_OF[i.kind] === metric && i.monthly != null);
      const top = m.sort((a, b) => (b.monthly ?? 0) - (a.monthly ?? 0))[0];
      return top
        ? { metric, label, now: `${usd(top.monthly!)}/mo at risk`, source: `Estimate for "${top.label.toLowerCase()}". Inputs are in the ROI calculator, overlaps counted once`, estimate: true }
        : { metric, label, now: null, source: "not estimated", estimate: true };
    }
    case "listing_basics": {
      const missing = [!business.phone && "phone", !business.opening_hours?.length && "hours", !business.website && "website"].filter(Boolean);
      return { metric, label, now: missing.length ? `missing: ${missing.join(", ")}` : "phone, hours and website listed", source: "Google listing", estimate: false };
    }
  }
}

/** Merge the top fixes' checklists into weeks 1-4, in plan order. The recommended fix always makes the cut. */
export function buildThirtyDay(items: PlanItem[], business: Business, reviews: Pick<Review, "rating" | "owner_response" | "text">[], max = MAX_FOCUS): ThirtyDayPlan {
  const rec = items.find((i) => i.recommended);
  const ordered = rec ? [rec, ...items.filter((i) => i !== rec)] : items;
  const focus = ordered.slice(0, max);
  const later = ordered.slice(max);
  const steps: PlanStep[] = focus.flatMap((it) =>
    it.checklist.map((c) => ({ week: c.week, who: whoOf(c.who), afterOk: c.who === "ringy_after_ok", text: c.text, kind: it.kind, itemLabel: it.label, metric: METRIC_OF[it.kind] })),
  );
  const metricsUsed = [...new Set(focus.map((i) => METRIC_OF[i.kind]))];
  const weeks = [1, 2, 3, 4].map((week) => {
    const s = steps.filter((x) => x.week === week);
    return {
      week,
      steps: s,
      note: s.length ? null : `Nothing new this week. Keep up the earlier steps and check ${metricsUsed.map((m) => METRIC_LABEL[m].toLowerCase()).join(" and ") || "the numbers"}.`,
    };
  });
  return {
    focus,
    later,
    weeks,
    metrics: metricsUsed.map((m) => metricNow(m, focus, business, reviews)),
    counts: { ringy: steps.filter((s) => s.who === "ringy").length, you: steps.filter((s) => s.who === "you").length },
  };
}
