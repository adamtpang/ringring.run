"use client";

import { useMemo } from "react";
import { Badge, Card, SectionHeader } from "@/components/ds";
import { changeSource, weeklyView, type Change } from "@/lib/checkin/logic";
import type { Checkin, CheckinReview, CheckinSnapshot } from "@/lib/types";

export interface CheckinData {
  tracked: boolean;
  snapshots: CheckinSnapshot[];
  checkins: Checkin[];
  reviews: CheckinReview[];
}

const day = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });

function fmt(c: Change, v: number) {
  if (c.field === "reply_rate" || c.field === "neg_reply_rate") return `${Math.round(v * 100)}%`;
  return String(Math.round(v * 100) / 100);
}

export function WhatChanged({ data, planStep }: { data: CheckinData; planStep: string | null }) {
  const v = useMemo(
    () => weeklyView({ snaps: data.snapshots, checkins: data.checkins, reviews: data.reviews, tracked: data.tracked, now: new Date(), planStep }),
    [data, planStep],
  );
  const nextLine = v.next ? `Next check-in ${day(v.next)}.` : "Weekly check-ins start after the owner opts in.";
  return (
    <section id="what-changed" className="space-y-3" aria-labelledby="what-changed-title">
      <SectionHeader
        eyebrow="Weekly check-in"
        title={<span id="what-changed-title">What changed this week</span>}
        action={<Badge tone={data.tracked ? "success" : "neutral"}>{data.tracked ? "Owner opted in" : "Not tracked"}</Badge>}
      />
      <Card padding="md" as="div">
        {v.state === "none" && <p className="text-footnote text-muted">No check-ins yet. {nextLine}</p>}
        {v.state === "first" && (
          <p className="text-footnote">
            First check-in on {day(v.first)}. {v.next ? nextLine : "Weekly check-ins start after the owner opts in."}
          </p>
        )}
        {v.state === "changes" && (
          <div className="space-y-3 text-footnote">
            <p className="text-subtle">
              Since {day(v.since)}, latest check {day(v.latest)}. {nextLine}
            </p>
            <div>
              <p className="font-medium">Changes</p>
              {v.changes.length === 0 ? (
                <p className="text-muted">No change in the rating or review count.</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {v.changes.map((c) => (
                    <li key={c.field}>
                      {c.label}: {fmt(c, c.before)} → {fmt(c, c.after)}
                      <span className="block text-caption text-subtle">Source: {changeSource(c.field)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {v.newReviews > 0 && <p className="mt-1 text-muted">{v.newReviews} new review{v.newReviews === 1 ? "" : "s"} read.</p>}
            </div>
            <div>
              <p className="font-medium">What Ringy did</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {v.did.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium">Your one next step</p>
              <p className="mt-1">{v.nextStep}</p>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
