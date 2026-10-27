import type { ReactNode } from "react";
import { Badge, cx } from "@/components/ds";
import type { FixPaths } from "@/lib/fixpaths";

const hrs = (h: number) => (h === 0 ? "0 h" : h < 1 ? `${Math.round(h * 60)} min` : `${h} h`);
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Col({ title, tag, tone, children }: { title: string; tag: string; tone: "neutral" | "accent" | "warning"; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md bg-sunken p-3 ring-1 ring-inset ring-hairline">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <p className="text-footnote font-semibold">{title}</p>
        <Badge tone={tone}>{tag}</Badge>
      </div>
      {children}
    </div>
  );
}

/** Do it yourself, Ringy does it, or hire it out: the same fix three ways. */
export function FixPathsView({ paths, className }: { paths: FixPaths; className?: string }) {
  const { diy, ringy, thirdParty } = paths;
  return (
    <div className={cx("mt-4", className)} data-testid={`fix-paths-${paths.kind}`}>
      <p className="text-caption font-semibold uppercase tracking-wide text-subtle">Three ways to get it done</p>
      <div className="mt-1.5 grid gap-2 md:grid-cols-3">
        <Col title="Do it yourself" tag="Your time" tone="neutral">
          {diy.usdMonth != null && diy.hoursMonth != null && diy.setupHours != null ? (
            <p className="text-footnote">
              <span className="font-semibold tabular-nums text-warning">About {hrs(diy.hoursMonth)}/mo</span>
              <span className="text-muted"> plus {hrs(diy.setupHours)} to start</span>
            </p>
          ) : (
            <p className="text-footnote font-semibold text-muted">Time not estimated</p>
          )}
          <p className="text-caption text-subtle">
            Estimate.{diy.usdMonth != null && ` About $${diy.usdMonth}/mo of your time at $${diy.hourlyUsd}/h (change it in the ROI calculator).`} {diy.basis}
          </p>
          {diy.steps[0] && <p className="text-caption text-muted">First step: {diy.steps[0]}</p>}
        </Col>
        <Col title="Ringy does it" tag={ringy.role === "supports" ? "Ringy helps" : "After your OK"} tone="accent">
          <p className="text-footnote font-medium">{ringy.roleLabel}</p>
          <ul className="space-y-1">
            {ringy.steps.slice(0, 2).map((s, i) => (
              <li key={i} className="text-caption text-muted">
                {s.text}
              </li>
            ))}
          </ul>
          <p className="text-caption text-subtle">
            {ringy.price}
            {ringy.limits && ` Limits today: ${ringy.limits}`}
          </p>
        </Col>
        <Col title="Hire it out" tag="Third party" tone="warning">
          <p className="text-footnote font-medium">{thirdParty.category}</p>
          {thirdParty.vendors.length > 0 && (
            <ul className="space-y-1">
              {thirdParty.vendors.map((v) => (
                <li key={v.name} className="text-caption">
                  <a href={v.pricingUrl} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                    {v.name}
                  </a>{" "}
                  <span className="tabular-nums">about ${v.usdMonth.toLocaleString("en-US")}/mo</span>
                  {v.plan && <span className="text-subtle"> ({v.plan})</span>}
                  <span className="text-subtle">, checked {day(v.checkedOn)}</span>
                  {v.note && <span className="text-subtle">. {v.note}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-caption text-subtle">{thirdParty.note}</p>
        </Col>
      </div>
    </div>
  );
}
