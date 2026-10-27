"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { SnapshotMeta } from "@/lib/snapshot";

const noSubscribe = () => () => {};

/** The report API URL, asking for the saved snapshot when the page URL has ?snapshot=1. Null until mounted. */
export function useReportUrl(id: string): string | null {
  // The query string never changes while the page is open, so there is nothing to subscribe to.
  const force = useSyncExternalStore<boolean | null>(
    noSubscribe,
    () => new URLSearchParams(window.location.search).get("snapshot") === "1",
    () => null,
  );
  return force === null ? null : `/api/businesses/${id}${force ? "?snapshot=1" : ""}`;
}

/** Keep links inside the snapshot when the page is showing one. */
export function snapQs(s: SnapshotMeta | null | undefined): string {
  return s ? "?snapshot=1" : "";
}

/** How many snapshot banners are on screen, so the header badge never says "Live data" over a saved copy. */
let shown = 0;
const listeners = new Set<() => void>();
function setShown(delta: number) {
  shown += delta;
  listeners.forEach((l) => l());
}
export function useShowingSnapshot(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => shown > 0,
    () => false,
  );
}

export function SnapshotBanner({ snapshot, compact = false }: { snapshot: SnapshotMeta | null | undefined; compact?: boolean }) {
  const on = !!snapshot;
  useEffect(() => {
    if (!on) return;
    setShown(1);
    return () => setShown(-1);
  }, [on]);
  if (!snapshot) return null;
  const label = snapshot.label.charAt(0).toUpperCase() + snapshot.label.slice(1);
  return (
    <div role="status" data-snapshot="1" className={`rounded-md bg-warning-soft text-warning ${compact ? "px-3 py-1.5 text-caption" : "px-4 py-3 text-footnote"}`}>
      <span className="font-semibold">{label}.</span> {compact ? "Not live data." : `${snapshot.reason} This is a saved copy of a real report; numbers are as of that date and editing is off.`}
    </div>
  );
}
