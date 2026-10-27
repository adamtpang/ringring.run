"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Badge, Button, Card, SectionHeader, Stat, StatGrid } from "@/components/ds";
import { BackLink, dateTime12, PageShell, usePoll } from "@/components/ui";
import type { CaseResult, EvalReport } from "@/lib/evals/types";

interface EvalData {
  report: EvalReport;
  source: "stored" | "fixture";
  is_fixture: boolean;
  responders: { id: string; name: string; available: boolean; reason: string | null }[];
}

const CHECK_LABEL: Record<string, string> = {
  disclosure: "AI disclosure",
  facts: "Facts vs KB",
  task: "Task",
  hallucination: "No hallucination",
  latency: "Latency",
};

function CaseCard({ c }: { c: CaseResult }) {
  const tone = c.status === "pass" ? "success" : c.status === "fail" ? "danger" : "neutral";
  return (
    <Card as="li" padding="md" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-headline">{c.title}</h3>
          <p className="text-footnote text-muted">{c.goal}</p>
        </div>
        <Badge tone={tone} dot>
          {c.status === "pass" ? "Pass" : c.status === "fail" ? "Fail" : "Skipped"}
        </Badge>
      </div>
      {c.status === "skipped" ? (
        <p className="text-footnote text-muted">{c.skip_reason}</p>
      ) : (
        <>
          <ol className="space-y-1.5">
            {c.transcript.map((t, i) => (
              <li key={i} className="grid grid-cols-[3.5rem_1fr] gap-2 text-footnote">
                <span className="text-caption font-medium uppercase tracking-wider text-subtle">{t.role === "agent" ? "Agent" : "Caller"}</span>
                <span className={t.role === "agent" ? "" : "text-muted"}>
                  {t.text}
                  {t.latency_ms != null && (
                    <span className="ml-2 font-mono text-caption tabular-nums text-subtle">{t.latency_ms.toFixed(1)} ms</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <ul className="flex flex-wrap gap-1.5">
            {c.checks.map((x) => (
              <li key={x.name}>
                <Badge tone={x.pass ? "success" : "danger"} title={x.detail}>
                  {x.pass ? "✓" : "✕"} {CHECK_LABEL[x.name] ?? x.name}
                </Badge>
              </li>
            ))}
          </ul>
          {c.checks.some((x) => !x.pass) && (
            <ul className="space-y-0.5 text-caption text-danger">
              {c.checks.filter((x) => !x.pass).map((x) => (
                <li key={x.name}>
                  {CHECK_LABEL[x.name]}: {x.detail}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function Evals() {
  const params = useSearchParams();
  const businessId = params.get("businessId");
  const [responder, setResponder] = useState<"fixture" | "llm">("fixture");
  const q = new URLSearchParams();
  if (businessId) q.set("businessId", businessId);
  q.set("responder", responder);
  const { data, error } = usePoll<EvalData>(`/api/evals?${q}`, () => false);
  const r = data?.report;
  const llm = data?.responders.find((x) => x.id === "llm");
  const voice = data?.responders.find((x) => x.id === "voice");

  return (
    <PageShell>
      {businessId ? <BackLink href={`/businesses/${businessId}#agent`}>Business report</BackLink> : <BackLink href="/dashboard">Scans</BackLink>}
      <SectionHeader
        level={1}
        size="lg"
        eyebrow="Simulated calls"
        title={r ? `${r.business_name} phone agent` : "Phone agent evals"}
        description="Scripted callers talk to the generated agent in text. Each reply is graded for AI disclosure, facts against the knowledge base, the task, invented claims, and turn latency."
        action={
          r ? (
            <Badge tone={r.failed ? "danger" : "success"} dot>
              {r.passed}/{r.passed + r.failed} passed
            </Badge>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={responder === "fixture" ? "primary" : "secondary"} onClick={() => setResponder("fixture")}>
          Fixture responder
        </Button>
        <Button
          size="sm"
          variant={responder === "llm" ? "primary" : "secondary"}
          onClick={() => setResponder("llm")}
          disabled={!llm?.available}
          title={llm?.reason ?? undefined}
        >
          LLM responder
        </Button>
        <Button size="sm" variant="secondary" disabled title={voice?.reason ?? undefined}>
          Voice responder
        </Button>
        <Badge tone="neutral">Next</Badge>
      </div>
      <p className="-mt-4 text-caption text-muted">
        The fixture responder is a rule-based stand-in that follows the agent config exactly. It tests the config and the grader, not a model.
        {llm && !llm.available ? ` LLM responder: ${llm.reason}` : ""} Voice: simulated calls over audio are not built yet.
      </p>

      {error && <p className="rounded-md bg-danger-soft px-4 py-3 text-footnote text-danger">{error}</p>}
      {!data && !error && <p className="text-footnote text-muted">Running simulated calls…</p>}
      {r && data && (
        <>
          <StatGrid>
            <Stat
              label="Pass rate"
              value={r.passed + r.failed ? `${Math.round((100 * r.passed) / (r.passed + r.failed))}%` : "No cases"}
              hint={`${r.passed} passed ÷ ${r.passed + r.failed} cases, this run`}
              emphasis
            />
            <Stat label="Failed" value={r.failed} hint={r.skipped ? `${r.skipped} skipped` : undefined} />
            <Stat
              label="Slowest turn"
              value={`${Math.max(0, ...r.cases.map((c) => c.latency_ms.max)).toFixed(1)} ms`}
              hint={`Budget ${r.latency_budget_ms / 1000} s`}
            />
            <Stat label="Hallucination flags" value={r.cases.reduce((s, c) => s + c.hallucinations.length, 0)} />
          </StatGrid>
          <p className="flex flex-wrap items-center gap-2 text-footnote text-muted">
            {data.is_fixture && <Badge tone="warning">Demo data</Badge>}
            {data.source === "fixture"
              ? "No stored agent yet, so this uses an in-memory agent built from fixture data."
              : (
                <>
                  Agent for{" "}
                  <Link className="text-accent hover:underline" href={`/businesses/${r.business_id}#agent`}>
                    {r.business_name}
                  </Link>
                </>
              )}
            <span>· {r.responder.name} · ran {dateTime12(r.ran_at)}</span>
          </p>
          <ul className="grid gap-4 lg:grid-cols-2">
            {r.cases.map((c) => (
              <CaseCard key={c.id} c={c} />
            ))}
          </ul>
        </>
      )}
    </PageShell>
  );
}

export default function EvalsPage() {
  return (
    <Suspense fallback={null}>
      <Evals />
    </Suspense>
  );
}
