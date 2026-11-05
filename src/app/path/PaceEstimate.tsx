"use client";

import { useState } from "react";
import { Badge } from "@/components/ds";
import { EXTRA_REVIEWS_PER_WEEK, daysToMatchReviews } from "@/lib/path-to-one";

/** Review-count timeline only. The current pace is included only when the scan fully counted 90 days. */
export function PaceEstimate({ reviewGap, per90 }: { reviewGap: number; per90: number | null }) {
  const [extra, setExtra] = useState(EXTRA_REVIEWS_PER_WEEK);
  const days = daysToMatchReviews(reviewGap, per90, extra);
  const perDay = (per90 != null && per90 > 0 ? per90 / 90 : 0) + (extra > 0 ? extra / 7 : 0);
  return (
    <div className="mt-3 rounded-md bg-warning-soft p-3 text-warning">
      <p className="text-caption font-medium">
        Estimate, not a guarantee <Badge tone="warning">Default</Badge>
      </p>
      <p className="mt-1 text-footnote">
        Days to match #1&apos;s review count only. This is not a date the score reaches #1, and it is not a promise that the business gets there.
      </p>
      <label className="mt-3 block text-caption">
        Extra reviews per week with the review card
        <span className="mt-1 flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={extra}
            aria-label="Extra reviews per week"
            onChange={(e) => setExtra(Number(e.target.value))}
            className="h-2 min-w-0 flex-1 accent-[#217748]"
          />
          <input
            type="number"
            min={0}
            max={10}
            value={extra}
            aria-label="Extra reviews per week number"
            onChange={(e) => setExtra(Number(e.target.value) || 0)}
            className="h-9 w-16 rounded-md bg-surface px-2 text-right text-footnote text-foreground tabular-nums ring-1 ring-inset ring-hairline"
          />
        </span>
      </label>
      <p className="mt-2 text-caption">
        Labeled default: {EXTRA_REVIEWS_PER_WEEK} extra review per week if the owner asks customers. Not measured. Not a cited uplift.
        {per90 == null ? " Current pace is not in this math, because the scan did not fully count 90 days." : ` Current pace in the math: ${per90} reviews in 90 days.`}
      </p>
      <p className="mt-2 text-footnote tabular-nums">
        {days == null
          ? "No timeline at these inputs."
          : `${reviewGap} reviews / ${perDay.toFixed(3)} per day = ${days} days (about ${Math.ceil(days / 7)} weeks). Estimate only.`}
      </p>
    </div>
  );
}
