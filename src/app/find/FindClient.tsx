"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Badge, Button, cx, inputClass } from "@/components/ds";
import { AppHeader } from "@/components/ui";
import { useStartScan } from "@/components/useStartScan";
import { CATEGORIES } from "@/lib/places/categories";
import { AUSTIN, formatDistance, roundCoord } from "@/lib/places/geo";
import { DAY_NAMES, parseOsmHours } from "@/lib/places/hours";
import type { Place } from "@/lib/places/types";
import { BusinessChat } from "./BusinessChat";

const PlacesMap = dynamic(() => import("./PlacesMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface-2" />,
});

interface Loc {
  lat: number;
  lon: number;
  label: string;
  kind: "default" | "device" | "typed";
  note?: string;
}

interface Search {
  category: string | null;
  q: string | null;
}

interface Concierge {
  reply: string;
  mode: "llm" | "keywords";
}

const LOCATION_REASON = "Used only to search nearby. Rounded to about 100 m and sent to OpenStreetMap, not stored.";

function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

function todayHours(p: Place): string | null {
  const days = parseOsmHours(p.opening_hours);
  if (!days.length) return null;
  const today = DAY_NAMES[(new Date().getDay() + 6) % 7];
  return days.find((d) => d.day === today)?.hours ?? null;
}

export function FindClient() {
  const [loc, setLoc] = useState<Loc>({ ...AUSTIN, kind: "default" });
  const [search, setSearch] = useState<Search>({ category: "restaurants", q: null });
  const [places, setPlaces] = useState<Place[]>([]);
  const [radius, setRadius] = useState(2000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [askLocation, setAskLocation] = useState(true);
  const [editingLoc, setEditingLoc] = useState(false);
  const [locating, setLocating] = useState(false);
  const [place, setPlace] = useState("");
  const [ask, setAsk] = useState("");
  const [concierge, setConcierge] = useState<Concierge | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const isMobile = useIsMobile();
  const listRef = useRef<HTMLUListElement>(null);
  const scan = useStartScan();

  const selected = useMemo(() => places.find((p) => p.id === selectedId) ?? null, [places, selectedId]);

  // Search whenever the location or the query changes.
  useEffect(() => {
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ lat: String(loc.lat), lon: String(loc.lon) });
    if (search.category) qs.set("category", search.category);
    if (search.q) qs.set("q", search.q);
    // Loading state is set by the handlers that change the search, not here.
    fetch(`/api/places?${qs}`, { signal: ctrl.signal })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? "Search failed");
        setPlaces(b.places);
        setRadius(b.radius_m ?? 2000);
        setError(null);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setPlaces([]);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [loc.lat, loc.lon, search.category, search.q, retryKey]);

  const startSearch = useCallback((next: Search) => {
    setLoading(true);
    setSelectedId(null);
    setChatOpen(false);
    setSearch(next);
  }, []);

  const moveTo = useCallback((next: Loc) => {
    setLoading(true);
    setSelectedId(null);
    setChatOpen(false);
    setLoc(next);
    setEditingLoc(false);
  }, []);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLoc((l) => ({ ...l, note: "Location isn't available in this browser. Type a city or ZIP." }));
      setEditingLoc(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = roundCoord(pos.coords.latitude, 3);
        const lon = roundCoord(pos.coords.longitude, 3);
        setAskLocation(false);
        moveTo({ lat, lon, label: "Your location", kind: "device" });
        setLocating(false);
        try {
          const r = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
          const b = await r.json();
          if (r.ok && b.label) setLoc((l) => (l.lat === lat && l.lon === lon ? { ...l, label: b.label } : l));
        } catch {
          // Keep "Your location".
        }
      },
      () => {
        setLocating(false);
        setAskLocation(false);
        setEditingLoc(true);
        setLoc((l) => ({ ...l, note: "Location is off. Type a city or ZIP instead." }));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }, [moveTo]);

  // If location was already granted, use it without asking again.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((s) => {
        if (s.state === "granted") locate();
        if (s.state === "denied") setAskLocation(false);
      })
      .catch(() => {});
  }, [locate]);

  async function submitPlace(e: React.FormEvent) {
    e.preventDefault();
    const q = place.trim();
    if (!q) return;
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    const b = await r.json();
    setAskLocation(false);
    setPlace("");
    moveTo({
      lat: b.lat,
      lon: b.lon,
      label: b.label,
      kind: b.fallback ? "default" : "typed",
      note: b.fallback ? `Couldn't find "${q}". Showing ${b.label}.` : undefined,
    });
  }

  async function submitAsk(e: React.FormEvent) {
    e.preventDefault();
    const text = ask.trim();
    if (!text) return;
    try {
      const r = await fetch("/api/concierge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setConcierge({ reply: b.reply, mode: b.mode });
      if (b.category || b.query) startSearch({ category: b.category, q: b.category ? null : b.query });
    } catch {
      setConcierge({ reply: "That didn't work. Try a category below.", mode: "keywords" });
    }
  }

  function select(id: string, fromMap = false) {
    setSelectedId((cur) => (cur === id && !fromMap ? null : id));
    setChatOpen(false);
    if (fromMap) {
      setExpanded(false);
      requestAnimationFrame(() => listRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    }
  }

  function openChat() {
    setChatOpen(true);
    setExpanded(true);
  }

  const sheetH = expanded || chatOpen ? "h-[78dvh]" : "h-[44dvh]";
  const bottomInset = isMobile && typeof window !== "undefined" ? window.innerHeight * (expanded || chatOpen ? 0.78 : 0.44) : 0;

  return (
    <>
      <AppHeader />
      <main className="relative isolate grid h-[calc(100dvh-3.5rem)] min-h-0 md:grid-cols-[minmax(22rem,26rem)_1fr]">
        {/* Map: full screen on mobile, right column on desktop. */}
        <div className="absolute inset-0 md:relative md:order-2">
          <PlacesMap
            center={loc}
            radiusM={radius}
            places={places}
            selectedId={selectedId}
            hoveredId={hoveredId}
            showUser={loc.kind === "device"}
            onSelect={(id) => select(id, true)}
            bottomInset={bottomInset}
          />
        </div>

        {/* Panel: bottom sheet on mobile, left column on desktop. */}
        <section
          aria-label="Search and results"
          className={cx(
            "absolute inset-x-0 bottom-0 z-[1001] flex min-h-0 flex-col rounded-t-xl bg-surface shadow-float transition-[height] duration-[var(--duration-spring)] ease-spring motion-reduce:transition-none",
            sheetH,
            "md:static md:order-1 md:h-auto md:rounded-none md:shadow-[1px_0_0_var(--color-hairline-raw)]",
          )}
        >
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            aria-label={expanded ? "Collapse list" : "Expand list"}
            aria-expanded={expanded}
            className="mx-auto flex h-6 w-16 shrink-0 items-center justify-center md:hidden"
          >
            <span className="h-1 w-9 rounded-pill bg-hairline-strong" />
          </button>

          {chatOpen && selected ? (
            <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 md:pt-5">
              <BusinessChat key={selected.id} place={selected} onClose={() => setChatOpen(false)} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 space-y-3 px-4 pb-3 md:pt-5">
                <form onSubmit={submitAsk} role="search">
                  <label htmlFor="ask" className="sr-only">
                    What are you looking for?
                  </label>
                  <input
                    id="ask"
                    className={inputClass}
                    value={ask}
                    onChange={(e) => setAsk(e.target.value)}
                    placeholder="What are you looking for?"
                    maxLength={200}
                    autoComplete="off"
                    enterKeyHint="search"
                  />
                </form>
                {concierge && (
                  <p className="flex flex-wrap items-center gap-2 text-footnote text-muted" aria-live="polite">
                    <span>{concierge.reply}</span>
                    {concierge.mode === "keywords" && (
                      <Badge title="No LLM key is set, so requests are matched by keywords.">Keyword match</Badge>
                    )}
                  </p>
                )}

                <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5" role="group" aria-label="Categories">
                  {CATEGORIES.map((c) => {
                    const on = search.category === c.id && !search.q;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => startSearch({ category: c.id, q: null })}
                        className={cx(
                          "pressable shrink-0 rounded-pill px-3 py-1.5 text-footnote ring-1 ring-inset",
                          on ? "bg-foreground text-background ring-transparent" : "bg-surface-2 text-foreground ring-hairline hover:bg-sunken",
                        )}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>

                {/* Location */}
                {askLocation && loc.kind === "default" && !editingLoc ? (
                  <div className="rounded-lg bg-surface-2 p-3 ring-1 ring-inset ring-hairline">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-footnote font-medium">Search near you?</p>
                      <div className="flex shrink-0 gap-1">
                        <Button size="sm" variant="plain" onClick={() => setEditingLoc(true)}>
                          Type a city
                        </Button>
                        <Button size="sm" onClick={locate} disabled={locating}>
                          {locating ? "Locating…" : "Use my location"}
                        </Button>
                      </div>
                    </div>
                    <p className="mt-1 text-caption text-muted">{LOCATION_REASON}</p>
                  </div>
                ) : editingLoc ? (
                  <form onSubmit={submitPlace} className="flex gap-2">
                    <label htmlFor="where" className="sr-only">
                      City or ZIP
                    </label>
                    <input
                      id="where"
                      className={inputClass}
                      value={place}
                      onChange={(e) => setPlace(e.target.value)}
                      placeholder="City or ZIP"
                      maxLength={80}
                      autoFocus
                      autoComplete="postal-code"
                    />
                    <Button type="submit" className="h-11" disabled={!place.trim()}>
                      Go
                    </Button>
                    <Button variant="plain" className="h-11" onClick={locate} aria-label="Use my location" title={LOCATION_REASON}>
                      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                        <path d="M14 2 2 7l5 2 2 5 5-12Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                      </svg>
                    </Button>
                  </form>
                ) : null}

                <div className="flex items-center justify-between gap-2 text-footnote text-muted">
                  <p className="min-w-0 truncate" aria-live="polite">
                    {loading
                      ? "Searching OpenStreetMap…"
                      : error
                        ? "No results"
                        : `${places.length} ${places.length === 1 ? "place" : "places"} within ${formatDistance(radius)} of ${loc.label}${loc.kind === "default" ? " (default)" : ""}`}
                  </p>
                  {!editingLoc && (
                    <button type="button" onClick={() => setEditingLoc(true)} className="pressable shrink-0 rounded-pill px-2 py-0.5 font-medium text-accent hover:bg-accent-soft">
                      Change
                    </button>
                  )}
                </div>
                {loc.note && <p className="text-caption text-warning">{loc.note}</p>}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto border-t border-hairline">
                {error && (
                  <div className="space-y-2 p-4" role="alert">
                    <p className="text-footnote text-danger">{error}</p>
                    <Button size="sm" variant="secondary" onClick={() => (setLoading(true), setRetryKey((k) => k + 1))}>
                      Try again
                    </Button>
                  </div>
                )}
                {!loading && !error && places.length === 0 && (
                  <p className="p-4 text-footnote text-muted">Nothing on OpenStreetMap matches here. Try another category or a nearby city.</p>
                )}
                <ul ref={listRef} className={cx("divide-y divide-hairline", loading && "opacity-50")}>
                  {places.map((p) => (
                    <PlaceRow
                      key={p.id}
                      place={p}
                      selected={p.id === selectedId}
                      onSelect={() => select(p.id)}
                      onHover={(h) => setHoveredId(h ? p.id : null)}
                      onChat={openChat}
                      onScan={() => scan.start({ name: p.name, city: p.city ?? loc.label })}
                      scanning={scan.submitting}
                      scanError={p.id === selectedId ? scan.error : null}
                    />
                  ))}
                </ul>
                {places.length > 0 && (
                  <p className="px-4 py-3 text-caption text-subtle">
                    Listings from{" "}
                    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
                      OpenStreetMap
                    </a>{" "}
                    contributors. Details can be missing or out of date.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function PlaceRow({
  place: p,
  selected,
  onSelect,
  onHover,
  onChat,
  onScan,
  scanning,
  scanError,
}: {
  place: Place;
  selected: boolean;
  onSelect: () => void;
  onHover: (on: boolean) => void;
  onChat: () => void;
  onScan: () => void;
  scanning: boolean;
  scanError: string | null;
}) {
  const today = todayHours(p);
  const days = selected ? parseOsmHours(p.opening_hours) : [];
  return (
    <li data-id={p.id} className={cx(selected && "bg-accent-soft/60")} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <button type="button" onClick={onSelect} aria-expanded={selected} className="pressable block w-full px-4 py-3 text-left hover:bg-surface-2/70">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-callout font-medium">{p.name}</span>
          <span className="shrink-0 text-caption tabular-nums text-muted">{formatDistance(p.distance_m)}</span>
        </span>
        <span className="mt-0.5 block truncate text-footnote text-muted">
          {[p.cuisine ? `${p.kind_label} · ${p.cuisine}` : p.kind_label, today ? `Today ${today}` : null].filter(Boolean).join(" · ")}
        </span>
      </button>

      {selected && (
        <div className="space-y-3 px-4 pb-4">
          <dl className="space-y-1 text-footnote">
            {p.address && <Row label="Address">{p.address}</Row>}
            {p.phone && (
              <Row label="Phone">
                <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="text-accent hover:underline">
                  {p.phone}
                </a>
              </Row>
            )}
            {p.website && (
              <Row label="Website">
                <a href={p.website} target="_blank" rel="noreferrer nofollow" className="break-all text-accent hover:underline">
                  {p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </a>
              </Row>
            )}
            {days.length > 0 ? (
              <Row label="Hours">
                <details>
                  <summary className="cursor-pointer">{today ? `Today ${today}` : "See hours"}</summary>
                  <ul className="mt-1 space-y-0.5 tabular-nums text-muted">
                    {days.map((d) => (
                      <li key={d.day}>
                        {d.day.slice(0, 3)} {d.hours}
                      </li>
                    ))}
                  </ul>
                </details>
              </Row>
            ) : p.opening_hours ? (
              <Row label="Hours">{p.opening_hours}</Row>
            ) : null}
            {p.extras.length > 0 && <Row label="Also">{p.extras.map((x) => `${x.label}: ${x.value}`).join(", ")}</Row>}
            {!p.address && !p.phone && !p.website && !p.opening_hours && <p className="text-muted">OpenStreetMap has only the name and location.</p>}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onChat}>
              Chat with its AI
            </Button>
            <Button size="sm" variant="secondary" onClick={onScan} disabled={scanning}>
              {scanning ? "Starting…" : "Scan this business"}
            </Button>
          </div>
          {scanError && (
            <p role="alert" className="text-caption text-danger">
              {scanError}
            </p>
          )}
          <p className="text-caption text-subtle">
            Source:{" "}
            <a href={`https://www.openstreetmap.org/${p.osm_type}/${p.osm_id}`} target="_blank" rel="noreferrer" className="underline">
              OpenStreetMap {p.osm_type} {p.osm_id}
            </a>
          </p>
        </div>
      )}
    </li>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
