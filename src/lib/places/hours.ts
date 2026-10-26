import type { OpeningHours } from "../types";

// Minimal parser for OSM opening_hours. Handles the common simple forms:
//   "24/7", "Mo-Fr 07:00-18:00; Sa 08:00-14:00; Su off", "Mo,We 09:00-12:00,13:00-17:00",
//   "Tu-Su 11:00-02:00", "Mo-Su 11:00-22:00; PH off" (holiday rules are skipped).
// Anything it does not understand returns [] so we never show a wrong time.

const CODES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

function clock(hhmm: string): string | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  if (h === 24 && min === 0) return "midnight";
  if (h === 0 && min === 0) return "midnight";
  if (h === 12 && min === 0) return "noon";
  const ampm = h >= 12 && h < 24 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}${min ? `:${String(min).padStart(2, "0")}` : ""} ${ampm}`;
}

function spans(s: string): string | null {
  const parts = s.split(",").map((x) => x.trim());
  const out: string[] = [];
  for (const p of parts) {
    const m = p.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (!m) return null;
    const a = clock(m[1]!);
    const b = clock(m[2]!);
    if (!a || !b) return null;
    out.push(`${a} to ${b}`);
  }
  return out.join(" and ");
}

function days(sel: string): number[] | null {
  const out = new Set<number>();
  for (const part of sel.split(",").map((x) => x.trim())) {
    const range = part.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su)$/);
    if (range) {
      const a = CODES.indexOf(range[1] as (typeof CODES)[number]);
      const b = CODES.indexOf(range[2] as (typeof CODES)[number]);
      for (let i = a; ; i = (i + 1) % 7) {
        out.add(i);
        if (i === b) break;
      }
      continue;
    }
    const i = CODES.indexOf(part as (typeof CODES)[number]);
    if (i < 0) return null;
    out.add(i);
  }
  return [...out];
}

/** OSM opening_hours to one entry per day, Monday first. [] when not parseable. */
export function parseOsmHours(raw: string | null | undefined): OpeningHours[] {
  const s = (raw ?? "").trim();
  if (!s || s.length > 200) return [];
  if (/^24\/7$/.test(s)) return DAY_NAMES.map((day) => ({ day, hours: "Open 24 hours" }));
  const table = new Map<number, string>();
  // Rules are ";"-separated; many OSM entries also use ", " between rules ("Mo-Th 11:00-23:00, Fr 11:00-01:00").
  const rules = s.split(/;|(?<=\d),\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/).map((r) => r.trim()).filter(Boolean);
  for (const rule of rules) {
    if (/^PH\b/.test(rule) || /^SH\b/.test(rule)) continue; // public or school holidays: skip
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)\s+(.+)$/);
    let dayList: number[] | null;
    let body: string;
    if (m) {
      dayList = days(m[1]!.trim().replace(/,$/, ""));
      body = m[2]!.trim();
    } else if (/^\d{1,2}:\d{2}/.test(rule)) {
      dayList = [0, 1, 2, 3, 4, 5, 6];
      body = rule;
    } else return [];
    if (!dayList) return [];
    let text: string | null;
    if (/^(off|closed)$/i.test(body)) text = "Closed";
    else if (body === "00:00-24:00") text = "Open 24 hours";
    else text = spans(body);
    if (!text) return [];
    for (const d of dayList) table.set(d, text);
  }
  if (!table.size) return [];
  return DAY_NAMES.flatMap((day, i) => (table.has(i) ? [{ day, hours: table.get(i)! }] : []));
}
