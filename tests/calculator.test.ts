import { describe, expect, it } from "vitest";
import { applyCalcEdits, fmtPayback, payback, CalcInputError, CALC, combineRoi, computeRoi, defaultFields, toolDefault } from "@/lib/calculator";
import { computeMonthlyValue, defaultAssumptions, OVERLAP_RULE } from "@/lib/roi";
import { CATALOG } from "@/lib/prescription";
import type { FindingKind } from "@/lib/types";

const ctx = { category: "HVAC contractor", owner_response_rate: 0.6 };
const fields = (k: FindingKind) => defaultFields(k, "home_services", defaultAssumptions(k, ctx));
const dollars = (t: string) => [...t.matchAll(/\$(\d[\d,]*)/g)].map((m) => Number(m[1]!.replace(/,/g, "")));

describe("ROI calculator", () => {
  it("starts from the existing traced loss figure", () => {
    const r = computeRoi(fields("missed_calls"));
    expect(r.atRisk).toBe(computeMonthlyValue(defaultAssumptions("missed_calls", ctx)));
    expect(r.gain).toBe(Math.round(r.atRisk * CALC.win_back_share));
  });

  it("monthly net and payback are arithmetic on the inputs", () => {
    const f = fields("missed_calls");
    const v = (k: string) => f.find((x) => x.key === k)!.value;
    const r = computeRoi(f);
    expect(r.monthlyCost).toBe(Math.round(v("tool_usd_month")) + Math.round(v("owner_hours_month") * v("hourly_usd")));
    expect(r.net).toBe(r.gain - r.monthlyCost);
    expect(r.setupCost).toBe(Math.round(v("setup_hours") * v("hourly_usd")));
    expect(r.paybackMonths).toBe(Math.max(0.01, Math.round((r.setupCost / r.net) * 100) / 100));
    expect(r.paybackMonths).toBeGreaterThan(0); // a real setup cost never shows as "right away"
  });

  it("every dollar in the math lines is a computed result or an input", () => {
    const f = fields("missed_calls");
    const r = computeRoi(f);
    const allowed = new Set([r.atRisk, r.gain, r.toolCost, r.monthlyCost, Math.abs(r.net), r.setupCost, ...f.filter((x) => x.unit === "usd").map((x) => Math.round(x.value))]);
    for (const line of r.math) for (const d of dollars(line)) expect(allowed.has(d), `${d} in "${line}"`).toBe(true);
  });

  it("every input says where it came from; tool prices link a vendor pricing page", () => {
    for (const k of ["missed_calls", "slow_response", "booking_friction", "unanswered_reviews", "no_website"] as FindingKind[]) {
      for (const x of fields(k)) {
        expect(["sourced", "assumed", "calendar"]).toContain(x.status);
        expect(x.source.length).toBeGreaterThan(5);
        if (x.key === "tool_usd_month" && x.value > 0) {
          expect(x.status).toBe("sourced");
          expect(x.url).toMatch(/^https:\/\//);
          expect(CATALOG.products.some((p) => p.pricing_url === x.url)).toBe(true);
        }
        if (x.status === "sourced" && x.key !== "tool_usd_month") expect(x.group).toBe("loss");
      }
    }
  });

  it("uses no paid tool when no catalog product fits (reviews, website)", () => {
    expect(toolDefault("unanswered_reviews", "home_services", defaultAssumptions("unanswered_reviews", ctx))).toMatchObject({ usd: 0, url: null });
    expect(toolDefault("no_website", "home_services", defaultAssumptions("no_website", ctx)).usd).toBe(0);
  });

  it("says it does not pay back when the net is zero or negative", () => {
    const f = applyCalcEdits(fields("missed_calls"), { tool_usd_month: "100000" });
    const r = computeRoi(f);
    expect(r.net).toBeLessThan(0);
    expect(r.paybackMonths).toBeNull();
    expect(r.math.at(-1)).toMatch(/does not pay back/);
  });

  it("pays back right away when there is no setup time", () => {
    const r = computeRoi(applyCalcEdits(fields("missed_calls"), { setup_hours: "0" }));
    expect(r.paybackMonths).toBe(0);
  });

  it("formats payback in days under a month", () => {
    expect(payback(25, 1800)).toBe(0.01);
    expect(fmtPayback(0.01)).toBe("About 1 day");
    expect(fmtPayback(0.5)).toBe("About 16 days");
    expect(fmtPayback(2.345)).toBe("2.3 months");
    expect(fmtPayback(null)).toBe("Does not pay back");
  });

  it("marks edits and rejects bad input", () => {
    const f = applyCalcEdits(fields("missed_calls"), { avg_ticket: "600" });
    expect(f.find((x) => x.key === "avg_ticket")).toMatchObject({ value: 600, status: "edited" });
    expect(() => applyCalcEdits(fields("missed_calls"), { close_rate: "1.5" })).toThrow(CalcInputError);
    expect(() => applyCalcEdits(fields("missed_calls"), { avg_ticket: "-1" })).toThrow(CalcInputError);
    expect(() => applyCalcEdits(fields("missed_calls"), { avg_ticket: "" })).toThrow(CalcInputError);
  });

  it("combined total keeps the overlap rule: one per group, costs only for kept rows", () => {
    const rows = (["missed_calls", "slow_response", "booking_friction", "unanswered_reviews", "no_website"] as FindingKind[]).map((k) => ({ kind: k, label: k, result: computeRoi(fields(k)) }));
    const c = combineRoi(rows);
    expect(c.kept).toHaveLength(2);
    expect(c.dropped).toHaveLength(3);
    const inbound = rows.slice(0, 3).sort((a, b) => b.result.gain - a.result.gain)[0]!;
    const found = rows.slice(3).sort((a, b) => b.result.gain - a.result.gain)[0]!;
    expect(c.gain).toBe(inbound.result.gain + found.result.gain);
    expect(c.monthlyCost).toBe(inbound.result.monthlyCost + found.result.monthlyCost);
    expect(c.net).toBe(c.gain - c.monthlyCost);
    expect(c.rule).toBe(OVERLAP_RULE);
  });
});
