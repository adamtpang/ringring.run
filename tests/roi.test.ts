import { describe, expect, it } from "vitest";
import { applyEdits, computeMonthlyValue, defaultAssumptions, defaultAvgTicket, InvalidAssumptionError, opportunityScore } from "@/lib/roi";
import { FINDING_KINDS } from "@/lib/types";

describe("ROI math", () => {
  it("is the product of the assumptions", () => {
    const a = defaultAssumptions("missed_calls", { category: "Plumber", owner_response_rate: null });
    // 10 calls x 4.33 weeks x 0.5 new x 0.4 close x $350
    expect(computeMonthlyValue(a)).toBe(Math.round(10 * 4.33 * 0.5 * 0.4 * 350));
  });

  it("every kind has assumptions and a non-negative value", () => {
    for (const k of FINDING_KINDS) {
      const a = defaultAssumptions(k, { category: null, owner_response_rate: 0.2 });
      expect(a.length).toBeGreaterThan(0);
      expect(computeMonthlyValue(a)).toBeGreaterThanOrEqual(0);
    }
  });

  it("uses the listing response rate when known", () => {
    const a = defaultAssumptions("unanswered_reviews", { category: null, owner_response_rate: 0.25 });
    expect(a.find((x) => x.key === "unanswered_share")).toMatchObject({ value: 0.75, source: "listing" });
  });

  it("applies edits and rejects bad ones", () => {
    const a = defaultAssumptions("no_website", { category: "Plumber", owner_response_rate: null });
    const edited = applyEdits(a, { avg_ticket: 1000 });
    expect(computeMonthlyValue(edited)).toBe(Math.round(500 * 0.1 * 0.1 * 0.4 * 1000));
    expect(() => applyEdits(a, { nope: 1 })).toThrow(InvalidAssumptionError);
    expect(() => applyEdits(a, { close_rate: 2 })).toThrow(InvalidAssumptionError);
    expect(() => applyEdits(a, { avg_ticket: -5 })).toThrow(InvalidAssumptionError);
  });

  it("scores and tickets are sane", () => {
    expect(opportunityScore(0)).toBe(0);
    expect(opportunityScore(1_000_000)).toBe(100);
    expect(defaultAvgTicket("Plumbing service")).toBe(350);
    expect(defaultAvgTicket(null)).toBe(200);
  });
});
