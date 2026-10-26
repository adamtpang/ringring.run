import { inline } from "../untrusted";
import { TtlCache } from "./cache";
import { AUSTIN, roundCoord, validLatLon } from "./geo";
import { USER_AGENT } from "./overpass";

// Typed city or ZIP to coordinates via Nominatim (OpenStreetMap).
// Usage policy: identifying User-Agent, at most 1 request per second, cache
// results, no autocomplete. We geocode only on submit and cache for 24 hours.
// https://operations.osmfoundation.org/policies/nominatim/

export const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
export const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
  /** True when the lookup failed or found nothing and we fell back to Austin, TX. */
  fallback: boolean;
  source: "nominatim" | "default";
}

const cache = new TtlCache<GeocodeResult>(GEOCODE_TTL_MS, 1000);
let lastCall = 0;

async function throttle(now: () => number, sleep: (ms: number) => Promise<void>) {
  const wait = lastCall + 1100 - now();
  if (wait > 0) await sleep(wait);
  lastCall = now();
}

export interface GeocodeDeps {
  fetch?: typeof fetch;
  cache?: TtlCache<GeocodeResult>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
}

export function fallbackLocation(): GeocodeResult {
  return { lat: AUSTIN.lat, lon: AUSTIN.lon, label: AUSTIN.label, fallback: true, source: "default" };
}

interface NominatimHit {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
}

function labelFor(hit: NominatimHit): string {
  const a = hit.address ?? {};
  const place = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? a.county ?? hit.name ?? "";
  const state = a.state_code ?? a.state ?? "";
  const pc = a.postcode && /^\d/.test(hit.name ?? "") ? a.postcode : "";
  const s = [pc && place ? `${place} ${pc}` : place, state].filter(Boolean).join(", ");
  return inline(s || hit.display_name || "", 80) || "Selected location";
}

/** Forward geocode a city or ZIP. Never throws: falls back to Austin, TX with fallback=true. */
export async function geocode(query: string, deps: GeocodeDeps = {}): Promise<GeocodeResult> {
  const q = inline(query, 100).trim();
  if (!q) return fallbackLocation();
  const c = deps.cache ?? cache;
  const key = `f:${q.toLowerCase()}`;
  const hit = c.get(key);
  if (hit) return hit;
  try {
    await throttle(deps.now ?? Date.now, deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))));
    const url = new URL("/search", deps.baseUrl ?? NOMINATIM_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("countrycodes", "us");
    const res = await (deps.fetch ?? fetch)(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Language": "en" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return fallbackLocation();
    const body = (await res.json()) as NominatimHit[];
    const first = Array.isArray(body) ? body[0] : undefined;
    const lat = Number(first?.lat);
    const lon = Number(first?.lon);
    if (!first || !validLatLon(lat, lon)) return fallbackLocation();
    const out: GeocodeResult = { lat, lon, label: labelFor(first), fallback: false, source: "nominatim" };
    c.set(key, out);
    return out;
  } catch {
    return fallbackLocation();
  }
}

/** Reverse geocode for a city label. Coordinates are rounded to about 1 km first. */
export async function reverseGeocode(lat: number, lon: number, deps: GeocodeDeps = {}): Promise<GeocodeResult> {
  const rl = roundCoord(lat, 2);
  const ro = roundCoord(lon, 2);
  const base = { lat, lon, fallback: false, source: "nominatim" as const };
  const c = deps.cache ?? cache;
  const key = `r:${rl},${ro}`;
  const hit = c.get(key);
  if (hit) return { ...hit, lat, lon };
  try {
    await throttle(deps.now ?? Date.now, deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))));
    const url = new URL("/reverse", deps.baseUrl ?? NOMINATIM_URL);
    url.searchParams.set("lat", String(rl));
    url.searchParams.set("lon", String(ro));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "10");
    url.searchParams.set("addressdetails", "1");
    const res = await (deps.fetch ?? fetch)(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Language": "en" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ...base, label: "Your location" };
    const out: GeocodeResult = { ...base, label: labelFor((await res.json()) as NominatimHit) };
    c.set(key, out);
    return out;
  } catch {
    return { ...base, label: "Your location" };
  }
}

/** Test hook. */
export function resetGeocodeThrottle() {
  lastCall = 0;
}
