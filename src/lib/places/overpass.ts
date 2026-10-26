import { withRetry } from "../retry";
import { inline, isSuspicious } from "../untrusted";
import { TtlCache } from "./cache";
import { CATEGORIES, categoryById, categoryForTags } from "./categories";
import { distanceM, roundCoord } from "./geo";
import type { LatLon, Place, SearchParams, SearchResult } from "./types";

// Nearby business search over the Overpass API (OpenStreetMap). No API key.
// Public instances are shared and rate limited, so: small radius, one query per
// search, a 10 minute cache, a short timeout, and a fallback across instances.

export const DEFAULT_RADIUS_M = 2000;
export const DEFAULT_LIMIT = 40;
export const CACHE_TTL_MS = 10 * 60 * 1000;
export const USER_AGENT = "ringring.run/0.1 (+https://ringring.run; AITX hackathon demo)";

/** Public Overpass instances, tried in order. OVERPASS_URL overrides the list. */
export function overpassEndpoints(): string[] {
  const env = process.env.OVERPASS_URL?.trim();
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];
}

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
    for (const [k, v] of cat.tags) lines.push(`  nwr["${k}"="${v}"]${nameFilter}${around};`);
  } else if (text) {
    for (const k of BUSINESS_KEYS) lines.push(`  nwr["${k}"]${nameFilter}${around};`);
  } else {
    // No category and no text: every chip category.
    for (const c of CATEGORIES) for (const [k, v] of c.tags) lines.push(`  nwr["${k}"="${v}"]["name"]${around};`);
  }
  const timeout = p.timeoutS ?? 25;
  // Overpass returns in id order, not distance, so fetch extra and sort by distance after parsing.
  const maxOut = p.maxOut ?? Math.max((p.limit ?? DEFAULT_LIMIT) * 3, 60);
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
      phone: clean(tags.phone ?? tags["contact:phone"], 40),
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
  /** Per-endpoint timeout. Public instances often take 10 to 20 s. */
  timeoutMs?: number;
  /** Total time across endpoints and the retry. */
  budgetMs?: number;
  retryDelayMs?: number;
}

/** Search nearby places. Tries each endpoint once per attempt; retries the round once. */
export async function searchPlaces(p: SearchParams, deps: OverpassDeps = {}): Promise<SearchResult> {
  const c = deps.cache ?? cache;
  const key = cacheKey(p);
  const hit = c.get(key);
  if (hit) return { ...hit, cached: true };

  const doFetch = deps.fetch ?? fetch;
  const endpoints = deps.endpoints ?? overpassEndpoints();
  const query = buildOverpassQuery(p);
  const timeoutMs = deps.timeoutMs ?? 20_000;
  const budgetMs = deps.budgetMs ?? 50_000;
  const started = Date.now();

  const result = await withRetry(
    async () => {
      const errors: string[] = [];
      for (const url of endpoints) {
        const left = budgetMs - (Date.now() - started);
        if (left < 2000) {
          errors.push("time budget used");
          break;
        }
        try {
          const res = await doFetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT, Accept: "application/json" },
            body: `data=${encodeURIComponent(query)}`,
            signal: AbortSignal.timeout(Math.min(timeoutMs, left)),
          });
          if (!res.ok) {
            errors.push(`${new URL(url).host} ${res.status}`);
            continue;
          }
          const json = await res.json();
          return { places: parseOverpass(json, p, p.limit ?? DEFAULT_LIMIT), endpoint: new URL(url).host };
        } catch (e) {
          errors.push(`${new URL(url).host} ${e instanceof Error ? e.name : "error"}`);
        }
      }
      throw new Error(`OpenStreetMap search unavailable (${errors.join(", ")})`);
    },
    { retries: 1, baseDelayMs: deps.retryDelayMs ?? 1500, jitter: false, shouldRetry: () => Date.now() - started < budgetMs - 5000 },
  );

  const out: SearchResult = { ...result, source: "osm", cached: false, fetched_at: new Date().toISOString() };
  c.set(key, out);
  return out;
}

