import { json } from "@/lib/api";
import { categoryById } from "@/lib/places/categories";
import { validLatLon } from "@/lib/places/geo";
import { DEFAULT_LIMIT, DEFAULT_RADIUS_M, searchPlaces } from "@/lib/places/overpass";
import { searchSnapshot } from "@/lib/places/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/places?lat=&lon=&category=restaurants|&q=tacos
// Nearby businesses from OpenStreetMap: public Overpass mirrors raced in parallel,
// cached 10 minutes per ~100 m cell. If no mirror answers, central Austin falls back
// to a bundled saved snapshot (snapshot: true). Elsewhere it returns 503 with
// code "unavailable" so the page can offer a Google Maps search instead.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lon = Number(u.searchParams.get("lon"));
  if (!validLatLon(lat, lon)) return json({ error: "lat and lon are required" }, 400);
  const category = u.searchParams.get("category");
  if (category && !categoryById(category)) return json({ error: "Unknown category" }, 400);
  const q = (u.searchParams.get("q") ?? "").slice(0, 60).trim() || null;
  const params = { lat, lon, category, text: q, radius_m: DEFAULT_RADIUS_M, limit: DEFAULT_LIMIT };
  try {
    const result = await searchPlaces(params);
    return json({ ...result, radius_m: DEFAULT_RADIUS_M });
  } catch (e) {
    console.error("places search failed:", e instanceof Error ? e.message : e);
    const saved = searchSnapshot(params);
    if (saved) return json({ ...saved, radius_m: DEFAULT_RADIUS_M });
    return json({ error: "Live map search isn't answering right now.", code: "unavailable" }, 503);
  }
}
