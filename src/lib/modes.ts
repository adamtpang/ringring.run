// Two ways into the app: customers looking for a local business, and owners
// checking their own. Each mode has a URL; the last choice is remembered.

export type Mode = "customers" | "owners";

export const MODES: { id: Mode; label: string; short: string; href: string; blurb: string }[] = [
  { id: "customers", label: "For customers", short: "Customers", href: "/find", blurb: "Find a business near you and ask its AI a question." },
  { id: "owners", label: "For owners", short: "Owners", href: "/owners", blurb: "Find your business and see the calls you miss, with cited proof." },
];

export const MODE_STORAGE_KEY = "ringring.mode";

export function pathForMode(mode: Mode): string {
  return mode === "owners" ? "/owners" : "/find";
}

/** Which mode a path belongs to. Scan and report pages are the owner flow. Null for neutral pages. */
export function modeFromPath(path: string | null | undefined): Mode | null {
  const p = (path ?? "").split(/[?#]/)[0] ?? "";
  if (p === "/find" || p.startsWith("/find/")) return "customers";
  if (["/owners", "/dashboard", "/runs", "/businesses"].some((r) => p === r || p.startsWith(`${r}/`))) return "owners";
  return null;
}

export function parseStoredMode(v: string | null | undefined): Mode | null {
  return v === "customers" || v === "owners" ? v : null;
}
