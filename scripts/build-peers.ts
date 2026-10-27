/**
 * pnpm tsx scripts/build-peers.ts [researchDir]
 *
 * Builds src/data/peers.json from the Austin review-pain study (the same source files that
 * build_market_intel.py reads). No network calls. Writes only derived counts: no names,
 * place ids, phone numbers, websites or review text. Reviews that allege discrimination or
 * bias (ALLEGATION_RE) are dropped from every count.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ALLEGATION_RE } from "../src/lib/allegations";

const dir = process.argv[2] ?? "/workspace/research/review-pain";
const SRC = [".", "benchmark_cafe_music"];
const IND: Record<string, string> = { restaurant: "restaurant", home_services: "hvac_plumbing", dentist: "dentist", salon: "salon", cafe: "cafe", music_shop: "music_shop" };
const REACH = new Set(["phone_unanswered", "slow_response_callback", "communication_followup"]);

interface Place { placeId: string; category: string; rating: number | null; reviewsCount: number | null }
interface Rev { review_id: string; place_id: string; stars: number; has_owner_response: boolean; text: string | null }
interface Cls { is_complaint: boolean; problems: { category: string }[] }

const read = <T>(f: string): T => JSON.parse(readFileSync(path.join(dir, f), "utf8"));
const places: Place[] = [];
const reviews: Rev[] = [];
const cls: Record<string, Cls> = {};
const sampleBySrc: Record<string, string> = {};
for (const d of SRC) {
  const ps = read<Place[]>(`${d}/places.json`);
  places.push(...ps);
  reviews.push(...read<Rev[]>(`${d}/reviews_all.json`));
  Object.assign(cls, read<Record<string, Cls>>(`${d}/classified_raw.json`));
  for (const p of ps) sampleBySrc[IND[p.category]!] = d === "." ? "Up to 10 newest and 10 lowest-rated Google reviews per business" : "Up to 10 lowest-rated Google reviews per business";
}

const seen = new Set<string>();
let excluded = 0;
const rows = places
  .filter((p) => (seen.has(p.placeId) ? false : (seen.add(p.placeId), true)))
  .map((p) => {
    const rs = reviews.filter((r) => r.place_id === p.placeId);
    const kept = rs.filter((r) => !(r.stars <= 2 && ALLEGATION_RE.test(r.text ?? "")));
    excluded += rs.length - kept.length;
    const text = kept.filter((r) => cls[r.review_id]);
    const comp = text.filter((r) => cls[r.review_id]!.is_complaint);
    const neg = kept.filter((r) => r.stars <= 2);
    return {
      industry: IND[p.category]!,
      place_hash: createHash("sha256").update(p.placeId).digest("hex").slice(0, 12),
      rating: p.rating ?? null,
      total_reviews: p.reviewsCount ?? null,
      sampled_reviews: kept.length,
      text_reviews: text.length,
      negative_reviews: neg.length,
      negative_replied: neg.filter((r) => r.has_owner_response).length,
      complaint_reviews: comp.length,
      reach_complaint_reviews: comp.filter((r) => cls[r.review_id]!.problems.some((x) => REACH.has(x.category))).length,
    };
  })
  .sort((a, b) => a.industry.localeCompare(b.industry) || a.place_hash.localeCompare(b.place_hash));

const counters: Record<string, number> = {};
const peers = rows.map((r) => ({ key: `${r.industry}-${String((counters[r.industry] = (counters[r.industry] ?? 0) + 1)).padStart(2, "0")}`, ...r }));

const META: Record<string, { label: string; plural: string; singular: string }> = {
  hvac_plumbing: { label: "HVAC and plumbing", plural: "Austin HVAC and plumbing businesses", singular: "HVAC/plumbing" },
  cafe: { label: "Cafes", plural: "Austin cafes", singular: "Cafe" },
  music_shop: { label: "Music shops", plural: "Austin music shops", singular: "Music shop" },
  restaurant: { label: "Restaurants", plural: "Austin restaurants", singular: "Restaurant" },
  dentist: { label: "Dentists", plural: "Austin dentists", singular: "Dentist" },
  salon: { label: "Hair and nail salons", plural: "Austin hair and nail salons", singular: "Salon" },
};
const industries = Object.fromEntries(Object.entries(META).map(([k, v]) => [k, { ...v, sample: sampleBySrc[k]! }]));

const out = {
  scan_date: "2026-10-26",
  city: "Austin",
  source: "Public Google Maps listings and reviews (Apify Google Places crawler), classified for complaint type. Austin review-pain study.",
  excluded_allegation_reviews: excluded,
  industries,
  peers,
};
writeFileSync("src/data/peers.json", JSON.stringify(out, null, 1) + "\n");
console.log(`${peers.length} peers,`, Object.entries(counters).map(([k, v]) => `${k} ${v}`).join(", "), `; excluded ${excluded} allegation reviews`);
