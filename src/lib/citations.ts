import { listingFacts, LISTING_FACT_LABELS } from "./listing";
import type { Diagnosis, LlmFinding } from "./schema";
import { KIND_TO_SOLUTION } from "./solutions";
import type { Evidence, FindingKind, Review, WebPage } from "./types";

// Post-validation of LLM findings. A finding survives only if every citation
// checks out against stored data:
//  - review quotes must be a real substring of a stored review for this business
//  - website quotes must be a real substring of the stored homepage text
//  - listing facts must actually hold for this listing
//  - any number in the title or detail must appear in the cited evidence

export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

function trimQuote(q: string): string {
  // Models sometimes wrap quotes in quotation marks or ellipses.
  return normalizeText(q)
    .replace(/^["'.\s]+|["'.\s]+$/g, "")
    .trim();
}

/** Returns the review that contains the quote, preferring the cited id. */
/** Returns the successfully read page that contains the quote. */
export function findPageSource(quote: string, pages: Pick<WebPage, "id" | "url" | "status" | "text">[]) {
  const q = trimQuote(quote);
  if (q.length < 12) return null;
  return pages.find((p) => p.status === "ok" && normalizeText(p.text).includes(q)) ?? null;
}

export function findQuoteSource(quote: string, reviews: Review[], citedId?: string | null): Review | null {
  const q = trimQuote(quote);
  if (q.length < 12) return null;
  const ordered = citedId ? [...reviews].sort((a, b) => (a.id === citedId ? -1 : b.id === citedId ? 1 : 0)) : reviews;
  for (const r of ordered) {
    if (normalizeText(r.text).includes(q)) return r;
  }
  return null;
}

export interface ValidatedFinding {
  kind: FindingKind;
  title: string;
  detail: string;
  severity: number;
  solution: (typeof KIND_TO_SOLUTION)[FindingKind];
  evidence: Evidence[];
}

export interface DroppedFinding {
  kind: string;
  title: string;
  reason: string;
}

export interface CitationResult {
  kept: ValidatedFinding[];
  dropped: DroppedFinding[];
}

type BusinessFacts = Parameters<typeof listingFacts>[0];

/**
 * review_id in LLM output refers to the prompt alias (r1, r2, ...). aliasMap maps alias to stored review id.
 */
export function validateFindings(
  diagnosis: Diagnosis,
  business: BusinessFacts,
  reviews: Review[],
  aliasMap: Record<string, string> = {},
  pages: Pick<WebPage, "id" | "url" | "status" | "text">[] = [],
): CitationResult {
  const facts = listingFacts(business);
  const kept: ValidatedFinding[] = [];
  const dropped: DroppedFinding[] = [];
  const seenKinds = new Set<string>();

  for (const f of diagnosis.findings) {
    const result = validateOne(f, facts, reviews, aliasMap, pages);
    if ("reason" in result) {
      dropped.push({ kind: f.kind, title: f.title, reason: result.reason });
      continue;
    }
    if (seenKinds.has(f.kind)) {
      dropped.push({ kind: f.kind, title: f.title, reason: "duplicate finding kind" });
      continue;
    }
    seenKinds.add(f.kind);
    kept.push(result);
  }
  return { kept, dropped };
}

function validateOne(
  f: LlmFinding,
  facts: ReturnType<typeof listingFacts>,
  reviews: Review[],
  aliasMap: Record<string, string>,
  pages: Pick<WebPage, "id" | "url" | "status" | "text">[],
): ValidatedFinding | { reason: string } {
  const evidence: Evidence[] = [];
  for (const e of f.evidence) {
    if (e.source === "review") {
      const cited = e.review_id ? aliasMap[e.review_id] ?? e.review_id : null;
      const src = e.quote ? findQuoteSource(e.quote, reviews, cited) : null;
      if (!src || !e.quote) {
        return { reason: `quote not found in any stored review: "${truncate(e.quote ?? "", 80)}"` };
      }
      evidence.push({ source: "review", review_id: src.id, quote: trimQuote(e.quote), rating: src.rating });
    } else if (e.source === "website") {
      const page = e.quote ? findPageSource(e.quote, pages) : null;
      if (!page || !e.quote) {
        return { reason: `quote not found on the business website: "${truncate(e.quote ?? "", 80)}"` };
      }
      evidence.push({ source: "website", page_id: page.id, url: page.url, quote: trimQuote(e.quote) });
    } else {
      const fact = e.listing_fact;
      if (!fact) return { reason: "listing evidence without a fact" };
      if (!facts[fact].holds) {
        return { reason: `listing fact "${fact}" does not hold for this listing (${facts[fact].value})` };
      }
      evidence.push({ source: "listing", fact, value: `${LISTING_FACT_LABELS[fact]} (${facts[fact].value})` });
    }
  }
  if (evidence.length === 0) return { reason: "no evidence" };

  const evidenceText = evidence.map((e) => (e.source === "listing" ? e.value : e.quote)).join(" ");
  const unsupported = unsupportedNumbers(`${f.title} ${f.detail}`, evidenceText);
  if (unsupported.length > 0) {
    return { reason: `numbers not supported by evidence: ${unsupported.join(", ")}` };
  }

  return {
    kind: f.kind,
    title: f.title.trim(),
    detail: f.detail.trim(),
    severity: f.severity,
    solution: KIND_TO_SOLUTION[f.kind],
    evidence,
  };
}

/** Numbers in text that do not appear in the evidence text. */
export function unsupportedNumbers(text: string, evidenceText: string): string[] {
  const nums = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const ev = normalizeText(evidenceText);
  return [...new Set(nums)].filter((n) => !ev.includes(n));
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 3) + "..." : s;
}
