import { elevenLabsProvider } from "./agent/providers";
import type { Store } from "./store/types";

/** Everything a business report page needs, in one payload. Throws on store errors. Null when not found. */
export async function loadReport(store: Store, id: string) {
  const business = await store.getBusiness(id);
  if (!business) return null;
  const [reviews, findings, roi, steps, run, pages, knowledge] = await Promise.all([
    store.listReviews(id),
    store.listFindings(id),
    store.listRoi(id),
    store.listSteps(business.run_id, id),
    store.getRun(business.run_id),
    store.listWebPages(id),
    store.listKnowledgeFacts(id),
  ]);
  // Agents table may be missing on an older Supabase schema: the report still renders without it.
  const agent = await store.getAgentForBusiness(id).catch(() => null);
  // Check-in tables may be missing on an older Supabase schema: the report renders without them.
  const pid = business.place_id;
  const checkin = await Promise.all([store.getTracked(pid), store.listSnapshots(pid, 12), store.listCheckins({ placeId: pid, limit: 30 }), store.listCheckinReviews(pid)])
    .then(([tracked, snapshots, checkins, reviews]) => ({ tracked: tracked?.tracked ?? false, snapshots, checkins, reviews }))
    .catch(() => null);
  // Page text can be long; the report shows a preview, the full text stays in the store.
  const pageSummaries = pages.map(({ text, ...p }) => ({ ...p, chars: text.length, preview: text.slice(0, 600) }));
  return {
    business, run, reviews, findings, roi, steps, pages: pageSummaries, knowledge,
    agent,
    checkin,
    // Names and booleans only; never key values.
    voice: elevenLabsProvider.status(),
  };
}

export type ReportPayload = NonNullable<Awaited<ReturnType<typeof loadReport>>>;
