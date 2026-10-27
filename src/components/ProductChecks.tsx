"use client";

import Link from "next/link";
import { Badge, Card, SectionHeader } from "@/components/ds";
import { usePoll } from "@/components/ui";
import type { ProductEvalReport } from "@/lib/evals/product";

/** Rule checks computed from real saved reports, one row per check. */
export function ProductChecks() {
  const { data, error } = usePoll<ProductEvalReport>("/api/evals/product", () => false);
  const passed = data ? data.checks.filter((c) => !c.fail).length : 0;
  return (
    <section className="space-y-4" id="product-checks">
      <SectionHeader
        size="md"
        eyebrow="Checks on real reports"
        title="Does every report follow the rules?"
        description="Each check rebuilds what the report pages show from saved scans and tests one rule. Counts are businesses: pass, fail, or n/a when the rule has nothing to check (for example, no dollar estimates)."
        action={
          data ? (
            <Badge tone={passed === data.checks.length ? "success" : "danger"} dot>
              {passed}/{data.checks.length} checks pass
            </Badge>
          ) : undefined
        }
      />
      {error && <p className="rounded-md bg-danger-soft px-4 py-3 text-footnote text-danger">{error}</p>}
      {!data && !error && <p className="text-footnote text-muted">Checking saved reports…</p>}
      {data && (
        <>
          <p className="flex flex-wrap items-center gap-2 text-footnote text-muted" data-eval-source={data.source.kind}>
            {data.source.kind === "snapshot" ? <Badge tone="warning">Saved snapshot</Badge> : <Badge tone="success">Live store</Badge>}
            <span>{data.source.label}</span>
          </p>
          <Card padding="none" className="overflow-hidden">
            <ul className="divide-y divide-hairline">
              {data.checks.map((c) => (
                <li key={c.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-start" data-check={c.id}>
                  <div className="min-w-0">
                    <h3 className="text-headline">{c.title}</h3>
                    <p className="text-footnote text-muted">{c.checks}</p>
                    {c.failures.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {c.failures.map((f, i) => (
                          <li key={i} className="break-words rounded-md bg-danger-soft px-3 py-2 text-caption text-danger">
                            <span className="font-medium">{f.business}:</span> {f.detail}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    <Badge tone={c.fail ? "danger" : "success"} dot>
                      {c.fail ? "Fail" : "Pass"}
                    </Badge>
                    <span className="font-mono text-caption tabular-nums text-subtle">
                      {c.pass} pass · {c.fail} fail{c.skipped ? ` · ${c.skipped} n/a` : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <details className="text-footnote text-muted">
            <summary className="cursor-pointer">Reports checked ({data.businesses.length})</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {data.businesses.map((b) => (
                <li key={b.id}>
                  <Link className="text-accent hover:underline" href={`/businesses/${b.id}/diagnosis`}>
                    {b.name}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
