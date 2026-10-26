import type { ReactNode } from "react";
import { cx } from "./cx";

export type TimelineStatus = "running" | "ok" | "retry" | "warn" | "error" | "skipped";

const DOT: Record<TimelineStatus, string> = {
  running: "bg-accent",
  ok: "bg-success",
  retry: "bg-warning",
  warn: "bg-warning",
  error: "bg-danger",
  skipped: "bg-subtle",
};

const LABEL: Record<TimelineStatus, string> = {
  running: "Running",
  ok: "Done",
  retry: "Retrying",
  warn: "Warning",
  error: "Error",
  skipped: "Skipped",
};

export function Timeline({ children, className }: { children: ReactNode; className?: string }) {
  return <ol className={cx("relative", className)}>{children}</ol>;
}

/**
 * One row in a live agent timeline: a status node on a connecting rail, a step
 * label, the message, and timing. New rows enter on a critically damped spring.
 */
export function TimelineStep({
  status,
  label,
  meta,
  last = false,
  children,
}: {
  status: TimelineStatus;
  label: ReactNode;
  meta?: ReactNode;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="timeline-enter relative grid grid-cols-[1.25rem_1fr] gap-x-3 pb-4 last:pb-0">
      {!last && <span className="absolute left-[0.625rem] top-5 bottom-0 w-px -translate-x-1/2 bg-hairline-strong" aria-hidden="true" />}
      <span className="relative mt-1 flex h-3.5 w-3.5 items-center justify-center justify-self-center" role="img" aria-label={LABEL[status]}>
        {status === "running" && <span className="live-ping absolute inset-0 rounded-full bg-accent" />}
        <span className={cx("relative h-2.5 w-2.5 rounded-full ring-4 ring-surface", DOT[status])} />
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-caption font-medium uppercase tracking-wider text-subtle">{label}</span>
          {meta && <span className="shrink-0 font-mono text-caption tabular-nums text-subtle">{meta}</span>}
        </div>
        <div
          className={cx(
            "mt-0.5 text-footnote",
            status === "error" ? "text-danger" : status === "warn" || status === "retry" ? "text-warning" : "text-foreground",
          )}
        >
          {children}
        </div>
      </div>
    </li>
  );
}
