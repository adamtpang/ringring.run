import { describe, expect, it } from "vitest";
import {
  ACTOR_LABEL,
  ASSUMPTION_QUESTIONS,
  buildGamePlan,
  CHECK_IDS,
  COACHING,
  CoachingSchema,
  FIX_CAPABILITIES,
  leadActor,
  NEEDS_OK,
  pickQuestions,
  snippet,
  SUPPORT_ONLY,
  tierOf,
  type PlanInput,
} from "@/lib/gameplan";
import { buildBoard, toSubjectInput } from "@/lib/peers";
import { INTERVIEW } from "@/lib/prescription";
import { defaultAssumptions } from "@/lib/roi";
import { OWNER_ONLY_KINDS, PLAN_KINDS, type Business, type Finding, type KnowledgeFact, type Review, type RoiEstimate } from "@/lib/types";

const SCAN = "2026-10-26T21:48:51Z";

function biz(over: Partial<Business> = {}): Business {
  return {
    id: "b1",
    run_id: "r1",
    place_id: "ChIJtest",
    name: "Test Air",
    category: "HVAC contractor",
    address: null,
    city: "Austin",
    phone: "(512) 555-0100",
    website: "https://example.com/",
    rating: 4.6,
    review_count: 80,
    opening_hours: [{ day: "Monday", hours: "8 AM to 5 PM" }],
    maps_url: "https://maps.google.com/?cid=1",
    owner_response_rate: null,
    scraped_review_count: 0,
    is_fixture: true,
    diagnosis_status: "ok",
    diagnosis_summary: null,
    diagnosis_error: null,
    opportunity_score: 0,
    est_monthly_value: 0,
    raw: {},
    created_at: SCAN,
    ...over,
  } as Business;
}

let n = 0;
function rev(rating: number, text: string, published_at: string | null, replied = false): Review {
  n++;
  return { id: `rv${n}`, business_id: "b1", external_id: null, rating, text, published_at, owner_response: replied ? "Thanks, we are on it." : null, position: n };
}

function finding(kind: Finding["kind"], r: Review, severity = 4): Finding {
  return { id: `f-${kind}`, business_id: "b1", run_id: "r1", kind, title: kind, detail: "d", severity, solution: "ai_receptionist", evidence: [{ source: "review", review_id: r.id, quote: r.text.slice(0, 40), rating: r.rating }], created_at: SCAN } as Finding;
}

function roi(f: Finding, monthly: number): RoiEstimate {
  return { id: `roi-${f.id}`, finding_id: f.id, business_id: "b1", assumptions: [{ key: "a", label: "Amount", value: monthly, unit: "usd", source: "assumption" }], formula: "a", monthly_value: monthly, is_edited: false, updated_at: SCAN } as unknown as RoiEstimate;
}

function input(over: Partial<PlanInput> & { business?: Business } = {}): PlanInput {
  const business = over.business ?? biz();
  const reviews = over.reviews ?? [];
  const subject = toSubjectInput(business, reviews, null);
  return { business, findings: [], roi: [], reviews, knowledge: [], board: buildBoard(subject), subject, scanDate: SCAN, ...over };
}

describe("coaching data", () => {
  it("covers every plan kind and validates", () => {
    expect(() => CoachingSchema.parse(COACHING)).not.toThrow();
    for (const k of PLAN_KINDS) expect(COACHING.kinds[k], k).toBeDefined();
  });

  it("only links real https sources and never uses em dashes", () => {
    const text = JSON.stringify(COACHING);
    expect(text).not.toMatch(/\u2014/);
    for (const k of PLAN_KINDS) for (const s of COACHING.kinds[k].sources) expect(s.url).toMatch(/^https:\/\//);
  });

  it("splits agent work from owner work", () => {
    for (const k of PLAN_KINDS) {
      const c = COACHING.kinds[k];
      expect(c.you.length, k).toBeGreaterThan(0);
      for (const s of c.ringy) {
        if (NEEDS_OK.includes(s.capability)) expect(s.actor, `${k} ${s.capability}`).toBe("ringy_after_ok");
      }
    }
    // Problems only the owner can fix never get a tool or an agent as the fix.
    for (const k of OWNER_ONLY_KINDS) {
      const c = COACHING.kinds[k];
      expect(c.owner_only).toBe(true);
      for (const s of c.ringy) expect(SUPPORT_ONLY).toContain(s.capability);
      expect(leadActor(c)).toBe("you");
    }
  });

  it("rejects a coaching file where Ringy 'fixes' staff attitude with an agent", () => {
    const bad = structuredClone(COACHING);
    bad.kinds.staff_attitude.ringy = [{ actor: "ringy_after_ok", capability: "build_agent", text: "Build an agent that is nicer to customers." }];
    expect(() => CoachingSchema.parse(bad)).toThrow(/owner-only/);
  });

  it("rejects posting replies without the owner's OK", () => {
    const bad = structuredClone(COACHING);
    bad.kinds.unanswered_reviews.ringy = [{ actor: "ringy", capability: "draft_replies", text: "Post replies to every review right away." }];
    expect(() => CoachingSchema.parse(bad)).toThrow(/OK/);
  });

  it("labels the lead actor", () => {
    expect(leadActor({ owner_only: false, ringy: [{ actor: "ringy_after_ok", capability: "set_up_tool", text: "x".repeat(10) }] })).toBe("ringy_after_ok");
    expect(leadActor({ owner_only: false, ringy: [{ actor: "ringy", capability: "monitor", text: "x".repeat(10) }] })).toBe("you");
    expect(FIX_CAPABILITIES).not.toContain("monitor");
    expect(Object.keys(ACTOR_LABEL)).toEqual(["ringy", "ringy_after_ok", "you"]);
  });

  it("has interview questions for every plan kind", () => {
    for (const k of PLAN_KINDS) expect(INTERVIEW[k].length, k).toBeGreaterThanOrEqual(4);
  });
});

describe("scorecard", () => {
  it("always runs the same checks in the same order", () => {
    const a = buildGamePlan(input()).checks.map((c) => c.id);
    const b = buildGamePlan(input({ business: biz({ website: null, phone: null, opening_hours: [], rating: null, review_count: null }) })).checks.map((c) => c.id);
    expect(a).toEqual([...CHECK_IDS]);
    expect(b).toEqual([...CHECK_IDS]);
  });

  it("says unknown, not pass or gap, for what Ringy could not read", () => {
    const g = buildGamePlan(input());
    const by = Object.fromEntries(g.checks.map((c) => [c.id, c.status]));
    expect(by.replies).toBe("unknown");
    expect(by.reach).toBe("unknown");
    expect(by.prices).toBe("unknown");
    expect(by.booking).toBe("unknown");
  });

  it("passes prices and booking only on evidence", () => {
    const k = (kind: KnowledgeFact["kind"], label: string, value: string): KnowledgeFact => ({ id: label, business_id: "b1", kind, label, value, source_type: "website", source_ref: "p1", quote: value, created_at: SCAN });
    const g = buildGamePlan(input({ knowledge: [k("price", "Tune-up", "$89 tune-up"), k("policy", "How to book", "Book online now")] }));
    const by = Object.fromEntries(g.checks.map((c) => [c.id, c]));
    expect(by.prices!.status).toBe("pass");
    expect(by.booking!.status).toBe("pass");
    const g2 = buildGamePlan(input({ knowledge: [k("policy", "How to book", "Call Us")] }));
    expect(g2.checks.find((c) => c.id === "booking")!.status).toBe("unknown");
    expect(g2.checks.find((c) => c.id === "booking")!.detail).toMatch(/Call Us/);
  });

  it("makes the first gap the binding constraint", () => {
    const g = buildGamePlan(input({ business: biz({ opening_hours: [], website: null }) }));
    expect(g.binding.check).toBe("hours");
    expect(g.items.find((i) => i.recommended)!.kind).toBe("no_hours");
    expect(g.items.filter((i) => i.recommended)).toHaveLength(1);
  });

  it("quotes the newest unanswered bad review in the binding sentence", () => {
    const old = rev(1, "Nobody showed up at all.", "2026-01-02T00:00:00Z");
    const fresh = rev(2, "They never called me back.", "2026-09-01T00:00:00Z");
    const rest = [3, 4, 5].map((i) => rev(1, `Bad visit ${i} but they apologized.`, `2026-08-0${i}T00:00:00Z`, true));
    const g = buildGamePlan(input({ reviews: [old, fresh, ...rest] }));
    expect(g.binding.check).toBe("replies");
    expect(g.binding.sentence).toMatch(/^The owner replied to 3 of the 5 reviews with 1 or 2 stars Ringy read \(60%; Ringy's sample, not a Google figure\), under the 80% target/);
    expect(g.binding.sentence).toContain("They never called me back.");
    expect(g.binding.evidence[0]!.url).toBe("https://maps.google.com/?cid=1");
  });

  it("never lets a small sample decide replies, and shows it as a secondary note", () => {
    const happy = Array.from({ length: 15 }, (_, i) => rev(5, `Great service number ${i}.`, "2026-06-01T00:00:00Z", true));
    const bad = rev(1, "Nobody came back to finish.", "2026-05-11T00:00:00Z");
    const badOk = rev(1, "Tech was late.", "2025-07-29T00:00:00Z", true);
    const g = buildGamePlan(input({ reviews: [...happy, bad, badOk] }));
    const c = g.checks.find((x) => x.id === "replies")!;
    expect(c.status).toBe("pass");
    expect(c.detail).toMatch(/16 of the 17 newest reviews Ringy read \(94%/);
    expect(c.note).toBe("1 of the 2 reviews with 1 or 2 stars has no reply (small sample, under 5).");
    expect(g.binding.check).not.toBe("replies");
    const tiny = buildGamePlan(input({ reviews: [bad, badOk] }));
    expect(tiny.checks.find((x) => x.id === "replies")!.status).toBe("unknown");
    expect(tiny.binding.check).not.toBe("replies");
  });

  it("never counts or quotes reviews with discrimination allegations", () => {
    const a = rev(1, "The tech was racist and rude to my family.", "2026-09-01T00:00:00Z");
    const b = rev(1, "Rude staff, they hung up on me.", "2026-09-02T00:00:00Z");
    const g = buildGamePlan(input({ reviews: [a, b] }));
    const all = JSON.stringify(g);
    expect(all).not.toMatch(/racist/i);
    const c = g.checks.find((x) => x.id === "replies")!;
    expect(c.detail).toMatch(/^Ringy read only 1 review, too few/);
    expect(c.note).toMatch(/^1 of the 1 review with 1 or 2 stars has no reply \(small sample/);
    const staff = g.items.find((i) => i.kind === "staff_attitude")!;
    expect(staff.evidence.map((e) => e.reviewId)).toEqual([b.id]);
  });
});

describe("plan items", () => {
  it("tiers urgent and important first", () => {
    expect(tierOf(true, true)).toBe("A");
    expect(tierOf(false, true)).toBe("B");
    expect(tierOf(true, false)).toBe("C");
    expect(tierOf(false, false)).toBe("C");
  });

  it("orders by tier, then severity and money, and marks recent evidence urgent", () => {
    const recent = rev(1, "Called three times, no answer.", "2026-09-01T00:00:00Z", true);
    const old = rev(2, "Booking was a pain, had to call twice.", "2025-01-01T00:00:00Z", true);
    const fMiss = finding("missed_calls", recent, 5);
    const fBook = finding("booking_friction", old, 4);
    const g = buildGamePlan(input({ reviews: [recent, old], findings: [fBook, fMiss], roi: [roi(fMiss, 2000), roi(fBook, 900)] }));
    expect(g.items.map((i) => [i.kind, i.tier])).toEqual([
      ["missed_calls", "A"],
      ["booking_friction", "B"],
    ]);
    expect(g.items[0]!.urgentWhy).toMatch(/days old \(under 180\)/);
    expect(g.items[1]!.urgentWhy).toMatch(/over 180/);
  });

  it("reads owner-only problems from 1 to 3 star reviews and leads them with 'You do this'", () => {
    const r = rev(3, "Fine visit. But it was way overpriced for a tune-up.", "2026-09-01T00:00:00Z", true);
    const g = buildGamePlan(input({ reviews: [r] }));
    const p = g.items.find((i) => i.kind === "pricing")!;
    expect(p.lead).toBe("you");
    expect(p.ownerOnly).toBe(true);
    expect(p.evidence[0]!.text).toBe("But it was way overpriced for a tune-up.");
    expect(p.effects.money.value).toBeNull();
    expect(p.effects.money.basis).toMatch(/Not estimated/);
  });

  it("does not flag 5 star praise as an owner-only problem", () => {
    const r = rev(5, "Not overpriced at all, and nobody was rude.", "2026-09-01T00:00:00Z", true);
    expect(buildGamePlan(input({ reviews: [r] })).items.map((i) => i.kind)).not.toContain("pricing");
  });

  it("treats missing basics as problems", () => {
    const g = buildGamePlan(input({ business: biz({ phone: null, opening_hours: [], review_count: 6, rating: 4.8 }) }));
    const kinds = g.items.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["no_phone", "no_hours", "few_reviews"]));
    expect(g.items.find((i) => i.kind === "no_phone")!.urgent).toBe(true);
  });

  it("shows 'not estimated' instead of inventing numbers", () => {
    const g = buildGamePlan(input({ business: biz({ opening_hours: [] }) }));
    const it0 = g.items.find((i) => i.kind === "no_hours")!;
    expect(it0.effects.money.value).toBeNull();
    expect(it0.effects.quality.value).toBeNull();
  });

  it("drops a dollar figure whose inputs are not on file, and never shows a star-lift figure", () => {
    const r1 = rev(1, "Called three times, no answer.", "2026-09-01T00:00:00Z");
    const fMiss = finding("missed_calls", r1, 5);
    const bare = { ...roi(fMiss, 3897), assumptions: [] } as RoiEstimate;
    const g = buildGamePlan(input({ reviews: [r1], findings: [fMiss], roi: [bare] }));
    const item = g.items.find((i) => i.kind === "missed_calls")!;
    expect(item.monthly).toBeNull();
    expect(item.effects.money.value).toBeNull();
    expect(JSON.stringify(g)).not.toMatch(/\$3,897|stars at most|ceiling/);
  });
});

describe("prognosis and interview", () => {
  it("ties the prognosis to the measured reply rate and labels it an estimate", () => {
    const a = rev(1, "Never called back after the quote.", "2026-09-01T00:00:00Z");
    const b = [2, 3, 4, 5].map((i) => rev(2, `Late and messy ${i}.`, "2026-08-01T00:00:00Z", true));
    const g = buildGamePlan(input({ reviews: [a, ...b] }));
    expect(g.prognosis.metric).toMatch(/Reply rate/);
    expect(g.prognosis.now).toBe("80% (4 of 5 read)");
    expect(g.prognosis.ifNothing).toMatch(/^If nothing changes: .*80% \(4 of 5 read\)/);
    expect(g.prognosis.ifPlan).toMatch(/^If you do the A items in the next 30 days: .*100% \(5 of 5\)/);
    expect(g.prognosis.note).toMatch(/Estimate, not a promise/);
  });

  it("counts overlapping dollar estimates once and shows the rule", () => {
    const r1 = rev(1, "Called three times, no answer.", "2026-09-01T00:00:00Z", true);
    const r2 = rev(2, "Took days to answer my message.", "2026-09-02T00:00:00Z", true);
    const fMiss = finding("missed_calls", r1, 5);
    const fSlow = finding("slow_response", r2, 4);
    const g = buildGamePlan(input({ reviews: [r1, r2], findings: [fMiss, fSlow], roi: [roi(fMiss, 3897), roi(fSlow, 1080)] }));
    const a = g.items.filter((i) => i.tier === "A");
    expect(a.map((i) => i.kind).sort()).toEqual(["missed_calls", "slow_response"]);
    expect(JSON.stringify(g.prognosis)).toContain("$3,897/mo");
    expect(JSON.stringify(g.prognosis)).not.toContain("$4,977");
    expect(g.prognosis.note).toMatch(/counted once/);
  });

  it("shows the inputs and math behind each dollar figure inline", () => {
    const r1 = rev(1, "Called three times, no answer.", "2026-09-01T00:00:00Z", true);
    const fMiss = finding("missed_calls", r1, 5);
    const est = { ...roi(fMiss, 3897), assumptions: defaultAssumptions("missed_calls", { category: "HVAC contractor", owner_response_rate: null }) };
    const g = buildGamePlan(input({ reviews: [r1], findings: [fMiss], roi: [est] }));
    const item = g.items[0]!;
    expect(item.effects.money.basis).toMatch(/10 missed calls per week \(assumed\)/i);
    expect(item.effects.money.basis).toMatch(/4\.33 weeks per month \(52 weeks \/ 12 months\)/);
    expect(item.effects.money.basis).toMatch(/default assumption, ask the owner/);
    expect(item.moneyTrace!.math).toBe("10 × 4.33 × 50% × 40% × $450 = $3,897");
    expect(item.monthly).toBe(3897);
    expect(g.questions).toContain(ASSUMPTION_QUESTIONS.avg_ticket);
    expect(g.questions.length).toBeLessThanOrEqual(5);
  });

  it("falls back to listing basics when one is missing, without a peer guess", () => {
    const g = buildGamePlan(input({ business: biz({ phone: null }) }));
    expect(g.prognosis.metric).toMatch(/Listing basics/);
    expect(g.prognosis.now).toBe("2 of 3");
  });

  it("picks 3 to 5 distinct questions starting with the top problems", () => {
    const g = buildGamePlan(input({ business: biz({ phone: null, opening_hours: [] }) }));
    expect(g.questions.length).toBeGreaterThanOrEqual(3);
    expect(g.questions.length).toBeLessThanOrEqual(5);
    expect(new Set(g.questions).size).toBe(g.questions.length);
    expect(g.questions[0]).toBe(INTERVIEW[g.items[0]!.kind][0]);
    expect(pickQuestions([], []).length).toBe(3);
  });

  it("quotes a single sentence, trimmed", () => {
    expect(snippet("Great guys. Way too expensive though! Would not return.", /expensive/)).toBe("Way too expensive though!");
    expect(snippet("x".repeat(300), /x/).length).toBe(160);
  });
});
