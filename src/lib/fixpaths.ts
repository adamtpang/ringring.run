// In-house vs outsourced, per recommendation: do it yourself (time cost, an estimate),
// Ringy does it (after your OK), or a third-party category. Pure.
import { z } from "zod";
import pathsJson from "@/data/fix-paths.json";
import { CALC } from "./calculator";
import { FIX_CAPABILITIES, type PlanItem } from "./gameplan";
import { CATALOG, callsPerMonth, prescribe, verticalFor, type Catalog } from "./prescription";
import { FINDING_KINDS, PLAN_KINDS, type Business, type FindingKind, type PlanKind, type RoiEstimate } from "./types";

const Hours = z.object({ setup_hours: z.number().min(0), owner_hours_month: z.number().min(0), basis: z.string().min(10) });
const PathsSchema = z.object({
  note: z.string(),
  kinds: z.record(z.enum(PLAN_KINDS), z.object({ category: z.string().min(5), diy: Hours.optional() })),
});
export const FIX_PATHS = PathsSchema.parse(pathsJson);

const isFinding = (k: PlanKind): k is FindingKind => (FINDING_KINDS as readonly string[]).includes(k);

export interface DiyPath {
  steps: string[];
  setupHours: number | null;
  hoursMonth: number | null;
  /** hoursMonth × hourly value; an estimate. */
  usdMonth: number | null;
  hourlyUsd: number;
  basis: string;
}
export interface RingyPath {
  role: "builds" | "drafts" | "supports";
  roleLabel: string;
  steps: { text: string; afterOk: boolean }[];
  price: string;
  /** What does not work yet, when Ringy builds it. */
  limits: string | null;
}
export interface Vendor {
  name: string;
  plan: string | null;
  usdMonth: number;
  pricingUrl: string;
  checkedOn: string;
  note: string | null;
}
export interface ThirdPartyPath {
  category: string;
  vendors: Vendor[];
  note: string;
}
export interface FixPaths {
  kind: PlanKind;
  diy: DiyPath;
  ringy: RingyPath;
  thirdParty: ThirdPartyPath;
}

export function diyPath(item: PlanItem): DiyPath {
  const h = isFinding(item.kind) ? CALC.kinds[item.kind] : FIX_PATHS.kinds[item.kind].diy;
  const hourlyUsd = CALC.hourly_value_usd;
  return {
    steps: item.you,
    setupHours: h?.setup_hours ?? null,
    hoursMonth: h?.owner_hours_month ?? null,
    usdMonth: h ? Math.round(h.owner_hours_month * hourlyUsd) : null,
    hourlyUsd,
    basis: h ? h.basis : "Not estimated: it depends on what is going wrong. Only you can size it.",
  };
}

export function ringyPath(item: PlanItem, catalog: Catalog = CATALOG): RingyPath {
  const steps = item.ringy.map((s) => ({ text: s.text, afterOk: s.actor === "ringy_after_ok" }));
  const builds = catalog.in_house.problems.includes(item.kind as FindingKind);
  const fixes = !item.ownerOnly && item.ringy.some((s) => FIX_CAPABILITIES.includes(s.capability));
  const role: RingyPath["role"] = builds ? "builds" : fixes ? "drafts" : "supports";
  return {
    role,
    roleLabel:
      role === "builds"
        ? "Ringy builds it, after your OK"
        : role === "drafts"
          ? "Ringy does the work, you approve it"
          : "Ringy helps; the fix itself is yours",
    steps,
    price: "Price not set yet.",
    limits: builds ? catalog.in_house.limits : null,
  };
}

export function thirdPartyPath(item: PlanItem, business: Business, roi: RoiEstimate[], catalog: Catalog = CATALOG, max = 3): ThirdPartyPath {
  const category = FIX_PATHS.kinds[item.kind].category;
  if (!isFinding(item.kind)) return { category, vendors: [], note: "No product named: none we checked covers this." };
  const est = roi.find((r) => r.finding_id === item.findingId);
  const p = prescribe(item.kind, verticalFor(business.category), item.monthly ?? 0, est ? callsPerMonth(est.assumptions) : null, catalog, max);
  const vendors = [...p.options, ...p.alsoChecked]
    .filter((o) => o.estUsdMonth != null && !!o.product.pricing_url)
    .sort((a, b) => Number(!!a.whyNot) - Number(!!b.whyNot) || a.estUsdMonth! - b.estUsdMonth!)
    .slice(0, max)
    .map((o) => ({ name: o.product.name, plan: o.plan, usdMonth: o.estUsdMonth!, pricingUrl: o.product.pricing_url!, checkedOn: o.product.checked_on, note: o.whyNot }));
  return {
    category,
    vendors,
    note: vendors.length
      ? "Prices from each vendor's public pricing page at the volume assumed here. No affiliation, no referral fees."
      : "No product named: none we checked has a public price for this.",
  };
}

export function buildFixPaths(items: PlanItem[], business: Business, roi: RoiEstimate[]): Record<string, FixPaths> {
  return Object.fromEntries(items.map((i) => [i.kind, { kind: i.kind, diy: diyPath(i), ringy: ringyPath(i), thirdParty: thirdPartyPath(i, business, roi) }]));
}
