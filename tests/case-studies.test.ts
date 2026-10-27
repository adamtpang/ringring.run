import { describe, expect, it } from "vitest";
import raw from "@/data/case-studies.json";
import { CASE_STUDIES, caseStudiesFor, CaseStudySchema, fmtStudyDate, numbersIn } from "@/lib/case-studies";
import { PLAN_KINDS } from "@/lib/types";

describe("case studies", () => {
  it("every case study has a url and a quote", () => {
    expect(CASE_STUDIES.length).toBeGreaterThanOrEqual(3);
    expect(CASE_STUDIES.length).toBeLessThanOrEqual(6);
    for (const c of raw.studies) {
      expect(c.url, c.id).toMatch(/^https:\/\/\S+$/);
      expect(c.quote.trim().length, c.id).toBeGreaterThan(10);
      expect(() => CaseStudySchema.parse(c)).not.toThrow();
    }
  });

  it("claims only use numbers the quote states", () => {
    for (const c of CASE_STUDIES) for (const n of numbersIn(c.claim)) expect(c.quote, `${c.id}: ${n}`).toContain(n);
  });

  it("labels vendor sources", () => {
    const vendors = CASE_STUDIES.filter((c) => /brightlocal|servicedirect/.test(c.url));
    expect(vendors.length).toBeGreaterThan(0);
    for (const c of vendors) expect(c.vendor_reported, c.id).toBe(true);
  });

  it("has unique ids and urls, no em dashes, and no made-up people", () => {
    expect(new Set(CASE_STUDIES.map((c) => c.id)).size).toBe(CASE_STUDIES.length);
    expect(new Set(CASE_STUDIES.map((c) => c.url)).size).toBe(CASE_STUDIES.length);
    expect(JSON.stringify(raw)).not.toMatch(/\u2014/);
    // Studies cite publishers and authors, never a "founder" testimonial.
    expect(JSON.stringify(raw)).not.toMatch(/founder|testimonial/i);
  });

  it("shows none where no source was found", () => {
    for (const k of ["slow_response", "booking_friction", "no_website"] as const) expect(caseStudiesFor(k)).toEqual([]);
    for (const k of PLAN_KINDS) for (const c of caseStudiesFor(k)) expect(c.kinds).toContain(k);
  });

  it("formats partial dates", () => {
    expect(fmtStudyDate("2018-02-14")).toBe("Feb 14, 2018");
    expect(fmtStudyDate("2011-09")).toBe("Sep 2011");
    expect(fmtStudyDate("2019")).toBe("2019");
  });
});
