import { listingFacts } from "../listing";
import type { Business, FindingKind, Review, WebPage } from "../types";

// DEMO MODE ONLY. Deterministic keyword diagnoser used when no LLM key is set.
// It produces output in the exact LLM schema, quoting real sentences from the
// stored reviews, so the downstream validation and ROI steps run unchanged.
// Two fixture behaviors exist to demo failure handling:
//   fail_diagnosis: always throws (simulates an LLM outage for one business)
//   hallucinate: adds a finding with a fabricated quote that the citation check must drop

const RULES: { kind: FindingKind; re: RegExp; site?: RegExp; title: string; detail: string; severity: number }[] = [
  {
    kind: "missed_calls",
    re: /voicemail|nobody answered|no one answered|didn'?t answer|could( not|n'?t) get (through|a hold)|never (got a call|heard) back|never called back/i,
    title: "Customers report calls going unanswered",
    detail: "Reviewers describe calls going to voicemail or never being returned, which sends ready-to-buy customers to competitors.",
    severity: 5,
  },
  {
    kind: "slow_response",
    re: /took (days|forever)|slow to respond|still waiting|never followed up|ever followed up|get back to me/i,
    title: "Slow quotes and follow ups",
    detail: "Reviewers mention waiting on quotes, invoices, or replies.",
    severity: 3,
  },
  {
    kind: "booking_friction",
    re: /hard to schedule|no online booking|scheduling was|just to book|only take bookings/i,
    // On the business's own homepage: phone-only booking.
    site: /to schedule service, call|call (us |our office )?to (schedule|book)/i,
    title: "Booking takes too much effort",
    detail: "Reviews or the business website show friction when trying to book a visit.",
    severity: 3,
  },
];

function sentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

function sentenceMatching(text: string, re: RegExp): string | null {
  for (const s of sentences(text)) if (re.test(s) && s.length >= 12) return s;
  return null;
}

type StubEvidence = { source: "review" | "listing" | "website"; review_id: string | null; quote: string | null; listing_fact: string | null };
type StubFinding = { kind: string; title: string; detail: string; severity: number; evidence: StubEvidence[] };

export function stubDiagnose(
  business: Business,
  reviews: Review[],
  aliasMap: Record<string, string>,
  pages: Pick<WebPage, "status" | "text">[] = [],
) {
  const siteText = pages.find((p) => p.status === "ok")?.text ?? "";
  const behavior = (business.raw as { fixtureBehavior?: string })?.fixtureBehavior;
  if (behavior === "fail_diagnosis") {
    throw new Error("Simulated LLM failure (demo fixture): upstream returned 503");
  }
  const aliasOf = Object.fromEntries(Object.entries(aliasMap).map(([alias, id]) => [id, alias]));
  const findings: StubFinding[] = [];

  for (const rule of RULES) {
    const evidence: StubEvidence[] = [];
    for (const r of reviews) {
      const s = sentenceMatching(r.text, rule.re);
      if (s) evidence.push({ source: "review", review_id: aliasOf[r.id] ?? null, quote: s, listing_fact: null });
      if (evidence.length >= 2) break;
    }
    if (rule.site && siteText) {
      const line = siteText.split("\n").map((l) => sentenceMatching(l, rule.site as RegExp)).find(Boolean);
      if (line) evidence.push({ source: "website", review_id: null, quote: line, listing_fact: null });
    }
    if (evidence.length) findings.push({ kind: rule.kind, title: rule.title, detail: rule.detail, severity: rule.severity, evidence });
  }

  const facts = listingFacts(business);
  if (facts.low_owner_response_rate.holds) {
    const negative = reviews.find((r) => (r.rating ?? 5) <= 2 && !r.owner_response);
    const evidence: StubEvidence[] = [{ source: "listing", review_id: null, quote: null, listing_fact: "low_owner_response_rate" }];
    if (negative) {
      const s = sentences(negative.text).find((x) => x.length >= 12);
      if (s) evidence.push({ source: "review", review_id: aliasOf[negative.id] ?? null, quote: s, listing_fact: null });
    }
    findings.push({
      kind: "unanswered_reviews",
      title: "Negative reviews sit without a reply",
      detail: "The owner rarely replies to reviews, so complaints are the last word future customers see.",
      severity: negative ? 4 : 2,
      evidence,
    });
  }

  if (facts.no_website.holds) {
    const mention = reviews.map((r) => ({ r, s: sentenceMatching(r.text, /website|online|contact info/i) })).find((x) => x.s);
    const evidence: StubEvidence[] = [{ source: "listing", review_id: null, quote: null, listing_fact: "no_website" }];
    if (mention?.s) evidence.push({ source: "review", review_id: aliasOf[mention.r.id] ?? null, quote: mention.s, listing_fact: null });
    findings.push({
      kind: "no_website",
      title: "No website on the listing",
      detail: "Customers who look for prices, services, or a booking link have nowhere to go.",
      severity: 3,
      evidence,
    });
  }

  if (behavior === "hallucinate") {
    findings.push({
      kind: "booking_friction",
      title: "Customers say booking is impossible",
      detail: "This finding cites a quote that does not exist in any review, to prove the citation check drops it.",
      severity: 5,
      evidence: [{ source: "review", review_id: "r1", quote: "I waited on hold for an hour and then they hung up on me", listing_fact: null }],
    });
  }

  const summary = findings.length
    ? `Demo diagnosis from keyword rules. Found ${findings.length === 1 ? "one issue" : "several issues"} backed by review quotes, website text, or listing data.`
    : "Demo diagnosis from keyword rules. No evidence-backed issues found.";
  return { summary, findings: findings.slice(0, 6) };
}
