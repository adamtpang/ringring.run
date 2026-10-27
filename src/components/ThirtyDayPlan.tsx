"use client";

import { useMemo } from "react";
import { Badge, Card, cx, SectionHeader } from "@/components/ds";
import type { PlanItem } from "@/lib/gameplan";
import { buildThirtyDay, METRIC_LABEL, WHO_LABEL, type ThirtyDayPlan as Plan } from "@/lib/thirtyday";
import type { Business, Review } from "@/lib/types";

export function useThirtyDay(items: PlanItem[] | null, business: Business | null, reviews: Review[] | null): Plan | null {
  return useMemo(() => (items && business ? buildThirtyDay(items, business, reviews ?? []) : null), [items, business, reviews]);
}

export const THIRTY_INTRO =
  "Your top fixes, week by week. Every step comes from the game plan above. Ringy only drafts and sets things up; nothing goes live or out to a customer until you say OK.";

function Metrics({ plan, dense }: { plan: Plan; dense?: boolean }) {
  return (
    <ul className={cx("grid gap-2", dense ? "grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3")} aria-label="Where you start">
      {plan.metrics.map((m) => (
        <li key={m.metric} className={cx("rounded-md bg-sunken ring-1 ring-inset ring-hairline", dense ? "px-2 py-1.5" : "px-3 py-2")}>
          <p className="text-caption text-subtle">{m.label} now</p>
          <p className={cx("font-semibold tabular-nums", dense ? "text-footnote" : "text-headline", m.estimate && "text-warning")}>{m.now ?? "not measured"}</p>
          <p className="text-caption text-subtle">
            {m.estimate ? m.source : `Source: ${m.source}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Week({ w, dense }: { w: Plan["weeks"][number]; dense?: boolean }) {
  return (
    <li className={cx("op-avoid rounded-lg ring-1 ring-inset ring-hairline", dense ? "p-2.5" : "p-4")}>
      <p className="text-eyebrow uppercase text-accent">Week {w.week}</p>
      {w.note ? (
        <p className="mt-2 text-footnote text-muted">{w.note}</p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {w.steps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 rounded-[4px] ring-1 ring-inset ring-hairline-strong" />
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={s.who === "ringy" ? "accent" : "neutral"} dot>
                    {WHO_LABEL[s.who]}
                  </Badge>
                  {s.afterOk && <span className="text-caption text-subtle">after your OK</span>}
                </div>
                <p className={cx("text-pretty", dense ? "text-caption" : "text-footnote")}>{s.text}</p>
                <p className="text-caption text-subtle">
                  {s.itemLabel} · moves <span className="font-medium text-muted">{METRIC_LABEL[s.metric].toLowerCase()}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function ThirtyDayView({ plan, dense }: { plan: Plan; dense?: boolean }) {
  return (
    <div className={dense ? "space-y-2" : "space-y-4"}>
      <Metrics plan={plan} dense={dense} />
      <ol className={cx("grid gap-3", dense ? "grid-cols-2" : "md:grid-cols-2")} aria-label="Weeks 1 to 4">
        {plan.weeks.map((w) => (
          <Week key={w.week} w={w} dense={dense} />
        ))}
      </ol>
      <p className="text-caption text-subtle">
        {plan.counts.ringy} steps for Ringy, {plan.counts.you} for you.
        {plan.later.length > 0 && ` After day 30: ${plan.later.map((i) => i.label.toLowerCase()).join(", ")}.`}
      </p>
    </div>
  );
}

export function ThirtyDayCard({ plan, printHref }: { plan: Plan; printHref?: string }) {
  if (!plan.focus.length) return null;
  return (
    <Card padding="lg" className="space-y-4" id="thirty-day" aria-labelledby="thirty-day-title">
      <SectionHeader
        eyebrow="30-day plan"
        title={<span id="thirty-day-title">Your first 30 days</span>}
        description={THIRTY_INTRO}
        action={
          printHref && (
            <a href={printHref} className="text-footnote font-medium text-accent hover:underline">
              Print it
            </a>
          )
        }
      />
      <ThirtyDayView plan={plan} />
    </Card>
  );
}
