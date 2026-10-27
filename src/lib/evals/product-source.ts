import { errorMessage } from "../retry";
import { loadReport, type ReportPayload } from "../report";
import { SNAPSHOTS, snapshotLabel, withTimeout } from "../snapshot";
import type { Store } from "../store/types";
import { runProductEvals, type ProductEvalReport } from "./product";

export const PRODUCT_EVAL_LIMIT = 25;

/** Real (non-fixture) diagnosed businesses from saved runs, newest first. */
export async function realReports(store: Store, limit = PRODUCT_EVAL_LIMIT): Promise<ReportPayload[]> {
  const businesses = (await store.listBusinesses({ limit: 200 }))
    .filter((b) => !b.is_fixture && b.diagnosis_status === "ok")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  // One report per place: the newest scan of each business.
  const seen = new Set<string>();
  const pick = businesses.filter((b) => (seen.has(b.place_id) ? false : (seen.add(b.place_id), true))).slice(0, limit);
  const reports = await Promise.all(pick.map((b) => loadReport(store, b.id)));
  return reports.filter((r): r is ReportPayload => !!r);
}

export function snapshotEvals(reason?: string): ProductEvalReport {
  const label = `Saved snapshots (${SNAPSHOTS.map((s) => `${s.name}, ${snapshotLabel(s.saved_at).replace(/^saved snapshot from /i, "")}`).join("; ")})${reason ? `. ${reason}` : ""}`;
  return runProductEvals(
    SNAPSHOTS.map((s) => s.report),
    { kind: "snapshot", label },
  );
}

/** Checks on real saved reports; falls back to the committed snapshots when the store is down or empty. */
export async function productEvals(load: () => Promise<Store>, timeoutMs = 8000): Promise<ProductEvalReport> {
  try {
    const store = await load();
    const reports = await withTimeout(realReports(store), timeoutMs, "load saved reports");
    if (!reports.length) return snapshotEvals("No real scans saved yet.");
    return runProductEvals(reports, { kind: "store", label: `${reports.length} real business report${reports.length === 1 ? "" : "s"} from saved scans (newest scan per business, fixtures excluded)` });
  } catch (e) {
    return snapshotEvals(`Live store unavailable (${errorMessage(e)}).`);
  }
}
