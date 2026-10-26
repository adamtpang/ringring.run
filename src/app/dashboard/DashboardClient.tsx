"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BusinessTable } from "@/components/BusinessTable";
import { AppHeader, Card, dateTime12, RunStatusPill, runTitle, usePoll } from "@/components/ui";
import type { Business, Run } from "@/lib/types";

const isActive = (r: Run) => r.status === "queued" || r.status === "running";

export function DashboardClient() {
  const router = useRouter();
  const [kind, setKind] = useState<"category" | "name">("category");
  const [category, setCategory] = useState("plumbers");
  const [name, setName] = useState("");
  const [city, setCity] = useState("Austin TX");
  const [maxCount, setMaxCount] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const runs = usePoll<{ runs: Run[] }>("/api/runs", (d) => d.runs.some(isActive));
  const latest = runs.data?.runs[0];
  const latestBiz = usePoll<{ businesses: Business[] }>(
    latest ? `/api/businesses?runId=${latest.id}&status=${latest.status}` : null,
    () => (latest ? isActive(latest) : false),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "name" ? { name, city } : { category, city, maxCount }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.issues?.join("; ") || body.error || "Scan failed to start");
      router.push(`/runs/${body.run.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-5 py-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Scan a market or one business</h1>
          <p className="mt-1 text-muted">
            Pick a category and a city, or look up one business by name. The agent pulls Google Maps data, reads each website, diagnoses each
            business, and prices what it finds.
          </p>
        </div>

        <Card>
          <div role="tablist" aria-label="Scan type" className="mb-4 inline-flex rounded-full bg-background p-1 text-sm ring-1 ring-hairline">
            {(["category", "name"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
                className={`rounded-full px-4 py-1.5 ${kind === k ? "bg-white font-medium shadow-sm" : "text-muted"}`}>
                {k === "category" ? "Category and city" : "One business by name"}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className={`grid gap-4 sm:items-end ${kind === "category" ? "sm:grid-cols-[1fr_1fr_8rem_auto]" : "sm:grid-cols-[2fr_1fr_auto]"}`}>
            {kind === "category" ? (
              <label className="block text-sm">
                <span className="text-muted">Category</span>
                <input value={category} onChange={(e) => setCategory(e.target.value)} required minLength={2} maxLength={80}
                  className="mt-1 w-full rounded-xl border border-hairline bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
              </label>
            ) : (
              <label className="block text-sm">
                <span className="text-muted">Business name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120}
                  placeholder="Joe's Plumbing"
                  className="mt-1 w-full rounded-xl border border-hairline bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
              </label>
            )}
            <label className="block text-sm">
              <span className="text-muted">City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} required minLength={2} maxLength={80}
                className="mt-1 w-full rounded-xl border border-hairline bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
            </label>
            {kind === "category" && (
              <label className="block text-sm">
                <span className="text-muted">Max businesses</span>
                <input type="number" min={1} max={50} value={maxCount} onChange={(e) => setMaxCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-hairline bg-background px-3 py-2 tabular-nums outline-none focus:ring-2 focus:ring-accent/40" />
              </label>
            )}
            <button type="submit" disabled={submitting}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-[#0077ed] disabled:opacity-50">
              {submitting ? "Starting..." : "Run scan"}
            </button>
          </form>
          {formError && <p className="mt-3 text-sm text-red-700">{formError}</p>}
        </Card>

        {latest && (
          <Card>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                Latest run: {runTitle(latest)}
              </h2>
              <div className="flex items-center gap-3 text-sm">
                <RunStatusPill status={latest.status} />
                <Link href={`/runs/${latest.id}`} className="text-accent hover:underline">Timeline and logs</Link>
              </div>
            </div>
            <BusinessTable businesses={latestBiz.data?.businesses ?? []} />
          </Card>
        )}

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Runs</h2>
          {runs.error && <p className="text-sm text-red-700">{runs.error}</p>}
          {runs.data && runs.data.runs.length === 0 && <p className="text-sm text-muted">No runs yet. Start a scan above.</p>}
          <ul>
            {runs.data?.runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline py-2.5 text-sm last:border-0">
                <Link href={`/runs/${r.id}`} className="font-medium hover:text-accent">
                  {runTitle(r)}
                </Link>
                <span className="flex items-center gap-3 text-muted">
                  <span className="tabular-nums">
                    {r.diagnosed_count}/{r.business_count} diagnosed{r.failed_count ? `, ${r.failed_count} failed` : ""}
                  </span>
                  <RunStatusPill status={r.status} />
                  <span className="text-xs">{dateTime12(r.created_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </main>
    </>
  );
}
