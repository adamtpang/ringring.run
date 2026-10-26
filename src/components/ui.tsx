"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Wordmark } from "./Logo";
import type { Run, RunMode, RunStatus, RunStep } from "@/lib/types";

export function money(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function time12(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function dateTime12(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Fetch JSON, re-polling every intervalMs while shouldPoll(data) is true. */
export function usePoll<T>(url: string | null, shouldPoll: (d: T) => boolean, intervalMs = 1500) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef(shouldPoll);
  useEffect(() => {
    pollRef.current = shouldPoll;
  });

  const load = useCallback(async () => {
    if (!url) return null;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body);
      setError(null);
      return body as T;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [url]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const tick = async () => {
      const d = await load();
      if (alive && d && pollRef.current(d)) timer = setTimeout(tick, intervalMs);
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [load, intervalMs]);

  return { data, error, reload: load };
}

export function ModeBadge() {
  const { data } = usePoll<{ demo: boolean; mode: RunMode }>("/api/health", () => false);
  if (!data) return null;
  if (!data.demo) {
    return (
      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
        Live data
      </span>
    );
  }
  const parts = [
    data.mode.scraper === "fixture" && "fixture places",
    data.mode.diagnoser === "stub" && "keyword diagnoser",
    data.mode.store === "local" && "local store",
  ].filter(Boolean);
  return (
    <span
      title={`Demo mode: ${parts.join(", ")}. Add API keys in .env.local for live data.`}
      className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200"
    >
      Demo data
    </span>
  );
}

/** "plumbers in Austin TX" for category runs, "Joe's Plumbing, Austin TX" for name lookups. */
export function runTitle(r: Pick<Run, "category" | "city" | "search_kind">) {
  return r.search_kind === "name" ? `${r.category}, ${r.city}` : `${r.category} in ${r.city}`;
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Link href="/" aria-label="ringring.run home">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="text-muted hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/health" className="text-muted hover:text-foreground">
            Health
          </Link>
          <ModeBadge />
        </nav>
      </div>
    </header>
  );
}

const RUN_STATUS_STYLE: Record<RunStatus, string> = {
  queued: "bg-black/5 text-muted",
  running: "bg-blue-50 text-accent",
  completed: "bg-emerald-50 text-emerald-700",
  completed_with_errors: "bg-amber-50 text-amber-800",
  failed: "bg-red-50 text-red-700",
};

export function RunStatusPill({ status }: { status: RunStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RUN_STATUS_STYLE[status]}`}>
      {status === "running" && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent align-middle" />}
      {status.replaceAll("_", " ")}
    </span>
  );
}

const STEP_DOT: Record<RunStep["status"], string> = {
  running: "bg-accent animate-pulse",
  ok: "bg-emerald-500",
  retry: "bg-amber-400",
  warn: "bg-amber-500",
  error: "bg-red-500",
  skipped: "bg-black/20",
};

export function StepTimeline({ steps }: { steps: RunStep[] }) {
  if (steps.length === 0) return <p className="text-sm text-muted">No steps yet.</p>;
  return (
    <ol className="space-y-0">
      {steps.map((s) => (
        <li key={s.id} className="grid grid-cols-[auto_5.5rem_1fr_auto] items-baseline gap-3 border-b border-hairline py-2 text-sm last:border-0">
          <span className={`mt-1.5 h-2 w-2 rounded-full ${STEP_DOT[s.status]}`} aria-label={s.status} />
          <span className="font-mono text-xs uppercase tracking-wide text-muted">{s.step}</span>
          <span className={s.status === "error" ? "text-red-700" : s.status === "warn" ? "text-amber-800" : ""}>
            {s.message}
            {s.attempt > 1 && <span className="ml-2 text-xs text-muted">attempt {s.attempt}</span>}
          </span>
          <span className="whitespace-nowrap text-xs tabular-nums text-muted">
            {s.duration_ms != null && s.duration_ms > 0 ? `${(s.duration_ms / 1000).toFixed(1)}s · ` : ""}
            {time12(s.created_at)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-hairline ${className}`}>{children}</section>;
}
