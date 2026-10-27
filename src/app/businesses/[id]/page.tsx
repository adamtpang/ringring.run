"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Card, SectionHeader, Stat, StatGrid } from "@/components/ds";
import { RoiCalculatorCard, useCalcBase } from "@/components/RoiCalculator";
import { AgentPanel, type VoiceStatus } from "@/components/AgentPanel";
import { BackLink, money, PageShell, StepTimeline, usePoll } from "@/components/ui";
import { SnapshotBanner, snapQs, useReportUrl } from "@/components/Snapshot";
import type { SnapshotMeta } from "@/lib/snapshot";
import { ASSUMPTION_LABEL, computeMonthlyValue, dedupMonthly, moneyTrace, opportunityScore, traceLine } from "@/lib/roi";
import { KIND_LABELS, SOLUTIONS } from "@/lib/solutions";
import { isSuspicious } from "@/lib/untrusted";
import type { AgentRecord, Assumption, Business, Finding, KnowledgeFact, Review, RoiEstimate, Run, RunStep, SolutionId, WebPage } from "@/lib/types";

interface Report {
  business: Business;
  run: Run | null;
  reviews: Review[];
  findings: Finding[];
  roi: RoiEstimate[];
  steps: RunStep[];
  pages: (Omit<WebPage, "text"> & { chars: number; preview: string })[];
  knowledge: KnowledgeFact[];
  agent: AgentRecord | null;
  voice: VoiceStatus | null;
  snapshot?: SnapshotMeta;
}

const KNOWLEDGE_ORDER = ["contact", "hours", "service", "price", "policy", "faq", "service_area"];

function Stars({ n }: { n: number | null }) {
  if (n == null) return null;
  return (
    <span className="tracking-[0.05em] text-warning" aria-label={`${n} stars`}>
      {"★".repeat(n)}
      <span className="text-hairline-strong">{"★".repeat(5 - n)}</span>
    </span>
  );
}

function fmt(a: Assumption) {
  if (a.unit === "usd") return money(a.value);
  if (a.unit === "ratio") return `${Math.round(a.value * 1000) / 10}%`;
  return String(a.value);
}

function Quote({ children, source }: { children: React.ReactNode; source: React.ReactNode }) {
  return (
    <li className="rounded-md bg-surface-2 px-4 py-3">
      <p className="text-callout">{children}</p>
      <p className="mt-1 text-caption text-muted">{source}</p>
    </li>
  );
}

function RoiEditor({ roi, onSaved, readOnly = false }: { roi: RoiEstimate; onSaved: () => void; readOnly?: boolean }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const live = useMemo(() => {
    const next = roi.assumptions.map((a) => (a.key in draft ? { ...a, value: Number(draft[a.key]) } : a));
    try {
      return { value: computeMonthlyValue(next), error: null as string | null };
    } catch (e) {
      return { value: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [draft, roi.assumptions]);
  const dirty = Object.keys(draft).length > 0;

  async function send(body: unknown) {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/roi/${roi.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "Save failed");
      setDraft({});
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md bg-surface-2 p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-eyebrow uppercase text-muted">
          Estimate{roi.is_edited && !dirty ? " · edited" : ""}
        </span>
        <span className="text-title-3 tabular-nums">
          {live.value == null ? "Invalid" : `${money(live.value)}/mo`}
          {dirty && <span className="ml-2 text-caption font-medium text-accent">Unsaved</span>}
        </span>
      </div>
      <ul className="divide-y divide-hairline">
        {roi.assumptions.map((a, i) => (
          <li key={a.key} className="grid grid-cols-[1rem_1fr_auto] items-center gap-3 py-2">
            <span className="text-footnote text-subtle" aria-hidden="true">{i > 0 ? "×" : ""}</span>
            <span className="min-w-0 text-footnote">
              {a.label}
              {a.note && <span className="block text-caption text-muted">{a.note}</span>}
              {a.source === "assumption" && a.unit !== "multiplier" && !roi.is_edited && <span className="block text-caption text-warning">{ASSUMPTION_LABEL}</span>}
              {a.unit === "multiplier" && a.key === "weeks_per_month" && <span className="block text-caption text-muted">Calendar: 52 weeks / 12 months.</span>}
              {a.source === "listing" && <span className="block text-caption text-success">Sourced</span>}
            </span>
            <span className="text-right">
              <input
                aria-label={a.label}
                type="number"
                readOnly={readOnly}
                step={a.unit === "ratio" ? 0.01 : a.unit === "multiplier" ? 0.01 : 1}
                min={0}
                max={a.unit === "ratio" ? 1 : undefined}
                value={draft[a.key] ?? String(a.value)}
                onChange={(e) => setDraft((d) => ({ ...d, [a.key]: e.target.value }))}
                className="h-8 w-24 rounded-sm bg-surface px-2 text-right text-footnote tabular-nums ring-1 ring-inset ring-hairline outline-none focus:ring-2 focus:ring-accent"
              />
              <span className="block text-[0.6875rem] text-subtle">{a.unit === "ratio" ? `ratio (${fmt(a)})` : a.unit}</span>
            </span>
          </li>
        ))}
      </ul>
      {live.value != null && (() => {
        const t = moneyTrace(roi.assumptions.map((a) => (a.key in draft ? { ...a, value: Number(draft[a.key]) } : a)));
        return t ? <p className="mt-2 text-caption text-subtle">How we got this: {traceLine(t)}.</p> : null;
      })()}
      {(live.error || err) && <p className="mt-2 text-caption text-danger">{live.error ?? err}</p>}
      {readOnly ? <p className="mt-3 text-caption text-subtle">Editing is off in the saved snapshot.</p> : <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={!dirty || saving || live.value == null}
          onClick={() => send({ assumptions: Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Number(v)])) })}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={saving || (!roi.is_edited && !dirty)}
          onClick={() => (dirty && !roi.is_edited ? setDraft({}) : send({ assumptions: {}, reset: true }))}
        >
          Reset
        </Button>
      </div>}
    </div>
  );
}

export default function BusinessPage() {
  const { id } = useParams<{ id: string }>();
  const url = useReportUrl(id);
  const { data, error, reload } = usePoll<Report>(
    url,
    (d) =>
      !d.snapshot &&
      d.business.diagnosis_status === "running" ||
      d.business.diagnosis_status === "pending" ||
      (!d.agent && (d.run?.status === "running" || d.run?.status === "queued")),
  );

  const roiByFinding = useMemo(() => new Map((data?.roi ?? []).map((r) => [r.finding_id, r])), [data]);
  const solutionIds = useMemo(() => [...new Set((data?.findings ?? []).map((f) => f.solution))] as SolutionId[], [data]);

  const calcRows = useCalcBase(data?.business ?? null, data?.findings ?? null, data?.roi ?? null);
  if (error) return <PageShell width="narrow"><p className="rounded-md bg-danger-soft px-4 py-3 text-footnote text-danger">{error}</p></PageShell>;
  if (!data) return <PageShell width="narrow"><p className="text-footnote text-muted">Loading report…</p></PageShell>;

  const b = data.business;
  const kindOf = new Map(data.findings.map((f) => [f.id, f.kind]));
  // Overlapping problems (e.g. missed calls and slow replies) are counted once.
  // Each figure is recomputed from its own inputs, so the total always traces to the cards below.
  const titleOf = new Map(data.findings.map((f) => [f.kind as string, f.title]));
  const dedup = dedupMonthly(data.roi.map((r) => ({ kind: kindOf.get(r.finding_id) ?? r.finding_id, monthly: moneyTrace(r.assumptions)?.result ?? null })));
  const total = dedup.total;
  const keptKinds = data.roi
    .map((r) => ({ kind: kindOf.get(r.finding_id) ?? r.finding_id, t: moneyTrace(r.assumptions) }))
    .filter((x) => x.t && x.t.result > 0 && !dedup.dropped.some((d) => d.kind === x.kind));
  const ok = b.diagnosis_status === "ok";

  return (
    <PageShell width="narrow">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <BackLink href={data.snapshot ? "/owners" : `/runs/${b.run_id}`}>{data.snapshot ? "Owners" : "Run"}</BackLink>
        {ok && data.findings.length > 0 && (
          <Link href={`/businesses/${b.id}/diagnosis${snapQs(data.snapshot)}`} className="text-footnote font-medium text-accent hover:underline">
            Ringy&apos;s diagnosis and prescription
          </Link>
        )}
      </div>

      <SnapshotBanner snapshot={data.snapshot} />
      <div className="space-y-5">
        {b.is_fixture && (
          <Badge tone="warning" dot>
            Demo data · fictional business and reviews
          </Badge>
        )}
        <SectionHeader level={1} size="lg" title={b.name} description={[b.category, b.address].filter(Boolean).join(" · ")} />
        <StatGrid>
          <Stat label="Est. / month" value={ok ? money(total) : "n/a"} hint="overlaps counted once" emphasis />
          <Stat label="Opportunity" value={ok ? opportunityScore(total) : "n/a"} hint="out of 100" />
          <Stat label="Rating" value={b.rating ?? "n/a"} hint={`${b.review_count ?? 0} reviews`} />
          <Stat label="Owner replies" value={b.owner_response_rate != null ? `${Math.round(b.owner_response_rate * 100)}%` : "n/a"} hint={`Ringy's sample: ${b.scraped_review_count} reviews read${b.scraped_review_count < 5 ? " (small sample)" : ""}`} />
        </StatGrid>
        {ok && total > 0 && (
          <p className="text-caption text-subtle">
            How we got {money(total)}/mo: {keptKinds.map((x) => `${titleOf.get(x.kind) ?? x.kind} (${money(x.t!.result)})`).join(" + ")}
            {dedup.dropped.length ? `. Not added, because they can be the same customers: ${dedup.dropped.map((d) => `${titleOf.get(d.kind) ?? d.kind} (${money(d.monthly)})`).join(", ")}` : ""}. Each estimate&apos;s inputs and math are on its card below; inputs marked {ASSUMPTION_LABEL} are not measured. Rating and review count: the Google listing.
          </p>
        )}
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-footnote text-muted">
          <span>{b.phone ?? "No phone listed"}</span>
          {b.website ? (
            <a href={b.website} className="truncate text-accent hover:underline" target="_blank" rel="noreferrer">
              {b.website.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            <span>No website</span>
          )}
          <span>{b.scraped_review_count} reviews analyzed</span>
        </p>
      </div>

      {b.diagnosis_status === "failed" && (
        <Card tone="danger">
          <h2 className="text-headline text-danger">Diagnosis failed</h2>
          <p className="mt-1 text-footnote text-muted">{b.diagnosis_error}</p>
          <p className="mt-1 text-footnote text-muted">The rest of the run continued. See the agent log below.</p>
        </Card>
      )}

      {b.diagnosis_summary && (
        <Card padding="lg">
          <SectionHeader title="Summary" size="sm" />
          <p className="mt-2 text-body">{b.diagnosis_summary}</p>
          {data.run && data.run.mode.diagnoser === "stub" && <p className="mt-2 text-caption text-subtle">Demo keyword diagnoser, not an LLM.</p>}
        </Card>
      )}

      {ok && data.findings.length === 0 && (
        <Card>
          <p className="text-footnote text-muted">No evidence-backed problems found. Nothing to price.</p>
        </Card>
      )}

      {data.findings.map((f) => {
        const roi = roiByFinding.get(f.id);
        return (
          <Card key={f.id} as="article" padding="lg" className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone="accent">{KIND_LABELS[f.kind]}</Badge>
                <span className="text-caption text-muted">Severity {f.severity}/5</span>
              </div>
              <h3 className="mt-3 text-title-3">{f.title}</h3>
              <p className="mt-1 text-callout text-muted">{f.detail}</p>
            </div>

            <div>
              <h4 className="text-eyebrow uppercase text-muted">Evidence</h4>
              <ul className="mt-2 space-y-2">
                {f.evidence.map((e, i) =>
                  e.source === "review" ? (
                    <Quote key={i} source={<>Google review <Stars n={e.rating} /></>}>&ldquo;{e.quote}&rdquo;</Quote>
                  ) : e.source === "website" ? (
                    <Quote key={i} source={<>Website · <span className="break-all">{e.url}</span></>}>&ldquo;{e.quote}&rdquo;</Quote>
                  ) : (
                    <Quote key={i} source="Listing field">{e.value}</Quote>
                  ),
                )}
              </ul>
            </div>

            {roi && <RoiEditor roi={roi} readOnly={!!data.snapshot} onSaved={() => reload()} />}
            <p className="text-footnote text-muted">
              Suggested fix: <span className="font-medium text-foreground">{SOLUTIONS[f.solution].name}</span>
            </p>
          </Card>
        );
      })}

      {ok && calcRows.length > 0 && <RoiCalculatorCard rows={calcRows} />}

      {solutionIds.length > 0 && (
        <Card padding="lg" className="space-y-4">
          <SectionHeader title="Suggested solutions" size="sm" description="Proposals only. Nothing is built or sent from this report." />
          <div className="grid gap-3 sm:grid-cols-2">
            {solutionIds.map((sid) => (
              <div key={sid} className="rounded-md bg-surface-2 p-4">
                <div className="text-headline">{SOLUTIONS[sid].name}</div>
                <p className="mt-1 text-footnote text-muted">{SOLUTIONS[sid].oneLiner}</p>
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-caption text-muted">
                  {SOLUTIONS[sid].includes.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card padding="lg" className="space-y-3">
        <SectionHeader title="Website" size="sm" />
        {(data.pages ?? []).length === 0 ? (
          <p className="text-footnote text-muted">No website on the listing, so nothing was read.</p>
        ) : (
          (data.pages ?? []).map((p) => (
            <div key={p.id} className="space-y-2">
              <p className="text-caption text-muted">
                <span className="break-all">{p.url}</span> · {p.status === "ok" ? `${p.chars.toLocaleString("en-US")} characters read` : `not read: ${p.error}`}
              </p>
              {p.status === "ok" && (
                <p className="max-h-48 overflow-auto whitespace-pre-line rounded-md bg-surface-2 p-3 text-caption text-muted">
                  {p.preview}
                  {p.chars > p.preview.length ? " …" : ""}
                </p>
              )}
            </div>
          ))
        )}
      </Card>

      {data.agent && !data.snapshot && <AgentPanel agent={data.agent} voice={data.voice} isFixture={b.is_fixture} onDeployed={() => reload()} />}

      {!data.agent && (
      <Card padding="lg" className="space-y-3">
        <SectionHeader title="Knowledge on file" size="sm" description="Facts with their source. The phone agent is built from these when the run reaches this business." />
        {(data.knowledge ?? []).length === 0 ? (
          <p className="text-footnote text-muted">No facts stored.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {[...(data.knowledge ?? [])]
              .sort((a, b) => KNOWLEDGE_ORDER.indexOf(a.kind) - KNOWLEDGE_ORDER.indexOf(b.kind))
              .map((k) => (
                <li key={k.id} className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-0.5 py-2.5 sm:grid-cols-[5.5rem_10rem_1fr_auto]">
                  <span className="text-caption font-medium uppercase tracking-wider text-subtle">{k.kind}</span>
                  <span className="text-footnote text-muted">{k.label}</span>
                  <span className="col-start-2 text-footnote sm:col-start-auto">{k.value}</span>
                  <span className="col-start-2 text-caption text-subtle sm:col-start-auto sm:text-right">
                    {k.source_type === "listing" ? "Google listing" : k.source_type === "website" ? "Website" : k.source_type}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Card>
      )}

      <Card padding="lg" className="space-y-3">
        <SectionHeader title="Reviews analyzed" size="sm" />
        <ul className="divide-y divide-hairline">
          {data.reviews.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Stars n={r.rating} />
                {isSuspicious(r.text) && (
                  <Badge tone="danger" title="Instruction-like text. Fenced and redacted in prompts, never used as a fact.">
                    Prompt injection ignored
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-footnote">{r.text}</p>
              <p className="mt-1 text-caption text-muted">{r.owner_response ? `Owner replied: ${r.owner_response}` : "No owner reply"}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card padding="lg" className="space-y-5">
        <SectionHeader title="Agent log" size="sm" />
        <StepTimeline steps={data.steps} />
      </Card>
    </PageShell>
  );
}
