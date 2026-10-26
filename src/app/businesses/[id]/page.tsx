"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AppHeader, Card, money, StepTimeline, usePoll } from "@/components/ui";
import { computeMonthlyValue, opportunityScore } from "@/lib/roi";
import { KIND_LABELS, SOLUTIONS } from "@/lib/solutions";
import type { Assumption, Business, Finding, KnowledgeFact, Review, RoiEstimate, Run, RunStep, SolutionId, WebPage } from "@/lib/types";

interface Report {
  business: Business;
  run: Run | null;
  reviews: Review[];
  findings: Finding[];
  roi: RoiEstimate[];
  steps: RunStep[];
  pages: (Omit<WebPage, "text"> & { chars: number; preview: string })[];
  knowledge: KnowledgeFact[];
}

const KNOWLEDGE_ORDER = ["contact", "hours", "service", "price", "policy", "faq", "service_area"];

function Stars({ n }: { n: number | null }) {
  if (n == null) return null;
  return <span className="text-amber-500" aria-label={`${n} stars`}>{"★".repeat(n)}<span className="text-black/15">{"★".repeat(5 - n)}</span></span>;
}

function fmt(a: Assumption) {
  if (a.unit === "usd") return money(a.value);
  if (a.unit === "ratio") return `${Math.round(a.value * 1000) / 10}%`;
  return String(a.value);
}

function RoiEditor({ roi, onSaved }: { roi: RoiEstimate; onSaved: () => void }) {
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
    <div className="mt-4 rounded-xl bg-background p-4 ring-1 ring-hairline">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Estimate {roi.is_edited && !dirty ? "(edited)" : ""}
        </span>
        <span className="text-xl font-semibold tabular-nums">
          {live.value == null ? "invalid" : `${money(live.value)}/mo`}
          {dirty && <span className="ml-2 text-xs font-normal text-accent">unsaved</span>}
        </span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {roi.assumptions.map((a, i) => (
            <tr key={a.key} className="border-t border-hairline first:border-0">
              <td className="py-1.5 pr-2 text-muted">{i > 0 ? "x " : ""}</td>
              <td className="py-1.5 pr-3">
                {a.label}
                {a.note && <div className="text-xs text-muted">{a.note}</div>}
              </td>
              <td className="py-1.5 text-right">
                <input
                  aria-label={a.label}
                  type="number"
                  step={a.unit === "ratio" ? 0.01 : a.unit === "multiplier" ? 0.01 : 1}
                  min={0}
                  max={a.unit === "ratio" ? 1 : undefined}
                  value={draft[a.key] ?? String(a.value)}
                  onChange={(e) => setDraft((d) => ({ ...d, [a.key]: e.target.value }))}
                  className="w-24 rounded-lg border border-hairline bg-white px-2 py-1 text-right tabular-nums outline-none focus:ring-2 focus:ring-accent/40"
                />
                <div className="text-[11px] text-muted">{a.unit === "ratio" ? `ratio (${fmt(a)})` : a.unit}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(live.error || err) && <p className="mt-2 text-xs text-red-700">{live.error ?? err}</p>}
      <div className="mt-3 flex gap-2">
        <button
          disabled={!dirty || saving || live.value == null}
          onClick={() => send({ assumptions: Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Number(v)])) })}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Save
        </button>
        <button
          disabled={saving || (!roi.is_edited && !dirty)}
          onClick={() => (dirty && !roi.is_edited ? setDraft({}) : send({ assumptions: {}, reset: true }))}
          className="rounded-full px-4 py-1.5 text-xs font-medium text-accent ring-1 ring-hairline disabled:opacity-40"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

export default function BusinessPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = usePoll<Report>(`/api/businesses/${id}`, (d) => d.business.diagnosis_status === "running" || d.business.diagnosis_status === "pending");

  const roiByFinding = useMemo(() => new Map((data?.roi ?? []).map((r) => [r.finding_id, r])), [data]);
  const solutionIds = useMemo(() => [...new Set((data?.findings ?? []).map((f) => f.solution))] as SolutionId[], [data]);

  if (error) return (<><AppHeader /><main className="mx-auto max-w-4xl px-5 py-10 text-sm text-red-700">{error}</main></>);
  if (!data) return (<><AppHeader /><main className="mx-auto max-w-4xl px-5 py-10 text-sm text-muted">Loading report...</main></>);

  const b = data.business;
  const total = data.roi.reduce((s, r) => s + r.monthly_value, 0);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-8 px-5 py-10">
        <Link href={`/runs/${b.run_id}`} className="text-sm text-accent hover:underline">Back to run</Link>

        <div>
          {b.is_fixture && (
            <p className="mb-3 inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
              Demo data: this business and its reviews are fictional
            </p>
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{b.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {[b.category, b.address].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Est. monthly value", b.diagnosis_status === "ok" ? money(total) : "n/a"],
              ["Opportunity score", b.diagnosis_status === "ok" ? String(opportunityScore(total)) : "n/a"],
              ["Rating", b.rating != null ? `${b.rating} (${b.review_count ?? 0})` : "n/a"],
              ["Owner reply rate", b.owner_response_rate != null ? `${Math.round(b.owner_response_rate * 100)}%` : "n/a"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white p-3 ring-1 ring-hairline">
                <div className="text-xs text-muted">{k}</div>
                <div className="text-lg font-semibold tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Phone {b.phone ?? "not listed"} · Website {b.website ? <a href={b.website} className="text-accent" target="_blank" rel="noreferrer">{b.website}</a> : "not listed"} · {b.scraped_review_count} reviews analyzed
          </p>
        </div>

        {b.diagnosis_status === "failed" && (
          <Card className="ring-red-200">
            <h2 className="font-semibold text-red-700">Diagnosis failed</h2>
            <p className="mt-1 text-sm text-muted">{b.diagnosis_error}</p>
            <p className="mt-1 text-sm text-muted">The rest of the run continued. See the agent log below.</p>
          </Card>
        )}

        {b.diagnosis_summary && (
          <Card>
            <h2 className="text-lg font-semibold">Summary</h2>
            <p className="mt-1 text-sm">{b.diagnosis_summary}</p>
            {data.run && data.run.mode.diagnoser === "stub" && (
              <p className="mt-2 text-xs text-muted">Diagnosed by the demo keyword diagnoser, not an LLM.</p>
            )}
          </Card>
        )}

        {b.diagnosis_status === "ok" && data.findings.length === 0 && (
          <Card><p className="text-sm text-muted">No evidence-backed problems found. Nothing to price.</p></Card>
        )}

        {data.findings.map((f) => {
          const roi = roiByFinding.get(f.id);
          return (
            <Card key={f.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-accent">{KIND_LABELS[f.kind]}</span>
                <span className="text-xs text-muted">Severity {f.severity} of 5</span>
              </div>
              <h3 className="mt-1 text-xl font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.detail}</p>

              <h4 className="mt-5 text-xs font-medium uppercase tracking-wide text-muted">Evidence</h4>
              <ul className="mt-2 space-y-2">
                {f.evidence.map((e, i) =>
                  e.source === "review" ? (
                    <li key={i} className="border-l-2 border-accent/40 pl-3 text-sm">
                      <span className="italic">&ldquo;{e.quote}&rdquo;</span>
                      <div className="text-xs text-muted">Google review <Stars n={e.rating} /></div>
                    </li>
                  ) : e.source === "website" ? (
                    <li key={i} className="border-l-2 border-accent/40 pl-3 text-sm">
                      <span className="italic">&ldquo;{e.quote}&rdquo;</span>
                      <div className="text-xs text-muted">
                        Business website <span className="break-all">{e.url}</span>
                      </div>
                    </li>
                  ) : (
                    <li key={i} className="border-l-2 border-black/15 pl-3 text-sm">
                      {e.value}
                      <div className="text-xs text-muted">Listing field</div>
                    </li>
                  ),
                )}
              </ul>

              {roi && <RoiEditor roi={roi} onSaved={() => reload()} />}
              <p className="mt-3 text-sm">
                Suggested fix: <span className="font-medium">{SOLUTIONS[f.solution].name}</span>
              </p>
            </Card>
          );
        })}

        {solutionIds.length > 0 && (
          <Card>
            <h2 className="text-lg font-semibold">Suggested solutions</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {solutionIds.map((sid) => (
                <div key={sid} className="rounded-xl bg-background p-4 ring-1 ring-hairline">
                  <div className="font-medium">{SOLUTIONS[sid].name}</div>
                  <p className="mt-1 text-sm text-muted">{SOLUTIONS[sid].oneLiner}</p>
                  <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                    {SOLUTIONS[sid].includes.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">Proposals only. Nothing is built or sent to the business from this report.</p>
          </Card>
        )}

        <Card>
          <h2 className="text-lg font-semibold">Website</h2>
          {(data.pages ?? []).length === 0 ? (
            <p className="mt-1 text-sm text-muted">No website on the listing, so nothing was read.</p>
          ) : (
            (data.pages ?? []).map((p) => (
              <div key={p.id} className="mt-2 text-sm">
                <div className="text-xs text-muted">
                  <span className="break-all">{p.url}</span> ·{" "}
                  {p.status === "ok" ? `read ${p.chars.toLocaleString("en-US")} characters` : `not read: ${p.error}`}
                </div>
                {p.status === "ok" && <p className="mt-2 whitespace-pre-line rounded-lg bg-background p-3 text-xs ring-1 ring-hairline">{p.preview}{p.chars > p.preview.length ? " ..." : ""}</p>}
              </div>
            ))
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Knowledge on file</h2>
          <p className="mt-1 text-xs text-muted">
            Facts stored with their source, ready for a future phone agent knowledge pack. No phone agent is built yet.
          </p>
          {(data.knowledge ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted">No facts stored.</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <tbody>
                {[...(data.knowledge ?? [])]
                  .sort((a, b) => KNOWLEDGE_ORDER.indexOf(a.kind) - KNOWLEDGE_ORDER.indexOf(b.kind))
                  .map((k) => (
                    <tr key={k.id} className="border-b border-hairline align-top last:border-0">
                      <td className="py-1.5 pr-3 text-xs uppercase tracking-wide text-muted">{k.kind}</td>
                      <td className="py-1.5 pr-3 text-muted">{k.label}</td>
                      <td className="py-1.5 pr-3">{k.value}</td>
                      <td className="py-1.5 text-xs text-muted">{k.source_type === "listing" ? "Google listing" : k.source_type === "website" ? "Website" : k.source_type}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-semibold">Reviews analyzed</h2>
          <ul>
            {data.reviews.map((r) => (
              <li key={r.id} className="border-b border-hairline py-2 text-sm last:border-0">
                <Stars n={r.rating} /> <span>{r.text}</span>
                {r.owner_response ? <div className="mt-1 text-xs text-muted">Owner replied: {r.owner_response}</div> : <div className="mt-1 text-xs text-muted">No owner reply</div>}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Agent log for this business</h2>
          <StepTimeline steps={data.steps} />
        </Card>
      </main>
    </>
  );
}
