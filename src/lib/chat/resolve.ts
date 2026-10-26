import type { AgentConfig } from "../agent/schema";
import type { Place } from "../places/types";
import type { Business } from "../types";
import { getStore } from "../store";
import { osmAgentConfig } from "./osm-agent";

// Which agent config answers for a place on /find: a scanned business's stored
// agent when one clearly matches (same name, same city when both are known,
// not demo data), else a lightweight config from OpenStreetMap tags.

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** Google often appends a branch to the name ("WU Chow - Downtown"); OSM usually does not ("Wu Chow"). */
const baseName = (s: string) => norm(s.split(/\s[-\u2013\u2014|]\s/)[0]);
const houseNumber = (a: string | null | undefined) => a?.trim().match(/^(\d+[a-z]?)\b/i)?.[1]?.toLowerCase() ?? null;

/**
 * Same name (and city when both are known), or the same name before a branch
 * suffix at the same street number, so one branch of a chain never answers for another.
 */
export function sameBusiness(b: Pick<Business, "name" | "city" | "address">, place: Pick<Place, "name" | "city" | "address">): boolean {
  if (b.city && place.city && norm(b.city) !== norm(place.city)) return false;
  if (norm(b.name) === norm(place.name)) return true;
  const n = houseNumber(place.address);
  return baseName(b.name) === baseName(place.name) && n !== null && n === houseNumber(b.address);
}

export async function resolveChatAgent(place: Place): Promise<{ config: AgentConfig; source: "scan" | "osm"; business_id: string | null }> {
  try {
    const store = getStore();
    const list = await store.listBusinesses({ limit: 200 });
    const match = list.find((b) => !b.is_fixture && sameBusiness(b, place));
    if (match) {
      const agent = await store.getAgentForBusiness(match.id);
      if (agent) return { config: agent.config, source: "scan", business_id: match.id };
    }
  } catch {
    // Store unavailable: the OSM config still works.
  }
  return { config: osmAgentConfig(place), source: "osm", business_id: null };
}
