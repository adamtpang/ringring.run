import { describe, expect, it } from "vitest";
import { defaultAvgTicket } from "@/lib/roi";
import { STARTER_DEFAULTS, prefillFromCategories, starterResult } from "@/lib/starter-roi";
import { previewBySlug, unansweredCount } from "@/lib/preview-pages";

describe("starter pack ROI", () => {
  it("recovers calls x miss rate x close rate x ticket x days, then subtracts price", () => {
    const r = starterResult(STARTER_DEFAULTS);
    const recovered = Math.round(8 * 0.3 * 0.4 * 450 * 30);
    expect(r.recovered).toBe(recovered);
    expect(r.net).toBe(recovered - 149);
    expect(r.paybackDays).toBe(Math.ceil(149 / (recovered / 30)));
    expect(r.moneyMath).toContain("8 x 30% x 40% x $450 x 30 days");
  });

  it("adds owner time as minutes x volume", () => {
    const r = starterResult(STARTER_DEFAULTS);
    const calls = 8 * 0.3 * 6;
    const minutes = 8 * calls + 10 * 1.4 + 45 * 1 + 30 * 1;
    expect(r.hoursPerWeek).toBe(Math.round((minutes / 60) * 100) / 100);
    expect(r.timeDollarsPerWeek).toBe(Math.round(r.hoursPerWeek * 50));
    expect(r.tasks).toHaveLength(4);
  });

  it("does not turn a scanned review count into a weekly rate or a ticket", () => {
    const page = previewBySlug("small-victory")!;
    const unanswered = unansweredCount(page);
    const pre = prefillFromCategories(page.categories, page.reviewCount, unanswered, page.sample?.read ?? null, page.slug, page.name);
    expect(pre.avgTicket).toBe(defaultAvgTicket("Bar / Cocktail bar"));
    expect(pre.avgTicket).toBe(35);
    expect(pre.reviewCount).toBe(507);
    expect(pre.unansweredInSample).toBe(10);
    const r = starterResult({ ...STARTER_DEFAULTS, avgTicket: pre.avgTicket });
    expect(r.tasks.find((t) => t.id === "replies")?.volume).toBe(STARTER_DEFAULTS.repliesPerWeek);
  });

  it("has no payback when nothing is recovered", () => {
    expect(starterResult({ ...STARTER_DEFAULTS, callsPerDay: 0 }).paybackDays).toBeNull();
  });
});
