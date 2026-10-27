"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { Badge, Button } from "@/components/ds";
import { TIER_TONE, useGamePlan } from "@/components/GamePlan";
import { usePeerBoard, usePeerSubject } from "@/components/PeersSection";
import { RoiCalculator, useCalcBase, type CalcBase } from "@/components/RoiCalculator";
import { Qr } from "@/components/Qr";
import { usePoll } from "@/components/ui";
import { SnapshotBanner, snapQs, useReportUrl } from "@/components/Snapshot";
import type { SnapshotMeta } from "@/lib/snapshot";
import { ASSUMPTION_LABEL } from "@/lib/roi";
import { ONE_PAGER_CONTACT, ONE_PAGER_FOOTER } from "@/lib/copy";
import {
  ACTOR_LABEL,
  fmtDate,
  type EvidenceLine,
  type PlanItem,
} from "@/lib/gameplan";
import type {
  Business,
  Finding,
  KnowledgeFact,
  Review,
  RoiEstimate,
  Run,
} from "@/lib/types";

interface Report {
  business: Business;
  run: Run | null;
  reviews: Review[];
  findings: Finding[];
  roi: RoiEstimate[];
  knowledge?: KnowledgeFact[];
  snapshot?: SnapshotMeta;
}

/** Public home of the shareable diagnosis page. Matches metadataBase in the root layout. */
const SITE = "https://ringring.run";
const ACTOR_TEXT = {
  ringy: "text-accent",
  ringy_after_ok: "text-accent",
  you: "text-foreground",
} as const;

function Problem({
  item,
  n,
  e,
}: {
  item: PlanItem;
  n: number;
  e: EvidenceLine | undefined;
}) {
  return (
    <li className="op-avoid grid grid-cols-[1.25rem_1fr] gap-x-2">
      <span className="text-headline tabular-nums text-accent">{n}</span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 text-footnote font-semibold">
          {item.label}
          <Badge tone={TIER_TONE[item.tier]} className="h-5 px-2">
            {item.tier}
          </Badge>
          {item.effects.money.value && (
            <span className="text-caption font-normal text-subtle">
              est. {item.effects.money.value}
            </span>
          )}
        </p>
        {e ? (
          <p className="text-caption text-muted">
            &ldquo;{e.text}&rdquo;{" "}
            <span className="text-subtle">({e.cite})</span>
          </p>
        ) : (
          <p className="text-caption text-muted">{item.detail}</p>
        )}
        {item.moneyInputs && (
          <p className="text-[0.625rem] leading-snug text-subtle">
            How we got this: {item.moneyInputs}.
            {item.defaultKeys.length ? ` Assumed = ${ASSUMPTION_LABEL}.` : ""}
          </p>
        )}
      </div>
    </li>
  );
}

/** Page 2 of the printout: the numbers behind the plan, editable on screen, printed as typed. */
function PageTwo({ b, calcRows, scanned }: { b: Business; calcRows: CalcBase[]; scanned: string | null }) {
  if (!calcRows.length) return null;
  return (
    <article
      className="op-sheet op-page2 mx-auto mb-10 flex w-full max-w-[8.5in] flex-col gap-3 bg-white px-[0.45in] py-[0.38in] text-foreground shadow-raised print:m-0 print:shadow-none"
      aria-label={`One-pager for ${b.name}, page 2`}
    >
      <header className="flex items-baseline justify-between gap-4 border-b border-hairline pb-2">
        <p className="text-eyebrow uppercase text-accent">Ringy · {b.name} · page 2</p>
        <p className="text-caption text-subtle">Change any number on screen, then print</p>
      </header>
      <RoiCalculator rows={calcRows} dense title="Is each fix worth it? (ROI)" />
      <footer className="mt-auto border-t border-hairline pt-2 text-[0.625rem] leading-snug text-subtle">
        Estimates from public data read on {scanned ?? "the scan date"} and the assumptions shown. Tool prices from each vendor&apos;s own pricing page; no affiliation. {ONE_PAGER_FOOTER}
      </footer>
    </article>
  );
}

export default function OnePagerPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = usePoll<Report>(useReportUrl(id), () => false);
  const subject = usePeerSubject(data?.business ?? null, data?.reviews ?? null);
  const board = usePeerBoard(subject);
  const planInput = useMemo(
    () =>
      data && data.business.diagnosis_status === "ok"
        ? {
            business: data.business,
            findings: data.findings,
            roi: data.roi,
            reviews: data.reviews,
            knowledge: data.knowledge ?? [],
            board,
            subject,
            scanDate: data.run?.created_at ?? data.business.created_at,
          }
        : null,
    [data, board, subject],
  );
  const plan = useGamePlan(planInput);
  const calcRows = useCalcBase(data?.business ?? null, data?.findings ?? null, data?.roi ?? null);

  if (error) return <p className="p-8 text-footnote text-danger">{error}</p>;
  if (!data) return <p className="p-8 text-footnote text-muted">Loading…</p>;
  const b = data.business;
  if (!plan)
    return (
      <p className="p-8 text-footnote text-muted">
        The diagnosis for {b.name} is not ready yet.
      </p>
    );

  const url = `${SITE}/businesses/${b.id}/diagnosis`;
  const scanned = fmtDate(planInput?.scanDate);
  const top = plan.items.slice(0, 3);
  // One quote per problem, without repeating a quote another problem already uses.
  const used = new Set<string>();
  const quotes = top.map((it) => {
    const e = it.evidence.find((x) => !used.has(x.text));
    if (e) used.add(e.text);
    return e;
  });
  const planItems = plan.items.slice(0, 5);
  const ok = board?.status === "ok" ? board : null;

  return (
    <div className="paper min-h-full bg-sunken print:bg-white">
      <div className="op-toolbar mx-auto flex max-w-[8.5in] flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Link
          href={`/businesses/${b.id}/diagnosis${snapQs(data.snapshot)}`}
          className="text-footnote font-medium text-accent hover:underline"
        >
          Back to the full diagnosis
        </Link>
        <Button onClick={() => window.print()}>Download PDF</Button>
        {data.snapshot && (
          <div className="w-full">
            <SnapshotBanner snapshot={data.snapshot} />
          </div>
        )}
      </div>

      {/* On a phone the Letter-width sheet scrolls sideways inside this box instead of widening the page. */}
      <div className="overflow-x-auto print:overflow-visible">
        <article
          className="op-sheet mx-auto mb-10 flex w-full max-w-[8.5in] flex-col gap-3 bg-white px-[0.45in] py-[0.38in] text-foreground shadow-raised print:m-0 print:shadow-none"
          aria-label={`One-pager for ${b.name}`}
        >
          <header className="flex items-start justify-between gap-4 border-b border-hairline pb-3">
            <div className="min-w-0">
              <p className="text-eyebrow uppercase text-accent">
                Ringy · ringring.run
              </p>
              <h1 className="mt-1 text-title-2">{b.name}</h1>
              <p className="text-caption text-subtle">
                {[b.category, b.address].filter(Boolean).join(" · ")}
                {scanned && ` · checked ${scanned}`}
                {data.snapshot && (
                  <span className="font-semibold text-warning">
                    {" "}
                    · {data.snapshot.label}
                  </span>
                )}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {ok ? (
                <>
                  <p className="text-caption text-subtle">
                    Where you are (peer estimate)
                  </p>
                  <p className="text-title-2 leading-none">
                    Tier {ok.subject.tier}
                  </p>
                  <p className="text-caption text-muted">
                    {ok.subject.tied ? "tied " : ""}#{ok.subject.rank} of{" "}
                    {ok.rows.length} {ok.meta.plural}
                  </p>
                  <p className="text-caption text-subtle">
                    {b.rating ?? "n/a"} stars · {b.review_count ?? 0} reviews
                  </p>
                </>
              ) : (
                <>
                  <p className="text-caption text-subtle">
                    Where you are (peer estimate)
                  </p>
                  <p className="text-footnote font-medium">Peer tier unknown</p>
                  <p className="text-caption text-subtle">
                    {b.rating ?? "n/a"} stars · {b.review_count ?? 0} reviews
                  </p>
                </>
              )}
            </div>
          </header>

          <section className="op-avoid rounded-md bg-accent-soft px-4 py-3">
            <p className="text-eyebrow uppercase text-accent">
              The one thing first
            </p>
            <p className="mt-1 text-callout font-semibold text-pretty">
              {plan.binding.sentence}
            </p>
            {plan.firstRingyStep && (
              <p className="mt-1.5 text-footnote">
                <span className="font-semibold">
                  What Ringy does first
                  {plan.firstRingyStep.step.actor === "ringy_after_ok"
                    ? ", after your OK"
                    : ""}
                  :
                </span>{" "}
                {plan.firstRingyStep.step.text}
              </p>
            )}
          </section>

          <div className="grid grid-cols-2 gap-5">
            <section className="op-avoid">
              <h2 className="text-headline">Top problems</h2>
              <ol className="mt-1 space-y-1.5">
                {top.map((it, i) => (
                  <Problem key={it.kind} item={it} n={i + 1} e={quotes[i]} />
                ))}
              </ol>
            </section>
            <section className="op-avoid">
              <h2 className="text-headline">Prognosis</h2>
              <p className="mt-1 text-caption">{plan.prognosis.ifNothing}</p>
              <p className="mt-1 text-caption font-medium">
                {plan.prognosis.ifPlan}
              </p>
              {plan.prognosis.money && (
                <p className="mt-1 text-[0.625rem] leading-snug text-subtle">
                  How we got $
                  {plan.prognosis.money.total.toLocaleString("en-US")}/mo:{" "}
                  {plan.prognosis.money.kept
                    .map(
                      (k) =>
                        `${k.label.toLowerCase()} ($${k.trace.result.toLocaleString("en-US")}, math at left)`,
                    )
                    .join(" + ")}
                  {plan.prognosis.money.dropped.length
                    ? `. Not added: ${plan.prognosis.money.dropped.map((d) => `${d.label.toLowerCase()} ($${d.monthly.toLocaleString("en-US")})`).join(", ")}, since it can be the same customers.`
                    : "."}
                </p>
              )}
              <p className="mt-1 text-caption text-subtle">
                Estimate, not a promise. Measured by{" "}
                {plan.prognosis.metric.toLowerCase()}. Source:{" "}
                {plan.prognosis.source}
              </p>
            </section>
          </div>

          <section className="op-avoid">
            <h2 className="text-headline">The plan</h2>
            <p className="text-caption text-subtle">
              A: urgent and important. B: important. C: when you can. The
              recommended first step is marked.
            </p>
            <table className="mt-1.5 w-full border-collapse text-left align-top">
              <thead>
                <tr className="border-b border-hairline text-caption text-subtle">
                  <th className="w-[1.75rem] py-1 font-medium">Tier</th>
                  <th className="w-[30%] py-1 font-medium">Problem</th>
                  <th className="py-1 pr-3 font-medium">Ringy does</th>
                  <th className="py-1 font-medium">You do</th>
                </tr>
              </thead>
              <tbody>
                {planItems.map((it) => (
                  <tr
                    key={it.kind}
                    className="border-b border-hairline align-top last:border-0"
                  >
                    <td className="py-1">
                      <Badge tone={TIER_TONE[it.tier]} className="h-5 px-2">
                        {it.tier}
                      </Badge>
                    </td>
                    <td className="py-1 pr-3">
                      <p className="text-footnote font-semibold">
                        {it.label}
                        {it.recommended && (
                          <span className="ml-1 text-caption font-medium text-success">
                            · recommended
                          </span>
                        )}
                      </p>
                      <p
                        className={`text-[0.6875rem] font-medium ${ACTOR_TEXT[it.lead]}`}
                      >
                        {ACTOR_LABEL[it.lead]}
                      </p>
                    </td>
                    <td className="py-1 pr-3 text-[0.6875rem] leading-snug">
                      {it.ringy[0]!.text}
                    </td>
                    <td className="py-1 text-[0.6875rem] leading-snug">
                      {it.you[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="grid grid-cols-[1fr_auto] gap-5">
            <section className="op-avoid">
              <h2 className="text-headline">
                What we&apos;d love to learn from you
              </h2>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-caption">
                {plan.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            </section>
            <section
              className="op-avoid flex w-[3.3in] items-center gap-3 rounded-md border border-hairline-strong p-2.5"
              aria-label="Contact"
            >
              <span className="shrink-0">
                <Qr value={url} size={80} label={`QR code to ${url}`} />
              </span>
              <div className="min-w-0">
                <p className="text-headline leading-tight">
                  {ONE_PAGER_CONTACT.title}
                </p>
                <p className="mt-1 text-caption text-subtle">
                  {ONE_PAGER_CONTACT.body}
                </p>
                <a
                  href={url}
                  className="block break-all font-mono text-[0.5625rem] leading-tight text-accent"
                >
                  {url.replace(/^https:\/\//, "")}
                </a>
              </div>
            </section>
          </div>

          <footer className="mt-auto border-t border-hairline pt-2 text-[0.625rem] leading-snug text-subtle">
            Built from public Google reviews, the Google listing
            {b.website ? " and your website" : ""}, read on{" "}
            {scanned ?? "the scan date"}. {ONE_PAGER_FOOTER}
          </footer>
        </article>
        <PageTwo b={b} calcRows={calcRows} scanned={scanned} />
      </div>
    </div>
  );
}
