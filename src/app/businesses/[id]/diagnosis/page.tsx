"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, ButtonLink, Card, SectionHeader, Stat, StatGrid } from "@/components/ds";
import { PeersSection, usePeerBoard } from "@/components/PeersSection";
import { BackLink, money, PageShell, usePoll } from "@/components/ui";
import { callsPerMonth, CATALOG, INTERVIEW, prescribe, rankProblems, verticalFor, type MenuOption, type RankedProblem, type Vertical } from "@/lib/prescription";
import { computeMonthlyValue } from "@/lib/roi";
import { KIND_LABELS } from "@/lib/solutions";
import type { AgentRecord, Assumption, Business, Finding, Review, RoiEstimate, Run } from "@/lib/types";

interface Report {
  business: Business;
  run: Run | null;
  reviews: Review[];
  findings: Finding[];
  roi: RoiEstimate[];
  pages: { status: string }[];
  agent: AgentRecord | null;
}

const VERTICAL_LABEL: Record<Vertical, string> = { home_services: "home services", dental: "dental", any: "local business" };
const CHECKED = new Date(`${CATALOG.checked_on}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function fmtValue(a: Assumption) {
  if (a.unit === "usd") return money(a.value);
  if (a.unit === "ratio") return `${Math.round(a.value * 1000) / 10}%`;
  return String(a.value);
}

function severityTone(s: number) {
  return s >= 5 ? "danger" : s >= 4 ? "warning" : "neutral";
}

function Quotes({ finding, reviews }: { finding: Finding; reviews: Review[] }) {
  const byId = new Map(reviews.map((r) => [r.id, r]));
  const items = finding.evidence.slice(0, 3);
  return (
    <ul className="space-y-2">
      {items.map((e, i) => (
        <li key={i} className="rounded-md border-l-2 border-accent bg-surface-2 px-4 py-3">
          {e.source === "listing" ? (
            <p className="text-callout">{e.value}</p>
          ) : (
            <p className="text-callout">&ldquo;{e.quote}&rdquo;</p>
          )}
          <p className="mt-1 text-caption text-muted">
            {e.source === "review"
              ? `Google review${e.rating != null ? `, ${e.rating} of 5 stars` : ""}${byId.get(e.review_id)?.published_at ? `, ${new Date(byId.get(e.review_id)!.published_at!).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}`
              : e.source === "website"
                ? `Their website: ${e.url}`
                : "Google listing"}
          </p>
        </li>
      ))}
    </ul>
  );
}

function CostEditor({ assumptions, edits, setEdits }: { assumptions: Assumption[]; edits: Record<string, string>; setEdits: (e: Record<string, string>) => void }) {
  return (
    <ul className="divide-y divide-hairline">
      {assumptions.map((a, i) => (
        <li key={a.key} className="grid grid-cols-[1rem_1fr_auto] items-center gap-3 py-2">
          <span className="text-footnote text-subtle" aria-hidden="true">{i > 0 ? "×" : ""}</span>
          <span className="min-w-0 text-footnote">
            <span className="mr-2">{a.label}</span>
            {a.source === "listing" ? (
              <Badge tone="success" className="h-5 px-2">From listing</Badge>
            ) : (
              <Badge tone="warning" className="h-5 px-2">Assumption</Badge>
            )}
          </span>
          <span className="text-right">
            <input
              aria-label={`${a.label} (${a.source === "listing" ? "from listing" : "assumption"})`}
              type="number"
              step={a.unit === "ratio" || a.unit === "multiplier" ? 0.01 : 1}
              min={0}
              max={a.unit === "ratio" ? 1 : undefined}
              value={edits[a.key] ?? String(a.value)}
              onChange={(e) => setEdits({ ...edits, [a.key]: e.target.value })}
              className="h-8 w-24 rounded-sm bg-surface px-2 text-right text-footnote tabular-nums ring-1 ring-inset ring-hairline outline-none focus:ring-2 focus:ring-accent"
            />
            <span className="block text-[0.6875rem] text-subtle">{a.unit === "ratio" ? fmtValue({ ...a, value: Number(edits[a.key] ?? a.value) }) : a.unit === "usd" ? "dollars" : a.unit}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function priceLine(o: MenuOption) {
  if (o.estUsdMonth == null) return "Price not public";
  return `About ${money(o.estUsdMonth)}/mo`;
}

function OptionCard({ o, picked, calls }: { o: MenuOption; picked: boolean; calls: number | null }) {
  const p = o.product;
  const usesVolume = calls != null && p.price.included_calls != null;
  return (
    <div className={`rounded-md p-4 ${picked ? "bg-accent-soft ring-2 ring-inset ring-accent" : "bg-surface-2"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a href={p.url} target="_blank" rel="noreferrer" className="text-headline text-foreground hover:underline">{p.name}</a>
        {picked && <Badge tone="accent" dot>Ringy recommends</Badge>}
      </div>
      <p className="mt-1 text-title-3 tabular-nums">{priceLine(o)}</p>
      <p className="text-caption text-muted">
        {o.plan ?? ""}
        {usesVolume ? `${o.plan ? ", " : ""}at about ${Math.round(calls!)} calls a month (assumption)` : ""}
      </p>
      <p className="mt-2 text-footnote text-muted">{p.summary}</p>
      <p className="mt-2 text-caption text-subtle">{p.price.note}</p>
      <p className="mt-2 text-caption text-subtle">
        {p.pricing_url ? (
          <a href={p.pricing_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">Vendor pricing page</a>
        ) : (
          "No pricing page"
        )}
        {` · checked ${CHECKED} · no affiliation`}
      </p>
    </div>
  );
}

function ProblemCard({ rank, rp, b, reviews, agent }: { rank: number; rp: RankedProblem; b: Business; reviews: Review[]; agent: AgentRecord | null }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const f = rp.finding;
  const base = rp.roi?.assumptions ?? [];
  const current = base.map((a) => (a.key in edits ? { ...a, value: Number(edits[a.key]) } : a));
  let monthly: number | null = rp.monthly;
  let err: string | null = null;
  try {
    monthly = base.length ? computeMonthlyValue(current) : rp.monthly;
  } catch (e) {
    monthly = null;
    err = e instanceof Error ? e.message : String(e);
  }
  const vertical = verticalFor(b.category);
  const calls = f.kind === "missed_calls" ? callsPerMonth(current) : null;
  const rx = prescribe(f.kind, vertical, monthly ?? rp.monthly, calls);
  const questions = INTERVIEW[f.kind];

  return (
    <Card as="article" padding="lg" id={`problem-${f.kind}`} className="scroll-mt-24 space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-eyebrow uppercase text-accent">Problem {rank}</span>
          <Badge tone="accent">{KIND_LABELS[f.kind]}</Badge>
          <Badge tone={severityTone(f.severity)}>Severity {f.severity} of 5</Badge>
          <Badge>{rp.evidenceCount} {rp.evidenceCount === 1 ? "piece" : "pieces"} of evidence</Badge>
        </div>
        <h2 className="mt-3 text-title-2">{f.title}</h2>
        <p className="mt-1 text-callout text-muted">{f.detail}</p>
      </div>

      <section>
        <h3 className="text-eyebrow uppercase text-muted">What customers said</h3>
        <div className="mt-2"><Quotes finding={f} reviews={reviews} /></div>
      </section>

      <section className="rounded-md bg-surface-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-eyebrow uppercase text-muted">What it may cost</h3>
          <span className="text-title-2 tabular-nums text-accent">{monthly == null ? "Check inputs" : `${money(monthly)}/mo`}</span>
        </div>
        <p className="mt-1 text-caption text-muted">
          An estimate, not a fact. It multiplies the numbers below. Most are assumptions; change any of them to match what you know. Edits stay on this page and are not saved.
        </p>
        {base.length > 0 ? (
          <CostEditor assumptions={base} edits={edits} setEdits={setEdits} />
        ) : (
          <p className="mt-2 text-footnote text-muted">No estimate on file for this problem.</p>
        )}
        {err && <p className="mt-2 text-caption text-danger">{err}</p>}
        {Object.keys(edits).length > 0 && (
          <button type="button" onClick={() => setEdits({})} className="mt-2 text-caption font-medium text-accent hover:underline">Reset to defaults</button>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-eyebrow uppercase text-muted">Prescription</h3>
          <p className="mt-1 text-callout">
            <span className="font-medium">Why: </span>
            {rx.reason}
          </p>
          <p className="mt-1 text-caption text-subtle">
            Rule: a product fits if it serves {VERTICAL_LABEL[vertical]}, shows a public price, needs nothing else you may not have, and costs at most {Math.round(CATALOG.fair_share_of_loss * 100)}% of the estimated loss ({money(rx.fairCeilingUsd)}/mo here). The cheapest fit wins unless ours is cheaper.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {rx.options.map((o) => (
            <OptionCard key={o.product.id} o={o} calls={calls} picked={rx.pick?.source === "third_party" && rx.pick.id === o.product.id} />
          ))}
          {rx.inHouse && (
            <div className={`rounded-md p-4 ${rx.pick?.source === "in_house" ? "bg-accent-soft ring-2 ring-inset ring-accent" : "bg-surface-2"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-headline">{rx.inHouse.name}</span>
                {rx.pick?.source === "in_house" ? <Badge tone="accent" dot>Ringy recommends</Badge> : <Badge tone="success">Built by ringring.run</Badge>}
              </div>
              <p className="mt-1 text-title-3">Price TBD</p>
              <p className="text-caption text-muted">{rx.inHouse.price.note}</p>
              <p className="mt-2 text-footnote text-muted">{rx.inHouse.summary}</p>
              <p className="mt-2 text-caption text-subtle">{rx.inHouse.limits}</p>
              {agent ? (
                <ButtonLink size="sm" className="mt-3" href={`/businesses/${b.id}#agent`}>Try the agent built for them</ButtonLink>
              ) : (
                <p className="mt-3 text-caption text-subtle">Agent not built for this business yet.</p>
              )}
            </div>
          )}
        </div>
        {rx.alsoChecked.length > 0 && (
          <details className="text-footnote text-muted">
            <summary className="cursor-pointer text-accent">Also checked ({rx.alsoChecked.length})</summary>
            <ul className="mt-2 space-y-1">
              {rx.alsoChecked.map((o) => (
                <li key={o.product.id}>
                  <a href={o.product.url} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">{o.product.name}</a>
                  {": "}
                  {o.whyNot ?? `Fits at ${priceLine(o).toLowerCase()}, but costs more than the options above.`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section>
        <h3 className="text-eyebrow uppercase text-muted">Ringy will ask</h3>
        <p className="mt-1 text-caption text-muted">Questions for the owner to confirm this before anything is built or bought.</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-callout">
          {questions.map((q) => <li key={q}>{q}</li>)}
        </ol>
      </section>
    </Card>
  );
}

const STEPS = ["Market map", "Diagnosis", "Owner interview", "Fix ships"] as const;

export default function DiagnosisPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = usePoll<Report>(`/api/businesses/${id}`, (d) => d.business.diagnosis_status === "running" || d.business.diagnosis_status === "pending");
  const ranked = useMemo(() => (data ? rankProblems(data.findings, data.roi) : []), [data]);
  const board = usePeerBoard(data?.business ?? null, data?.reviews ?? null);

  if (error) return <PageShell width="narrow"><p className="rounded-md bg-danger-soft px-4 py-3 text-footnote text-danger">{error}</p></PageShell>;
  if (!data) return <PageShell width="narrow"><p className="text-footnote text-muted">Loading diagnosis…</p></PageShell>;

  const b = data.business;
  const total = ranked.reduce((s, r) => s + r.monthly, 0);
  const sources = [`${b.scraped_review_count} Google reviews`, "the listing", ...(data.pages.some((p) => p.status === "ok") ? ["their website"] : [])];
  const current = data.agent ? 3 : 1;

  return (
    <PageShell width="narrow">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <BackLink href={`/runs/${b.run_id}`}>Market map</BackLink>
        <Link href={`/businesses/${b.id}`} className="text-footnote font-medium text-accent hover:underline">Full report</Link>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <Badge tone={i === 1 ? "accent" : i < 1 || (i === 3 && current === 3) ? "success" : "neutral"} dot={i === 1}>
              {i + 1}. {s}
              {i === 2 ? " (voice soon)" : i === 3 && data.agent ? " (agent ready)" : ""}
            </Badge>
          </li>
        ))}
      </ol>

      <div className="space-y-5">
        {b.is_fixture && <Badge tone="warning" dot>Demo data · fictional business and reviews</Badge>}
        <SectionHeader
          level={1}
          size="lg"
          eyebrow="Ringy's diagnosis"
          title={b.name}
          description={`Ringy checked this business from the outside: ${sources.length > 1 ? `${sources.slice(0, -1).join(", ")} and ${sources[sources.length - 1]}` : sources[0]}. These are the best first problems to fix, with a prescription for each.`}
        />
        <StatGrid>
          <Stat label="May cost / month" value={money(total)} hint="estimate, top problems" emphasis />
          <Stat label="Problems found" value={data.findings.length} hint={`top ${ranked.length} shown`} />
          <Stat label="Rating" value={b.rating ?? "n/a"} hint={`${b.review_count ?? 0} reviews`} />
          <Stat label="Owner replies" value={b.owner_response_rate != null ? `${Math.round(b.owner_response_rate * 100)}%` : "n/a"} hint="to reviews" />
        </StatGrid>
        {board?.status === "ok" && (
          <a href="#peers" className="flex flex-wrap items-center gap-2 text-footnote font-medium text-accent hover:underline">
            <Badge tone="accent">Tier {board.subject.tier}</Badge>
            {board.subject.tied ? "Tied " : ""}#{board.subject.rank} of {board.rows.length} {board.meta.plural}. See your peers
          </a>
        )}
        {b.diagnosis_summary && <p className="text-body">{b.diagnosis_summary}</p>}
        <p className="text-caption text-subtle">Ranked by how much evidence there is, then by the estimated monthly cost.</p>
      </div>

      {b.diagnosis_status === "failed" && (
        <Card tone="danger"><p className="text-footnote text-danger">Diagnosis failed: {b.diagnosis_error}</p></Card>
      )}
      {b.diagnosis_status === "ok" && ranked.length === 0 && (
        <Card><p className="text-footnote text-muted">No evidence-backed problems found. Nothing to prescribe.</p></Card>
      )}

      {ranked.map((rp, i) => (
        <ProblemCard key={rp.finding.id} rank={i + 1} rp={rp} b={b} reviews={data.reviews} agent={data.agent} />
      ))}

      {board && <PeersSection business={b} board={board} fixes={ranked.map((r) => r.finding.kind)} />}

      <p className="text-caption text-subtle">
        Product prices were copied from each vendor&apos;s own pricing page on {CHECKED}. ringring.run has no affiliation, partnership or referral deal with any of them. Prices change; check the vendor page before buying.
      </p>
    </PageShell>
  );
}
