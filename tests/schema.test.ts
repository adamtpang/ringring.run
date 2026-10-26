import { describe, expect, it } from "vitest";
import { DIAGNOSIS_JSON_SCHEMA, parseDiagnosis, ScanInputSchema } from "@/lib/schema";

const ev = (o: Record<string, unknown>) => ({ review_id: null, quote: null, listing_fact: null, ...o });
const finding = (evidence: unknown[]) => ({ kind: "missed_calls", title: "Calls go unanswered", detail: "Callers reach voicemail.", severity: 4, evidence });

describe("diagnosis schema", () => {
  it("accepts review, website, and listing evidence", () => {
    const r = parseDiagnosis({
      summary: "ok",
      findings: [
        finding([
          ev({ source: "review", review_id: "r1", quote: "went straight to voicemail" }),
          ev({ source: "website", quote: "To schedule service, call our office" }),
          ev({ source: "listing", listing_fact: "no_hours" }),
        ]),
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects review evidence without an id or with a short quote", () => {
    expect(parseDiagnosis({ summary: "x", findings: [finding([ev({ source: "review", quote: "a long enough quote here" })])] }).ok).toBe(false);
    expect(parseDiagnosis({ summary: "x", findings: [finding([ev({ source: "review", review_id: "r1", quote: "short" })])] }).ok).toBe(false);
  });

  it("rejects website evidence without a quote", () => {
    expect(parseDiagnosis({ summary: "x", findings: [finding([ev({ source: "website" })])] }).ok).toBe(false);
  });

  it("rejects unknown kinds, extra keys, and empty evidence", () => {
    expect(parseDiagnosis({ summary: "x", findings: [{ ...finding([ev({ source: "listing", listing_fact: "no_hours" })]), kind: "bad" }] }).ok).toBe(false);
    expect(parseDiagnosis({ summary: "x", extra: 1, findings: [] }).ok).toBe(false);
    expect(parseDiagnosis({ summary: "x", findings: [finding([])] }).ok).toBe(false);
  });

  it("JSON schema allows the website source", () => {
    expect(JSON.stringify(DIAGNOSIS_JSON_SCHEMA)).toContain('"website"');
  });
});

describe("scan input", () => {
  it("parses a category scan", () => {
    const r = ScanInputSchema.parse({ category: "plumbers", city: "Austin TX", maxCount: "12" });
    expect(r).toEqual({ kind: "category", category: "plumbers", city: "Austin TX", maxCount: 12 });
  });

  it("parses a name lookup with the city after a comma", () => {
    const r = ScanInputSchema.parse({ name: "Joe's Plumbing, Austin TX" });
    expect(r).toEqual({ kind: "name", category: "Joe's Plumbing", city: "Austin TX", maxCount: 1 });
  });

  it("parses a name lookup with a separate city", () => {
    expect(ScanInputSchema.parse({ name: "Joe's Plumbing", city: "Austin TX" }).kind).toBe("name");
  });

  it("rejects a name without a city and out of range counts", () => {
    expect(ScanInputSchema.safeParse({ name: "Joe's Plumbing" }).success).toBe(false);
    expect(ScanInputSchema.safeParse({ category: "plumbers", city: "Austin", maxCount: 99 }).success).toBe(false);
    expect(ScanInputSchema.safeParse({ city: "Austin" }).success).toBe(false);
  });
});
