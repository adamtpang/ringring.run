import type { Business, ListingFact } from "./types";

export interface ListingFactResult {
  holds: boolean;
  value: string; // human readable value taken from the listing itself
}

export const LISTING_FACT_LABELS: Record<ListingFact, string> = {
  no_website: "No website on the Google listing",
  no_phone: "No phone number on the Google listing",
  no_hours: "No opening hours on the Google listing",
  low_owner_response_rate: "Owner rarely replies to reviews",
  low_rating: "Rating below 4.0",
  few_reviews: "Fewer than 20 reviews",
};

type ListingInput = Pick<
  Business,
  "website" | "phone" | "opening_hours" | "owner_response_rate" | "rating" | "review_count" | "scraped_review_count"
>;

/** Deterministic facts derived only from listing data. The LLM may cite these, never invent them. */
export function listingFacts(b: ListingInput): Record<ListingFact, ListingFactResult> {
  const pct = b.owner_response_rate == null ? null : Math.round(b.owner_response_rate * 100);
  return {
    no_website: { holds: !b.website, value: b.website ? `website: ${b.website}` : "website: none listed" },
    no_phone: { holds: !b.phone, value: b.phone ? `phone: ${b.phone}` : "phone: none listed" },
    no_hours: {
      holds: !b.opening_hours || b.opening_hours.length === 0,
      value: b.opening_hours?.length ? `${b.opening_hours.length} days of hours listed` : "hours: none listed",
    },
    low_owner_response_rate: {
      holds: b.owner_response_rate != null && b.scraped_review_count >= 3 && b.owner_response_rate < 0.3,
      value:
        pct == null
          ? "owner response rate: unknown"
          : `owner replied to ${pct}% of the ${b.scraped_review_count} scraped reviews`,
    },
    low_rating: {
      holds: b.rating != null && b.rating < 4.0,
      value: b.rating == null ? "rating: none" : `rating: ${b.rating}`,
    },
    few_reviews: {
      holds: b.review_count != null && b.review_count < 20,
      value: b.review_count == null ? "review count: unknown" : `review count: ${b.review_count}`,
    },
  };
}

export function ownerResponseRate(reviews: { owner_response: string | null }[]): number | null {
  if (reviews.length === 0) return null;
  const answered = reviews.filter((r) => r.owner_response && r.owner_response.trim().length > 0).length;
  return answered / reviews.length;
}
