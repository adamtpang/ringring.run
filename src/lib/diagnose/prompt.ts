import { listingFacts } from "../listing";
import type { Business, Review } from "../types";

export const SYSTEM_PROMPT = `You are a forward deployed engineer auditing a small local business from its public Google Maps listing and reviews.
Find operational problems that cost the business customers and that AI or simple automation could fix.

Allowed finding kinds:
- missed_calls: calls not answered, voicemail, no callback
- slow_response: slow quotes, slow replies, slow follow up
- booking_friction: hard to schedule or book, no online booking
- unanswered_reviews: the owner does not reply to reviews, especially negative ones
- no_website: the listing has no website or customers cannot find the business online

Hard rules:
1. Every finding needs evidence. Review evidence: set source "review", review_id to the id shown (like "r3"), and quote copied VERBATIM from that review (a contiguous span, at least 12 characters, no edits, no ellipses). Listing evidence: set source "listing" and listing_fact to one of the facts listed as TRUE in the input.
2. Never invent facts. If there is no evidence for a kind, do not include it. Returning zero findings is fine.
3. Do not write any numbers in title, detail, or summary unless that exact number appears in your quoted evidence. Do not estimate money, volumes, or percentages. ROI is computed elsewhere.
4. At most one finding per kind. Severity 1 to 5 reflects how strongly the evidence shows lost customers.
5. Set unused evidence fields to null.`;

export function buildUserPrompt(business: Business, reviews: Review[]): { prompt: string; aliasMap: Record<string, string> } {
  const facts = listingFacts(business);
  const aliasMap: Record<string, string> = {};
  const reviewLines = reviews.map((r, i) => {
    const alias = `r${i + 1}`;
    aliasMap[alias] = r.id;
    const reply = r.owner_response ? "owner replied" : "no owner reply";
    return `[${alias}] (${r.rating ?? "?"} stars, ${reply}) ${r.text.replace(/\s+/g, " ")}`;
  });
  const factLines = Object.entries(facts).map(([k, v]) => `- ${k}: ${v.holds ? "TRUE" : "false"} (${v.value})`);
  const prompt = `Business: ${business.name}
Category: ${business.category ?? "unknown"}
Address: ${business.address ?? "unknown"}

Listing facts:
${factLines.join("\n")}

Reviews (${reviews.length}):
${reviewLines.join("\n") || "(no reviews scraped)"}

Return the diagnosis JSON.`;
  return { prompt, aliasMap };
}
