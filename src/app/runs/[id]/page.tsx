"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { BusinessTable } from "@/components/BusinessTable";
import { AppHeader, Card, dateTime12, RunStatusPill, runTitle, StepTimeline, usePoll } from "@/components/ui";
import type { Business, Run, RunStep } from "@/lib/types";

interface RunData {
  run: Run;
  steps: RunStep[];
  businesses: Business[];
}

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = usePoll<RunData>(`/api/runs/${id}`, (d) => d.run.status === "queued" || d.run.status === "running");

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-5 py-10">
        <Link href="/dashboard" className="text-sm text-accent hover:underline">Back to dashboard</Link>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {data && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  {runTitle(data.run)}
                </h1>
                <p className="mt-1 text-sm text-muted">
                  Started {dateTime12(data.run.created_at)} · up to {data.run.max_count} businesses · scraper {data.run.mode.scraper}, diagnoser{" "}
                  {data.run.mode.diagnoser}
                  {data.run.mode.llm_model ? ` (${data.run.mode.llm_model})` : ""}, store {data.run.mode.store}
                </p>
              </div>
              <RunStatusPill status={data.run.status} />
            </div>
            {data.run.error && (
              <p className={`rounded-xl px-4 py-3 text-sm ${data.run.status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                {data.run.error}
              </p>
            )}
            <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
              <Card>
                <h2 className="mb-4 text-lg font-semibold">Ranked by opportunity</h2>
                <BusinessTable businesses={data.businesses} />
              </Card>
              <Card>
                <h2 className="mb-1 text-lg font-semibold">Agent timeline</h2>
                <p className="mb-4 text-xs text-muted">
                  {data.run.diagnosed_count} diagnosed, {data.run.failed_count} failed of {data.run.business_count}. Updates live while the run is going.
                </p>
                <StepTimeline steps={data.steps} />
              </Card>
            </div>
          </>
        )}
      </main>
    </>
  );
}
