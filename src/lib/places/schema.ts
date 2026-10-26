import { z } from "zod";

// A Place sent back from the browser (for chat or scan). It came from our own
// /api/places, but the client can change it, so it is validated and treated as
// untrusted again on the server.

const str = (max: number) => z.string().max(max);

export const PlaceSchema = z.object({
  id: z.string().regex(/^osm-(node|way|relation)-\d{1,15}$/),
  osm_type: z.enum(["node", "way", "relation"]),
  osm_id: z.number().int().nonnegative(),
  name: str(120).min(1),
  category: str(40).nullable(),
  kind_label: str(60),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  address: str(200).nullable(),
  city: str(80).nullable(),
  opening_hours: str(200).nullable(),
  phone: str(40).nullable(),
  website: str(300).nullable(),
  cuisine: str(120).nullable(),
  extras: z.array(z.object({ key: str(30), label: str(40), value: str(20) })).max(10),
  distance_m: z.number().nonnegative(),
  source: z.literal("osm"),
});
