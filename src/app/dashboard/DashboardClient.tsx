"use client";

import Link from "next/link";
import { useState } from "react";
import { BusinessTable } from "@/components/BusinessTable";
import { Button, ButtonLink, Card, Field, SectionHeader } from "@/components/ds";
import { dateTime12, PageShell, RunStatusPill, runTitle, usePoll } from "@/components/ui";
import { useStartScan } from "@/components/useStartScan";
import type { BusinessWithMoney } from "@/lib/business-money";
import type { Run } from "@/lib/types";

const isActive = (r: Run) => r.status === "queued" || r.status === "running";

export function DashboardClient() {
  const [kind, setKind] = useState<"category" | "name">("category");
  const [category, setCategory] = useState("plumbers");
  const [name, setName] = useState("");
  const [city, setCity] = useState("Austin TX");
  const [maxCount, setMaxCount] = useState(10);
  const { start, submitting, error: formError } = useStartScan();

  const runs = usePoll<{ runs: Run[] }>("/api/runs", (d) => d.runs.some(isActive));
  const latest = runs.data?.runs[0];
  const latestBiz = usePoll<{ businesses: BusinessWithMoney[] }>(
    latest ? `/api/businesses?runId=${latest.id}&status=${latest.status}` : null,
    () => (latest ? isActive(latest) : false),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void start(kind === "name" ? { name, city } : { category, city, maxCount });
  }

  return (
    <PageShell>
      <SectionHeader
        level={1}
        size="lg"
        title="Scan"
        description="A category in a city, or one business by name. Google Maps, website, diagnosis, and ROI in one run."
      />

      <Card padding="lg">
        <div role="tablist" aria-label="Scan type" className="relative mb-6 inline-grid grid-cols-2 rounded-pill bg-surface-2 p-1 text-footnote ring-1 ring-inset ring-hairline">
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-pill bg-surface shadow-raised transition-transform duration-[var(--duration-spring)] ease-spring motion-reduce:transition-none"
            style={{ transform: kind === "name" ? "translateX(100%)" : "translateX(0)" }}
          />
          {(["category", "name"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onPointerDown={() => setKind(k)}
              onClick={() => setKind(k)}
              className={`pressable relative z-10 rounded-pill px-4 py-1.5 ${kind === k ? "font-medium text-foreground" : "text-muted"}`}
            >
              {k === "category" ? "Category" : "One business"}
            </button>
          ))}
        </div>
        <form
          onSubmit={submit}
          className={`grid gap-4 sm:items-end ${kind === "category" ? "sm:grid-cols-[1fr_1fr_7rem_auto]" : "sm:grid-cols-[2fr_1fr_auto]"}`}
        >
          {kind === "category" ? (
            <Field label="Category" value={category} onChange={(e) => setCategory(e.target.value)} required minLength={2} maxLength={80} />
          ) : (
            <Field
              label="Business name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={120}
              placeholder="Joe's Plumbing"
            />
          )}
          <Field label="City" value={city} onChange={(e) => setCity(e.target.value)} required minLength={2} maxLength={80} />
          {kind === "category" && (
            <Field label="Max" type="number" min={1} max={50} value={maxCount} onChange={(e) => setMaxCount(Number(e.target.value))} />
          )}
          <Button type="submit" size="lg" disabled={submitting} className="h-11 text-callout">
            {submitting ? "Starting…" : "Run scan"}
          </Button>
        </form>
        {formError && (
          <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3.5 py-2.5 text-footnote text-danger">
            {formError}
          </p>
        )}
      </Card>

      {latest && (
        <Card padding="lg" className="space-y-5">
          <SectionHeader
            eyebrow="Latest run"
            title={runTitle(latest)}
            action={
              <>
                <RunStatusPill status={latest.status} />
                <ButtonLink href={`/runs/${latest.id}`} variant="secondary" size="sm">
                  Timeline
                </ButtonLink>
              </>
            }
          />
          <BusinessTable businesses={latestBiz.data?.businesses ?? []} />
        </Card>
      )}

      <Card padding="lg" className="space-y-4">
        <SectionHeader title="History" size="sm" />
        {runs.error && <p className="text-footnote text-danger">{runs.error}</p>}
        {runs.data && runs.data.runs.length === 0 && <p className="text-footnote text-muted">No runs yet.</p>}
        <ul className="-mx-3">
          {runs.data?.runs.map((r) => (
            <li key={r.id}>
              <Link
                href={`/runs/${r.id}`}
                className="pressable flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md px-3 py-2.5 hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-callout font-medium">{runTitle(r)}</span>
                  <span className="block font-mono text-caption tabular-nums text-muted">
                    {dateTime12(r.created_at)} · {r.diagnosed_count}/{r.business_count} diagnosed
                    {r.failed_count ? ` · ${r.failed_count} failed` : ""}
                  </span>
                </span>
                <RunStatusPill status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </PageShell>
  );
}
