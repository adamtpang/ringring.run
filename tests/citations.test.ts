import { describe, expect, it } from "vitest";
import { findQuoteSource, normalizeText, unsupportedNumbers, validateFindings } from "@/lib/citations";
import type { Diagnosis } from "@/lib/schema";
import type { Review, WebPage } from "@/lib/types";

const review = (id: string, text: string, rating = 2): Review => ({
  id, business_id: "b1", external_id: null, rating, text, published_at: null, owner_response: null, position: 0,
});
const reviews = [
  review("rev-a", "Called three times and it went straight to voicemail. Nobody called back."),
  review("rev-b", "Great work on our water heater.", 5),
];
const business = {
  website: "https://example.com", phone: "(512) 555-0100", opening_hours: [], owner_response_rate: 0.1,
  rating: 3.9, review_count: 40, scraped_review_count: 10,
};
const page: Pick<WebPage, "id" | "url" | "status" | "text"> = {
  id: "page-1", url: "https://example.com", status: "ok", text: "Welcome.\nTo schedule service, call our office during business hours.",
};
const alias = { r1: "rev-a", r2: "rev-b" };
const ev = (o: Record<string, unknown>) => ({ review_id: null, quote: null, listing_fact: null, ...o }) as Diagnosis["findings"][0]["evidence"][0];
const diag = (findings: Partial<Diagnosis["findings"][0]>[]): Diagnosis => ({
  summary: "s",
  findings: findings.map((f) => ({ kind: "missed_calls", title: "Calls go unanswered", detail: "Callers reach voicemail.", severity: 4, evidence: [], ...f })),
});

describe("citation substring check", () => {
  it("keeps a verbatim review quote and maps the alias to the stored id", () => {
    const { kept, dropped } = validateFindings(diag([{ evidence: [ev({ source: "review", review_id: "r1", quote: "it went straight to voicemail" })] }]), business, reviews, alias);
    expect(dropped).toEqual([]);
    expect(kept[0].evidence[0]).toMatchObject({ source: "review", review_id: "rev-a" });
  });

  it("drops a fabricated quote", () => {
    const { kept, dropped } = validateFindings(diag([{ evidence: [ev({ source: "review", review_id: "r1", quote: "they hung up on me twice" })] }]), business, reviews, alias);
    expect(kept).toHaveLength(0);
    expect(dropped[0].reason).toMatch(/not found/);
  });

  it("ignores case-insensitive near matches (case sensitive)", () => {
    expect(findQuoteSource("IT WENT STRAIGHT TO VOICEMAIL", reviews)).toBeNull();
  });

  it("normalizes unicode and whitespace", () => {
    expect(normalizeText("it\u00a0went   straight")).toBe(normalizeText("it went straight"));
  });

  it("keeps a website quote found on the stored page", () => {
    const { kept } = validateFindings(
      diag([{ kind: "booking_friction", title: "Phone only booking", detail: "Booking needs a call.", evidence: [ev({ source: "website", quote: "To schedule service, call our office" })] }]),
      business, reviews, alias, [page],
    );
    expect(kept[0].evidence[0]).toEqual({ source: "website", page_id: "page-1", url: "https://example.com", quote: "To schedule service, call our office" });
  });

  it("drops a website quote that is not on the page, or when the page failed", () => {
    const d = diag([{ kind: "booking_friction", title: "Phone only", detail: "x", evidence: [ev({ source: "website", quote: "Online booking is unavailable" })] }]);
    expect(validateFindings(d, business, reviews, alias, [page]).kept).toHaveLength(0);
    const ok = diag([{ kind: "booking_friction", title: "Phone only", detail: "x", evidence: [ev({ source: "website", quote: "To schedule service, call our office" })] }]);
    expect(validateFindings(ok, business, reviews, alias, [{ ...page, status: "failed" }]).kept).toHaveLength(0);
  });

  it("drops listing facts that do not hold", () => {
    const { dropped } = validateFindings(diag([{ kind: "no_website", title: "No website", detail: "x", evidence: [ev({ source: "listing", listing_fact: "no_website" })] }]), business, reviews, alias);
    expect(dropped[0].reason).toMatch(/does not hold/);
  });

  it("drops numbers the evidence does not support", () => {
    expect(unsupportedNumbers("Lost 40 calls", "went to voicemail")).toEqual(["40"]);
    const { dropped } = validateFindings(diag([{ title: "Missed 40 calls a week", evidence: [ev({ source: "review", review_id: "r1", quote: "it went straight to voicemail" })] }]), business, reviews, alias);
    expect(dropped[0].reason).toMatch(/numbers/);
  });

  it("drops duplicate kinds", () => {
    const e = [ev({ source: "review", review_id: "r1", quote: "it went straight to voicemail" })];
    const { kept, dropped } = validateFindings(diag([{ evidence: e }, { evidence: e }]), business, reviews, alias);
    expect(kept).toHaveLength(1);
    expect(dropped[0].reason).toMatch(/duplicate/);
  });
});
