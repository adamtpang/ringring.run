// A nearby business from OpenStreetMap. Every field is untrusted public data.

export interface Place {
  /** Stable id: "osm-node-123", "osm-way-456". */
  id: string;
  osm_type: "node" | "way" | "relation";
  osm_id: number;
  name: string;
  /** Category id from CATEGORIES when it matched one, else null. */
  category: string | null;
  /** Human label from the OSM tags, for example "Restaurant" or "Car repair". */
  kind_label: string;
  lat: number;
  lon: number;
  address: string | null;
  city: string | null;
  /** Raw OSM opening_hours value. */
  opening_hours: string | null;
  phone: string | null;
  website: string | null;
  cuisine: string | null;
  /** Other simple yes/no amenities from OSM tags, for example "Takeaway: yes". */
  extras: { key: string; label: string; value: string }[];
  distance_m: number;
  source: "osm";
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface SearchParams extends LatLon {
  category?: string | null;
  text?: string | null;
  radius_m?: number;
  limit?: number;
}

export interface SearchResult {
  places: Place[];
  source: "osm";
  endpoint: string | null;
  cached: boolean;
  /** When the data was fetched from OpenStreetMap. For a snapshot, when the snapshot was taken. */
  fetched_at: string;
  /** True when served from the bundled saved snapshot because no mirror answered. */
  snapshot: boolean;
}
