import { Badge, cx } from "@/components/ds";
import { caseStudiesFor, fmtStudyDate, type CaseStudy } from "@/lib/case-studies";
import type { PlanKind } from "@/lib/types";

function Study({ c, dense }: { c: CaseStudy; dense?: boolean }) {
  return (
    <li className={cx("rounded-md bg-sunken ring-1 ring-inset ring-hairline", dense ? "px-2.5 py-2" : "px-3 py-2.5")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{c.source_type}</Badge>
        {c.vendor_reported && (
          <Badge tone="warning" title="Published by a company that sells products in this space">
            Vendor-reported
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-footnote font-medium text-pretty">{c.claim}</p>
      <blockquote className="mt-1 border-l-2 border-hairline-strong pl-2 text-caption italic text-muted">&ldquo;{c.quote}&rdquo;</blockquote>
      <p className="mt-1 text-caption text-subtle">
        <a href={c.url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
          {c.publisher}
        </a>
        {c.authors ? `, ${c.authors}` : ""}, {fmtStudyDate(c.date)}.{c.caveat ? ` ${c.caveat}` : ""}
      </p>
    </li>
  );
}

/** Published evidence for one kind of fix. Renders nothing when no verified source exists. */
export function CaseStudies({ kind, dense }: { kind: PlanKind; dense?: boolean }) {
  const list = caseStudiesFor(kind);
  if (!list.length) return null;
  return (
    <div className="mt-4" data-testid={`case-studies-${kind}`}>
      <p className="text-caption font-semibold uppercase tracking-wide text-subtle">What published studies found</p>
      <ul className={cx("mt-1.5 grid gap-2", !dense && list.length > 1 && "md:grid-cols-2")}>
        {list.map((c) => (
          <Study key={c.id} c={c} dense={dense} />
        ))}
      </ul>
      <p className="mt-1 text-caption text-subtle">Other businesses, other settings: a sign of what can happen, not a promise for yours.</p>
    </div>
  );
}
