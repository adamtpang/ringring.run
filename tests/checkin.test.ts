import { describe, expect, it } from "vitest";
import {
  afterLight,
  costFromEvents,
  CRON_SCHEDULE,
  ctMonthStart,
  decideCadence,
  diffSnapshots,
  estimateCost,
  monthlyBudget,
  monthSpend,
  nextCheckinDate,
  ownerNextStep,
  weeklyView,
  withinBudget,
} from "@/lib/checkin/logic";
import { runCheckins, type Checker, type CheckResult } from "@/lib/checkin/run";
import { businessMonthly, dedupMonthly } from "@/lib/roi";
import { createLocalStore } from "@/lib/store/local";
import type { Business, Checkin, CheckinSnapshot } from "@/lib/types";

const NOW = new Date("2026-11-09T15:00:00Z"); // Mon Nov 9 2026, 9 AM CST

const snap = (o: Partial<CheckinSnapshot>): CheckinSnapshot => ({
  id: Math.random().toString(36).slice(2),
  place_id: "p1",
  business_id: "b1",
  checkin_id: null,
  kind: "light",
  rating: null,
  review_count: null,
  reply_rate: null,
  reply_sample: null,
  neg_reply_rate: null,
  neg_sample: null,
  complaint_counts: null,
  new_reviews: 0,
  taken_at: "2026-11-02T15:00:00Z",
  ...o,
});

const ck = (o: Partial<Checkin>): Checkin => ({
  id: Math.random().toString(36).slice(2),
  place_id: "p1",
  business_id: "b1",
  kind: "light",
  trigger: "cron",
  status: "ok",
  est_cost_usd: 0.00605,
  actual_cost_usd: null,
  apify_run_id: null,
  message: null,
  started_at: "2026-11-02T15:00:00Z",
  finished_at: "2026-11-02T15:01:00Z",
  ...o,
});

describe("check-in costs", () => {
  it("prices a light check under a cent and caps new reviews at 10", () => {
    expect(estimateCost("light")).toBeCloseTo(0.0062, 5);
    expect(estimateCost("light")).toBeLessThan(0.01);
    expect(estimateCost("light", { places: 3 })).toBeCloseTo(0.0002 + 3 * 0.006, 5);
    expect(estimateCost("new_reviews", { reviews: 50 })).toBeCloseTo(0.0062 + 10 * 0.0005, 5);
    expect(estimateCost("new_reviews", { reviews: 3, llm: true })).toBeCloseTo(0.0062 + 3 * 0.0012, 5);
    expect(estimateCost("deep", { reviews: 20 })).toBeCloseTo(0.0062 + 20 * 0.0005, 5);
  });

  it("turns Apify charged events into dollars (the Oct 26 proof run) and flags unknown events", () => {
    const proof = { "place-scraped": 1, "filter-applied": 0, "place-details-scraped": 1, "lead-scraped": 0, "review-scraped": 0, "apify-actor-start": 4 };
    expect(costFromEvents(proof)).toEqual({ usd: 0.0062, unknown: [] });
    expect(costFromEvents({ "something-new": 2, "other-new": 0 }).unknown).toEqual(["something-new"]);
  });

  it("defaults the cap to $1.00 and reads an override", () => {
    expect(monthlyBudget({})).toBe(1);
    expect(monthlyBudget({ CHECKIN_MONTHLY_BUDGET_USD: "0.25" })).toBe(0.25);
    expect(monthlyBudget({ CHECKIN_MONTHLY_BUDGET_USD: "abc" })).toBe(1);
  });

  it("counts this CT month only, actual over estimate, and not skipped runs", () => {
    const cs = [
      ck({ started_at: "2026-11-02T15:00:00Z", est_cost_usd: 0.006, actual_cost_usd: 0.005 }),
      ck({ started_at: "2026-11-09T15:00:00Z", est_cost_usd: 0.006 }),
      ck({ started_at: "2026-11-09T15:00:00Z", est_cost_usd: 0.5, status: "skipped_budget" }),
      ck({ started_at: "2026-11-01T04:00:00Z", est_cost_usd: 0.9 }), // Oct 31, 11 PM CDT: last month
    ];
    expect(monthSpend(cs, NOW)).toBeCloseTo(0.011, 6);
    expect(ctMonthStart(NOW).toISOString()).toBe("2026-11-01T05:00:00.000Z");
  });

  it("allows spend up to the cap and refuses past it", () => {
    expect(withinBudget(0.99, 0.01, 1)).toBe(true);
    expect(withinBudget(0.995, 0.00605, 1)).toBe(false);
  });

  it("schedules Monday 15:00 UTC (9 AM CST)", () => {
    expect(CRON_SCHEDULE).toBe("0 15 * * 1");
    expect(nextCheckinDate(new Date("2026-10-26T20:00:00Z")).toISOString()).toBe("2026-11-02T15:00:00.000Z");
    expect(nextCheckinDate(new Date("2026-11-09T14:00:00Z")).toISOString()).toBe("2026-11-09T15:00:00.000Z");
  });
});

describe("cadence", () => {
  it("runs deep on the first check-in of the CT month, then light", () => {
    expect(decideCadence([], NOW)).toBe("deep");
    expect(decideCadence([ck({ kind: "deep", started_at: "2026-11-02T15:00:00Z" })], NOW)).toBe("light");
    // A deep from last month or a failed deep does not count.
    expect(decideCadence([ck({ kind: "deep", started_at: "2026-10-26T15:00:00Z" })], NOW)).toBe("deep");
    expect(decideCadence([ck({ kind: "deep", status: "error", started_at: "2026-11-02T15:00:00Z" })], NOW)).toBe("deep");
    expect(decideCadence([], NOW, { lightOnly: true })).toBe("light");
  });

  it("fetches new reviews only when the count went up, capped at 10", () => {
    expect(afterLight(106, 106).action).toBe("none");
    expect(afterLight(106, 105).action).toBe("none");
    expect(afterLight(null, 106).action).toBe("none");
    expect(afterLight(106, null).action).toBe("none");
    expect(afterLight(106, 109)).toEqual({ action: "fetch_new", delta: 3, fetch: 3 });
    expect(afterLight(106, 130)).toEqual({ action: "fetch_new", delta: 24, fetch: 10 });
  });
});

describe("snapshot diff", () => {
  it("reports only fields measured in both, never from a missing value", () => {
    const a = snap({ rating: 4.9, review_count: 106 });
    const b = snap({ rating: 4.9, review_count: 108, reply_rate: 0.9, reply_sample: 20 });
    expect(diffSnapshots(a, b)).toEqual([{ field: "review_count", label: "Google reviews", before: 106, after: 108, delta: 2 }]);
  });

  it("ignores reply-rate moves on samples under 5", () => {
    const a = snap({ neg_reply_rate: 0.5, neg_sample: 2, reply_rate: 0.8, reply_sample: 10 });
    const b = snap({ neg_reply_rate: 1, neg_sample: 3, reply_rate: 0.9, reply_sample: 10 });
    expect(diffSnapshots(a, b).map((c) => c.field)).toEqual(["reply_rate"]);
  });

  it("diffs complaint counts", () => {
    const d = diffSnapshots(snap({ complaint_counts: { missed_calls: 1 } }), snap({ complaint_counts: { missed_calls: 2, pricing: 1 } }));
    expect(d.map((c) => [c.field, c.delta])).toEqual([["complaints:missed_calls", 1], ["complaints:pricing", 1]]);
  });
});

describe("what changed this week", () => {
  it("says first check-in with one snapshot and invents nothing", () => {
    const v = weeklyView({ snaps: [snap({ kind: "baseline", taken_at: "2026-10-20T15:00:00Z", rating: 4.9 })], checkins: [], reviews: [], tracked: true, now: NOW, planStep: null });
    expect(v.state).toBe("first");
    if (v.state === "first") expect(v.next?.toISOString()).toBe("2026-11-16T15:00:00.000Z");
  });

  it("compares each field with the last snapshot that measured it", () => {
    const snaps = [
      snap({ taken_at: "2026-11-09T15:00:00Z", rating: 4.8, review_count: 107 }),
      snap({ taken_at: "2026-11-02T15:00:00Z", rating: 4.9, review_count: 106 }),
      snap({ kind: "baseline", taken_at: "2026-10-20T15:00:00Z", rating: 4.9, review_count: 106, reply_rate: 0.88, reply_sample: 17 }),
    ];
    const c = ck({ started_at: "2026-11-09T15:00:00Z", status: "ok", actual_cost_usd: 0.00605 });
    const v = weeklyView({
      snaps,
      checkins: [c],
      reviews: [{ id: "r", place_id: "p1", checkin_id: c.id, external_id: "x", rating: 1, text: "Nobody called back.", published_at: "2026-11-08", owner_response: null, complaints: ["missed_calls"], classified_by: "rules", created_at: "2026-11-09T15:02:00Z" }],
      tracked: true,
      now: NOW,
      planStep: "Plan step",
    });
    expect(v.state).toBe("changes");
    if (v.state !== "changes") return;
    expect(v.changes.map((x) => [x.field, x.before, x.after])).toEqual([["rating", 4.9, 4.8], ["review_count", 106, 107]]);
    expect(v.newReviews).toBe(1);
    expect(v.nextStep).toMatch(/Reply to the new 1-star review from 2026-11-08/);
    expect(v.did[0]).toMatch(/rating and review count/);
  });

  it("falls back to the plan step when nothing new needs the owner", () => {
    expect(ownerNextStep([], "Turn on call forwarding.")).toBe("Turn on call forwarding.");
    expect(ownerNextStep([], null)).toBe("Nothing new needs you this week.");
  });
});

// ---------- runner ----------

const BIZ: Business = {
  id: "b1",
  run_id: "r1",
  place_id: "p1",
  name: "Test HVAC",
  category: "HVAC contractor",
  address: null,
  city: "Austin",
  phone: null,
  website: null,
  rating: 4.9,
  review_count: 106,
  opening_hours: [],
  maps_url: null,
  owner_response_rate: 0.88,
  scraped_review_count: 1,
  is_fixture: true,
  diagnosis_status: "ok",
  diagnosis_summary: null,
  diagnosis_error: null,
  opportunity_score: 0,
  est_monthly_value: 0,
  raw: {},
  created_at: "2026-10-20T15:00:00Z",
} as Business;

function fakeChecker(count: number, newReviews = 0): Checker & { calls: string[] } {
  const calls: string[] = [];
  const res = (ids: string[], n: number): CheckResult => ({
    places: new Map(ids.map((id) => [id, { placeId: id, rating: 4.9, reviewCount: count, reviews: Array.from({ length: n }, (_, i) => ({ reviewId: `new${i}`, stars: i === 0 ? 1 : 5, text: i === 0 ? "Called three times, no one picked up." : "Great work.", publishedAtDate: `2026-11-0${i + 1}` })) }])),
    runId: "run",
    costUsd: n ? 0.00605 + n * 0.0005 : 0.00605,
  });
  return {
    mode: "fixture",
    calls,
    light: async (ids) => (calls.push(`light:${ids.length}`), res(ids, 0)),
    reviews: async (ids, max) => (calls.push(`reviews:${max}`), res(ids, Math.min(max, newReviews))),
  };
}

const target = { business: BIZ, reviews: [{ external_id: "old", rating: 5, text: "Fast and friendly.", published_at: "2026-10-01", owner_response: "Thanks!" }] };

describe("check-in runner", () => {
  it("records a free baseline, then logs a no-change light run with its cost", async () => {
    const store = createLocalStore({ file: null });
    // A deep refresh already ran this month, so this run is light.
    await store.insertCheckin({ ...ck({ kind: "deep", started_at: "2026-11-02T15:00:00Z", actual_cost_usd: 0.016 }), id: undefined } as never);
    const checker = fakeChecker(106);
    const s = await runCheckins({ store, checker, trigger: "cron", targets: [target], now: NOW, cap: 1 });
    expect(checker.calls).toEqual(["light:1"]);
    expect(s.outcomes.map((o) => [o.kind, o.status])).toEqual([["baseline", "ok"], ["light", "no_change"]]);
    expect(s.outcomes[1]!.actualCostUsd).toBeCloseTo(0.00605, 5);
    const snaps = await store.listSnapshots("p1");
    expect(snaps).toHaveLength(2);
    expect(snaps.find((x) => x.kind === "baseline")?.reply_sample).toBe(1);
  });

  it("fetches only the new reviews when the count went up, and classifies only those", async () => {
    const store = createLocalStore({ file: null });
    await store.insertCheckin({ ...ck({ kind: "deep", started_at: "2026-11-02T15:00:00Z" }), id: undefined } as never);
    const checker = fakeChecker(108, 2);
    let classified = 0;
    const s = await runCheckins({
      store,
      checker,
      classifier: { mode: "rules", classify: async (t) => ((classified += t.length), t.map((x) => (/no one picked up/.test(x) ? ["missed_calls"] : []))) },
      trigger: "cron",
      targets: [target],
      now: NOW,
      cap: 1,
    });
    expect(checker.calls).toEqual(["light:1", "reviews:2"]);
    expect(classified).toBe(2);
    expect(s.outcomes.map((o) => o.kind)).toEqual(["baseline", "light", "new_reviews"]);
    const rs = await store.listCheckinReviews("p1");
    expect(rs.map((r) => r.complaints)).toEqual(expect.arrayContaining([["missed_calls"], []]));
  });

  it("runs a deep refresh on the month's first check-in", async () => {
    const store = createLocalStore({ file: null });
    const checker = fakeChecker(106, 5);
    const s = await runCheckins({ store, checker, trigger: "cron", targets: [target], now: NOW, cap: 1 });
    expect(checker.calls).toEqual(["reviews:20"]);
    expect(s.outcomes.map((o) => [o.kind, o.status])).toEqual([["baseline", "ok"], ["deep", "ok"]]);
  });

  it("stops at the cap and logs the skip at $0", async () => {
    const store = createLocalStore({ file: null });
    await store.insertCheckin({ ...ck({ kind: "deep", started_at: "2026-11-02T15:00:00Z", actual_cost_usd: 0.998 }), id: undefined } as never);
    const checker = fakeChecker(110, 5);
    const s = await runCheckins({ store, checker, trigger: "cron", targets: [target], now: NOW, cap: 1 });
    expect(checker.calls).toEqual([]);
    expect(s.outcomes.map((o) => [o.kind, o.status, o.actualCostUsd])).toEqual([["baseline", "ok", 0], ["light", "skipped_budget", 0]]);
    expect(s.spentAfter).toBeCloseTo(0.998, 5);
  });

  it("light-only records the new count but never fetches reviews", async () => {
    const store = createLocalStore({ file: null });
    const checker = fakeChecker(109, 3);
    const s = await runCheckins({ store, checker, trigger: "manual", targets: [target], now: NOW, cap: 1, lightOnly: true });
    expect(checker.calls).toEqual(["light:1"]);
    expect(s.outcomes[1]!.status).toBe("deferred");
  });
});

describe("dedup total", () => {
  it("counts overlapping lost jobs once: the largest inbound item stands for the group", () => {
    const rows = [
      { kind: "missed_calls", monthly: 3897 },
      { kind: "slow_response", monthly: 1080 },
      { kind: "booking_friction", monthly: 900 },
    ];
    const d = dedupMonthly(rows);
    expect(d.total).toBe(3897);
    expect(d.rawSum).toBe(5877);
    expect(d.dropped.length).toBe(2);
    expect(businessMonthly(rows)).toBe(3897);
  });

  it("adds items from different groups", () => {
    expect(businessMonthly([{ kind: "missed_calls", monthly: 1000 }, { kind: "unanswered_reviews", monthly: 200 }])).toBe(1200);
  });
});
