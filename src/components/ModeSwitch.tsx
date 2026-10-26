"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { MODE_STORAGE_KEY, MODES, modeFromPath, parseStoredMode, type Mode } from "@/lib/modes";
import { cx } from "./ds";

function remember(mode: Mode) {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Private mode or storage disabled: the URL still carries the mode.
  }
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readStoredMode(): Mode | null {
  try {
    return parseStoredMode(localStorage.getItem(MODE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Segmented control between /find and /owners. The URL is the source of truth; the last choice is remembered. */
export function ModeSwitch({ size = "sm", fallback, className }: { size?: "sm" | "md"; fallback?: Mode; className?: string }) {
  const path = usePathname();
  const fromPath = modeFromPath(path);
  // Stored choice, read on the client only (the server snapshot is null, so hydration matches).
  const stored = useSyncExternalStore(subscribeStorage, readStoredMode, () => null);

  useEffect(() => {
    if (fromPath) remember(fromPath);
  }, [fromPath]);

  // The thumb shows the current or last-used mode; aria-current only marks the page you are on.
  const active = fromPath ?? stored ?? fallback ?? null;
  const index = active === "owners" ? 1 : 0;

  return (
    <nav
      aria-label="Mode"
      className={cx(
        "relative inline-grid grid-cols-2 rounded-pill bg-surface-2 p-1 ring-1 ring-inset ring-hairline",
        size === "md" ? "text-callout" : "text-footnote",
        className,
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-pill bg-surface shadow-raised transition-transform duration-[var(--duration-spring)] ease-spring motion-reduce:transition-none"
          style={{ transform: index === 1 ? "translateX(100%)" : "translateX(0)" }}
        />
      )}
      {MODES.map((m) => (
        <Link
          key={m.id}
          href={m.href}
          onClick={() => remember(m.id)}
          aria-current={fromPath === m.id ? "page" : undefined}
          className={cx(
            "pressable relative z-10 whitespace-nowrap rounded-pill text-center",
            size === "md" ? "px-5 py-2" : "px-3 py-1.5",
            active === m.id ? "font-medium text-foreground" : "text-muted hover:text-foreground",
          )}
        >
          {size === "sm" ? (
            <>
              <span className="sm:hidden">{m.short}</span>
              <span className="hidden sm:inline">{m.label}</span>
            </>
          ) : (
            m.label
          )}
        </Link>
      ))}
    </nav>
  );
}
