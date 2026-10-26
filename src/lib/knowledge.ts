import type { NewKnowledgeFact } from "./store/types";
import type { Business, WebPage } from "./types";
import { isSuspicious, neutralize } from "./untrusted";

// Knowledge facts: the raw material for the per-business agent config
// (src/lib/agent). Every fact carries its source so the agent can cite it.
// Facts are extracted deterministically from the listing and from labeled
// lines on the homepage. Instruction-like text is never stored as a fact.

type Fact = Omit<NewKnowledgeFact, "business_id">;

export function listingKnowledge(b: Pick<Business, "phone" | "address" | "website" | "category" | "opening_hours">): Fact[] {
  const out: Fact[] = [];
  const add = (kind: Fact["kind"], label: string, value: string | null, ref: string) => {
    // Listing fields are scraped text: skip anything instruction-like, store the rest neutralized.
    if (!value || !value.trim() || isSuspicious(value)) return;
    out.push({ kind, label, value: neutralize(value).text.trim(), source_type: "listing", source_ref: ref, quote: null });
  };
  add("contact", "Phone", b.phone, "phone");
  add("contact", "Address", b.address, "address");
  add("contact", "Website", b.website, "website");
  add("service", "Category", b.category, "category");
  for (const h of b.opening_hours ?? []) add("hours", h.day, h.hours, `opening_hours.${h.day}`);
  return out;
}

const SERVICE_LINE = /^(our )?services?\s*:\s*(.+)$/i;
const HOURS_LINE = /^(business )?hours\s*:\s*(.+)$/i;
const PRICE_LINE = /\$\s?\d|free (estimates?|quotes?)|no trip charge|flat rate/i;
const BOOKING_LINE = /book online|to schedule|to book|call (now|us|our office)/i;

/** Facts from labeled homepage lines. The quote is the exact stored line, so it can be re-checked later. */
export function websiteKnowledge(page: Pick<WebPage, "id" | "status" | "text">): Fact[] {
  if (page.status !== "ok") return [];
  const out: Fact[] = [];
  const base = { source_type: "website" as const, source_ref: page.id };
  for (const raw of page.text.split("\n")) {
    const line = raw.trim();
    // Untrusted website text: an instruction-like line never becomes a fact.
    if (!line || line.length > 300 || isSuspicious(line)) continue;
    const s = line.match(SERVICE_LINE);
    if (s) {
      for (const item of (s[2] ?? "").replace(/\.$/, "").split(/,|;|\band\b/)) {
        const v = item.trim();
        if (v.length >= 3) out.push({ ...base, kind: "service", label: "Service", value: v, quote: line });
      }
      continue;
    }
    const h = line.match(HOURS_LINE);
    if (h) {
      out.push({ ...base, kind: "hours", label: "Hours (website)", value: (h[2] ?? "").replace(/\.$/, ""), quote: line });
      continue;
    }
    if (PRICE_LINE.test(line)) out.push({ ...base, kind: "price", label: "Pricing note", value: line, quote: line });
    else if (BOOKING_LINE.test(line)) out.push({ ...base, kind: "policy", label: "How to book", value: line, quote: line });
  }
  return out.slice(0, 40);
}
