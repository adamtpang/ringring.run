"use client";

import Link from "next/link";
import type { Business } from "@/lib/types";
import { Badge } from "./ds";
import { money } from "./ui";

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-pill bg-surface-2 ring-1 ring-inset ring-hairline" aria-hidden="true">
        <div className="h-full rounded-pill bg-accent transition-[width] duration-[var(--duration-spring)] ease-spring" style={{ width: `${score}%` }} />
      </div>
      <span className="w-6 text-right tabular-nums">{score}</span>
    </div>
  );
}

/** Businesses ranked by opportunity. Rows are full-width tap targets that open the report. */
export function BusinessTable({ businesses }: { businesses: Business[] }) {
  if (businesses.length === 0) return <p className="text-footnote text-muted">No businesses yet.</p>;
  return (
    <div>
      <div className="hidden grid-cols-[1.5rem_1fr_4.5rem_6rem_6.5rem] gap-3 px-3 pb-2 text-caption font-medium text-subtle sm:grid">
        <span>#</span>
        <span>Business</span>
        <span>Rating</span>
        <span>Score</span>
        <span className="text-right">Est. / month</span>
      </div>
      <ol className="-mx-1 space-y-0.5">
        {businesses.map((b, i) => {
          const ok = b.diagnosis_status === "ok";
          return (
            <li key={b.id} className="timeline-enter">
              <Link
                href={`/businesses/${b.id}`}
                className="pressable grid grid-cols-[1.5rem_1fr_auto] items-center gap-x-3 gap-y-1 rounded-md px-3 py-2.5 text-footnote hover:bg-surface-2 sm:grid-cols-[1.5rem_1fr_4.5rem_6rem_6.5rem]"
              >
                <span className="tabular-nums text-subtle">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-callout font-medium">{b.name}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-caption text-muted">
                    {b.is_fixture && <Badge tone="warning" className="h-[1.125rem] shrink-0 px-1.5 text-[0.6875rem]">Fictional</Badge>}
                    <span className="truncate">{b.address ?? b.city ?? ""}</span>
                  </span>
                </span>
                <span className="hidden tabular-nums sm:block">
                  {b.rating ?? "n/a"}
                  <span className="text-caption text-subtle"> ({b.review_count ?? 0})</span>
                </span>
                <span className="hidden sm:block">
                  {ok ? (
                    <ScoreBar score={b.opportunity_score} />
                  ) : (
                    <span className={`text-caption ${b.diagnosis_status === "failed" ? "text-danger" : "text-muted"}`} title={b.diagnosis_error ?? undefined}>
                      {b.diagnosis_status === "failed" ? "Diagnosis failed" : b.diagnosis_status}
                    </span>
                  )}
                </span>
                <span className="text-right text-callout font-semibold tabular-nums">
                  {ok ? money(b.est_monthly_value) : <span className="text-caption font-normal text-muted">{b.diagnosis_status === "failed" ? "Failed" : "n/a"}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 px-2 text-caption text-subtle">Estimates. Open a business to see and edit the assumptions.</p>
    </div>
  );
}
