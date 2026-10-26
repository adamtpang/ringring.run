"use client";

import Link from "next/link";
import type { Business } from "@/lib/types";
import { money } from "./ui";

export function BusinessTable({ businesses }: { businesses: Business[] }) {
  if (businesses.length === 0) return <p className="text-sm text-muted">No businesses yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3 font-medium">#</th>
            <th className="py-2 pr-3 font-medium">Business</th>
            <th className="py-2 pr-3 font-medium">Rating</th>
            <th className="py-2 pr-3 font-medium">Score</th>
            <th className="py-2 pr-3 text-right font-medium">Est. monthly value</th>
          </tr>
        </thead>
        <tbody>
          {businesses.map((b, i) => (
            <tr key={b.id} className="border-b border-hairline last:border-0 hover:bg-black/[0.02]">
              <td className="py-3 pr-3 tabular-nums text-muted">{i + 1}</td>
              <td className="py-3 pr-3">
                <Link href={`/businesses/${b.id}`} className="font-medium hover:text-accent">
                  {b.name}
                </Link>
                {b.is_fixture && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">fictional</span>}
                <div className="text-xs text-muted">{b.address ?? b.city ?? ""}</div>
              </td>
              <td className="py-3 pr-3 tabular-nums">
                {b.rating ?? "n/a"}
                <span className="text-xs text-muted"> ({b.review_count ?? 0})</span>
              </td>
              <td className="py-3 pr-3">
                {b.diagnosis_status === "ok" ? (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/5">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${b.opportunity_score}%` }} />
                    </div>
                    <span className="tabular-nums">{b.opportunity_score}</span>
                  </div>
                ) : (
                  <span
                    className={`text-xs ${b.diagnosis_status === "failed" ? "text-red-700" : "text-muted"}`}
                    title={b.diagnosis_error ?? undefined}
                  >
                    {b.diagnosis_status === "failed" ? "diagnosis failed" : b.diagnosis_status}
                  </span>
                )}
              </td>
              <td className="py-3 pr-3 text-right font-medium tabular-nums">
                {b.diagnosis_status === "ok" ? money(b.est_monthly_value) : "n/a"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">
        Estimates only. Each value is the product of stated assumptions you can open and edit on the business report.
      </p>
    </div>
  );
}
