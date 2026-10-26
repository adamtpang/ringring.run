import { json } from "@/lib/api";
import { validLatLon } from "@/lib/places/geo";
import { geocode, reverseGeocode } from "@/lib/places/geocode";

export const dynamic = "force-dynamic";

// GET /api/geocode?q=78701         forward (city or ZIP), falls back to Austin, TX
// GET /api/geocode?lat=..&lon=..   reverse, for a city label
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = u.searchParams.get("q");
  if (q !== null) return json(await geocode(q));
  const lat = Number(u.searchParams.get("lat"));
  const lon = Number(u.searchParams.get("lon"));
  if (!validLatLon(lat, lon)) return json({ error: "Pass q, or lat and lon" }, 400);
  return json(await reverseGeocode(lat, lon));
}
