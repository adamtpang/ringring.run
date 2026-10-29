export const OUTCOMES = [
  { id: "not_visited", label: "Not visited" },
  { id: "pitched", label: "Pitched" },
  { id: "interested", label: "Interested" },
  { id: "said_no", label: "Said no" },
  { id: "signed_up", label: "Signed up" },
] as const;

export type OutcomeId = (typeof OUTCOMES)[number]["id"];

export const ANGLES = [
  { id: "replies", label: "Review replies", detail: "We draft, you post." },
  { id: "listing", label: "Listing gaps", detail: "Website, hours, or phone." },
  { id: "stand", label: "Review stand", detail: "A card on the counter." },
  { id: "calls", label: "Missed calls", detail: "Coming soon. Not live." },
] as const;

export type AngleId = (typeof ANGLES)[number]["id"];

export const XP = { visit: 5, pitched: 10, interested: 25, said_no: 8, signed_up: 40 } as const;

export interface PlaceLog {
  outcome: OutcomeId;
  note: string;
  angle: AngleId | null;
  at: string;
}

export interface FounderLog {
  visits: Record<string, string>;
  places: Record<string, PlaceLog>;
}

export const EMPTY_LOG: FounderLog = { visits: {}, places: {} };

const OUTCOME_IDS = new Set<string>(OUTCOMES.map((o) => o.id));
const ANGLE_IDS = new Set<string>(ANGLES.map((a) => a.id));

export function xpFor(log: FounderLog): number {
  let n = Object.keys(log.visits).length * XP.visit;
  for (const row of Object.values(log.places)) {
    if (row.outcome === "not_visited") continue;
    n += XP[row.outcome];
  }
  return n;
}

export function caughtCount(log: FounderLog): number {
  return Object.values(log.places).filter((r) => r.outcome !== "not_visited").length;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function prevDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** Days that have a real outcome (not "not visited"). */
export function outcomeDays(log: FounderLog): string[] {
  const days = new Set<string>();
  for (const row of Object.values(log.places)) {
    if (row.outcome !== "not_visited" && row.at) days.add(dayKey(row.at));
  }
  return [...days].sort();
}

export function streak(log: FounderLog, today: string): number {
  const days = new Set(outcomeDays(log));
  let cursor = today;
  if (!days.has(cursor)) cursor = prevDay(today);
  if (!days.has(cursor)) return 0;
  let n = 0;
  while (days.has(cursor)) {
    n += 1;
    cursor = prevDay(cursor);
  }
  return n;
}

export interface Badge {
  id: string;
  label: string;
  earned: boolean;
}

export function badges(log: FounderLog, today: string): Badge[] {
  const caught = caughtCount(log);
  const signed = Object.values(log.places).some((r) => r.outcome === "signed_up");
  return [
    { id: "first", label: "First pitch", earned: caught >= 1 },
    { id: "scout", label: "5 caught", earned: caught >= 5 },
    { id: "close", label: "Signed up", earned: signed },
    { id: "streak", label: "2-day streak", earned: streak(log, today) >= 2 },
  ];
}

export function parseLog(raw: unknown): FounderLog | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { visits?: unknown; places?: unknown };
  const visits: Record<string, string> = {};
  const places: Record<string, PlaceLog> = {};
  if (o.visits && typeof o.visits === "object") {
    for (const [k, v] of Object.entries(o.visits as Record<string, unknown>)) {
      if (typeof v === "string") visits[k] = v;
    }
  }
  if (o.places && typeof o.places === "object") {
    for (const [k, v] of Object.entries(o.places as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const row = v as { outcome?: unknown; note?: unknown; angle?: unknown; at?: unknown };
      if (typeof row.outcome !== "string" || !OUTCOME_IDS.has(row.outcome)) continue;
      places[k] = {
        outcome: row.outcome as OutcomeId,
        note: typeof row.note === "string" ? row.note.slice(0, 280) : "",
        angle: typeof row.angle === "string" && ANGLE_IDS.has(row.angle) ? (row.angle as AngleId) : null,
        at: typeof row.at === "string" ? row.at : new Date(0).toISOString(),
      };
    }
  }
  return { visits, places };
}

export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
