"use client";

import { useParams } from "next/navigation";
import { BusinessTable } from "@/components/BusinessTable";
import { ButtonLink, Card, SectionHeader, Stat, StatGrid } from "@/components/ds";
import { Stopwatch } from "@/components/Stopwatch";
import { BackLink, dateTime12, money, PageShell, RunStatusPill, runTitle, StepTimeline, usePoll } from "@/components/ui";
import { stepsWithCurrentFigures, type BusinessWithMoney } from "@/lib/business-money";
import { runMoney, runMoneyHow } from "@/lib/roi";
import type { Run, RunStep } from "@/lib/types";

interface RunData {
  run: Run;
  steps: RunStep[];
  businesses: BusinessWithMoney[];
  agents?: { id: string; business_id: string; status: string; ready_ms: number | null }[];
}

function elapsed(run: Run) {
  if (!run.started_at) return "n/a";
  const end = run.finished_at ? new Date(run.finished_at).getTime() : Date.now();
  const s = Math.max(0, (end - new Date(run.started_at).getTime()) / 1000);
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = usePoll<RunData>(`/api/runs/${id}`, (d) => d.run.status === "queued" || d.run.status === "running");
  const rm = runMoney((data?.businesses ?? []).filter((b) => b.diagnosis_status === "ok").map((b) => ({ name: b.name, money: b.money })));

  return (
    <PageShell>
      <BackLink href="/dashboard">Scans</BackLink>
      {error && <p className="rounded-md bg-danger-soft px-4 py-3 text-footnote text-danger">{error}</p>}
      {!data && !error && <p className="text-footnote text-muted">Loading run…</p>}
      {data && (
        <>
          <SectionHeader
            level={1}
            size="lg"
            title={runTitle(data.run)}
            description={
              <>
                {dateTime12(data.run.created_at)} · up to {data.run.max_count} · {data.run.mode.scraper} scraper, {data.run.mode.diagnoser} diagnoser
                {data.run.mode.llm_model ? ` (${data.run.mode.llm_model})` : ""}, {data.run.mode.store} store
              </>
            }
            action={<RunStatusPill status={data.run.status} />}
          />
          {data.run.error && (
            <p
              className={`rounded-md px-4 py-3 text-footnote ${data.run.status === "failed" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}
            >
              {data.run.error}
            </p>
          )}
          <Stopwatch
            createdAt={data.run.created_at}
            readyMs={data.run.agent_ready_ms}
            active={data.run.status === "queued" || data.run.status === "running"}
            label={data.run.search_kind === "name" ? "Business named to agent ready" : "Scan started to first agent ready"}
            note={
              data.run.mode.scraper === "fixture" && data.run.mode.diagnoser === "stub"
                ? `Fixture run: no scraping or network calls, so this is near zero (${data.run.agent_ready_ms ?? 0} ms). A live run includes Apify and the LLM.`
                : undefined
            }
          />
          <StatGrid>
            <Stat label="Businesses" value={data.run.business_count} />
            <Stat label="Diagnosed" value={data.run.diagnosed_count} hint={data.run.failed_count ? `${data.run.failed_count} failed` : undefined} />
            <Stat
              label="Est. / month"
              value={rm.total == null ? "Not estimated" : money(rm.total)}
              hint={rm.total == null ? "No dollar inputs on file" : `Sum of ${rm.parts.length} business estimates`}
              emphasis
            />
            <Stat
              label="Agents ready"
              value={data.agents?.length ?? 0}
              hint={`Run total ${elapsed(data.run)}`}
            />
          </StatGrid>
          <details className="-mt-2 rounded-md px-1 text-caption text-muted">
            <summary className="cursor-pointer select-none text-footnote text-subtle">How we got this</summary>
            <p className="mt-1">{runMoneyHow(rm)}</p>
            <p className="mt-1">Each business figure is rebuilt from its own inputs (mostly default assumptions to confirm with the owner). Hover a figure in the list for its math.</p>
          </details>
          <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card padding="lg" className="space-y-4">
              <SectionHeader
                title="Ranked by opportunity"
                size="sm"
                action={
                  data.agents?.[0] ? (
                    <ButtonLink href={`/evals?businessId=${data.businesses[0]?.id ?? data.agents[0].business_id}`} variant="secondary" size="sm">
                      Simulated calls
                    </ButtonLink>
                  ) : undefined
                }
              />
              <BusinessTable businesses={data.businesses} />
            </Card>
            <Card padding="lg" className="space-y-5 lg:sticky lg:top-20">
              <SectionHeader
                title="Agent timeline"
                size="sm"
                description={data.run.status === "running" || data.run.status === "queued" ? "Updating live." : `${data.steps.length} steps.`}
              />
              <StepTimeline steps={stepsWithCurrentFigures(data.steps, data.businesses)} />
            </Card>
          </div>
        </>
      )}
    </PageShell>
  );
}
