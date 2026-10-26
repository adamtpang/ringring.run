import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export const inputClass =
  "h-11 w-full rounded-md bg-surface-2 px-3.5 text-callout text-foreground ring-1 ring-inset ring-hairline placeholder:text-subtle outline-none transition-shadow duration-fast focus:ring-2 focus:ring-accent";

/** Label above an input. Keeps labels short; hints go in `hint`. */
export function Field({ label, hint, className, ...input }: { label: ReactNode; hint?: ReactNode } & ComponentProps<"input">) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-footnote font-medium text-muted">{label}</span>
      <input className={inputClass} {...input} />
      {hint && <span className="mt-1 block text-caption text-subtle">{hint}</span>}
    </label>
  );
}
