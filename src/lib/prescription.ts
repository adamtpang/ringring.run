import { z } from "zod";
import catalogJson from "@/data/solutions.json";
import interviewJson from "@/data/interview.json";
import { FINDING_KINDS, type Assumption, type Finding, type FindingKind, type RoiEstimate } from "./types";

// Ringy's prescription: for each top problem, a short menu of real products
// (from a hand-checked catalog) plus our in-house agent, and one pick with a
// one-line reason. Prices come only from src/data/solutions.json, which is
// copied from each vendor's own pricing page. Nothing here invents a price.

export const VERTICALS = ["home_services", "dental", "any"] as const;
export type Vertical = (typeof VERTICALS)[number];

const Kind = z.enum(FINDING_KINDS);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const PriceSchema = z
  .object({
    status: z.enum(["public", "not_public"]),
    usd_month: z.number().nonnegative().nullable(),
    plan: z.string().nullable(),
    included_calls: z.number().int().positive().optional(),
    per_extra_call_usd: z.number().nonnegative().optional(),
    note: z.string().min(1),
    by_problem: z.partialRecord(Kind, z.object({ usd_month: z.number().nonnegative(), plan: z.string() })).optional(),
  })
  .refine((p) => (p.status === "public") === (p.usd_month != null), "Public prices need a number; non-public prices must be null");

export const ProductSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  vendor: z.string().min(1),
  url: z.string().regex(/^https:\/\/[^\s]+$/),
  pricing_url: z.string().regex(/^https:\/\/[^\s]+$/).optional(),
  type: z.enum(["ai_receptionist", "live_answering", "field_service_software", "patient_communication"]),
  problems: z.array(Kind).min(1),
  verticals: z.array(z.enum(VERTICALS)).min(1),
  summary: z.string().min(1),
  price: PriceSchema,
  requires: z.string().nullable(),
  checked_on: Day,
  affiliation: z.literal("none"),
});
export type Product = z.infer<typeof ProductSchema>;

export const InHouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  built_by: z.literal("ringring.run"),
  problems: z.array(Kind).min(1),
  verticals: z.array(z.enum(VERTICALS)).min(1),
  summary: z.string(),
  limits: z.string(),
  price: z.object({ status: z.enum(["tbd", "set"]), usd_month: z.number().nonnegative().nullable(), note: z.string() }),
});
export type InHouse = z.infer<typeof InHouseSchema>;

export const CatalogSchema = z.object({
  checked_on: Day,
  note: z.string(),
  fair_share_of_loss: z.number().gt(0).lte(1),
  in_house: InHouseSchema,
  products: z.array(ProductSchema).min(1),
});
export type Catalog = z.infer<typeof CatalogSchema>;

export const CATALOG: Catalog = CatalogSchema.parse(catalogJson);

export const InterviewSchema = z.record(Kind, z.array(z.string().min(10)).min(4).max(5));
export const INTERVIEW: Record<FindingKind, string[]> = InterviewSchema.parse(interviewJson);

export function verticalFor(category: string | null | undefined): Vertical {
  if (!category) return "any";
  if (/dent|orthodont/i.test(category)) return "dental";
  if (/hvac|heating|air cond|plumb|electric|roof|garage door|pest|contractor/i.test(category)) return "home_services";
  return "any";
}

// ---------- problem ranking ----------

export interface RankedProblem {
  finding: Finding;
  roi: RoiEstimate | null;
  evidenceCount: number;
  monthly: number;
}

/** Top problems: most evidence first, then highest estimated monthly cost, then severity. */
export function rankProblems(findings: Finding[], roi: RoiEstimate[], limit = 3): RankedProblem[] {
  const byFinding = new Map(roi.map((r) => [r.finding_id, r]));
  return findings
    .map((f) => {
      const r = byFinding.get(f.id) ?? null;
      return { finding: f, roi: r, evidenceCount: f.evidence.length, monthly: r?.monthly_value ?? 0 };
    })
    .sort((a, b) => b.evidenceCount - a.evidenceCount || b.monthly - a.monthly || b.finding.severity - a.finding.severity)
    .slice(0, limit);
}

/** Calls a month implied by the assumptions, when the problem is about calls. */
export function callsPerMonth(assumptions: Assumption[]): number | null {
  const v = (k: string) => assumptions.find((a) => a.key === k)?.value;
  const perWeek = v("missed_calls_per_week");
  const weeks = v("weeks_per_month");
  return perWeek != null && weeks != null ? perWeek * weeks : null;
}

// ---------- prescription ----------

export interface MenuOption {
  product: Product;
  plan: string | null;
  /** Estimated monthly price at the assumed volume, or null when the vendor does not publish one. */
  estUsdMonth: number | null;
  fits: boolean;
  /** Why it does not fit, in plain words; null when it fits. */
  whyNot: string | null;
}

export interface Prescription {
  kind: FindingKind;
  options: MenuOption[];
  /** Products checked that did not make the menu (no public price, a prerequisite, or over the fair price). */
  alsoChecked: MenuOption[];
  inHouse: InHouse | null;
  pick: { source: "third_party"; id: string } | { source: "in_house"; id: string } | null;
  reason: string;
  fairCeilingUsd: number;
}

export function estimatePrice(p: Product, kind: FindingKind, calls: number | null): { usd: number | null; plan: string | null } {
  const special = p.price.by_problem?.[kind];
  if (special) return { usd: special.usd_month, plan: special.plan };
  if (p.price.usd_month == null) return { usd: null, plan: p.price.plan };
  let usd = p.price.usd_month;
  if (calls != null && p.price.included_calls != null && p.price.per_extra_call_usd != null) {
    usd += Math.max(0, calls - p.price.included_calls) * p.price.per_extra_call_usd;
  }
  return { usd: Math.round(usd), plan: p.price.plan };
}

const matchesVertical = (vs: readonly Vertical[], v: Vertical) => vs.includes("any") || vs.includes(v);
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function prescribe(
  kind: FindingKind,
  vertical: Vertical,
  monthlyLoss: number,
  calls: number | null,
  catalog: Catalog = CATALOG,
  maxOptions = 3,
): Prescription {
  const fairCeilingUsd = Math.round(monthlyLoss * catalog.fair_share_of_loss);
  const ih = catalog.in_house;
  const inHouse = ih.problems.includes(kind) && matchesVertical(ih.verticals, vertical) ? ih : null;
  const inHousePrice = inHouse?.price.status === "set" ? inHouse.price.usd_month : null;

  const all: MenuOption[] = catalog.products
    .filter((p) => p.problems.includes(kind) && matchesVertical(p.verticals, vertical))
    .map((p) => {
      const { usd, plan } = estimatePrice(p, kind, calls);
      let whyNot: string | null = null;
      if (usd == null) whyNot = "No public price.";
      else if (p.requires) whyNot = `Needs ${p.requires.toLowerCase()}.`;
      else if (usd > fairCeilingUsd) whyNot = `About ${money(usd)}/mo, more than the fair price of ${money(fairCeilingUsd)}/mo.`;
      return { product: p, plan, estUsdMonth: usd, fits: whyNot == null, whyNot };
    })
    .sort((a, b) => Number(b.fits) - Number(a.fits) || (a.estUsdMonth ?? Infinity) - (b.estUsdMonth ?? Infinity));

  const fitting = all.filter((o) => o.fits);
  const options = fitting.slice(0, maxOptions);
  const alsoChecked = all.filter((o) => !options.includes(o));
  const best = fitting[0];
  const pct = Math.round(catalog.fair_share_of_loss * 100);

  if (best && (inHousePrice == null || best.estUsdMonth! < inHousePrice)) {
    const vs =
      inHousePrice == null
        ? "our own price is not set yet"
        : `cheaper than ours at ${money(inHousePrice)}/mo`;
    return {
      kind, options, alsoChecked, inHouse, fairCeilingUsd,
      pick: { source: "third_party", id: best.product.id },
      reason: `${best.product.name} fits at about ${money(best.estUsdMonth!)}/mo, under ${pct}% of the estimated loss, and ${vs}.`,
    };
  }
  if (inHouse) {
    const reason = best
      ? `Ours costs less than ${best.product.name} at about ${money(best.estUsdMonth!)}/mo and is already built for this business.`
      : `No product we checked fits at a fair, public price, so we build it: our agent is already built for this business.`;
    return { kind, options, alsoChecked, inHouse, fairCeilingUsd, pick: { source: "in_house", id: inHouse.id }, reason };
  }
  return { kind, options, alsoChecked, inHouse, fairCeilingUsd, pick: null, reason: "No product in our catalog covers this yet, and our agent does not fix it." };
}
