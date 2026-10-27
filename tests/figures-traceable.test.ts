import { describe, expect, it } from "vitest";
import { buildGamePlan, type GamePlan, type PlanInput } from "@/lib/gameplan";
import { buildBoard, toSubjectInput } from "@/lib/peers";
import { defaultAssumptions } from "@/lib/roi";
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
