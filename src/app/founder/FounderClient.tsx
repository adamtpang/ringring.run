"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Badge, Button } from "@/components/ds";
import { Wordmark } from "@/components/Logo";
import { distanceM } from "@/lib/places/geo";
import {
  ANGLES,
  EMPTY_LOG,
  OUTCOMES,
  badges,
  caughtCount,
  parseLog,
  streak,
  todayKey,
  xpFor,
  type AngleId,
  type FounderLog,
  type OutcomeId,
} from "@/lib/founder-log";
import {
  FIT_RULE,
  NUDGE_RULE,
  WALK_FALLBACK,
  WALK_PLACES,
  categoryNudge,
  fitOf,
  learnedScore,
  type WalkPlace,
} from "@/lib/walk";

const WalkMap = dynamic(() => import("./WalkMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-surface-2" />,
});

const STORE = "rr-founder-v1";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function readRaw(): string {
  return localStorage.getItem(STORE) ?? "";
}

function writeLog(next: FounderLog) {
  localStorage.setItem(STORE, JSON.stringify(next));
  listeners.forEach((cb) => cb());
}
const FIT_DOT = { green: "bg-accent-solid", amber: "bg-yellow", red: "bg-coral" } as const;
const FIT_TEXT = { green: "text-accent", amber: "text-warning", red: "text-danger" } as const;

function logFrom(raw: string): FounderLog {
  if (!raw) return EMPTY_LOG;
  try {
    return parseLog(JSON.parse(raw)) ?? EMPTY_LOG;
  } catch {
    return EMPTY_LOG;
  }
}

function meters(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function wedLine(place: WalkPlace): string {
  if (place.openAfter630 === true) return "Wednesday listing: open after 6:30 PM";
  if (place.openAfter630 === false) return "Wednesday listing: closed by 6:30 PM";
  return place.wedHours ? `Wednesday hours: ${place.wedHours}` : "Wednesday hours were not in this pull";
}

export function FounderClient() {
  const [here, setHere] = useState({ lat: WALK_FALLBACK.lat, lng: WALK_FALLBACK.lng, label: "800 Brazos St" });
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const log = useMemo(() => logFrom(raw), [raw]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "You" }),
      () => undefined,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

  const ranked = useMemo(() => {
    return WALK_PLACES.map((place) => ({
      place,
      meters: distanceM({ lat: here.lat, lon: here.lng }, { lat: place.lat, lon: place.lng }),
    })).sort((a, b) => a.meters - b.meters);
  }, [here.lat, here.lng]);

  const visible = showAll ? ranked : ranked.slice(0, 20);
  const current = ranked.find((r) => r.place.placeId === selected) ?? null;
  const today = todayKey();
  const xp = xpFor(log);
  const caught = caughtCount(log);
  const dayStreak = streak(log, today);
  const badgeList = badges(log, today);

  function visit(id: string) {
    setSelected(id);
    if (log.visits[id]) return;
    writeLog({ ...log, visits: { ...log.visits, [id]: new Date().toISOString() } });
  }

  function setOutcome(id: string, outcome: OutcomeId) {
    const prior = log.places[id];
    writeLog({
      ...log,
      places: {
        ...log.places,
        [id]: { outcome, note: prior?.note ?? "", angle: prior?.angle ?? null, at: new Date().toISOString() },
      },
    });
  }

  function setNote(id: string, note: string) {
    const prior = log.places[id] ?? { outcome: "not_visited" as const, note: "", angle: null, at: new Date().toISOString() };
    writeLog({ ...log, places: { ...log.places, [id]: { ...prior, note: note.slice(0, 280) } } });
  }

  function setAngle(id: string, angle: AngleId) {
    const prior = log.places[id] ?? { outcome: "not_visited" as const, note: "", angle: null, at: new Date().toISOString() };
    writeLog({ ...log, places: { ...log.places, [id]: { ...prior, angle, at: new Date().toISOString() } } });
  }

  function exportLog() {
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "founder-walk.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importLog(file: File) {
    file.text().then((text) => {
      const parsed = parseLog(JSON.parse(text));
      if (parsed) writeLog(parsed);
    }).catch(() => undefined);
  }

  const outcomeRows = WALK_PLACES.flatMap((place) => {
    const row = log.places[place.placeId];
    return row ? [{ category: place.category, outcome: row.outcome, angle: row.angle }] : [];
  });

  const byCategory = new Map<string, Record<string, number>>();
  const byAngle = new Map<string, Record<string, number>>();
  for (const row of outcomeRows) {
    if (row.outcome === "not_visited") continue;
    const cat = byCategory.get(row.category) ?? {};
    cat[row.outcome] = (cat[row.outcome] ?? 0) + 1;
    byCategory.set(row.category, cat);
    if (row.angle) {
      const ang = byAngle.get(row.angle) ?? {};
      ang[row.outcome] = (ang[row.outcome] ?? 0) + 1;
      byAngle.set(row.angle, ang);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col">
      <header className="flex items-center justify-between gap-3 px-[var(--space-gutter)] py-3">
        <Wordmark />
        <Badge tone="warning">Private</Badge>
      </header>
      <div className="grid grid-cols-3 gap-2 px-[var(--space-gutter)] text-center">
        <Stat n={String(xp)} label="XP" />
        <Stat n={String(dayStreak)} label="day streak" />
        <Stat n={String(caught)} label="caught" />
      </div>
      <p className="px-[var(--space-gutter)] pt-2 text-caption text-subtle">
        Centered on {here.label}. Straight-line distance. Nothing here contacts a business.
      </p>
      <div className="mt-2 h-[42vh] min-h-56">
        <WalkMap
          center={here}
          selectedId={selected}
          onSelect={visit}
          pins={WALK_PLACES.map((p) => ({ id: p.placeId, name: p.name, lat: p.lat, lng: p.lng, fit: fitOf(p.tier) }))}
        />
      </div>

      {current && (
        <Card
          place={current.place}
          meters={current.meters}
          log={log}
          nudge={categoryNudge(current.place.category, outcomeRows)}
          onOutcome={(id) => setOutcome(current.place.placeId, id)}
          onNote={(note) => setNote(current.place.placeId, note)}
          onAngle={(id) => setAngle(current.place.placeId, id)}
        />
      )}

      <ul className="mt-2 divide-y divide-hairline px-[var(--space-gutter)]">
        {visible.map(({ place, meters: m }) => {
          const fit = fitOf(place.tier);
          const row = log.places[place.placeId];
          return (
            <li key={place.placeId}>
              <button type="button" onClick={() => visit(place.placeId)} className="flex w-full items-center gap-3 py-3 text-left">
                <span className={`h-3 w-3 shrink-0 rounded-full ${FIT_DOT[fit]}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-footnote font-medium">{place.name}</span>
                  <span className="block text-caption text-subtle">
                    {place.category} · {place.rating != null ? `${place.rating.toFixed(1)}★` : "no rating"}
                    {row && row.outcome !== "not_visited" ? ` · ${OUTCOMES.find((o) => o.id === row.outcome)?.label}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-caption tabular-nums text-muted">{meters(m)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {!showAll && (
        <div className="px-[var(--space-gutter)] py-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowAll(true)}>
            Show all {ranked.length}
          </Button>
        </div>
      )}

      <section className="mt-4 space-y-3 px-[var(--space-gutter)] pb-8">
        <h2 className="text-eyebrow uppercase text-subtle">Badges</h2>
        <div className="flex flex-wrap gap-2">
          {badgeList.map((b) => (
            <Badge key={b.id} tone={b.earned ? "success" : "neutral"}>
              {b.earned ? b.label : `${b.label} locked`}
            </Badge>
          ))}
        </div>
        <h2 className="text-eyebrow uppercase text-subtle">What is working</h2>
        <p className="text-caption text-subtle">{NUDGE_RULE}</p>
        <p className="text-caption text-subtle">{FIT_RULE}</p>
        {byCategory.size === 0 ? (
          <p className="text-footnote text-muted">Log a pitch to see outcomes by category and by angle.</p>
        ) : (
          <>
            <CountTable title="By category" rows={[...byCategory.entries()].map(([k, v]) => [k, v])} />
            <CountTable title="By pitch angle" rows={[...byAngle.entries()].map(([k, v]) => [ANGLES.find((a) => a.id === k)?.label ?? k, v])} />
          </>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={exportLog}>
            Export JSON
          </Button>
          <label className="pressable inline-flex h-8 cursor-pointer items-center rounded-pill bg-surface px-3.5 text-footnote font-medium text-accent ring-1 ring-inset ring-hairline-strong">
            Import JSON
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importLog(file);
              }}
            />
          </label>
        </div>
        <p className="text-caption text-subtle">Saved on this phone. Scan a new place is off.</p>
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-md bg-surface px-2 py-2 shadow-card">
      <div className="text-headline font-semibold tabular-nums">{n}</div>
      <div className="text-caption text-subtle">{label}</div>
    </div>
  );
}

function CountTable({ title, rows }: { title: string; rows: [string, Record<string, number>][] }) {
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="text-footnote font-medium">{title}</h3>
      <ul className="mt-1 space-y-1 text-caption">
        {rows.map(([name, counts]) => (
          <li key={name} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{name}</span>
            <span className="shrink-0 tabular-nums text-muted">
              {Object.entries(counts)
                .map(([k, n]) => `${n} ${OUTCOMES.find((o) => o.id === k)?.label ?? k}`)
                .join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({
  place,
  meters: m,
  log,
  nudge,
  onOutcome,
  onNote,
  onAngle,
}: {
  place: WalkPlace;
  meters: number;
  log: FounderLog;
  nudge: number;
  onOutcome: (id: OutcomeId) => void;
  onNote: (note: string) => void;
  onAngle: (id: AngleId) => void;
}) {
  const fit = fitOf(place.tier);
  const row = log.places[place.placeId];
  const learned = learnedScore(place.score, nudge);
  const report = place.dSlug ? `/d/${place.dSlug}` : `/w/${place.placeId}`;
  return (
    <section className="mx-[var(--space-gutter)] mt-3 rounded-lg bg-surface p-4 shadow-card">
      <h2 className="text-headline">{place.name}</h2>
      <p className="mt-1 text-caption text-subtle">
        {place.category} · {meters(m)} · {place.rating != null ? `${place.rating.toFixed(1)}★` : "no rating"}
        {place.reviewCount != null ? ` · ${place.reviewCount} reviews` : ""}
      </p>
      <p className={`mt-2 text-footnote font-medium ${FIT_TEXT[fit]}`}>
        {place.score != null ? `Fit ${place.score}` : "Not scored"}
        {place.tier ? ` · tier ${place.tier}` : ""}
        {learned != null && nudge !== 0 ? ` · learned ${learned}` : ""}
      </p>
      <p className="mt-1 text-footnote">{wedLine(place)}{place.wedHours && place.openAfter630 != null ? `. ${place.wedHours}` : ""}</p>
      <p className="mt-1 text-footnote text-muted">{place.why}</p>
      {place.pinNote && <p className="mt-1 text-caption text-subtle">{place.pinNote}</p>}
      {place.problems.length > 0 && (
        <ul className="mt-2 space-y-1 text-footnote">
          {place.problems.map((p) => (
            <li key={p.label}>
              {p.label}
              {p.detail ? ` · ${p.detail}` : ""}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={report} className="pressable inline-flex h-10 items-center rounded-pill bg-accent-solid px-4 text-footnote font-medium text-accent-fg">
          Owner report
        </Link>
        <Link href={`/c/${place.slug}`} className="pressable inline-flex h-10 items-center rounded-pill bg-surface px-4 text-footnote font-medium text-accent ring-1 ring-inset ring-hairline-strong">
          Customer link
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Pitch outcome">
        {OUTCOMES.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={row?.outcome === o.id}
            onClick={() => onOutcome(o.id)}
            className={`rounded-pill px-2.5 py-1 text-caption ${row?.outcome === o.id ? "bg-inverse text-inverse-fg" : "bg-surface-2 text-muted"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Pitch angle">
        {ANGLES.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={row?.angle === a.id}
            title={a.detail}
            onClick={() => onAngle(a.id)}
            className={`rounded-pill px-2.5 py-1 text-caption ${row?.angle === a.id ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"}`}
          >
            {a.label}
          </button>
        ))}
      </div>
      <label className="mt-2 block text-caption text-subtle">
        Note
        <textarea
          value={row?.note ?? ""}
          maxLength={280}
          rows={2}
          onChange={(e) => onNote(e.target.value)}
          className="mt-1 w-full rounded-md bg-surface-2 px-2 py-1.5 text-footnote text-foreground"
        />
      </label>
    </section>
  );
}
