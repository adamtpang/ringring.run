import aireServ from "@/data/snapshots/aire-serv.json";
import type { ReportPayload } from "./report";

/**
 * Demo-safe fallback. If the live store (Supabase), the scraper (Apify) or the
 * model (xAI) fails or hangs during a demo, the Aire Serv report still renders
 * from a committed copy of its real report, labeled as a saved snapshot.
 * Phone numbers are masked in the committed copy.
 */
export interface SnapshotMeta {
  saved_at: string;
  label: string;
  reason: string;
}

export interface SavedSnapshot {
  saved_at: string;
  business_id: string;
  place_id: string;
  name: string;
  /** Lowercased words a name search must contain to match. */
  match: string[];
  report: ReportPayload;
}

export const SNAPSHOTS: SavedSnapshot[] = [aireServ as unknown as SavedSnapshot];

export const SNAPSHOT_TIMEOUT_MS = 8000;

export function snapshotLabel(savedAt: string): string {
  const d = new Date(savedAt).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });
  return `saved snapshot from ${d}`;
}

export function findSnapshot(q: { id?: string | null; placeId?: string | null; name?: string | null }): SavedSnapshot | null {
  const name = (q.name ?? "").toLowerCase();
  return (
    SNAPSHOTS.find(
      (s) => (q.id && s.business_id === q.id) || (q.placeId && s.place_id === q.placeId) || (name && s.match.every((w) => name.includes(w))),
    ) ?? null
  );
}

export class TimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} did not answer within ${Math.round(ms / 1000)} s`);
  }
}

export async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<never>((_, rej) => (t = setTimeout(() => rej(new TimeoutError(what, ms)), ms)))]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export type ReportResult =
  | { kind: "live"; report: ReportPayload }
  | { kind: "snapshot"; report: ReportPayload & { snapshot: SnapshotMeta } }
  | { kind: "not_found" }
  | { kind: "error"; error: string };

function fromSnapshot(s: SavedSnapshot, reason: string): ReportResult {
  return { kind: "snapshot", report: { ...s.report, snapshot: { saved_at: s.saved_at, label: snapshotLabel(s.saved_at), reason } } };
}

/** Live report, or the saved snapshot when the live path fails, hangs, or is skipped on purpose. */
export async function reportOrSnapshot(
  id: string,
  load: () => Promise<ReportPayload | null>,
  o: { timeoutMs?: number; force?: boolean } = {},
): Promise<ReportResult> {
  const snap = findSnapshot({ id });
  if (o.force && snap) return fromSnapshot(snap, "Opened the saved snapshot on purpose.");
  try {
    const r = await withTimeout(load(), o.timeoutMs ?? SNAPSHOT_TIMEOUT_MS, "The database");
    if (r) return { kind: "live", report: r };
    return snap ? fromSnapshot(snap, "The live record was not found.") : { kind: "not_found" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return snap ? fromSnapshot(snap, `Live data unavailable (${msg}).`) : { kind: "error", error: msg };
  }
}

/** Where to send a demo when a scan cannot start or finish. Null when no snapshot matches. */
export function scanFallback(q: { name?: string | null; placeId?: string | null }, reason: string): { url: string; label: string; reason: string } | null {
  const s = findSnapshot(q);
  return s ? { url: `/businesses/${s.business_id}?snapshot=1`, label: snapshotLabel(s.saved_at), reason } : null;
}

/** A scan that hangs this long is treated as stuck for the demo fallback link. */
export const STUCK_RUN_MS = 120_000;

/**
 * Offer the saved snapshot on a run page when the run is about a saved business
 * and it failed (Apify or xAI errors end here), a business in it failed, or it is stuck.
 */
export function runFallback(
  run: { search_kind: string; category: string; status: string; error: string | null; created_at: string },
  businesses: { name: string; place_id: string; diagnosis_status: string; diagnosis_error: string | null }[],
  now = Date.now(),
): { url: string; label: string; reason: string } | null {
  const hit = businesses.find((b) => findSnapshot({ placeId: b.place_id, name: b.name }));
  const named = run.search_kind === "name" ? findSnapshot({ name: run.category }) : null;
  if (!hit && !named) return null;
  const q = hit ? { placeId: hit.place_id, name: hit.name } : { name: run.category };
  if (run.status === "failed") return scanFallback(q, `The live scan failed${run.error ? ` (${run.error})` : ""}.`);
  // A name run holds just the looked-up business, so any failed diagnosis in it is that business.
  const failed = hit?.diagnosis_status === "failed" ? hit : named ? businesses.find((b) => b.diagnosis_status === "failed") : undefined;
  if (failed) return scanFallback(q, `The live diagnosis failed${failed.diagnosis_error ? ` (${failed.diagnosis_error})` : ""}.`);
  if ((run.status === "running" || run.status === "queued") && now - new Date(run.created_at).getTime() > STUCK_RUN_MS)
    return scanFallback(q, "The live scan is taking longer than 2 minutes.");
  return null;
}
