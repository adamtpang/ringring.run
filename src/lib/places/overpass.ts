import { inline, isSuspicious } from "../untrusted";
import { TtlCache } from "./cache";
import { CATEGORIES, categoryById, categoryForTags } from "./categories";
import { distanceM, roundCoord } from "./geo";
import { formatPhone } from "./phone";
import type { LatLon, Place, SearchParams, SearchResult } from "./types";

// Nearby business search over the Overpass API (OpenStreetMap). No API key.
// Public instances are shared and rate limited, so: small radius, one query per
// search, a 10 minute cache, a short timeout, and a fallback across instances.

export const DEFAULT_RADIUS_M = 2000;
export const DEFAULT_LIMIT = 40;
export const CACHE_TTL_MS = 10 * 60 * 1000;
export const USER_AGENT = "ringring.run/0.1 (+https://ringring.run; AITX hackathon demo)";

/**
 * Public keyless Overpass instances (OSM wiki, Oct 2026), tried one at a time in
 * this order. overpass-api.de is left out on purpose: its usage policy asks
 * hosted platforms not to call it. OVERPASS_URL overrides the list.
 */
export const PUBLIC_ENDPOINTS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export function overpassEndpoints(): string[] {
  const env = process.env.OVERPASS_URL?.trim();
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return PUBLIC_ENDPOINTS;
}

/** Per-mirror timeout. */
export const MIRROR_TIMEOUT_MS = 5000;

// Keys that mark a named feature as a business or service rather than a street or park.
const BUSINESS_KEYS = ["amenity", "shop", "craft", "office", "healthcare", "tourism"];

/** Escape free text for an Overpass regex inside double quotes. */
export function escapeOverpassRegex(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[\\"]/g, "")
    .replace(/[.*+?^${}()|[\]]/g, "\\\\$&")
    .trim()
    .slice(0, 60);
}

/** Overpass QL for businesses around a point, by category tags and/or a name match. */
export function buildOverpassQuery(p: SearchParams & { timeoutS?: number; maxOut?: number }): string {
  const radius = Math.min(Math.max(Math.round(p.radius_m ?? DEFAULT_RADIUS_M), 100), 5000);
  const around = `(around:${radius},${roundCoord(p.lat, 4)},${roundCoord(p.lon, 4)})`;
  const cat = categoryById(p.category);
  const text = p.text ? escapeOverpassRegex(p.text) : "";
  const nameFilter = text ? `["name"~"${text}",i]` : `["name"]`;
  const lines: string[] = [];
  if (cat) {
    for (const [k, v] of cat.tags) lines.push(`  nw["${k}"="${v}"]${nameFilter}${around};`);
  } else if (text) {
    for (const k of BUSINESS_KEYS) lines.push(`  nw["${k}"]${nameFilter}${around};`);
  } else {
    // No category and no text: every chip category.
    for (const c of CATEGORIES) for (const [k, v] of c.tags) lines.push(`  nw["${k}"="${v}"]["name"]${around};`);
  }
  // Short server timeout to match the client timeout; nodes and ways only (relations are rare for shops).
  const timeout = p.timeoutS ?? 5;
  // Overpass returns in id order, not distance, so fetch some extra and sort by distance after parsing.
  const maxOut = p.maxOut ?? (p.limit ?? DEFAULT_LIMIT) * 2;
  return `[out:json][timeout:${timeout}];\n(\n${lines.join("\n")}\n);\nout center tags ${maxOut};`;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const LABELS: Record<string, string> = {
  restaurant: "Restaurant",
  fast_food: "Fast food",
  cafe: "Cafe",
  plumber: "Plumber",
  plumbing: "Plumbing",
  hairdresser: "Hair salon",
  beauty: "Beauty salon",
  car_repair: "Car repair",
  tyres: "Tires",
  dentist: "Dentist",
};

function kindLabel(tags: Record<string, string>): string {
  for (const k of ["amenity", "shop", "craft", "healthcare", "trade", "office", "tourism"]) {
    const v = tags[k];
    if (!v) continue;
    if (LABELS[v]) return LABELS[v];
    const s = v.replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return "Business";
}

function address(tags: Record<string, string>): string | null {
  if (tags["addr:full"]) return tags["addr:full"];
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const unit = tags["addr:unit"] ? ` #${tags["addr:unit"]}` : "";
  const city = [tags["addr:city"], [tags["addr:state"], tags["addr:postcode"]].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const s = [street ? street + unit : "", city].filter(Boolean).join(", ");
  return s || null;
}

const EXTRAS: { key: string; label: string }[] = [
  { key: "takeaway", label: "Takeout" },
  { key: "delivery", label: "Delivery" },
  { key: "outdoor_seating", label: "Outdoor seating" },
  { key: "wheelchair", label: "Wheelchair access" },
  { key: "reservation", label: "Reservations" },
];

/** Clean one untrusted OSM value: neutralized, single line, capped. Instruction-like values are dropped. */
function clean(v: string | undefined, max = 200): string | null {
  if (!v || isSuspicious(v)) return null;
  const s = inline(v, max);
  return s || null;
}

function safeUrl(v: string | undefined): string | null {
  const s = clean(v, 300);
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Parse an Overpass JSON response into named places, nearest first. */
export function parseOverpass(json: unknown, origin: LatLon, limit = DEFAULT_LIMIT): Place[] {
  const elements = (json as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const raw of elements as OverpassElement[]) {
    if (!raw || typeof raw !== "object" || !["node", "way", "relation"].includes(raw.type) || typeof raw.id !== "number") continue;
    const tags = raw.tags ?? {};
    const lat = raw.lat ?? raw.center?.lat;
    const lon = raw.lon ?? raw.center?.lon;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const name = clean(tags.name, 120);
    if (!name) continue;
    const id = `osm-${raw.type}-${raw.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const extras = EXTRAS.flatMap((e) => {
      const v = clean(tags[e.key], 20);
      return v && /^(yes|no|only|limited|required|recommended)$/i.test(v) ? [{ key: e.key, label: e.label, value: v.toLowerCase() }] : [];
    });
    const cuisine = clean(tags.cuisine, 80);
    out.push({
      id,
      osm_type: raw.type,
      osm_id: raw.id,
      name,
      category: categoryForTags(tags)?.id ?? null,
      kind_label: kindLabel(tags),
      lat,
      lon,
      address: clean(address(tags) ?? undefined, 200),
      city: clean(tags["addr:city"], 80),
      opening_hours: clean(tags.opening_hours, 200),
      phone: formatPhone(clean(tags.phone ?? tags["contact:phone"], 80)),
      website: safeUrl(tags.website ?? tags["contact:website"]),
      cuisine: cuisine ? cuisine.replace(/_/g, " ").replace(/;/g, ", ") : null,
      extras,
      distance_m: distanceM(origin, { lat, lon }),
      source: "osm",
    });
  }
  return out.sort((a, b) => a.distance_m - b.distance_m || a.name.localeCompare(b.name)).slice(0, limit);
}

export function cacheKey(p: SearchParams): string {
  return [roundCoord(p.lat), roundCoord(p.lon), p.category ?? "", (p.text ?? "").trim().toLowerCase(), p.radius_m ?? DEFAULT_RADIUS_M, p.limit ?? DEFAULT_LIMIT].join("|");
}

const cache = new TtlCache<SearchResult>(CACHE_TTL_MS, 300);

export interface OverpassDeps {
  fetch?: typeof fetch;
  endpoints?: string[];
  cache?: TtlCache<SearchResult>;
  /** Per-mirror timeout. */
  timeoutMs?: number;
  now?: () => number;
}

export class OverpassUnavailableError extends Error {
  constructor(public readonly reasons: string[]) {
    super(`OpenStreetMap search unavailable (${reasons.join(", ") || "no endpoints"})`);
    this.name = "OverpassUnavailableError";
  }
}

// A mirror that answers 429, 406 or 504 rests for 30 s before it is tried again.
const COOLDOWN_MS = 30_000;
const cooldown = new Map<string, number>();
// After every mirror fails, skip live search for a short while so the next
// searches fall back at once instead of waiting out the timeout again.
const ALL_DOWN_MS = 30_000;
let allDownUntil = 0;
export function resetOverpassCooldown() {
  cooldown.clear();
  allDownUntil = 0;
}

/** A usable Overpass body: an elements array, and no runtime error remark with nothing returned. */
function validBody(json: unknown): json is { elements: unknown[]; remark?: string } {
  const j = json as { elements?: unknown; remark?: unknown };
  if (!j || !Array.isArray(j.elements)) return false;
  if (j.elements.length === 0 && typeof j.remark === "string" && /error|timed out|out of memory/i.test(j.remark)) return false;
  return true;
}

/**
 * Search nearby places. Tries each mirror in turn (never in parallel), each with
 * a short timeout, and returns the first valid response. Throws
 * OverpassUnavailableError when all fail, so the caller can serve saved data.
 */
export async function searchPlaces(p: SearchParams, deps: OverpassDeps = {}): Promise<SearchResult> {
  const c = deps.cache ?? cache;
  const key = cacheKey(p);
  const hit = c.get(key);
  if (hit) return { ...hit, cached: true };

  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? MIRROR_TIMEOUT_MS;
  if (allDownUntil > now()) throw new OverpassUnavailableError(["all mirrors failed in the last 30 s"]);
  const query = buildOverpassQuery(p);
  const reasons: string[] = [];

  for (const url of deps.endpoints ?? overpassEndpoints()) {
    const until = cooldown.get(url);
    if (until && until > now()) {
      reasons.push(`${host(url)} cooling down`);
      continue;
    }
    const json = await tryMirror(url, query, doFetch, timeoutMs, now, reasons);
    if (json === undefined) continue;
    const out: SearchResult = {
      places: parseOverpass(json, p, p.limit ?? DEFAULT_LIMIT),
      endpoint: host(url),
      source: "osm",
      cached: false,
      fetched_at: new Date(now()).toISOString(),
      snapshot: false,
    };
    c.set(key, out);
    return out;
  }
  allDownUntil = now() + ALL_DOWN_MS;
  throw new OverpassUnavailableError(reasons);
}

/** One mirror, one request. Returns the body, or undefined after noting why it failed. */
async function tryMirror(
  url: string,
  query: string,
  doFetch: typeof fetch,
  timeoutMs: number,
  now: () => number,
  reasons: string[],
): Promise<unknown> {
  // Plain timers rather than AbortSignal.timeout/any, which can fail to fire on Node 20.
  // The deadline also covers a fetch that ignores its abort signal.
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort(new DOMException("timed out", "TimeoutError"));
      reject(new DOMException("timed out", "TimeoutError"));
    }, timeoutMs);
  });
  const request = (async () => {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT, Accept: "application/json" },
      body: `data=${encodeURIComponent(query)}`,
      signal: ctrl.signal,
    });
    if (res.status === 429 || res.status === 406 || res.status === 504) cooldown.set(url, now() + COOLDOWN_MS);
    if (!res.ok) throw new Error(`${host(url)} ${res.status}`);
    const json: unknown = await res.json();
    if (!validBody(json)) throw new Error(`${host(url)} invalid body`);
    return json;
  })();
  request.catch(() => {}); // settled after the deadline wins
  try {
    return await Promise.race([request, deadline]);
  } catch (e) {
    reasons.push(e instanceof Error && e.message.startsWith(host(url)) ? e.message : `${host(url)} ${e instanceof Error ? e.name : "error"}`);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
