import type { ReactNode } from "react";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted ring-hairline",
  accent: "bg-accent-soft text-accent ring-accent/20",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-danger-soft text-danger ring-danger/20",
};

const DOT: Record<BadgeTone, string> = {
  neutral: "bg-subtle",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** Small status label. `live` adds a pinging dot for work in progress. */
export function Badge({
  tone = "neutral",
  dot = false,
  live = false,
  title,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  live?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 text-caption font-medium ring-1 ring-inset",
        TONE[tone],
        className,
      )}
    >
      {(dot || live) && (
        <span className="relative inline-flex h-1.5 w-1.5" aria-hidden="true">
          {live && <span className={cx("live-ping absolute inset-0 rounded-full", DOT[tone])} />}
          <span className={cx("relative h-1.5 w-1.5 rounded-full", DOT[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}
