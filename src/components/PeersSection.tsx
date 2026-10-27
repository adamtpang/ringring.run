"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Card, SectionHeader, type BadgeTone } from "@/components/ds";
import {
  buildBoard,
  METRICS,
  MIN_NEGATIVE_FOR_REPLY,
  MIN_PEERS,
  PEERS,
  RATING_PRIOR_REVIEWS,
  SUBJECT_ID,
  TIERS,
  toSubjectInput,
  type Board,
  type MetricKey,
  type Move,
  type Scored,
  type SubjectInput,
  type Tier,
} from "@/lib/peers";
import { KIND_LABELS } from "@/lib/solutions";
import type { Business, FindingKind, Review } from "@/lib/types";

export const PEER_TIER_TONE: Record<Tier, BadgeTone> = { S: "accent", A: "success", B: "neutral", C: "warning", D: "danger" };
const TIER_TILE: Record<Tier, string> = {
  S: "bg-accent-soft text-accent",
  A: "bg-success-soft text-success",
  B: "bg-surface-2 text-foreground",
  C: "bg-warning-soft text-warning",
  D: "bg-danger-soft text-danger",
};

const fmtDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const pct = (v: number | null) => (v == null ? "n/a" : `${Math.round(v * 100)}%`);

function fmt(k: MetricKey, v: number | null) {
  if (v == null) return "n/a";
  if (k === "rating") return v.toFixed(1);
  if (k === "reviews") return Math.round(v).toLocaleString("en-US");
  return pct(v);
}

function useSha12(text: string | null) {
  const [hash, setHash] = useState<string | null>(null);
  useEffect(() => {
    if (!text || typeof crypto === "undefined" || !crypto.subtle) return;
    let alive = true;
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then((buf) => {
      if (alive) setHash([...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12));
    });
    return () => {
      alive = false;
    };
  }, [text]);
  return hash;
}

function TierTile({ tier, size = "md" }: { tier: Tier; size?: "md" | "lg" }) {
  return (
    <span
      aria-label={`Tier ${tier}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-semibold ${TIER_TILE[tier]} ${size === "lg" ? "h-16 w-16 text-title-1" : "h-9 w-9 text-headline"}`}
    >
      {tier}
    </span>
  );
}

function label(r: Scored, singular: string, name: string) {
  return r.id === SUBJECT_ID ? name : `${singular} #${r.position}`;
}

function MoveCard({ mv, fixes, businessName }: { mv: Move; fixes: FindingKind[]; businessName: string }) {
  const def = METRICS.find((m) => m.key === mv.metric)!;
  const linked = def.fixes.filter((k) => fixes.includes(k));
  return (
    <li className="rounded-md bg-surface-2 p-4">
      <p className="text-eyebrow uppercase text-muted">{def.label}</p>
      <p className="mt-1 text-title-3 tabular-nums">
        {fmt(mv.metric, mv.from)} <span className="text-subtle" aria-hidden="true">→</span>
        <span className="sr-only">to</span> {fmt(mv.metric, mv.to)}
      </p>
      <p className="mt-1 text-footnote text-muted">
        {mv.to === mv.from ? "" : "At least one peer already gets here. "}
        {mv.reachesNextTier ? `That alone would move ${businessName} to tier ${mv.tier}` : `That alone adds ${mv.gain} points`} (score {mv.score}, everyone else unchanged).
      </p>
      {linked.length > 0 ? (
        <p className="mt-2 text-footnote">
          {linked.map((k, i) => (
            <a key={k} href={`#problem-${k}`} className="font-medium text-accent hover:underline">
              {i > 0 ? " · " : ""}See the prescription for {KIND_LABELS[k].toLowerCase()}
            </a>
          ))}
        </p>
      ) : def.fixes.length > 0 ? (
        <p className="mt-2 text-caption text-subtle">No matching problem in this diagnosis yet, so no prescription to link.</p>
      ) : mv.metric === "reviews" ? (
        <p className="mt-2 text-caption text-subtle">More reviews come from asking happy customers. No product in our catalog targets this.</p>
      ) : null}
    </li>
  );
}

function TierList({ rows, name }: { rows: Scored[]; name: string }) {
  return (
    <ul className="space-y-2" aria-label="Tier list">
      {TIERS.map(({ tier }) => {
        const members = rows.filter((r) => r.tier === tier);
        return (
          <li key={tier} className="flex items-start gap-3">
            <TierTile tier={tier} />
            <div className="flex min-h-9 min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1.5">
              {members.length === 0 && <span className="px-1 text-caption text-subtle">No one yet</span>}
              {members.map((r) => (
                <span
                  key={r.id}
                  className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-pill px-2 text-caption tabular-nums ring-1 ring-inset ${r.id === SUBJECT_ID ? "bg-accent-solid font-semibold text-accent-fg ring-transparent" : "bg-surface text-muted ring-hairline"}`}
                >
                  {r.id === SUBJECT_ID ? (name.length > 22 ? `${name.slice(0, 20)}…` : name) : `#${r.position}`}
                  <span className={r.id === SUBJECT_ID ? "opacity-90" : "text-subtle"}>{fmt("rating", r.metrics.rating)}★</span>
                </span>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Leaderboard({ rows, singular, name, subject }: { rows: Scored[]; singular: string; name: string; subject: Scored }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.filter((r) => r.position <= 5 || Math.abs(r.position - subject.position) <= 1);
  return (
    <div>
      <div className="hidden grid-cols-[2.25rem_minmax(0,1fr)_3rem_3.5rem_4.5rem_4.5rem_4.5rem_4.5rem] gap-2 px-3 pb-1 text-caption text-subtle sm:grid">
        <span>Rank</span>
        <span>Business</span>
        <span>Tier</span>
        <span className="text-right">Score</span>
        <span className="text-right">Rating</span>
        <span className="text-right" title="Replies to 1-2 star reviews">Replies</span>
        <span className="text-right" title="Reviews with a complaint">Complaints</span>
        <span className="text-right" title="Hard-to-reach complaints">Reach</span>
      </div>
      <ol className="divide-y divide-hairline overflow-hidden rounded-md ring-1 ring-inset ring-hairline">
        {shown.map((r, i) => {
          const gap = i > 0 && r.position - shown[i - 1]!.position > 1;
          const me = r.id === SUBJECT_ID;
          return (
            <li key={r.id} className={`${me ? "bg-accent-soft" : "bg-surface"} ${gap ? "border-t-2 border-dashed border-hairline" : ""}`}>
              <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 sm:grid-cols-[2.25rem_minmax(0,1fr)_3rem_3.5rem_4.5rem_4.5rem_4.5rem_4.5rem]">
                <span className="text-footnote tabular-nums text-muted">{r.rank == null ? "–" : `${r.tied ? "T" : ""}${r.rank}`}</span>
                <span className="min-w-0">
                  <span className={`block truncate text-footnote ${me ? "font-semibold text-accent" : "text-foreground"}`}>
                    {label(r, singular, name)}
                    {me && <span className="sr-only"> (you)</span>}
                  </span>
                  <span className="block truncate text-caption text-subtle sm:hidden">
                    {fmt("rating", r.metrics.rating)}★ · {fmt("reviews", r.metrics.reviews)} reviews · replies {pct(r.metrics.reply)}
                  </span>
                </span>
                <span className="flex items-center gap-2 sm:contents">
                  {r.tier ? <Badge tone={PEER_TIER_TONE[r.tier]} className="w-8 justify-center px-0">{r.tier}</Badge> : <span className="text-caption text-subtle">n/a</span>}
                  <span className="w-10 text-right text-footnote font-medium tabular-nums sm:w-auto">{r.score ?? "n/a"}</span>
                </span>
                <span className="hidden text-right text-footnote tabular-nums sm:block">
                  {fmt("rating", r.metrics.rating)}★<span className="block text-caption text-subtle">{fmt("reviews", r.metrics.reviews)}</span>
                </span>
                <span className="hidden text-right text-footnote tabular-nums sm:block">{pct(r.metrics.reply)}</span>
                <span className="hidden text-right text-footnote tabular-nums sm:block">{pct(r.metrics.complaints)}</span>
                <span className="hidden text-right text-footnote tabular-nums sm:block">{pct(r.metrics.reach)}</span>
              </div>
            </li>
          );
        })}
      </ol>
      {rows.length > shown.length || all ? (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 text-caption font-medium text-accent hover:underline">
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      ) : null}
    </div>
  );
}

function HowTiersWork({ board, scanDate }: { board: Board; scanDate: string }) {
  const meta = board.status !== "no_industry" ? board.meta : null;
  return (
    <details className="rounded-md bg-surface-2 p-4 text-footnote text-muted">
      <summary className="cursor-pointer font-medium text-accent">How tiers work</summary>
      <div className="mt-3 space-y-3">
        <p>
          Each signal is turned into a percentile among the business and its peers (0 = lowest in the group, 1 = highest; ties split
          evenly). The score is the weighted average times 100. A signal we could not measure for a business is left out and the
          other weights are scaled up to fill in for it. A score needs at least a rating and a review count.
        </p>
        <ul className="space-y-1">
          {METRICS.map((m) => (
            <li key={m.key}>
              <span className="font-medium text-foreground">{m.label}, {Math.round(m.weight * 100)}%</span> ({m.better === "higher" ? "higher is better" : "lower is better"}). {m.how}
            </li>
          ))}
        </ul>
        <p>
          Tiers by score: {TIERS.map((t, i) => (i === TIERS.length - 1 ? `${t.tier} below ${TIERS[i - 1]!.min}` : `${t.tier} ${t.min}+`)).join(", ")}. Ranks share a number on
          a tie (shown as T). Groups with fewer than {MIN_PEERS} peers are not ranked.
        </p>
        <p>
          &ldquo;Ways up a tier&rdquo; tries the closest value a peer already has on each signal you can work on, one signal at a time, and
          keeps the smallest change that reaches the next tier. Rating is not suggested because it follows from the rest.
        </p>
        <p>
          Peers: public Google listings and reviews of {PEERS.city} businesses scanned {fmtDate(PEERS.scan_date)}.
          {meta ? ` ${meta.sample}.` : ""} Complaint types come from an AI classifier. {PEERS.excluded_allegation_reviews} reviews that allege
          discrimination or bias were left out of every count, and no peer review text is shown. Peers are anonymous; only the business on
          this page is named.
        </p>
        <p>
          This business: rating and review count from its Google listing, and replies to 1-2 star reviews from the newest reviews in
          Ringy&apos;s scan on {fmtDate(scanDate)} (needs at least {MIN_NEGATIVE_FOR_REPLY}; fewer is a small sample and is not scored). Complaint shares need the same classifier as the peers,
          so they are not measured for live scans yet. The rating is steadied with {RATING_PRIOR_REVIEWS} reviews at the group average.
        </p>
      </div>
    </details>
  );
}

/** The peer board for a business on the page (null until data loads). */
export function usePeerSubject(b: Business | null, reviews: Review[] | null): SubjectInput | null {
  const hash = useSha12(b?.place_id ?? null);
  return useMemo(() => (b ? toSubjectInput(b, reviews ?? [], hash) : null), [b, reviews, hash]);
}

export function usePeerBoard(subject: SubjectInput | null): Board | null {
  return useMemo(() => (subject ? buildBoard(subject) : null), [subject]);
}

export function PeersSection({ business: b, board, fixes }: { business: Business; board: Board; fixes: FindingKind[] }) {
  const scanDate = b.created_at;
  const note = (
    <p className="text-caption text-subtle">
      Tiers are estimates from public Google reviews as of the scan date ({fmtDate(PEERS.scan_date)} for peers, {fmtDate(scanDate)} for {b.name}). They are a starting point for a
      conversation, not a verdict.
    </p>
  );

  if (board.status !== "ok") {
    const why =
      board.status === "no_industry"
        ? board.reason
        : board.status === "not_enough_peers"
          ? `Only ${board.peerCount} ${board.meta.plural} in the benchmark so far; tiers need at least ${MIN_PEERS}.`
          : board.reason;
    return (
      <Card id="peers" className="scroll-mt-24 space-y-4">
        <SectionHeader eyebrow="Your peers" title="Not enough peers yet" description={why} size="sm" />
        <HowTiersWork board={board} scanDate={scanDate} />
      </Card>
    );
  }

  const { subject: s, rows, meta, moves, missing } = board;
  const total = rows.length;
  const measured = METRICS.length - missing.length;

  return (
    <Card as="section" id="peers" padding="lg" className="scroll-mt-24 space-y-6" aria-labelledby="peers-title">
      <div className="flex items-start gap-4">
        <TierTile tier={s.tier!} size="lg" />
        <div className="min-w-0">
          <p className="text-eyebrow uppercase text-accent">Your peers</p>
          <h2 id="peers-title" className="mt-1 text-title-2 text-balance">
            Tier {s.tier}, {s.tied ? "tied " : ""}#{s.rank} of {total} {meta.plural}
          </h2>
          <p className="mt-1 text-callout text-muted">
            Score {s.score} of 100, compared with {board.peerCount} local peers on public Google signals. Measured on {measured} of {METRICS.length} signals
            {missing.length ? ` (${missing.map((k) => METRICS.find((m) => m.key === k)!.label.toLowerCase()).join(", ")} not measured)` : ""}.
          </p>
        </div>
      </div>

      <section>
        <h3 className="text-eyebrow uppercase text-muted">{moves.length ? "Ways up a tier" : s.tier === "S" ? "Top tier" : "Ways up a tier"}</h3>
        {moves.length > 0 ? (
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {moves.map((mv) => (
              <MoveCard key={mv.metric} mv={mv} fixes={fixes} businessName={b.name} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-footnote text-muted">
            {s.tier === "S"
              ? `${b.name} leads this group. Keeping replies and response times steady is what holds the spot.`
              : "No single signal we measured, moved to a level a peer already has, changes the tier on its own. The signals we could not measure yet may."}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-eyebrow uppercase text-muted">Tier list</h3>
        <TierList rows={rows} name={b.name} />
      </section>

      <section className="space-y-2">
        <h3 className="text-eyebrow uppercase text-muted">Leaderboard</h3>
        <p className="text-caption text-subtle">Peers are anonymous and numbered by position. Replies = owner replies to 1-2 star reviews.</p>
        <Leaderboard rows={rows} singular={meta.singular} name={b.name} subject={s} />
      </section>

      {note}
      <HowTiersWork board={board} scanDate={scanDate} />
    </Card>
  );
}

