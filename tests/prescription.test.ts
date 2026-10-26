import { describe, expect, it } from "vitest";
import catalogJson from "@/data/solutions.json";
import { defaultAssumptions } from "@/lib/roi";
import {
  CATALOG,
  CatalogSchema,
  callsPerMonth,
  estimatePrice,
  INTERVIEW,
  prescribe,
  rankProblems,
  verticalFor,
  type Catalog,
} from "@/lib/prescription";
import { FINDING_KINDS, type Finding, type RoiEstimate } from "@/lib/types";

const clone = (): Catalog => JSON.parse(JSON.stringify(CATALOG));

describe("solutions catalog", () => {
  it("parses and every product is honest about price and affiliation", () => {
    expect(() => CatalogSchema.parse(catalogJson)).not.toThrow();
    for (const p of CATALOG.products) {
      expect(p.affiliation).toBe("none");
      expect(p.checked_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (p.price.status === "public") {
        expect(p.price.usd_month).not.toBeNull();
        expect(p.pricing_url).toMatch(/^https:\/\//);
      } else {
        expect(p.price.usd_month).toBeNull();
      }
    }
    expect(new Set(CATALOG.products.map((p) => p.id)).size).toBe(CATALOG.products.length);
  });

  it("has no made-up price for the in-house option", () => {
    expect(CATALOG.in_house.built_by).toBe("ringring.run");
    expect(CATALOG.in_house.price).toMatchObject({ status: "tbd", usd_month: null });
  });

  it("covers missed calls for home services and dental", () => {
    for (const v of ["home_services", "dental"] as const) {
      const hits = CATALOG.products.filter((p) => p.problems.includes("missed_calls") && (p.verticals.includes(v) || p.verticals.includes("any")));
      expect(hits.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("rejects a public price without a number and a fake affiliation", () => {
    const bad = clone();
    bad.products[0]!.price = { ...bad.products[0]!.price, status: "public", usd_month: null };
    expect(CatalogSchema.safeParse(bad).success).toBe(false);
    const bad2 = clone() as unknown as { products: { affiliation: string }[] };
    bad2.products[0]!.affiliation = "partner";
    expect(CatalogSchema.safeParse(bad2).success).toBe(false);
  });

  it("has 4 or 5 interview questions for every problem kind", () => {
    for (const k of FINDING_KINDS) {
      expect(INTERVIEW[k].length).toBeGreaterThanOrEqual(4);
      expect(INTERVIEW[k].length).toBeLessThanOrEqual(5);
      for (const q of INTERVIEW[k]) expect(q).not.toMatch(/\u2014/);
    }
  });
});

describe("verticalFor", () => {
  it("maps categories", () => {
    expect(verticalFor("HVAC contractor")).toBe("home_services");
    expect(verticalFor("Air conditioning repair service")).toBe("home_services");
    expect(verticalFor("Plumber")).toBe("home_services");
    expect(verticalFor("Cosmetic dentist")).toBe("dental");
    expect(verticalFor("Bakery")).toBe("any");
    expect(verticalFor(null)).toBe("any");
  });
});

function finding(id: string, kind: Finding["kind"], evidence: number, severity = 3): Finding {
  return {
    id, kind, severity, business_id: "b", run_id: "r", title: id, detail: "", solution: "ai_receptionist", created_at: "",
    evidence: Array.from({ length: evidence }, (_, i) => ({ source: "review" as const, review_id: `rv${i}`, quote: `q${i}`, rating: 1 })),
  };
}
const roiFor = (finding_id: string, monthly_value: number): RoiEstimate => ({
  id: `roi-${finding_id}`, finding_id, business_id: "b", assumptions: [], formula: "", monthly_value, is_edited: false, updated_at: "",
});

describe("rankProblems", () => {
  it("ranks by evidence count, then monthly cost, then severity, top 3", () => {
    const fs = [finding("a", "slow_response", 1), finding("b", "booking_friction", 2), finding("c", "missed_calls", 2), finding("d", "no_website", 1, 5)];
    const ranked = rankProblems(fs, [roiFor("a", 1080), roiFor("b", 900), roiFor("c", 3897), roiFor("d", 1080)]);
    expect(ranked.map((r) => r.finding.id)).toEqual(["c", "b", "d"]);
    expect(ranked[0]).toMatchObject({ evidenceCount: 2, monthly: 3897 });
  });

  it("treats a missing estimate as $0", () => {
    expect(rankProblems([finding("a", "missed_calls", 1)], [])[0]!.monthly).toBe(0);
  });
});

describe("prescribe", () => {
  const hvacCalls = callsPerMonth(defaultAssumptions("missed_calls", { category: "HVAC", owner_response_rate: null }));

  it("derives call volume from the missed-call assumptions only", () => {
    expect(hvacCalls).toBeCloseTo(43.3, 1);
    expect(callsPerMonth(defaultAssumptions("slow_response", { category: null, owner_response_rate: null }))).toBeNull();
  });

  it("adds per-call overage at the assumed volume", () => {
    const smith = CATALOG.products.find((p) => p.id === "smith_ai_ai")!;
    expect(estimatePrice(smith, "missed_calls", 43.3).usd).toBe(Math.round((43.3 - 25) * 3));
    expect(estimatePrice(smith, "missed_calls", null).usd).toBe(0);
    const rosie = CATALOG.products.find((p) => p.id === "rosie")!;
    expect(estimatePrice(rosie, "booking_friction", null)).toEqual({ usd: 149, plan: "Scale, 1,000 minutes a month" });
  });

  it("picks the cheapest fitting third-party product when our price is not set", () => {
    const rx = prescribe("missed_calls", "home_services", 3897, hvacCalls);
    expect(rx.pick).toEqual({ source: "third_party", id: "rosie" });
    expect(rx.reason).toMatch(/Rosie fits at about \$49\/mo/);
    expect(rx.reason).toMatch(/our own price is not set yet/);
    expect(rx.options.every((o) => o.fits)).toBe(true);
    expect(rx.options.length).toBeLessThanOrEqual(3);
    // No public price or a prerequisite keeps a product off the menu, with a reason.
    expect(rx.alsoChecked.find((o) => o.product.id === "avoca")?.whyNot).toBe("No public price.");
    expect(rx.alsoChecked.find((o) => o.product.id === "jobber_receptionist")?.whyNot).toMatch(/Needs a paid jobber plan/);
    expect(rx.inHouse?.id).toBe("ringring_agent");
  });

  it("recommends in-house when nothing fits at a fair price", () => {
    const rx = prescribe("missed_calls", "home_services", 100, hvacCalls);
    expect(rx.fairCeilingUsd).toBe(25);
    expect(rx.pick).toEqual({ source: "in_house", id: "ringring_agent" });
    expect(rx.reason).toMatch(/No product we checked fits/);
  });

  it("recommends in-house when our set price is lower", () => {
    const cat = clone();
    cat.in_house.price = { status: "set", usd_month: 20, note: "test" };
    const rx = prescribe("missed_calls", "home_services", 3897, hvacCalls, cat);
    expect(rx.pick).toEqual({ source: "in_house", id: "ringring_agent" });
    expect(rx.reason).toMatch(/Ours costs less than Rosie/);
    cat.in_house.price = { status: "set", usd_month: 500, note: "test" };
    expect(prescribe("missed_calls", "home_services", 3897, hvacCalls, cat).pick).toEqual({ source: "third_party", id: "rosie" });
  });

  it("keeps vertical-only products out of other verticals", () => {
    const dental = prescribe("missed_calls", "dental", 3000, 43);
    const ids = [...dental.options, ...dental.alsoChecked].map((o) => o.product.id);
    expect(ids).toContain("arini");
    expect(ids).not.toContain("avoca");
    expect(ids).not.toContain("jobber_receptionist");
  });

  it("has no pick when neither the catalog nor our agent covers the problem", () => {
    const rx = prescribe("no_website", "home_services", 1000, null);
    expect(rx.pick).toBeNull();
    expect(rx.inHouse).toBeNull();
  });
});
