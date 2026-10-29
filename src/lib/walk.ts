import walkFile from "@/data/walk.json";
import ragFile from "@/data/owner-rag.json";

export type Fit = "green" | "amber" | "red";
export type Tier = "S" | "A" | "B" | "C";

export interface WalkProblem {
  label: string;
  detail: string;
}

export interface WalkPlace {
  placeId: string;
  slug: string;
  dSlug: string | null;
  name: string;
  category: string;
  address: string | null;
  lat: number;
  lng: number;
  pinNote: string | null;
  rating: number | null;
  reviewCount: number | null;
  tier: Tier;
  score: number | null;
  wedHours: string | null;
  openAfter630: boolean | null;
  closesAt: string | null;
  phone: string | null;
  website: string | null;
  walkMinEst: number | null;
  why: string;
  problems: WalkProblem[];
  mapsUrl: string | null;
}

export interface RagItem {
  label: string;
  value: string;
  status: "green" | "amber" | "red" | "neutral";
  section: string;
}

interface WalkFile {
  pulled: string;
  origin: { lat: number; lng: number; label: string };
  fallback: { lat: number; lng: number; label: string };
  fitRule: string;
  places: WalkPlace[];
}

const file = walkFile as WalkFile;
const rag = ragFile as { _rule: Record<string, string> } & Record<string, RagItem[] | Record<string, string>>;

export const WALK_PLACES: WalkPlace[] = file.places;
export const WALK_PULLED = file.pulled;
export const WALK_FALLBACK = file.fallback;
export const FIT_RULE = file.fitRule;

/** S green, A amber, B and C red. Same tiers as the Oct 28 rank. */
export function fitOf(tier: Tier): Fit {
  if (tier === "S") return "green";
  if (tier === "A") return "amber";
  return "red";
}

export function walkBySlug(slug: string): WalkPlace | undefined {
  return WALK_PLACES.find((p) => p.slug === slug);
}

export function walkByPlaceId(placeId: string): WalkPlace | undefined {
  return WALK_PLACES.find((p) => p.placeId === placeId);
}

export function reviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${placeId}`;
}

export function ragItems(kit: string): RagItem[] {
  const rows = rag[kit];
  return Array.isArray(rows) ? rows : [];
}

export function ragSections(kit: string): { doingWell: RagItem[]; improve: RagItem[]; header: RagItem | undefined; recency: RagItem | undefined } {
  const rows = ragItems(kit);
  return {
    doingWell: rows.filter((r) => r.section === "doing_well"),
    improve: rows.filter((r) => r.section === "improve"),
    header: rows.find((r) => r.section === "header"),
    recency: rows.find((r) => r.section === "recency"),
  };
}

/**
 * Phone-only nudge. Scraped score is unchanged.
 * +2 per Signed up in the same category, -1 per Said no, clamped to [-4, 6].
 */
export function categoryNudge(category: string, outcomes: { category: string; outcome: string }[]): number {
  let n = 0;
  for (const row of outcomes) {
    if (row.category !== category) continue;
    if (row.outcome === "signed_up") n += 2;
    else if (row.outcome === "said_no") n -= 1;
  }
  return Math.max(-4, Math.min(6, n));
}

export const NUDGE_RULE =
  "Learned score, on this phone only: scraped score plus 2 for each Signed up in the same category, minus 1 for each Said no, clamped from -4 to +6. The scraped score on the card does not change.";

export function learnedScore(score: number | null, nudge: number): number | null {
  if (score == null) return null;
  return Math.round((score + nudge) * 10) / 10;
}
