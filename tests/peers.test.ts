import { describe, expect, it } from "vitest";
import {
  ALLEGATION_RE,
  buildBoard,
  industryFor,
  METRICS,
  MIN_PEERS,
  movesUp,
  PEERS,
  percentile,
  rowMetrics,
  scoreGroup,
  SUBJECT_ID,
  tierFor,
  type Entry,
  type Metrics,
  type PeerData,
  type PeerRow,
} from "@/lib/peers";

const m = (rating: number | null, reviews: number | null, reply: number | null = null, complaints: number | null = null, reach: number | null = null): Metrics => ({ rating, reviews, reply, complaints, reach });

function row(i: number, over: Partial<PeerRow> = {}): PeerRow {
  return {
    key: `cafe-${String(i).padStart(2, "0")}`,
    industry: "cafe",
    place_hash: `hash${i}`,
    rating: 4 + i / 10,
    total_reviews: 100 * i,
    sampled_reviews: 10,
    text_reviews: 10,
    negative_reviews: 4,
    negative_replied: i % 5,
    complaint_reviews: 10 - i,
    reach_complaint_reviews: i % 3,
    ...over,
  };
}

function data(rows: PeerRow[]): PeerData {
  return { ...PEERS, peers: rows };
}

const subject = (over: Partial<Parameters<typeof buildBoard>[0]> = {}) => ({
  id: "b1",
  name: "Test Cafe",
  category: "Coffee shop",
  city: "Austin",
  rating: 4.5,
  review_count: 250,
  reviews: [
    { rating: 1, owner_replied: false, text: "cold coffee" },
    { rating: 2, owner_replied: true, text: "slow" },
    { rating: 5, owner_replied: false, text: "great" },
  ],
  ...over,
});

describe("tier formula", () => {
  it("weights sum to 1 and tiers cover 0-100", () => {
    expect(METRICS.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 10);
    expect([tierFor(100), tierFor(80), tierFor(79.9), tierFor(65), tierFor(50), tierFor(35), tierFor(34.9), tierFor(0)]).toEqual(["S", "S", "A", "A", "B", "C", "D", "D"]);
  });

  it("percentile splits ties evenly and handles a group of one", () => {
    expect(percentile(3, [1, 2, 3])).toBe(1);
    expect(percentile(1, [1, 2, 3])).toBe(0);
    expect(percentile(2, [2, 2, 2])).toBe(0.5);
    expect(percentile(5, [5])).toBe(0.5);
  });

  it("best on every signal scores 100 and worst scores 0; lower complaints is better", () => {
    const entries: Entry[] = [
      { id: "a", metrics: m(5, 900, 1, 0, 0) },
      { id: "b", metrics: m(4.5, 500, 0.5, 0.3, 0.1) },
      { id: "c", metrics: m(4, 100, 0, 0.6, 0.2) },
    ];
    const s = scoreGroup(entries);
    expect(s.map((x) => [x.id, x.score, x.tier, x.rank])).toEqual([
      ["a", 100, "S", 1],
      ["b", 50, "B", 2],
      ["c", 0, "D", 3],
    ]);
  });

  it("ties share a rank and are flagged", () => {
    const s = scoreGroup([
      { id: "a", metrics: m(4.5, 100) },
      { id: "b", metrics: m(4.5, 100) },
      { id: "c", metrics: m(4, 50) },
    ]);
    expect(s.map((x) => [x.id, x.rank, x.tied, x.position])).toEqual([
      ["a", 1, true, 1],
      ["b", 1, true, 2],
      ["c", 3, false, 3],
    ]);
  });

  it("missing signals are left out and the remaining weights renormalize", () => {
    const s = scoreGroup([
      { id: "a", metrics: m(5, 900, null, null, null) },
      { id: "b", metrics: m(4, 100, 1, 0, 0) },
      { id: "c", metrics: m(4.5, 500, 0, 1, 1) },
    ]);
    const a = s.find((x) => x.id === "a")!;
    expect(a.score).toBe(100);
    expect(a.coverage).toBe(0.5);
    expect(a.parts.reply).toBeNull();
    const b = s.find((x) => x.id === "b")!;
    // rating 0, reviews 0, reply 1, complaints 1, reach 1 -> (0.2+0.15+0.15)/1
    expect(b.score).toBe(50);
  });

  it("does not score without a rating or review count", () => {
    const s = scoreGroup([
      { id: "a", metrics: m(null, 900) },
      { id: "b", metrics: m(4, 100) },
      { id: "c", metrics: m(4.5, 500) },
    ]);
    const a = s.find((x) => x.id === "a")!;
    expect([a.score, a.tier, a.rank]).toEqual([null, null, null]);
    expect(s[s.length - 1]!.id).toBe("a");
  });
});

describe("moves up a tier", () => {
  it("picks the smallest peer value that lifts the tier, best two first", () => {
    const entries: Entry[] = [
      { id: SUBJECT_ID, metrics: m(4.5, 300, 0, 0.5, 0.3) },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `p${i}`, metrics: m(4 + i / 10, 100 * i, i / 6, 0.6 - i / 10, 0.3 - i / 20) })),
    ];
    const base = scoreGroup(entries).find((x) => x.id === SUBJECT_ID)!;
    const moves = movesUp(entries, SUBJECT_ID);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.length).toBeLessThanOrEqual(2);
    for (const mv of moves) {
      expect(mv.score).toBeGreaterThan(base.score!);
      expect(entries.some((e) => e.id !== SUBJECT_ID && e.metrics[mv.metric] === mv.to)).toBe(true);
    }
    if (moves.length === 2 && moves[1]!.reachesNextTier) expect(moves[0]!.reachesNextTier).toBe(true);
  });

  it("returns nothing for a top-tier business", () => {
    const entries: Entry[] = [
      { id: SUBJECT_ID, metrics: m(5, 900, 1, 0, 0) },
      { id: "b", metrics: m(4, 100, 0, 1, 1) },
    ];
    expect(movesUp(entries, SUBJECT_ID)).toEqual([]);
  });
});

describe("peer board", () => {
  it("compares a live business with benchmark peers of the same industry", () => {
    const b = buildBoard(subject(), data([1, 2, 3, 4, 5, 6].map((i) => row(i))));
    expect(b.status).toBe("ok");
    if (b.status !== "ok") return;
    expect(b.peerCount).toBe(6);
    expect(b.rows).toHaveLength(7);
    expect(b.subject.metrics.reply).toBe(0.5);
    expect(b.missing).toEqual(["complaints", "reach"]);
    expect(b.subject.rank).toBeGreaterThanOrEqual(1);
  });

  it(`says not enough peers under ${MIN_PEERS}`, () => {
    const b = buildBoard(subject(), data([1, 2, 3, 4].map((i) => row(i))));
    expect(b).toMatchObject({ status: "not_enough_peers", peerCount: 4 });
  });

  it("does not count the business as its own peer", () => {
    const b = buildBoard(subject({ place_hash: "hash1" }), data([1, 2, 3, 4, 5].map((i) => row(i))));
    expect(b).toMatchObject({ status: "not_enough_peers", peerCount: 4 });
  });

  it("has no peers for an unmapped category or another city", () => {
    expect(buildBoard(subject({ category: "Car wash" })).status).toBe("no_industry");
    expect(buildBoard(subject({ city: "Dallas" })).status).toBe("no_industry");
  });

  it("needs a rating and review count to score", () => {
    expect(buildBoard(subject({ rating: null }), data([1, 2, 3, 4, 5].map((i) => row(i)))).status).toBe("not_scored");
  });

  it("drops allegation reviews and needs two 1-2 star reviews for the reply rate", () => {
    const one = buildBoard(subject({ reviews: [{ rating: 1, owner_replied: false, text: "rude" }, { rating: 1, owner_replied: true, text: "they were racist" }] }), data([1, 2, 3, 4, 5].map((i) => row(i))));
    expect(one.status === "ok" && one.subject.metrics.reply).toBeNull();
  });
});

describe("industry mapping", () => {
  it("maps clear Google categories in Austin only", () => {
    expect(industryFor("HVAC contractor", "Austin")).toBe("hvac_plumbing");
    expect(industryFor("Air conditioning repair service", "Austin")).toBe("hvac_plumbing");
    expect(industryFor("Plumber", "austin")).toBe("hvac_plumbing");
    expect(industryFor("Dental clinic", "Austin")).toBe("dentist");
    expect(industryFor("Coffee shop", "Austin")).toBe("cafe");
    expect(industryFor("Guitar store", "Austin")).toBe("music_shop");
    expect(industryFor("Taco restaurant", "Austin")).toBe("restaurant");
    expect(industryFor("Nail salon", "Austin")).toBe("salon");
    expect(industryFor("Electrician", "Austin")).toBeNull();
    expect(industryFor("Plumber", "Round Rock")).toBeNull();
    expect(industryFor(null, "Austin")).toBeNull();
  });
});

describe("benchmark data", () => {
  it("holds only derived counts, no names or text", () => {
    const allowed = new Set(["key", "industry", "place_hash", "rating", "total_reviews", "sampled_reviews", "text_reviews", "negative_reviews", "negative_replied", "complaint_reviews", "reach_complaint_reviews"]);
    expect(PEERS.peers.length).toBe(111);
    for (const p of PEERS.peers) {
      for (const k of Object.keys(p)) expect(allowed.has(k)).toBe(true);
      expect(p.negative_replied).toBeLessThanOrEqual(p.negative_reviews);
      expect(p.complaint_reviews).toBeLessThanOrEqual(p.text_reviews);
      expect(p.reach_complaint_reviews).toBeLessThanOrEqual(p.complaint_reviews);
      expect(p.text_reviews).toBeLessThanOrEqual(p.sampled_reviews);
    }
    expect(new Set(PEERS.peers.map((p) => p.key)).size).toBe(111);
    expect(PEERS.peers.filter((p) => p.industry === "hvac_plumbing")).toHaveLength(16);
    expect(PEERS.peers.filter((p) => p.industry === "cafe")).toHaveLength(27);
  });

  it("every industry group is big enough to rank", () => {
    for (const ind of Object.keys(PEERS.industries)) expect(PEERS.peers.filter((p) => p.industry === ind).length).toBeGreaterThanOrEqual(MIN_PEERS);
  });

  it("row metrics are shares of the sample", () => {
    const r = row(2, { negative_reviews: 1, negative_replied: 1 });
    expect(rowMetrics(r).reply).toBeNull();
    expect(rowMetrics(row(2)).complaints).toBeCloseTo(0.8);
  });

  it("allegation screen catches bias claims", () => {
    expect(ALLEGATION_RE.test("I think this person is racist")).toBe(true);
    expect(ALLEGATION_RE.test("age discrimination")).toBe(true);
    expect(ALLEGATION_RE.test("they never called back")).toBe(false);
  });
});

describe("rating steadied by review count", () => {
  it("three 5-star reviews do not outrank hundreds at 4.9", () => {
    const s = scoreGroup([
      { id: "few", metrics: m(5, 3) },
      { id: "many", metrics: m(4.9, 300) },
      { id: "low", metrics: m(4.2, 300) },
    ]);
    const few = s.find((x) => x.id === "few")!;
    const many = s.find((x) => x.id === "many")!;
    expect(many.parts.rating!).toBeGreaterThan(few.parts.rating!);
  });

  it("never suggests changing the rating itself", () => {
    const entries: Entry[] = [{ id: SUBJECT_ID, metrics: m(4, 100) }, ...[1, 2, 3, 4, 5].map((i) => ({ id: `p${i}`, metrics: m(4 + i / 10, 100) }))];
    expect(movesUp(entries, SUBJECT_ID).every((x) => x.metric !== "rating")).toBe(true);
  });
});
