import { ownerResponseRate } from "../listing";
import type { Business, Review } from "../types";
import type { ApifyPlaceItem } from "./apify-types";

export type NewBusiness = Omit<Business, "id" | "run_id" | "created_at">;
export type NewReview = Omit<Review, "id" | "business_id">;

export interface NormalizedPlace {
  business: NewBusiness;
  reviews: NewReview[];
}

export function normalizePlace(item: ApifyPlaceItem): NormalizedPlace | null {
  const name = (item.title ?? "").trim();
  const placeId = (item.placeId ?? "").trim();
  if (!name || !placeId) return null;

  const reviews: NewReview[] = (item.reviews ?? [])
    .map((r, i) => ({
      external_id: r.reviewId ?? null,
      rating: r.stars ?? r.rating ?? null,
      text: (r.text ?? r.textTranslated ?? "").trim(),
      published_at: r.publishedAtDate ?? null,
      owner_response: r.responseFromOwnerText?.trim() || null,
      position: i,
    }))
    .filter((r) => r.text.length > 0);

  const isFixture = item.__fixture === true;
  const raw: Record<string, unknown> = {
    categoryName: item.categoryName ?? null,
    state: item.state ?? null,
    permanentlyClosed: item.permanentlyClosed ?? null,
  };
  if (isFixture) {
    raw.fixture = true;
    if (item.__fixtureBehavior) raw.fixtureBehavior = item.__fixtureBehavior;
  }

  return {
    business: {
      place_id: placeId,
      name,
      category: item.categoryName ?? null,
      address: item.address ?? null,
      city: item.city ?? null,
      phone: item.phone ?? item.phoneUnformatted ?? null,
      website: item.website?.trim() || null,
      rating: typeof item.totalScore === "number" ? item.totalScore : null,
      review_count: typeof item.reviewsCount === "number" ? item.reviewsCount : null,
      opening_hours: Array.isArray(item.openingHours) ? item.openingHours : [],
      maps_url: item.url ?? null,
      owner_response_rate: ownerResponseRate(reviews),
      scraped_review_count: reviews.length,
      is_fixture: isFixture,
      diagnosis_status: "pending",
      diagnosis_summary: null,
      diagnosis_error: null,
      opportunity_score: 0,
      est_monthly_value: 0,
      raw,
    },
    reviews,
  };
}

/** Drop duplicates (the actor repeats a place when it has more than 5,000 reviews). */
export function dedupePlaces(items: ApifyPlaceItem[]): ApifyPlaceItem[] {
  const seen = new Set<string>();
  const out: ApifyPlaceItem[] = [];
  for (const it of items) {
    const key = it.placeId ?? `${it.title}|${it.address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}
