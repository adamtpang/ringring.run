import { json } from "@/lib/api";
import { categoryById } from "@/lib/places/categories";
import { validLatLon } from "@/lib/places/geo";
import { DEFAULT_LIMIT, DEFAULT_RADIUS_M, searchPlaces } from "@/lib/places/overpass";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/places?lat=&lon=&category=restaurants|&q=tacos
// Nearby businesses from OpenStreetMap (Overpass). Cached 10 minutes per ~100 m cell.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lon = Number(u.searchParams.get("lon"));
  if (!validLatLon(lat, lon)) return json({ error: "lat and lon are required" }, 400);
  const category = u.searchParams.get("category");
  if (category && !categoryById(category)) return json({ error: "Unknown category" }, 400);
  const q = (u.searchParams.get("q") ?? "").slice(0, 60).trim() || null;
  try {
    const result = await searchPlaces({ lat, lon, category, text: q, radius_m: DEFAULT_RADIUS_M, limit: DEFAULT_LIMIT });
    return json({ ...result, radius_m: DEFAULT_RADIUS_M });
  } catch (e) {
    console.error("places search failed:", e instanceof Error ? e.message : e);
    return json({ error: "OpenStreetMap search is not responding right now. Try again in a minute." }, 503);
  }
}
