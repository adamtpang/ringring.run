import { describe, expect, it } from "vitest";
import { daysToMatchReviews, fixedDraft, modelHasPhone, pathModel, resolvePath, searchCache } from "@/lib/path-to-one";

const PHONE = /\(?\b\d{3}\)?[ .-]?\d{3}[ .-]\d{4}\b/;

describe("path to #1", () => {
  it("ranks Aire Serv from the saved snapshot, with no phone and template drafts", () => {
    const m = pathModel("aire-serv")!;
    expect(m.name).toMatch(/Aire Serv/);
    expect(m.rank).toBe(11);
    expect(m.of).toBe(17);
    expect(m.score).toBe(46.3);
    expect(m.formula).toMatch(/not Google's ranking/);
    expect(m.gap?.reviewGap).toBe(108);
    expect(m.gap?.ratingGap).toBe(0.1);
    expect(m.gap?.per90).toBeNull();
    expect(m.drafts).toHaveLength(2);
    expect(m.drafts.map((d) => d.stars).sort()).toEqual([1, 5]);
    expect(m.drafts.find((d) => d.stars === 1)?.draft).toBe(fixedDraft(m.name, 1));
    expect(m.drafts.find((d) => d.stars === 5)?.draft).toBe(fixedDraft(m.name, 5));
    expect(m.drafts.every((d) => d.draft === fixedDraft(m.name, d.stars))).toBe(true);
    expect(m.draftNote).toMatch(/Fixed template/);
    expect(m.callsAllowed).toBe(false);
    expect(modelHasPhone(m)).toBe(false);
    expect(JSON.stringify(m)).not.toMatch(PHONE);
    expect(JSON.stringify(m)).not.toContain("tel:");
    expect(JSON.stringify(m)).not.toContain("[phone on Google listing]");
    const phone = m.profile.find((c) => c.label === "Phone on the listing");
    expect(phone?.status).toBe("pass");
    expect(phone?.detail).toMatch(/does not call/);
    expect(m.profile.some((c) => c.status === "gap" && c.label === "No can't-reach complaints")).toBe(true);
  });

  it("uses the nearby sample for Small Victory and the restaurant benchmark for Sapori", () => {
    const sv = pathModel("small-victory")!;
    expect(sv.rankLabel).toBe("#3 of 6");
    expect(sv.score).toBeNull();
    expect(sv.gap?.reviewGap).toBe(0);
    expect(sv.gap?.per90).toBe(12);
    expect(sv.drafts.length).toBe(10);
    const sapori = pathModel("sapori")!;
    expect(sapori.rank).not.toBeNull();
    expect(sapori.of).toBeGreaterThan(1);
    expect(sapori.formula).toMatch(/ringring's score/);
  });

  it("does not invent a business, and does not offer Antler or PlebLab", () => {
    expect(pathModel("antler-vc")).toBeNull();
    expect(pathModel("pleblab")).toBeNull();
    expect(searchCache("antler")).toEqual([]);
    expect(searchCache("pleblab")).toEqual([]);
    const miss = resolvePath({ q: "not a real shop xyz" });
    expect(miss.model.id).toBe("aire-serv");
    expect(miss.note).toMatch(/A live scan was not started/);
    expect(resolvePath({}).model.id).toBe("aire-serv");
    expect(resolvePath({ b: "lone-star-souvenir" }).model.id).toBe("lone-star-souvenir");
  });

  it("estimates days to match a review count without calling that a finish date", () => {
    expect(daysToMatchReviews(108, null, 1)).toBe(Math.ceil(108 / (1 / 7)));
    expect(daysToMatchReviews(0, 12, 1)).toBeNull();
    expect(daysToMatchReviews(12, 12, 0)).toBe(Math.ceil(12 / (12 / 90)));
  });
});
