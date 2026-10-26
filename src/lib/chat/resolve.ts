import type { AgentConfig } from "../agent/schema";
import type { Place } from "../places/types";
import { getStore } from "../store";
import { osmAgentConfig } from "./osm-agent";

// Which agent config answers for a place on /find: a scanned business's stored
// agent when one clearly matches (same name, same city when both are known,
// not demo data), else a lightweight config from OpenStreetMap tags.

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

export async function resolveChatAgent(place: Place): Promise<{ config: AgentConfig; source: "scan" | "osm"; business_id: string | null }> {
  try {
    const store = getStore();
    const list = await store.listBusinesses({ limit: 200 });
    const match = list.find(
      (b) => !b.is_fixture && norm(b.name) === norm(place.name) && (!b.city || !place.city || norm(b.city) === norm(place.city)),
    );
    if (match) {
      const agent = await store.getAgentForBusiness(match.id);
      if (agent) return { config: agent.config, source: "scan", business_id: match.id };
    }
  } catch {
    // Store unavailable: the OSM config still works.
  }
  return { config: osmAgentConfig(place), source: "osm", business_id: null };
}
