"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Wordmark } from "./Logo";
import { ModeSwitch } from "./ModeSwitch";
import { Badge, Timeline, TimelineStep, type BadgeTone } from "./ds";
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
      <Badge tone="success" dot>
        Live data
      </Badge>
    );
  }
  const parts = [
    data.mode.scraper === "fixture" && "fixture places",
    data.mode.diagnoser === "stub" && "keyword diagnoser",
    data.mode.store === "local" && "local store",
  ].filter(Boolean);
  return (
    <Badge tone="warning" dot title={`Demo mode: ${parts.join(", ")}. Add API keys in .env.local for live data.`}>
      Demo data
    </Badge>
  );
}

/** "plumbers in Austin TX" for category runs, "Joe's Plumbing, Austin TX" for name lookups. */
export function runTitle(r: Pick<Run, "category" | "city" | "search_kind">) {
  return r.search_kind === "name" ? `${r.category}, ${r.city}` : `${r.category} in ${r.city}`;
}

const NAV = [
  { href: "/dashboard", label: "Scans", hide: "hidden lg:inline-flex" },
  { href: "/evals", label: "Evals", hide: "hidden lg:inline-flex" },
  { href: "/health", label: "Health", hide: "hidden lg:inline-flex" },
];

export function AppHeader() {
  const path = usePathname();
  return (
    <header className="material-bar sticky top-0 z-20 shadow-[0_1px_0_var(--color-hairline-raw)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-[var(--space-gutter)]">
        <Link href="/" aria-label="ringring.run home" className="pressable shrink-0 rounded-sm">
          <Wordmark />
        </Link>
        <ModeSwitch className="min-w-0" />
        <nav className="flex items-center gap-1 text-footnote">
          {NAV.map((n) => {
            const active = path === n.href || (n.href === "/dashboard" && (path.startsWith("/runs") || path.startsWith("/businesses")));
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`pressable ${n.hide} rounded-pill px-3 py-1.5 ${active ? "bg-surface-2 font-medium text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {n.label}
              </Link>
            );
          })}
          <span className="ml-2 hidden sm:inline-flex">
            <ModeBadge />
          </span>
        </nav>
      </div>
    </header>
  );
}

/** Page container shared by app screens. */
export function PageShell({ children, width = "wide" }: { children: React.ReactNode; width?: "wide" | "narrow" }) {
  return (
    <>
      <AppHeader />
      <main className={`mx-auto w-full flex-1 space-y-8 px-[var(--space-gutter)] pb-20 pt-8 sm:pt-12 ${width === "wide" ? "max-w-6xl" : "max-w-3xl"}`}>
        {children}
      </main>
    </>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="pressable -ml-2 inline-flex items-center gap-1 rounded-pill px-2 py-1 text-footnote font-medium text-accent hover:bg-accent-soft">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  );
}

const RUN_STATUS: Record<RunStatus, { tone: BadgeTone; label: string }> = {
  queued: { tone: "neutral", label: "Queued" },
  running: { tone: "accent", label: "Running" },
  completed: { tone: "success", label: "Completed" },
  completed_with_errors: { tone: "warning", label: "Completed with errors" },
  failed: { tone: "danger", label: "Failed" },
};

export function RunStatusPill({ status }: { status: RunStatus }) {
  const s = RUN_STATUS[status];
  return (
    <Badge tone={s.tone} dot live={status === "running"}>
      {s.label}
    </Badge>
  );
}

export function StepTimeline({ steps }: { steps: RunStep[] }) {
  if (steps.length === 0) return <p className="text-footnote text-muted">No steps yet.</p>;
  return (
    <Timeline>
      {steps.map((s, i) => (
        <TimelineStep
          key={s.id}
          status={s.status}
          last={i === steps.length - 1}
          label={s.step}
          meta={
            <>
              {s.duration_ms != null && s.duration_ms > 0 ? `${(s.duration_ms / 1000).toFixed(1)}s · ` : ""}
              {time12(s.created_at)}
            </>
          }
        >
          {s.message}
          {s.attempt > 1 && <span className="ml-2 text-caption text-muted">attempt {s.attempt}</span>}
        </TimelineStep>
      ))}
    </Timeline>
  );
}
