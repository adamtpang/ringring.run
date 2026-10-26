import { CATEGORIES, categoryById } from "./categories";
import { distanceM } from "./geo";
import { DEFAULT_LIMIT, DEFAULT_RADIUS_M, parseOverpass } from "./overpass";
import type { Place, SearchParams, SearchResult } from "./types";
import data from "./snapshot-austin.json";

// A saved copy of real OpenStreetMap results for central Austin, one per category
// chip, bundled so /find still shows real places when every Overpass mirror is
// down. Always labeled "Saved map data" with the date it was taken.
// Built on 2026-10-26: restaurants from a live Overpass response; the other
// categories from Nominatim tag searches ([amenity=cafe] and so on) in a box
// around the center, because no Overpass mirror answered that day. Each
// category records its own source and time. Elements keep only the tags the
// parser reads.

export interface SnapshotCategory {
  /** When this category was fetched (UTC ISO). */
  taken_at: string;
  /** Where it came from, for example "overpass-api.de". */
  source: string;
  radius_m: number;
  elements: unknown[];
}

export interface Snapshot {
  center: { lat: number; lon: number; label: string };
  /** Searches whose point is within this distance of the center can use the snapshot. */
  coverage_m: number;
  categories: Record<string, SnapshotCategory>;
}

export const SNAPSHOT = data as Snapshot;

/** Whether a point is inside the snapshot's area. */
export function snapshotCovers(p: { lat: number; lon: number }, snap: Snapshot = SNAPSHOT): boolean {
  return distanceM(p, snap.center) <= snap.coverage_m;
}

function matchesText(place: Place, text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  return [place.name, place.cuisine ?? "", place.kind_label].some((v) => v.toLowerCase().includes(t));
}

/**
 * Search the snapshot like a live query: same parser, same radius, nearest first.
 * Returns null when the point is outside the snapshot or the category is missing.
 */
export function searchSnapshot(p: SearchParams, snap: Snapshot = SNAPSHOT): SearchResult | null {
  if (!snapshotCovers(p, snap)) return null;
  const cat = categoryById(p.category);
  const ids = cat ? [cat.id] : CATEGORIES.map((c) => c.id);
  const parts = ids.map((id) => snap.categories[id]).filter((c): c is SnapshotCategory => Boolean(c));
  if (parts.length === 0) return null;
  const radius = p.radius_m ?? DEFAULT_RADIUS_M;
  const limit = p.limit ?? DEFAULT_LIMIT;
  const all = parseOverpass({ elements: parts.flatMap((c) => c.elements) }, p, 10_000);
  const places = all.filter((pl) => pl.distance_m <= radius && matchesText(pl, p.text ?? "")).slice(0, limit);
  // The oldest part dates the whole result.
  const taken = parts.map((c) => c.taken_at).sort()[0] ?? new Date(0).toISOString();
  return { places, source: "osm", endpoint: "saved snapshot", cached: false, fetched_at: taken, snapshot: true };
}
