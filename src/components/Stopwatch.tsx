"use client";

import { useEffect, useState } from "react";
import { Badge, Card } from "./ds";

export const AGENT_TARGET_MS = 90_000;

/** 83456 -> "1:23.4" */
export function clock(ms: number) {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  return `${m}:${String(s).padStart(2, "0")}.${d}`;
}

/**
 * Business named -> agent ready. Ticks live from run creation until the first
 * agent config passes validation, then shows the stored value.
 */
export function Stopwatch({
  createdAt,
  readyMs,
  active,
  label = "Business named to agent ready",
  targetMs = AGENT_TARGET_MS,
  note,
}: {
  /** Optional caption under the bar, for example to explain a fixture run. */
  note?: string;
  createdAt: string;
  readyMs: number | null | undefined;
  /** True while the run is still working (the clock ticks). */
  active: boolean;
  label?: string;
  targetMs?: number;
}) {
  const start = Date.parse(createdAt);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const ticking = readyMs == null && active;
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNowMs(Date.now()), 100);
    return () => clearInterval(t);
  }, [ticking]);

  const value = readyMs ?? (ticking ? nowMs - start : null);
  const pct = value == null ? 0 : Math.min(100, (value / targetMs) * 100);
  const under = value != null && value <= targetMs;

  return (
    <Card padding="md" className="space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-eyebrow uppercase text-muted">{label}</span>
        {readyMs != null ? (
          <Badge tone={under ? "success" : "warning"} dot>
            {under ? "Under target" : "Over target"}
          </Badge>
        ) : ticking ? (
          <Badge tone="rungy" live>
            Timing
          </Badge>
        ) : (
          <Badge tone="neutral">No agent built</Badge>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-title-1 font-semibold tabular-nums">{value == null ? "–:––.–" : clock(value)}</span>
        <span className="font-mono text-footnote tabular-nums text-muted">target under {clock(targetMs).replace(/\.0$/, "")}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-pill bg-surface-2" role="presentation">
        <div
          className={`h-full rounded-pill ${value != null && !under ? "bg-warning" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {note && <p className="text-caption text-muted">{note}</p>}
    </Card>
  );
}
