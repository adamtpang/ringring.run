import type { ComponentProps } from "react";
import { cx } from "./cx";

type Tone = "default" | "sunken" | "danger";

const TONE: Record<Tone, string> = {
  default: "bg-surface shadow-card",
  sunken: "bg-surface-2 ring-1 ring-inset ring-hairline",
  danger: "bg-surface shadow-card ring-1 ring-danger/40",
};

const PAD = { none: "", sm: "p-4", md: "p-5 sm:p-6", lg: "p-6 sm:p-8" } as const;

/** A grouped surface. Use `as` for the right landmark (section, article, li). */
export function Card({
  as: Tag = "section",
  tone = "default",
  padding = "md",
  className,
  ...rest
}: { as?: "section" | "article" | "div" | "li"; tone?: Tone; padding?: keyof typeof PAD } & ComponentProps<"section">) {
  return <Tag className={cx("rounded-lg", TONE[tone], PAD[padding], className)} {...(rest as object)} />;
}
