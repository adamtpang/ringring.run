// Subset of the compass~crawler-google-places dataset item that we use.
export interface ApifyReviewItem {
  reviewId?: string | null;
  stars?: number | null;
  rating?: number | null;
  text?: string | null;
  textTranslated?: string | null;
  publishedAtDate?: string | null;
  responseFromOwnerText?: string | null;
}

export interface ApifyPlaceItem {
  title?: string | null;
  placeId?: string | null;
  categoryName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  phoneUnformatted?: string | null;
  website?: string | null;
  totalScore?: number | null;
  reviewsCount?: number | null;
  url?: string | null;
  openingHours?: { day: string; hours: string }[] | null;
  permanentlyClosed?: boolean | null;
  reviews?: ApifyReviewItem[] | null;
  // Present only on demo fixture items.
  __fixture?: boolean;
  __fixtureBehavior?: "fail_diagnosis" | "hallucinate";
  [key: string]: unknown;
}
