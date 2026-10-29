import type { Metadata } from "next";
import Link from "next/link";
import { Qr } from "@/components/Qr";
import { Badge } from "@/components/ds";
import { Wordmark } from "@/components/Logo";
import { PATH_DEMOS, resolvePath, type PathCheck, type PathModel } from "@/lib/path-to-one";
import { RoiDemo } from "../roi/RoiDemo";
import { PaceEstimate } from "./PaceEstimate";

export const metadata: Metadata = {
  title: "Your path to #1",
  description: "ringring's score, the gap to the top of that list, and an estimated timeline. Not Google's ranking, and not a promise.",
  robots: { index: false, follow: false },
};

const TONE: Record<PathCheck["status"], string> = {
  pass: "bg-accent-soft text-accent",
  gap: "bg-danger-soft text-danger",
  unknown: "bg-warning-soft text-warning",
};

function rankClass(rank: number, of: number): string {
  const p = rank / of;
  if (p <= 0.25) return "text-accent";
  if (p <= 0.5) return "text-warning";
  return "text-danger";
}

export default async function PathPage({ searchParams }: { searchParams: Promise<{ b?: string; q?: string }> }) {
  const sp = await searchParams;
  const { model, note, matches } = resolvePath({ b: sp.b, q: sp.q });
  return (
    <div className="mx-auto w-full max-w-3xl px-[var(--space-gutter)] py-5 sm:py-8">
      <header className="flex items-center justify-between gap-3">
        <Link href="/" aria-label="ringring.run home" className="pressable rounded-sm">
          <Wordmark />
        </Link>
        <Badge tone="warning">Estimate</Badge>
      </header>
      <h1 className="mt-5 text-title-1 text-balance">Your path to #1</h1>
      <p className="mt-2 text-footnote text-muted">
        ringring&apos;s score for one saved scan. Not Google&apos;s ranking. The gap and the timeline are estimates. Nothing here promises a business will reach #1.
      </p>
      <Picker active={model.id} />
      {note && <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-footnote text-warning">{note}</p>}
      {matches.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-2 text-caption">
          {matches.map((m) => (
            <li key={m.id}>
              <Link href={`/path?b=${m.id}`} className="text-accent">
                {m.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-headline">{model.name}</p>
      <p className="text-footnote text-muted">
        {model.category}. {model.sourceLabel}. Saved scan on screen. A live scan was not started.
      </p>
      <Leaderboard model={model} />
      <Gap model={model} />
      <section id="roi" className="mt-8">
        <h2 className="text-eyebrow uppercase text-subtle">Money and time</h2>
        <div className="mt-3">
          <RoiDemo scan={model.roi} embedded />
        </div>
      </section>
      <Drafts model={model} />
      <Profile model={model} />
      <ReviewCard model={model} />
    </div>
  );
}

function Picker({ active }: { active: string }) {
  return (
    <form action="/path" method="get" className="mt-4">
      <label className="block text-caption text-muted" htmlFor="biz">
        Austin business in the saved cache
      </label>
      <span className="mt-1 flex gap-2">
        <input
          id="biz"
          name="q"
          placeholder="Aire Serv, Sapori, Small Victory"
          className="h-10 min-w-0 flex-1 rounded-md bg-surface-2 px-3 text-footnote ring-1 ring-inset ring-hairline"
        />
        <button type="submit" className="pressable h-10 rounded-pill bg-accent-solid px-4 text-footnote font-medium text-accent-fg">
          Show
        </button>
      </span>
      <span className="mt-2 flex flex-wrap gap-2">
        {PATH_DEMOS.map((d) => (
          <Link
            key={d.id}
            href={`/path?b=${d.id}`}
            className={`pressable inline-flex h-8 items-center rounded-pill px-3 text-caption ${d.id === active ? "bg-accent-solid text-accent-fg" : "bg-surface-2 text-foreground ring-1 ring-inset ring-hairline"}`}
          >
            {d.id === "aire-serv" ? "Aire Serv" : d.name}
          </Link>
        ))}
      </span>
    </form>
  );
}

function Leaderboard({ model }: { model: PathModel }) {
  return (
    <section id="leaderboard" className="mt-6 rounded-lg bg-surface p-4 shadow-card">
      <h2 className="text-eyebrow uppercase text-subtle">Leaderboard</h2>
      {model.rankLabel && model.rank && model.of ? (
        <p className={`mt-2 text-display tabular-nums ${rankClass(model.rank, model.of)}`}>{model.rankLabel}</p>
      ) : (
        <p className="mt-2 text-title-2">No rank in the saved scan</p>
      )}
      {model.score != null && <p className="text-footnote text-muted">Score {model.score}. ringring&apos;s score, not Google&apos;s.</p>}
      <p className="mt-2 text-footnote">{model.rankNote}</p>
      <p className="mt-2 text-caption text-subtle">{model.formula}</p>
      {model.rows.length > 0 && (
        <ol className="mt-3">
          {model.rows.map((row) => (
            <li
              key={`${row.rank}-${row.name}`}
              className={row.you ? "flex items-baseline gap-2 rounded-sm bg-accent-soft px-2 py-1.5 text-footnote font-semibold" : "flex items-baseline gap-2 px-2 py-1.5 text-footnote"}
            >
              <span className="w-8 shrink-0 tabular-nums text-subtle">#{row.rank}</span>
              <span className="min-w-0 flex-1">
                {row.name}
                {row.you ? " (you)" : ""}
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums">{row.rating == null ? "" : row.rating.toFixed(1)}</span>
              <span className="w-14 shrink-0 text-right tabular-nums text-muted">{row.reviews == null ? "" : row.reviews.toLocaleString("en-US")}</span>
              <span className="w-12 shrink-0 text-right tabular-nums text-subtle">{row.score == null ? "" : row.score}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Gap({ model }: { model: PathModel }) {
  const g = model.gap;
  return (
    <section id="gap" className="mt-4 rounded-lg bg-surface p-4 shadow-card">
      <h2 className="text-eyebrow uppercase text-subtle">Gap to #1</h2>
      <p className="mt-1 text-caption text-warning">Estimate. Not a guarantee, and not a promise of reaching #1.</p>
      {!g ? (
        <p className="mt-2 text-footnote">{model.noRankReason}</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md bg-danger-soft p-3 text-danger">
              <p className="text-caption">Displayed stars vs #1</p>
              <p className="text-title-1 tabular-nums">{g.ratingGap == null ? "n/a" : g.ratingGap > 0 ? g.ratingGap.toFixed(1) : "0"}</p>
              <p className="text-caption">
                {g.ratingNow ?? "n/a"} now, {g.ratingFirst ?? "n/a"} at #1
              </p>
            </div>
            <div className={`rounded-md p-3 ${g.reviewGap ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent"}`}>
              <p className="text-caption">Reviews to match #1&apos;s count</p>
              <p className="text-title-1 tabular-nums">{g.reviewGap ?? "n/a"}</p>
              <p className="text-caption">
                {g.reviewsNow?.toLocaleString("en-US") ?? "n/a"} now, {g.reviewsFirst?.toLocaleString("en-US") ?? "n/a"} at #1
              </p>
            </div>
          </div>
          <p className="mt-3 text-footnote">{g.replyNote}</p>
          <p className="mt-2 text-footnote">{g.paceNote}</p>
          {g.reviewGap != null && g.reviewGap > 0 && <PaceEstimate reviewGap={g.reviewGap} per90={g.per90} />}
        </>
      )}
    </section>
  );
}

function Drafts({ model }: { model: PathModel }) {
  return (
    <section id="drafts" className="mt-8 rounded-lg bg-surface p-4 shadow-card">
      <h2 className="text-eyebrow uppercase text-subtle">Drafted replies</h2>
      <p className="mt-1 text-footnote">{model.draftNote}</p>
      {model.drafts.length === 0 ? (
        <p className="mt-3 text-footnote text-muted">No unanswered review is in the saved sample.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {model.drafts.map((d) => (
            <li key={`${d.date}-${d.stars}-${d.text.slice(0, 24)}`} className="rounded-md bg-surface-2 p-3">
              <p className="text-caption text-subtle">
                {d.stars}★ {d.date}
              </p>
              <p className="mt-1 text-footnote">{d.text || "No review text in the scan."}</p>
              <p className="mt-2 text-caption font-medium uppercase tracking-wide text-subtle">Draft</p>
              <p className="mt-1 text-footnote">{d.draft}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Profile({ model }: { model: PathModel }) {
  const gaps = model.profile.filter((c) => c.status !== "pass");
  const passes = model.profile.filter((c) => c.status === "pass");
  return (
    <section id="profile" className="mt-4 rounded-lg bg-surface p-4 shadow-card">
      <h2 className="text-eyebrow uppercase text-subtle">Profile fix list</h2>
      <p className="mt-1 text-footnote text-muted">From the saved scan. Display only. This page does not call the business.</p>
      <ul className="mt-2">
        {gaps.map((c) => (
          <li key={c.label} className="border-b border-hairline py-2">
            <span className={`rounded-pill px-2 py-0.5 text-caption font-medium ${TONE[c.status]}`}>{c.status === "gap" ? "Fix" : "Unknown"}</span>
            <p className="mt-1 text-footnote font-medium">{c.label}</p>
            <p className="text-caption text-muted">{c.detail}</p>
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-caption uppercase text-accent">Already on the listing</h3>
      <ul>
        {passes.map((c) => (
          <li key={c.label} className="border-b border-hairline py-2 last:border-b-0">
            <p className="text-footnote">{c.label}</p>
            <p className="text-caption text-muted">{c.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewCard({ model }: { model: PathModel }) {
  return (
    <section id="review-card" className="mt-4 rounded-lg bg-surface p-4 shadow-card">
      <h2 className="text-eyebrow uppercase text-subtle">Review card</h2>
      <p className="mt-1 text-footnote">Straight to Google. No gating and no incentive.</p>
      {model.reviewHref && (
        <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Qr value={model.reviewHref} label={`Google review QR for ${model.name}`} size={128} />
          <a href={model.reviewHref} className="text-footnote font-medium text-accent">
            Write a Google review
          </a>
        </div>
      )}
      <p className="mt-4 text-footnote text-muted">The missed-call phone agent is coming in the starter pack. It is not a live line, and this page does not place a call.</p>
    </section>
  );
}
