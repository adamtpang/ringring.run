import { describe, expect, it } from "vitest";
import snap from "@/data/snapshots/aire-serv.json";
import { buildGamePlan, COACHING, type PlanInput } from "@/lib/gameplan";
import { buildBoard, toSubjectInput } from "@/lib/peers";
import { buildThirtyDay, MAX_FOCUS, METRIC_OF, METRICS, metricNow, whoOf, WHO_LABEL } from "@/lib/thirtyday";
import { PLAN_KINDS, type Business, type Review } from "@/lib/types";

const r = snap.report as unknown as { business: Business; reviews: Review[]; findings: PlanInput["findings"]; roi: PlanInput["roi"]; knowledge: PlanInput["knowledge"]; run: { created_at: string } };
function plan() {
  const subject = toSubjectInput(r.business, r.reviews, null);
  return buildGamePlan({ business: r.business, findings: r.findings, roi: r.roi, reviews: r.reviews, knowledge: r.knowledge ?? [], board: buildBoard(subject), subject, scanDate: r.run.created_at });
}

describe("30-day plan", () => {
  const gp = plan();
  const t = buildThirtyDay(gp.items, r.business, r.reviews);

  it("maps every plan kind to one of the metrics", () => {
    for (const k of PLAN_KINDS) expect(METRICS).toContain(METRIC_OF[k]);
    expect(METRIC_OF.unanswered_reviews).toBe("reply_rate");
    expect(METRIC_OF.few_reviews).toBe("review_count");
    expect(METRIC_OF.missed_calls).toBe("revenue_estimate");
    expect(METRIC_OF.staff_attitude).toBe("rating");
  });

  it("has weeks 1 to 4, with a note for any empty week", () => {
    expect(t.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4]);
    for (const w of t.weeks) expect(w.steps.length > 0 || !!w.note).toBe(true);
  });

  it("uses only the game plan's own checklist text, tagged Ringy or you", () => {
    const allowed = new Set(t.focus.flatMap((i) => i.checklist.map((c) => `${c.week}|${c.text}`)));
    const steps = t.weeks.flatMap((w) => w.steps);
    expect(steps.length).toBe(t.focus.reduce((n, i) => n + i.checklist.length, 0));
    for (const s of steps) {
      expect(allowed.has(`${s.week}|${s.text}`)).toBe(true);
      expect(Object.keys(WHO_LABEL)).toContain(s.who);
      expect(s.metric).toBe(METRIC_OF[s.kind]);
    }
    expect(t.counts.ringy + t.counts.you).toBe(steps.length);
  });

  it("keeps the OK gate: steps that need the owner's OK are flagged", () => {
    for (const k of PLAN_KINDS)
      for (const c of COACHING.kinds[k].checklist) {
        expect(whoOf(c.who)).toBe(c.who === "you" ? "you" : "ringy");
      }
    const flagged = t.weeks.flatMap((w) => w.steps).filter((s) => s.afterOk);
    const expected = t.focus.flatMap((i) => i.checklist.filter((c) => c.who === "ringy_after_ok"));
    expect(flagged.length).toBe(expected.length);
  });

  it("focuses on at most three fixes and always includes the recommended one", () => {
    expect(t.focus.length).toBeLessThanOrEqual(MAX_FOCUS);
    const rec = gp.items.find((i) => i.recommended);
    if (rec) expect(t.focus[0]).toBe(rec);
    expect(t.focus.length + t.later.length).toBe(gp.items.length);
  });
});

describe("30-day plan starting numbers trace to data", () => {
  const gp = plan();
  it("rating and review count are the Google listing's own", () => {
    const rating = metricNow("rating", gp.items, r.business, r.reviews);
    expect(rating.now).toBe(r.business.rating != null ? `${r.business.rating} stars` : null);
    expect(rating.source).toBe("Google listing");
    const count = metricNow("review_count", gp.items, r.business, r.reviews);
    expect(count.now).toContain(String(r.business.review_count?.toLocaleString("en-US")));
  });

  it("the revenue estimate is a plan item's own monthly figure and labeled an estimate", () => {
    const m = metricNow("revenue_estimate", gp.items, r.business, r.reviews);
    expect(m.estimate).toBe(true);
    const figures = gp.items.filter((i) => i.monthly != null).map((i) => `$${Math.round(i.monthly!).toLocaleString("en-US")}/mo at risk`);
    if (m.now) expect(figures).toContain(m.now);
  });

  it("the reply rate is Ringy's sample, with the counts shown", () => {
    const m = metricNow("reply_rate", gp.items, r.business, r.reviews);
    if (m.now) expect(m.source).toMatch(/^\d+ of \d+ .*Ringy's sample/);
    else expect(m.source).toMatch(/too few/);
  });
});
