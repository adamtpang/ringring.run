import type { LatLon } from "./types";

export const AUSTIN: LatLon & { label: string } = { lat: 30.2672, lon: -97.7431, label: "Austin, TX" };

/** Great-circle distance in meters. */
export function distanceM(a: LatLon, b: LatLon): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Round to about 100 m: better cache hits, and we never send a precise location upstream. */
export function roundCoord(n: number, places = 3): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function validLatLon(lat: unknown, lon: unknown): lat is number {
  return typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function formatDistance(m: number): string {
  const miles = m / 1609.344;
  return miles < 0.1 ? `${Math.round(m * 3.281)} ft` : `${miles.toFixed(1)} mi`;
}
