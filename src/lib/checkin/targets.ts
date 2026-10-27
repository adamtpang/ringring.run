import type { Store } from "../store/types";
import type { Business } from "../types";
import { configured, forceDemo } from "../env";
import { apifyChecker, fixtureChecker, rulesClassifier, type Checker, type Classifier, type Target } from "./run";
import { llmClassifier } from "./classify";

/** Newest scanned row per place_id (a place can be scanned in several runs). */
async function latestBusiness(store: Store, placeId: string, hint?: string | null): Promise<Business | null> {
  if (hint) {
    const b = await store.getBusiness(hint);
    if (b && b.place_id === placeId) return b;
  }
  const all = await store.listBusinesses({ limit: 1000 });
  return all.filter((b) => b.place_id === placeId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

async function toTarget(store: Store, b: Business): Promise<Target> {
  const reviews = await store.listReviews(b.id);
  return { business: b, reviews };
}

/** Only owners who opted in (tracked = true) are scanned by the cron. */
export async function trackedTargets(store: Store): Promise<{ targets: Target[]; missing: string[] }> {
  const rows = await store.listTracked({ trackedOnly: true });
  const targets: Target[] = [];
  const missing: string[] = [];
  for (const r of rows) {
    const b = await latestBusiness(store, r.place_id, r.business_id);
    if (b) targets.push(await toTarget(store, b));
    else missing.push(r.place_id);
  }
  return { targets, missing };
}

export async function businessTarget(store: Store, businessId: string): Promise<Target | null> {
  const b = await store.getBusiness(businessId);
  return b ? toTarget(store, b) : null;
}

/** Fixture businesses never hit Apify, and neither does demo mode. */
export function pickChecker(targets: Target[], log?: (m: string) => void): Checker {
  const live = configured().apify && !forceDemo() && targets.every((t) => !t.business.is_fixture);
  if (live) return apifyChecker(process.env.APIFY_TOKEN!, { onProgress: log });
  return fixtureChecker(new Map(targets.map((t) => [t.business.place_id, { rating: t.business.rating, reviewCount: t.business.review_count }])));
}

export function pickClassifier(): Classifier {
  return configured().llm && !forceDemo() ? llmClassifier() : rulesClassifier;
}
