import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "plain" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent-solid text-accent-fg hover:bg-accent-hover",
  secondary: "bg-surface text-accent ring-1 ring-inset ring-hairline-strong hover:bg-surface-2",
  plain: "text-accent hover:bg-accent-soft",
  inverse: "bg-inverse text-inverse-fg hover:opacity-90",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-footnote",
  md: "h-10 px-5 text-callout",
  lg: "h-12 px-7 text-body",
};

/** Shared look. Feedback lands on pointer-down (see the `pressable` utility). */
export function buttonClass({ variant = "primary", size = "md", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cx(
    "pressable inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-pill font-medium",
    "disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

type Common = { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant, size, className, type = "button", ...rest }: Common & ComponentProps<"button">) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...rest} />;
}

export function ButtonLink({ variant, size, className, ...rest }: Common & ComponentProps<typeof Link>) {
  return <Link className={buttonClass({ variant, size, className })} {...rest} />;
}
