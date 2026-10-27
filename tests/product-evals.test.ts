import { describe, expect, it } from "vitest";
import { CASES, fixtureAgent, fixtureResponder, runEvals } from "@/lib/evals";
import { CAPABILITY_CLAIMS, planFor, checkReport, COLD_OUTREACH_RE, PRODUCT_CHECKS, runProductEvals } from "@/lib/evals/product";
import { productEvals, snapshotEvals } from "@/lib/evals/product-source";
import type { ReportPayload } from "@/lib/report";
import type { GamePlan } from "@/lib/gameplan";
import { SNAPSHOTS } from "@/lib/snapshot";
import { SOLUTIONS } from "@/lib/solutions";
import { ONE_PAGER_CONTACT, ONE_PAGER_FOOTER } from "@/lib/copy";
import type { Store } from "@/lib/store/types";

const real = () => structuredClone(SNAPSHOTS[0]!.report) as ReportPayload;
const fail = (id: string, r: ReportPayload, g?: GamePlan) => {
  const o = checkReport(id, r, g);
  return "ok" in o && !o.ok ? o.detail : null;
};

describe("product checks on the real Aire Serv report", () => {
  it("all checks pass on the committed snapshot", () => {
    const rep = snapshotEvals();
    expect(rep.source.kind).toBe("snapshot");
    expect(rep.checks.map((c) => c.id)).toEqual(PRODUCT_CHECKS.map((c) => c.id));
    for (const c of rep.checks) expect(c.failures, c.id).toEqual([]);
    expect(rep.checks.every((c) => c.pass + c.skipped === 1)).toBe(true);
  });

  it("catches a quote that is not in any review", () => {
    const r = real();
    const ev = r.findings[0]!.evidence.find((e) => e.source === "review")!;
    if (ev.source === "review") ev.quote = "The technician stole my dog and set the attic on fire.";
    expect(fail("cites_real_reviews", r)).toMatch(/not found/);
  });

  it("catches a cited review id that is not in the scan", () => {
    const r = real();
    const ev = r.findings[0]!.evidence.find((e) => e.source === "review")!;
    if (ev.source === "review") ev.review_id = "made-up";
    expect(fail("cites_real_reviews", r)).toMatch(/not in the scan/);
  });

  it("never shows the stored monthly number, only the math", () => {
    const r = real();
    r.roi.forEach((x) => (x.monthly_value = 999999));
    r.business.est_monthly_value = 999999;
    expect(fail("no_invented_figures", r)).toBeNull();
    expect(planFor(r).prognosis.money?.total).toBe(3897);
  });

  it("catches a shown dollar figure that does not equal its inputs multiplied out", () => {
    const r = real();
    const g = planFor(r);
    const item = g.items.find((i) => i.moneyTrace)!;
    item.monthly = item.monthly! + 500;
    expect(fail("no_invented_figures", r, g)).toMatch(/inputs multiply to/);
  });

  it("the overlap rule keeps only the largest inbound estimate ($3,897 of $3,897 + $1,080 + $900)", () => {
    const r = real();
    expect(fail("overlap_rule", r)).toBeNull();
    const rep = runProductEvals([r], { kind: "snapshot", label: "t" });
    expect(rep.checks.find((c) => c.id === "overlap_rule")!.pass).toBe(1);
  });
});

describe("traceable-figures rule", () => {
  it("fails a plan with an untraced dollar figure", () => {
    const r = real();
    // A finding title with a hand-typed number flows into the plan without a trace.
    r.findings[0]!.title = "You are losing $9,999 a month";
    expect(fail("traceable_figures", r)).toMatch(/9,999|no source/);
  });

  it("fails a plan with an untraced percent", () => {
    const r = real();
    r.findings[0]!.detail = "Fixing this lifts revenue 37%.";
    expect(fail("traceable_figures", r)).toMatch(/states 37\b/);
  });

  it("allows a dollar figure inside a cited verbatim quote", () => {
    // The snapshot has a website quote "Save $500 off HVAC system!" with its citation.
    expect(fail("traceable_figures", real())).toBeNull();
  });
});

describe("refusing to claim voice, SMS or Spanish", () => {
  it("flags each claim pattern", () => {
    const say = (t: string) => CAPABILITY_CLAIMS.filter((c) => c.re.test(t)).map((c) => c.label);
    expect(say("Text or call Ringy")).toContain("texting or SMS");
    expect(say("Ringy texts a summary to the owner")).toContain("texting or SMS");
    expect(say("Automatic text follow-ups")).toContain("texting or SMS");
    expect(say("Hablamos español")).toContain("Spanish or other languages");
    expect(say("Ringy picks up every call")).toContain("picks up every call");
    expect(say("Answers every call and text 24/7")).toEqual(expect.arrayContaining(["picks up every call", "24/7 answering"]));
    expect(say("512 number coming soon")).toContain("a Ringy phone number");
    expect(say("We found 3 problems in your reviews.")).toEqual([]);
  });

  it("fixed owner copy and solution templates make no such claims", () => {
    const copy = [ONE_PAGER_CONTACT.title, ONE_PAGER_CONTACT.body, ONE_PAGER_FOOTER, ...Object.values(SOLUTIONS).flatMap((s) => [s.oneLiner, ...s.includes])];
    for (const t of copy) for (const c of CAPABILITY_CLAIMS) expect(c.re.test(t), `${c.label}: ${t}`).toBe(false);
  });

  it("a plan that claims texting fails the check", () => {
    const r = real();
    r.findings[0]!.title = "Ringy texts your customers back in Spanish";
    expect(fail("no_capability_claims", r)).toMatch(/texting|Spanish/);
  });

  it("a business's own quoted words are not Ringy's claims", () => {
    const r = real();
    r.findings[0]!.detail = 'Their website says "Call us 24/7 for emergencies".';
    expect(fail("no_capability_claims", r)).toBeNull();
  });

  it("the simulated agent refuses to text or speak Spanish", async () => {
    const ids = CASES.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["sms_request", "spanish_caller"]));
    const agent = await fixtureAgent("Example Plumbing Co", "Austin TX");
    const rep = await runEvals(agent.config, fixtureResponder, { agentId: agent.id });
    for (const id of ["sms_request", "spanish_caller"]) expect(rep.cases.find((c) => c.id === id)!.status, id).toBe("pass");
  });

  it("the grader fails an agent that promises a text or answers in Spanish", () => {
    const sms = CASES.find((c) => c.id === "sms_request")!;
    const es = CASES.find((c) => c.id === "spanish_caller")!;
    expect(sms.mustNotMatch!.some((m) => m.re.test("Sure, I'll text you the quote now."))).toBe(true);
    expect(es.mustNotMatch!.some((m) => m.re.test("¡Claro que sí! Hablo español."))).toBe(true);
    expect(es.mustNotMatch!.some((m) => m.re.test("Sí, hablo español."))).toBe(true);
  });
});

describe("no cold-outreach language", () => {
  it("flags outreach phrasing and passes plain advice", () => {
    for (const t of ["Cold call past customers", "Send an SMS blast", "Buy a lead list", "Call your leads every morning", "Start an outbound campaign"]) expect(COLD_OUTREACH_RE.test(t), t).toBe(true);
    for (const t of ["Reply to your 1-star reviews", "Call back every missed caller the same day"]) expect(COLD_OUTREACH_RE.test(t), t).toBe(false);
  });
});

describe("source of the checks", () => {
  it("uses real saved reports from the store when it can", async () => {
    const r = real();
    const store = {
      listBusinesses: async () => [r.business, { ...r.business, id: "fx", is_fixture: true }],
      getBusiness: async (id: string) => (id === r.business.id ? r.business : null),
      listReviews: async () => r.reviews, listFindings: async () => r.findings, listRoi: async () => r.roi, listSteps: async () => [],
      getRun: async () => r.run, listWebPages: async () => r.pages.map((p) => ({ ...p, text: p.preview })), listKnowledgeFacts: async () => r.knowledge,
      getAgentForBusiness: async () => null, getTracked: async () => null, listSnapshots: async () => [], listCheckins: async () => [], listCheckinReviews: async () => [],
    } as unknown as Store;
    const rep = await productEvals(async () => store);
    expect(rep.source.kind).toBe("store");
    expect(rep.businesses.map((b) => b.id)).toEqual([r.business.id]);
    expect(rep.total.fail).toBe(0);
  });

  it("falls back to the labeled snapshot when the store fails", async () => {
    const rep = await productEvals(async () => {
      throw new Error("fetch failed");
    });
    expect(rep.source.kind).toBe("snapshot");
    expect(rep.source.label).toMatch(/Saved snapshots .*Oct 26, 2026.*Live store unavailable \(fetch failed\)/);
  });
});
