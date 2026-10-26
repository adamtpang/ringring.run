import type { ReactNode } from "react";
import { cx } from "./cx";

/** Eyebrow, title, one-line description, and an optional action on the right. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  level = 2,
  size = "md",
  align = "start",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  level?: 1 | 2 | 3;
  size?: "lg" | "md" | "sm";
  align?: "start" | "center";
  className?: string;
}) {
  const H = `h${level}` as "h1" | "h2" | "h3";
  const titleSize = size === "lg" ? "text-title-1" : size === "md" ? "text-title-2" : "text-headline";
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", align === "center" && "flex-col items-center text-center", className)}>
      <div className={cx("min-w-0", align === "center" && "mx-auto")}>
        {eyebrow && <p className="mb-2 text-eyebrow uppercase text-accent">{eyebrow}</p>}
        <H className={cx(titleSize, "text-balance")}>{title}</H>
        {description && (
          <p className={cx("mt-1.5 max-w-2xl text-pretty text-muted", size === "sm" ? "text-footnote" : "text-callout", align === "center" && "mx-auto")}>
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-3">{action}</div>}
    </div>
  );
}
