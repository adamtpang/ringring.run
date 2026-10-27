import { describe, expect, it } from "vitest";
import snap from "@/data/snapshots/aire-serv.json";
import { CALC } from "@/lib/calculator";
import { buildGamePlan, type PlanInput } from "@/lib/gameplan";
import { buildFixPaths, FIX_PATHS } from "@/lib/fixpaths";
import { buildBoard, toSubjectInput } from "@/lib/peers";
import { CATALOG } from "@/lib/prescription";
import { OWNER_ONLY_KINDS, PLAN_KINDS, type Business, type Review } from "@/lib/types";

const r = snap.report as unknown as { business: Business; reviews: Review[]; findings: PlanInput["findings"]; roi: PlanInput["roi"]; knowledge: PlanInput["knowledge"]; run: { created_at: string } };
const subject = toSubjectInput(r.business, r.reviews, null);
const gp = buildGamePlan({ business: r.business, findings: r.findings, roi: r.roi, reviews: r.reviews, knowledge: r.knowledge ?? [], board: buildBoard(subject), subject, scanDate: r.run.created_at });
const paths = buildFixPaths(gp.items, r.business, r.roi);

describe("in-house vs outsourced", () => {
  it("has a category for every plan kind and no em dashes", () => {
    for (const k of PLAN_KINDS) expect(FIX_PATHS.kinds[k]?.category, k).toBeTruthy();
    expect(JSON.stringify(FIX_PATHS)).not.toMatch(/\u2014/);
  });

  it("gives every recommendation all three paths", () => {
    for (const it of gp.items) {
      const p = paths[it.kind]!;
      expect(p.diy.steps).toEqual(it.you);
      expect(p.ringy.steps.map((s) => s.text)).toEqual(it.ringy.map((s) => s.text));
      expect(p.thirdParty.category.length).toBeGreaterThan(4);
    }
  });

  it("only names a vendor price that has a pricing page in the catalog", () => {
    const byName = new Map(CATALOG.products.map((p) => [p.name, p]));
    for (const p of Object.values(paths))
      for (const v of p.thirdParty.vendors) {
        const prod = byName.get(v.name);
        expect(prod, v.name).toBeDefined();
        expect(v.pricingUrl).toBe(prod!.pricing_url);
        expect(v.pricingUrl).toMatch(/^https:\/\//);
        expect(prod!.affiliation).toBe("none");
      }
  });

  it("DIY time is an estimate from the calculator inputs", () => {
    for (const p of Object.values(paths)) {
      if (p.diy.usdMonth == null) continue;
      expect(p.diy.usdMonth).toBe(Math.round(p.diy.hoursMonth! * CALC.hourly_value_usd));
      expect(p.diy.basis.length).toBeGreaterThan(10);
    }
  });

  it("Ringy never 'fixes' an owner-only problem and never claims its own price", () => {
    for (const p of Object.values(paths)) {
      expect(p.ringy.price).toBe("Price not set yet.");
      if ((OWNER_ONLY_KINDS as readonly string[]).includes(p.kind)) expect(p.ringy.role).toBe("supports");
      if (p.ringy.role === "builds") expect(p.ringy.limits).toBeTruthy();
    }
  });
});
