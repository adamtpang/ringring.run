import { generateAgentConfig } from "../agent/generate";
import type { AgentConfig } from "../agent/schema";
import { parseOsmHours } from "../places/hours";
import type { Place } from "../places/types";
import { inline, isSuspicious } from "../untrusted";

// A lightweight agent config for a business that has not been scanned, built
// only from its OpenStreetMap tags. Every fact cites "osm" and the tag it came
// from. Not stored: it is rebuilt from the place on every chat request.

type Fact = Parameters<typeof generateAgentConfig>[0]["facts"][number];

export function osmFacts(place: Place): Fact[] {
  const ref = (tag: string) => `${place.id} ${tag}`;
  const out: Fact[] = [];
  const add = (kind: Fact["kind"], label: string, value: string | null | undefined, tag: string) => {
    if (!value || isSuspicious(value)) return;
    const v = inline(value, 300);
    if (v) out.push({ kind, label, value: v, source_type: "osm", source_ref: ref(tag), quote: null });
  };
  add("service", "Type", place.kind_label, "type");
  add("contact", "Phone", place.phone, "phone");
  add("contact", "Address", place.address, "addr:*");
  add("contact", "Website", place.website, "website");
  if (place.cuisine) add("service", "Cuisine", place.cuisine, "cuisine");
  for (const h of parseOsmHours(place.opening_hours)) add("hours", h.day, h.hours, "opening_hours");
  // Hours we could not parse are still a fact, quoted raw, so the agent never rewrites them.
  if (place.opening_hours && !parseOsmHours(place.opening_hours).length) add("hours", "Hours (as listed)", place.opening_hours, "opening_hours");
  for (const e of place.extras) add("policy", e.label, e.value, e.key);
  return out;
}

export function osmAgentConfig(place: Place, now?: Date): AgentConfig {
  return generateAgentConfig({
    business: {
      id: place.id,
      name: place.name,
      phone: place.phone,
      opening_hours: parseOsmHours(place.opening_hours),
    },
    facts: osmFacts(place),
    reviews: [],
    findings: [],
    now,
  });
}
