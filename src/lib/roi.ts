import type { Assumption, Business, FindingKind } from "./types";

// ROI model. Every estimate is the product of explicit, editable assumptions.
// Values come only from listing data (source "listing") or stated defaults
// (source "assumption"). The LLM never supplies numbers here.

const AVG_TICKET_BY_CATEGORY: [RegExp, number][] = [
  [/plumb/i, 350],
  [/hvac|heating|air condition/i, 450],
  [/electric/i, 300],
  [/roof/i, 900],
  [/dent/i, 250],
  [/law|attorney|lawyer/i, 1500],
  [/restaurant|cafe|pizza|taco|bar\b/i, 35],
  [/salon|barber|spa|nail/i, 60],
  [/auto|mechanic|car repair|tire/i, 400],
  [/clean|maid/i, 180],
  [/landscap|lawn/i, 200],
];
export const DEFAULT_AVG_TICKET = 200;

export function defaultAvgTicket(category: string | null | undefined): number {
  if (!category) return DEFAULT_AVG_TICKET;
  for (const [re, v] of AVG_TICKET_BY_CATEGORY) if (re.test(category)) return v;
  return DEFAULT_AVG_TICKET;
}

function a(
  key: string,
  label: string,
  value: number,
  unit: Assumption["unit"],
  note?: string,
  source: Assumption["source"] = "assumption",
): Assumption {
  return { key, label, value, unit, source, note };
}

type RoiContext = Pick<Business, "category" | "owner_response_rate"> & { searchCategory?: string };

export function defaultAssumptions(kind: FindingKind, ctx: RoiContext): Assumption[] {
  const ticket = defaultAvgTicket(ctx.category || ctx.searchCategory);
  const avgTicket = a("avg_ticket", "Average ticket", ticket, "usd", "Assumed typical job value for this category. Edit to match.");
  const closeRate = a("close_rate", "Close rate on a real lead", 0.4, "ratio", "Assumed share of qualified leads that become paid jobs.");
  switch (kind) {
    case "missed_calls":
      return [
        a("missed_calls_per_week", "Missed calls per week", 10, "count", "Assumed. Confirm with the owner or call logs."),
        a("weeks_per_month", "Weeks per month", 4.33, "multiplier"),
        a("new_job_share", "Share of missed calls that are new jobs", 0.5, "ratio", "Assumed."),
        closeRate,
        avgTicket,
      ];
    case "slow_response":
      return [
        a("monthly_inquiries", "Inquiries per month", 40, "count", "Assumed."),
        a("lost_to_delay_share", "Share lost to slow replies", 0.15, "ratio", "Assumed."),
        closeRate,
        avgTicket,
      ];
    case "booking_friction":
      return [
        a("monthly_booking_attempts", "Booking attempts per month", 50, "count", "Assumed."),
        a("abandon_share", "Share who give up booking", 0.1, "ratio", "Assumed."),
        closeRate,
        avgTicket,
      ];
    case "unanswered_reviews": {
      const rate = ctx.owner_response_rate;
      const unanswered =
        rate == null
          ? a("unanswered_share", "Share of reviews without a reply", 0.8, "ratio", "Assumed; response rate unknown.")
          : a(
              "unanswered_share",
              "Share of reviews without a reply",
              Math.round((1 - rate) * 100) / 100,
              "ratio",
              "From the scraped reviews on the listing.",
              "listing",
            );
      return [
        a("monthly_profile_views", "Google profile views per month", 500, "count", "Assumed."),
        a("view_to_call", "Views that would call", 0.05, "ratio", "Assumed."),
        unanswered,
        a("trust_loss", "Callers lost to visible unanswered complaints", 0.1, "ratio", "Assumed."),
        closeRate,
        avgTicket,
      ];
    }
    case "no_website":
      return [
        a("monthly_profile_views", "Google profile views per month", 500, "count", "Assumed."),
        a("website_seekers", "Viewers who look for a website", 0.1, "ratio", "Assumed."),
        a("visit_to_lead", "Site visits that become leads", 0.1, "ratio", "Assumed."),
        closeRate,
        avgTicket,
      ];
  }
}

export function formulaFor(assumptions: Assumption[]): string {
  return assumptions.map((x) => x.label).join(" x ");
}

export class InvalidAssumptionError extends Error {}

export function validateAssumption(x: Assumption): void {
  if (!Number.isFinite(x.value) || x.value < 0) {
    throw new InvalidAssumptionError(`${x.label} must be a non-negative number`);
  }
  if (x.unit === "ratio" && x.value > 1) {
    throw new InvalidAssumptionError(`${x.label} must be between 0 and 1`);
  }
}

/** Monthly value in USD: the product of all assumption values, rounded to whole dollars. */
export function computeMonthlyValue(assumptions: Assumption[]): number {
  if (assumptions.length === 0) return 0;
  let v = 1;
  for (const x of assumptions) {
    validateAssumption(x);
    v *= x.value;
  }
  return Math.round(v);
}

/** Apply user edits (key -> value) on top of existing assumptions. Unknown keys are rejected. */
export function applyEdits(assumptions: Assumption[], edits: Record<string, number>): Assumption[] {
  const keys = new Set(assumptions.map((x) => x.key));
  for (const k of Object.keys(edits)) {
    if (!keys.has(k)) throw new InvalidAssumptionError(`Unknown assumption: ${k}`);
  }
  return assumptions.map((x) => {
    if (!(x.key in edits)) return x;
    const next: Assumption = { ...x, value: Number(edits[x.key]), source: "assumption", note: "Edited by user." };
    validateAssumption(next);
    return next;
  });
}

/** 0-100 score that rises with estimated monthly value; ranking uses the dollar value. */
export function opportunityScore(totalMonthly: number): number {
  if (totalMonthly <= 0) return 0;
  return Math.round(100 * (1 - Math.exp(-totalMonthly / 8000)));
}
