import type { ReactNode } from "react";
import { cx } from "./cx";

/** One number with a label. Numbers are tabular so live updates do not jitter. */
export function Stat({
  label,
  value,
  hint,
  emphasis = false,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("min-w-0 rounded-md bg-surface p-4 shadow-card", className)}>
      <div className="truncate text-footnote text-muted">{label}</div>
      <div className={cx("mt-1 truncate font-semibold tabular-nums", emphasis ? "text-title-2 text-accent" : "text-title-3")}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-caption text-subtle">{hint}</div>}
    </div>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}>{children}</div>;
}
