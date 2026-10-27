import { describe, expect, it } from "vitest";
import { combineRoi, computeRoi, defaultFields } from "@/lib/calculator";
import { buildGamePlan, type GamePlan, type PlanInput } from "@/lib/gameplan";
import { buildBoard, toSubjectInput } from "@/lib/peers";
import { rankByMoney, stepsWithCurrentFigures } from "@/lib/business-money";
import { changeSource, describeCheckin } from "@/lib/checkin/logic";
import { businessMoney, businessMoneyHow, computeMonthlyValue, defaultAssumptions, opportunityScore, runMoney, runMoneyHow, scoreHow, type BusinessMoney } from "@/lib/roi";
import type { Business, Finding, FindingKind, Review, RoiEstimate } from "@/lib/types";

// Every dollar or percent figure the game plan renders must sit in an object that
// carries where it came from: a `trace` (inputs and math), a `moneyTrace`, a
// `money` breakdown, or a `source`. Every dollar amount must also equal a figure
// some trace actually computes, so nothing is typed in by hand.

const SCAN = "2026-10-26T21:48:51Z";
const FIGURE = /\$\d[\d,]*|\b\d+(?:\.\d+)?%/;
const PROVENANCE = ["trace", "moneyTrace", "money", "source"] as const;

const biz = (over: Partial<Business> = {}): Business =>
  ({
    id: "b1", run_id: "r1", place_id: "ChIJtest", name: "Test Air", category: "HVAC contractor", address: null, city: "Austin",
    phone: "(512) 555-0100", website: "https://example.com/", rating: 4.6, review_count: 80,
    opening_hours: [{ day: "Monday", hours: "8 AM to 5 PM" }], maps_url: "https://maps.google.com/?cid=1",
    owner_response_rate: 0.6, scraped_review_count: 10, is_fixture: true, diagnosis_status: "ok", diagnosis_summary: null,
    diagnosis_error: null, opportunity_score: 0, est_monthly_value: 0, raw: {}, created_at: SCAN, ...over,
  }) as Business;

let n = 0;
const rev = (rating: number, text: string, date: string, replied = false): Review => {
  n++;
  return { id: `rv${n}`, business_id: "b1", external_id: null, rating, text, published_at: date, owner_response: replied ? "Thanks." : null, position: n };
};
const finding = (kind: FindingKind, r: Review, severity = 4): Finding =>
  ({ id: `f-${kind}`, business_id: "b1", run_id: "r1", kind, title: kind, detail: "d", severity, solution: "ai_receptionist", evidence: [{ source: "review", review_id: r.id, quote: r.text.slice(0, 40), rating: r.rating }], created_at: SCAN }) as Finding;
const roi = (f: Finding, b: Business): RoiEstimate =>
  ({ id: `roi-${f.id}`, finding_id: f.id, business_id: "b1", assumptions: defaultAssumptions(f.kind, b), formula: "", monthly_value: 999999, is_edited: false, updated_at: SCAN }) as RoiEstimate;

function plan(b: Business, reviews: Review[], kinds: [FindingKind, number][]): GamePlan {
  const findings = kinds.map(([k, i]) => finding(k, reviews[i]!, 5));
  const subject = toSubjectInput(b, reviews, null);
  const p: PlanInput = { business: b, findings, roi: findings.map((f) => roi(f, b)), reviews, knowledge: [], board: buildBoard(subject), subject, scanDate: SCAN };
  return buildGamePlan(p);
}

/** All strings with a figure, with the nearest object that holds them (arrays pass through to their parent). */
function figures(node: unknown, holder: Record<string, unknown> | null, path: string, out: { path: string; text: string; holder: Record<string, unknown> | null }[]) {
  if (typeof node === "string") {
    if (FIGURE.test(node)) out.push({ path, text: node, holder });
  } else if (Array.isArray(node)) node.forEach((x, i) => figures(x, holder, `${path}[${i}]`, out));
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    // Provenance objects themselves (the math and its inputs) are the source.
    if ("math" in o && "inputs" in o) return;
    for (const [k, v] of Object.entries(o)) figures(v, o, `${path}.${k}`, out);
  }
}

function tracedDollars(g: GamePlan): Set<number> {
  const s = new Set<number>();
  for (const i of g.items) if (i.moneyTrace) {
    s.add(i.moneyTrace.result);
    for (const x of i.moneyTrace.inputs) if (x.display.startsWith("$")) s.add(Number(x.display.replace(/[$,]/g, "")));
  }
  const m = g.prognosis.money;
  if (m) {
    s.add(m.total);
    m.dropped.forEach((d) => s.add(d.monthly));
  }
  return s;
}

const SCENARIOS: Record<string, () => GamePlan> = {
  "reach problems with overlap": () => {
    const r = [rev(1, "Called three times, no answer at all.", "2026-09-01T00:00:00Z"), rev(1, "Took days to get a reply to my message.", "2026-09-10T00:00:00Z"), rev(2, "Could not book online, had to call.", "2026-08-01T00:00:00Z"), ...[1, 2, 3, 4, 5].map((i) => rev(5, `Great work ${i}.`, "2026-07-01T00:00:00Z", true))];
    return plan(biz(), r, [["missed_calls", 0], ["slow_response", 1], ["booking_friction", 2]]);
  },
  "reply gap": () => {
    const r = [rev(1, "Rude and late.", "2026-09-01T00:00:00Z"), rev(2, "Messy job.", "2026-09-02T00:00:00Z"), ...[1, 2, 3, 4].map((i) => rev(5, `Fine ${i}.`, "2026-07-01T00:00:00Z"))];
    return plan(biz({ owner_response_rate: 0 }), r, [["unanswered_reviews", 0]]);
  },
  "missing basics": () => plan(biz({ website: null, opening_hours: [], review_count: 6 }), [rev(4, "Okay.", "2026-09-01T00:00:00Z")], [["no_website", 0]]),
};

describe("every dollar or percent figure in the game plan is traceable", () => {
  for (const [name, make] of Object.entries(SCENARIOS)) {
    it(name, () => {
      const g = make();
      const found: Parameters<typeof figures>[3] = [];
      figures(g, null, "plan", found);
      expect(found.length).toBeGreaterThan(0);
      const allowed = tracedDollars(g);
      for (const f of found) {
        const has = f.holder && PROVENANCE.some((k) => f.holder![k] != null && f.holder![k] !== "");
        expect(has, `${f.path}: "${f.text}" has no source or assumptions object`).toBe(true);
        for (const m of f.text.matchAll(/\$(\d[\d,]*)/g)) {
          const v = Number(m[1]!.replace(/,/g, ""));
          expect(allowed.has(v), `${f.path}: $${m[1]} is not a figure any trace computes`).toBe(true);
        }
      }
    });
  }

  it("the missed-call figure is the product of its listed inputs", () => {
    const g = SCENARIOS["reach problems with overlap"]!();
    const miss = g.items.find((i) => i.kind === "missed_calls")!;
    const product = miss.moneyTrace!.inputs.reduce((p, x) => p * Number(x.display.replace(/[$,%]/g, "")) / (x.display.endsWith("%") ? 100 : 1), 1);
    expect(miss.monthly).toBe(Math.round(product));
    expect(miss.monthly).not.toBe(999999); // the stored number is never shown without its math
    expect(miss.moneyTrace!.inputs.every((x) => ["sourced", "assumed", "calendar"].includes(x.status) && x.source)).toBe(true);
  });
});


// ---------- market map (run page), dashboard list, check-ins, evals ----------

const dollars = (t: string) => [...t.matchAll(/\$(\d[\d,]*)/g)].map((m) => Number(m[1]!.replace(/,/g, "")));

function moneyFor(b: Business, kinds: FindingKind[], over: Partial<Record<FindingKind, Partial<{ value: number }>>> = {}): BusinessMoney {
  const fs = kinds.map((k) => ({ id: `f-${k}`, kind: k, title: `title ${k}` }));
  const roiRows = fs.map((f) => ({ finding_id: f.id, assumptions: defaultAssumptions(f.kind as FindingKind, b).map((a, i) => (i === 0 && over[f.kind as FindingKind]?.value != null ? { ...a, value: over[f.kind as FindingKind]!.value! } : a)) }));
  return businessMoney(fs, roiRows);
}

/** Every $ the list shows must be a traced result, a traced $ input, or a dropped overlap figure. */
function tracedIn(m: BusinessMoney): Set<number> {
  const s = new Set<number>();
  if (m.total != null) s.add(m.total);
  for (const k of m.kept) {
    s.add(k.trace.result);
    for (const x of k.trace.inputs) if (x.display.startsWith("$")) s.add(Number(x.display.replace(/[$,]/g, "")));
  }
  for (const d of m.dropped) s.add(d.monthly);
  return s;
}

describe("market map and business list figures trace to inputs", () => {
  const b = biz();
  const inbound = moneyFor(b, ["missed_calls", "slow_response", "booking_friction", "unanswered_reviews"]);

  it("recomputes each business total from inputs with the overlap rule", () => {
    const each = (["missed_calls", "slow_response", "booking_friction"] as FindingKind[]).map((k) => computeMonthlyValue(defaultAssumptions(k, b)));
    const found = computeMonthlyValue(defaultAssumptions("unanswered_reviews", b));
    expect(inbound.total).toBe(Math.max(...each) + found);
    expect(inbound.dropped).toHaveLength(2);
    expect(inbound.rule).toMatch(/once/i);
    for (const k of inbound.kept) expect(k.trace.result).toBe(computeMonthlyValue(defaultAssumptions(k.kind as FindingKind, b)));
  });

  it("shows how we got every $ in the tooltip, and only traced dollars", () => {
    const how = businessMoneyHow(inbound);
    expect(how).toMatch(/^How we got \$/);
    const traced = tracedIn(inbound);
    for (const d of dollars(how)) expect(traced.has(d), `untraced $${d} in: ${how}`).toBe(true);
  });

  it("derives the opportunity score from the rebuilt total, with the formula shown", () => {
    expect(inbound.score).toBe(opportunityScore(inbound.total!));
    expect(scoreHow(inbound)).toContain(`= ${inbound.score}.`);
  });

  it("says 'not estimated' instead of a number when inputs are missing", () => {
    const none = businessMoney([{ id: "f1", kind: "missed_calls", title: "Missed calls" }], []);
    expect(none.total).toBeNull();
    expect(none.score).toBeNull();
    expect(businessMoneyHow(none)).toMatch(/^Not estimated/);
    expect(dollars(businessMoneyHow(none))).toEqual([]);
    expect(scoreHow(none)).toMatch(/^Not estimated/);
    const invalid = businessMoney([{ id: "f1", kind: "missed_calls", title: "Missed calls" }], [{ finding_id: "f1", assumptions: [{ key: "x", label: "x", value: -1, unit: "count" }] as never }]);
    expect(invalid.total).toBeNull();
    // A problem with inputs is still counted when a sibling has none.
    const partial = businessMoney(
      [{ id: "f1", kind: "missed_calls", title: "Missed calls" }, { id: "f2", kind: "no_website", title: "No website" }],
      [{ finding_id: "f1", assumptions: defaultAssumptions("missed_calls", b) }],
    );
    expect(partial.total).toBe(computeMonthlyValue(defaultAssumptions("missed_calls", b)));
    expect(partial.missing).toEqual(["No website"]);
    expect(businessMoneyHow(partial)).toContain("Not estimated: No website");
  });

  it("sums the run total from the per-business totals and shows the parts", () => {
    const other = moneyFor(biz({ id: "b2", name: "Other" }), ["no_website"]);
    const none = businessMoney([], []);
    const rm = runMoney([{ name: "Test Air", money: inbound }, { name: "Other", money: other }, { name: "Blank", money: none }]);
    expect(rm.total).toBe(inbound.total! + other.total!);
    expect(rm.notEstimated).toEqual(["Blank"]);
    const how = runMoneyHow(rm);
    const traced = new Set([rm.total!, inbound.total!, other.total!]);
    for (const d of dollars(how)) expect(traced.has(d), `untraced $${d} in: ${how}`).toBe(true);
    expect(runMoneyHow(runMoney([{ name: "Blank", money: none }]))).toMatch(/^Not estimated/);
  });

  it("ranks by the rebuilt figure, not the stored one", () => {
    const low = moneyFor(b, ["no_website"]);
    const ranked = rankByMoney([
      { name: "none", money: null },
      { name: "low", money: low },
      { name: "high", money: inbound },
    ]);
    expect(ranked.map((x) => x.name)).toEqual(["high", "low", "none"]);
  });
});

describe("check-in figures carry a source", () => {
  it("labels costs as Apify's settled charge or a planned estimate", () => {
    expect(describeCheckin({ kind: "light", status: "no_change", est_cost_usd: 0.01, actual_cost_usd: 0.0062 } as never)).toContain("Apify charge $0.0062");
    expect(describeCheckin({ kind: "light", status: "no_change", est_cost_usd: 0.01, actual_cost_usd: null } as never)).toMatch(/est\. \$0\.01, the planned cost/);
  });
  it("names the source of each change figure", () => {
    expect(changeSource("reply_rate")).toMatch(/Ringy's sample/);
    expect(changeSource("neg_reply_rate")).toMatch(/not a Google figure/);
    expect(changeSource("rating")).toMatch(/Google listing/);
  });
});

describe("run timeline shows the rebuilt figures", () => {
  it("replaces logged raw sums with the traced total, or 'not estimated'", () => {
    const b = biz();
    const m = moneyFor(b, ["missed_calls", "slow_response", "booking_friction"]);
    const list = [{ id: "b1", name: "Test Air", money: m }, { id: "b2", name: "Blank", money: businessMoney([], []) }];
    const steps = [
      { step: "roi", business_id: "b1", message: "Test Air: est. $5,877/mo across 3 findings (editable assumptions)" },
      { step: "roi", business_id: "b2", message: "Blank: est. $0/mo across 0 findings (editable assumptions)" },
      { step: "rank", business_id: null, message: "Ranked 2 businesses. Top: Test Air (est. $5,877/mo)" },
      { step: "scrape", business_id: null, message: "Scraped 2 places" },
    ];
    const out = stepsWithCurrentFigures(steps, list);
    expect(out[0]!.message).toContain(`est. $${m.total!.toLocaleString("en-US")}/mo, rebuilt`);
    expect(out[1]!.message).toContain("not estimated");
    expect(out[2]!.message).toBe(`Ranked 2 businesses. Top: Test Air (est. $${m.total!.toLocaleString("en-US")}/mo, rebuilt from its inputs)`);
    expect(out[3]).toBe(steps[3]);
    for (const s of out) for (const d of dollars(s.message)) expect(d).toBe(m.total);
  });
});

// ---------- ROI calculator (business page, diagnosis, one-pager page 2) ----------


describe("ROI calculator figures trace to their inputs", () => {
  const b = biz();
  const kinds: FindingKind[] = ["missed_calls", "slow_response", "booking_friction", "unanswered_reviews", "no_website"];
  const rows = kinds.map((k) => ({ kind: k, label: k, fields: defaultFields(k, "home_services", defaultAssumptions(k, b)) }));
  const computed = rows.map((r) => ({ kind: r.kind, label: r.label, result: computeRoi(r.fields) }));
  const total = combineRoi(computed);

  it("every input is sourced, assumed or calendar, with a source line; sourced tool prices carry a URL", () => {
    for (const r of rows) for (const f of r.fields) {
      expect(["sourced", "assumed", "calendar"]).toContain(f.status);
      expect(f.source).toBeTruthy();
      if (f.group === "fix" && f.status === "sourced") expect(f.url).toMatch(/^https:\/\//);
      for (const d of dollars(f.source)) expect(false, `untraced $${d} in source "${f.source}"`).toBe(true);
    }
  });

  it("every $ in the math and the total is computed or an input", () => {
    const allowed = new Set<number>();
    for (const [i, c] of computed.entries()) {
      const r = c.result;
      [r.atRisk, r.gain, r.toolCost, r.monthlyCost, Math.abs(r.net), r.setupCost].forEach((v) => allowed.add(v));
      rows[i]!.fields.filter((f) => f.unit === "usd").forEach((f) => allowed.add(Math.round(f.value)));
    }
    [Math.abs(total.net), total.gain, total.monthlyCost, total.setupCost].forEach((v) => allowed.add(v));
    total.dropped.forEach((d) => allowed.add(d.gain));
    const texts = [...computed.flatMap((c) => c.result.math), total.math];
    for (const t of texts) for (const d of dollars(t)) expect(allowed.has(d), `$${d} in "${t}"`).toBe(true);
    expect(total.math).not.toMatch(/^Nothing/);
  });
});
