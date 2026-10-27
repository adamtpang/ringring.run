import calcJson from "@/data/calculator.json";
import { z } from "zod";
import { CATALOG, callsPerMonth, prescribe, type Catalog, type Vertical } from "./prescription";
import { ASSUMPTION_LABEL, computeMonthlyValue, dedupMonthly, moneyTrace, OVERLAP_RULE } from "./roi";
import { FINDING_KINDS, type Assumption, type FindingKind } from "./types";

// Adjustable ROI calculator. Pure functions, no persistence: the page keeps
// edits in memory only. Every output is arithmetic on inputs that each carry
// a status (from the listing, a vendor pricing page, the calendar, or an
// assumption) so nothing on screen is a number typed in by hand.

const KindDefaults = z.object({ setup_hours: z.number().min(0), owner_hours_month: z.number().min(0), basis: z.string().min(10) });
const CalcSchema = z.object({
  note: z.string(),
  win_back_share: z.number().min(0).max(1),
  hourly_value_usd: z.number().min(0),
  kinds: z.record(z.enum(FINDING_KINDS), KindDefaults),
});
export const CALC = CalcSchema.parse(calcJson);

export type FieldStatus = "sourced" | "assumed" | "calendar" | "edited";

export interface CalcField {
  key: string;
  label: string;
  value: number;
  unit: "usd" | "ratio" | "count" | "multiplier" | "hours";
  status: FieldStatus;
  /** Plain words on where the default came from. */
  source: string;
  url?: string;
  /** "loss" inputs multiply to the money at risk; "fix" inputs describe the fix. */
  group: "loss" | "fix";
}

export interface CalcResult {
  /** Monthly revenue at risk: product of the loss inputs. */
  atRisk: number;
  /** atRisk × share won back. */
  gain: number;
  toolCost: number;
  timeCost: number;
  /** toolCost + timeCost. */
  monthlyCost: number;
  /** gain − monthlyCost. Revenue, before your job costs. */
  net: number;
  /** setup hours × hourly value. */
  setupCost: number;
  /** Months for net to cover the setup cost; 0 when there is no setup cost; null when net ≤ 0. */
  paybackMonths: number | null;
  /** The arithmetic, one line per step. */
  math: string[];
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
export const fmtField = (f: Pick<CalcField, "unit" | "value">) =>
  f.unit === "usd" ? usd(f.value) : f.unit === "ratio" ? pct(f.value) : f.unit === "hours" ? `${f.value} h` : String(f.value);

function lossFields(assumptions: Assumption[]): CalcField[] {
  const t = moneyTrace(assumptions);
  return assumptions.map((a, i) => {
    const ti = t?.inputs[i];
    return {
      key: a.key,
      label: a.label,
      value: a.value,
      unit: a.unit,
      status: ti?.status === "sourced" ? "sourced" : ti?.status === "calendar" ? "calendar" : "assumed",
      source: ti?.source ?? ASSUMPTION_LABEL,
      group: "loss" as const,
    };
  });
}

export interface ToolDefault {
  usd: number;
  name: string | null;
  url: string | null;
  source: string;
}

/** The cheapest product that fits this problem with a public price, from vendor pricing pages. Else $0 with a plain label. */
export function toolDefault(kind: FindingKind, vertical: Vertical, assumptions: Assumption[], catalog: Catalog = CATALOG): ToolDefault {
  const loss = assumptions.length ? computeMonthlyValue(assumptions) : 0;
  const rx = prescribe(kind, vertical, loss, kind === "missed_calls" ? callsPerMonth(assumptions) : null, catalog);
  const pick = rx.options.find((o) => o.estUsdMonth != null && o.product.pricing_url);
  if (pick && pick.estUsdMonth != null) {
    return { usd: pick.estUsdMonth, name: pick.product.name, url: pick.product.pricing_url ?? null, source: `${pick.product.name} pricing page, checked ${CHECKED_ON(catalog.checked_on)}${pick.plan ? ` (${pick.plan})` : ""}` };
  }
  return { usd: 0, name: null, url: null, source: "No paid tool assumed: Ringy drafts, you approve. Enter a tool price if you use one." };
}

export function defaultFields(kind: FindingKind, vertical: Vertical, assumptions: Assumption[], catalog: Catalog = CATALOG): CalcField[] {
  const k = CALC.kinds[kind];
  const tool = toolDefault(kind, vertical, assumptions, catalog);
  const fix: CalcField[] = [
    { key: "win_back", label: "Share of that the fix wins back", value: CALC.win_back_share, unit: "ratio", status: "assumed", source: `${ASSUMPTION_LABEL}. No fix recovers every lost job.`, group: "fix" },
    { key: "tool_usd_month", label: "Tool cost per month", value: tool.usd, unit: "usd", status: tool.url ? "sourced" : "assumed", source: tool.source, ...(tool.url ? { url: tool.url } : {}), group: "fix" },
    { key: "owner_hours_month", label: "Your time per month", value: k.owner_hours_month, unit: "hours", status: "assumed", source: `${ASSUMPTION_LABEL}. ${k.basis}`, group: "fix" },
    { key: "setup_hours", label: "Your setup time, once", value: k.setup_hours, unit: "hours", status: "assumed", source: `${ASSUMPTION_LABEL}. ${k.basis}`, group: "fix" },
    { key: "hourly_usd", label: "What an hour of your time is worth", value: CALC.hourly_value_usd, unit: "usd", status: "assumed", source: ASSUMPTION_LABEL, group: "fix" },
  ];
  return [...lossFields(assumptions), ...fix];
}

export class CalcInputError extends Error {}

/** Apply edits (key → raw string from an input). Edited fields are marked "edited". Throws on bad input. */
export function applyCalcEdits(fields: CalcField[], edits: Record<string, string>): CalcField[] {
  return fields.map((f) => {
    if (!(f.key in edits)) return f;
    const raw = edits[f.key]!;
    const v = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(v) || v < 0) throw new CalcInputError(`${f.label} must be a number, 0 or more`);
    if (f.unit === "ratio" && v > 1) throw new CalcInputError(`${f.label} must be between 0 and 1`);
    return { ...f, value: v, status: "edited", source: "entered on this page, not saved, not verified" };
  });
}

const val = (fields: CalcField[], key: string) => fields.find((f) => f.key === key)?.value ?? 0;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Months for `net` a month to cover `setup` once; 0 with no setup; null when it never does. Never rounds a real cost down to 0. */
export function payback(setup: number, net: number): number | null {
  if (net <= 0) return null;
  if (setup <= 0) return 0;
  return Math.max(0.01, round2(setup / net));
}
const days = (m: number) => Math.max(1, Math.ceil(m * 30.4));
/** "Right away", "about 3 days", "1.5 months" or "Does not pay back". */
export function fmtPayback(m: number | null): string {
  if (m == null) return "Does not pay back";
  if (m === 0) return "Right away";
  if (m < 1) return `About ${days(m)} ${days(m) === 1 ? "day" : "days"}`;
  return `${Math.round(m * 10) / 10} months`;
}
const CHECKED_ON = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function computeRoi(fields: CalcField[]): CalcResult {
  const loss = fields.filter((f) => f.group === "loss");
  const atRisk = loss.length ? Math.round(loss.reduce((p, f) => p * f.value, 1)) : 0;
  const share = val(fields, "win_back");
  const gain = Math.round(atRisk * share);
  const toolCost = Math.round(val(fields, "tool_usd_month"));
  const hourly = val(fields, "hourly_usd");
  const timeCost = Math.round(val(fields, "owner_hours_month") * hourly);
  const monthlyCost = toolCost + timeCost;
  const net = gain - monthlyCost;
  const setupCost = Math.round(val(fields, "setup_hours") * hourly);
  const paybackMonths = payback(setupCost, net);
  const math = [
    `At risk: ${loss.map(fmtField).join(" × ")} = ${usd(atRisk)}/mo`,
    `Won back: ${usd(atRisk)} × ${pct(share)} = ${usd(gain)}/mo`,
    `Cost: ${usd(toolCost)} tool + ${val(fields, "owner_hours_month")} h × ${usd(hourly)} of your time = ${usd(monthlyCost)}/mo`,
    `Net: ${usd(gain)} − ${usd(monthlyCost)} = ${net < 0 ? "−" : ""}${usd(Math.abs(net))}/mo`,
    `Setup: ${val(fields, "setup_hours")} h × ${usd(hourly)} = ${usd(setupCost)} once`,
    paybackMonths == null ? "Payback: does not pay back at these inputs" : paybackMonths === 0 ? "Payback: right away (no setup cost)" : `Payback: ${usd(setupCost)} ÷ ${usd(net)}/mo = ${paybackMonths} months (${fmtPayback(paybackMonths).toLowerCase()})`,
  ];
  return { atRisk, gain, toolCost, timeCost, monthlyCost, net, setupCost, paybackMonths, math };
}

export interface CalcRow {
  kind: FindingKind;
  label: string;
  result: CalcResult;
}

export interface CombinedRoi {
  /** Rows counted, at most one per overlap group (the largest win-back). */
  kept: CalcRow[];
  /** Rows left out because they can be the same customers as a kept row. */
  dropped: { kind: FindingKind; label: string; gain: number; keptLabel: string }[];
  gain: number;
  monthlyCost: number;
  net: number;
  setupCost: number;
  paybackMonths: number | null;
  rule: string;
  math: string;
}

/** Totals across recommendations with the overlap rule: in each group only the largest win-back counts, and only its costs are added. */
export function combineRoi(rows: CalcRow[]): CombinedRoi {
  const d = dedupMonthly(rows.map((r) => ({ kind: r.kind, monthly: r.result.gain })));
  const droppedKinds = new Set(d.dropped.map((x) => x.kind));
  const kept = rows.filter((r) => r.result.gain > 0 && !droppedKinds.has(r.kind));
  const label = (k: string) => rows.find((r) => r.kind === k)?.label ?? k;
  const dropped = d.dropped.map((x) => ({ kind: x.kind as FindingKind, label: label(x.kind), gain: x.monthly, keptLabel: label(x.keptKind) }));
  const gain = kept.reduce((s, r) => s + r.result.gain, 0);
  const monthlyCost = kept.reduce((s, r) => s + r.result.monthlyCost, 0);
  const net = gain - monthlyCost;
  const setupCost = kept.reduce((s, r) => s + r.result.setupCost, 0);
  const paybackMonths = payback(setupCost, net);
  const math = kept.length
    ? `${kept.map((r) => `${r.label.toLowerCase()} ${usd(r.result.net)}`).join(" + ")} = ${net < 0 ? "−" : ""}${usd(Math.abs(net))}/mo net`
    : "Nothing priced yet";
  return { kept, dropped, gain, monthlyCost, net, setupCost, paybackMonths, rule: OVERLAP_RULE, math };
}

export const fmtUsd = usd;
export const fmtMonths = fmtPayback;
