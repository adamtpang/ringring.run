"use client";

import { useMemo } from "react";
import { Badge, ButtonLink, Card, SectionHeader, type BadgeTone } from "@/components/ds";
import { ACTOR_LABEL, buildGamePlan, type Actor, type Check, type CheckStatus, type EvidenceLine, type GamePlan, type PlanInput, type PlanItem, type PlanTier } from "@/lib/gameplan";

export function useGamePlan(p: PlanInput | null): GamePlan | null {
  return useMemo(() => (p ? buildGamePlan(p) : null), [p]);
}

export const STATUS_TONE: Record<CheckStatus, BadgeTone> = { pass: "success", gap: "warning", unknown: "neutral" };
export const STATUS_LABEL: Record<CheckStatus, string> = { pass: "Pass", gap: "Gap", unknown: "Unknown" };
export const TIER_TONE: Record<PlanTier, BadgeTone> = { A: "accent", B: "warning", C: "neutral" };
export const TIER_LABEL: Record<PlanTier, string> = { A: "A · urgent and important", B: "B · important", C: "C · when you can" };
export const ACTOR_TONE: Record<Actor, BadgeTone> = { ringy: "accent", ringy_after_ok: "accent", you: "neutral" };

export function EvidenceQuote({ e }: { e: EvidenceLine }) {
  return (
    <li className="text-footnote">
      <span className="text-foreground">&ldquo;{e.text}&rdquo;</span>{" "}
      <span className="text-subtle">
        {e.url ? (
          <a href={e.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            {e.cite}
          </a>
        ) : (
          e.cite
        )}
      </span>
    </li>
  );
}

function Scorecard({ checks }: { checks: Check[] }) {
  return (
    <Card padding="sm" as="div">
      <h3 className="text-headline">Scorecard</h3>
      <p className="mt-1 text-caption text-subtle">The same 9 checks, in the same order, for every business. Unknown means Ringy could not read it, not that it is missing.</p>
      <ol className="mt-3 divide-y divide-hairline">
        {checks.map((c, i) => (
          <li key={c.id} className="grid grid-cols-[1.5rem_1fr_auto] items-start gap-x-3 gap-y-1 py-2.5">
            <span className="text-caption tabular-nums text-subtle">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-footnote font-medium">{c.label}</p>
              <p className="text-caption text-muted">{c.detail}</p>
              {/\d/.test(c.detail) && <p className="text-caption text-subtle">Source: {c.source}</p>}
              {c.note && <p className="text-caption text-subtle">{c.note}</p>}
              {(c.status !== "pass" || c.note) && c.evidence.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {c.evidence.map((e, j) => (
                    <EvidenceQuote key={j} e={e} />
                  ))}
                </ul>
              )}
            </div>
            <Badge tone={STATUS_TONE[c.status]} dot>
              {STATUS_LABEL[c.status]}
            </Badge>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function MoneyHow({ money }: { money: NonNullable<GamePlan["prognosis"]["money"]> }) {
  const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
  return (
    <div className="mt-3 text-caption text-subtle">
      <p className="font-medium">How we got {usd(money.total)}/mo:</p>
      <ul className="list-disc pl-4">
        {money.kept.map((k) => (
          <li key={k.kind}>
            {k.label}: {k.trace.math}
          </li>
        ))}
        {money.dropped.map((d) => (
          <li key={d.kind}>
            Not added: {d.label} ({usd(d.monthly)}/mo), because it can be the same customers as {d.keptLabel.toLowerCase()}.
          </li>
        ))}
      </ul>
    </div>
  );
}

function EffectRow({ label, value, basis, source }: { label: string; value: string | null; basis: string; source?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-subtle">{label}</dt>
      <dd className={value ? "text-footnote font-medium" : "text-footnote text-subtle"}>{value ?? "not estimated"}</dd>
      <dd className="text-caption text-subtle">{basis}</dd>
      {value && source && <dd className="text-caption text-subtle">Source: {source}.</dd>}
    </div>
  );
}

function Item({ item, n }: { item: PlanItem; n: number }) {
  const weeks = [1, 2, 3, 4].map((w) => ({ w, steps: item.checklist.filter((c) => c.week === w) })).filter((x) => x.steps.length);
  return (
    <Card as="li" padding="md" className={item.recommended ? "ring-2 ring-accent/40" : undefined} id={`plan-${item.kind}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TIER_TONE[item.tier]}>{TIER_LABEL[item.tier]}</Badge>
        <Badge tone={ACTOR_TONE[item.lead]} dot>
          {ACTOR_LABEL[item.lead]}
        </Badge>
        {item.recommended && <Badge tone="success">Recommended first</Badge>}
      </div>
      <h3 className="mt-3 text-headline">
        {n}. {item.label}
      </h3>
      <p className="mt-1 text-footnote text-muted">{item.detail}</p>
      <p className="mt-1 text-caption text-subtle">
        {item.urgentWhy} {item.importantWhy}
      </p>
      {item.moneyInputs && (
        <p className="mt-1 text-caption text-subtle">
          <span className="font-medium">How we got this:</span> {item.moneyInputs}. Inputs marked assumed are a default assumption, ask the owner.
        </p>
      )}

      {item.evidence.length > 0 && (
        <ul className="mt-3 space-y-1 border-l-2 border-hairline pl-3">
          {item.evidence.slice(0, 3).map((e, i) => (
            <EvidenceQuote key={i} e={e} />
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-subtle">Why it matters</p>
          <p className="text-footnote">{item.why}</p>
        </div>
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-subtle">What it unlocks</p>
          <p className="text-footnote">{item.unlocks}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-footnote font-semibold">What Ringy does</p>
          <ul className="mt-1 space-y-1.5">
            {item.ringy.map((s, i) => (
              <li key={i} className="text-footnote">
                <span className="mr-1.5 inline-block align-middle">
                  <Badge tone="accent">{ACTOR_LABEL[s.actor]}</Badge>
                </span>
                {s.text}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-footnote font-semibold">{ACTOR_LABEL.you}</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {item.you.map((t, i) => (
              <li key={i} className="text-footnote">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <details className="mt-4 rounded-md bg-surface-2 px-3 py-2">
        <summary className="cursor-pointer text-footnote font-medium">Estimated effect and 30-day checklist</summary>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <EffectRow label="Money" {...item.effects.money} />
          <EffectRow label="Your time" {...item.effects.time} />
          <EffectRow label="Review volume" {...item.effects.reviews} />
          <EffectRow label="How often it comes up" {...item.effects.quality} />
        </dl>
        <ol className="mt-4 space-y-2">
          {weeks.map(({ w, steps }) => (
            <li key={w}>
              <p className="text-caption font-semibold text-subtle">Week {w}</p>
              <ul className="space-y-0.5">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-footnote">
                    <span aria-hidden="true">☐</span>
                    <span>
                      <span className="text-subtle">{s.who === "you" ? "You" : "Ringy"}:</span> {s.text}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        {item.sources.length > 0 && (
          <p className="mt-3 text-caption text-subtle">
            Sources:{" "}
            {item.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && " · "}
                <a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {s.label}
                </a>
              </span>
            ))}
          </p>
        )}
      </details>
    </Card>
  );
}

export function GamePlanSection({ plan, onePagerHref, interviewHref }: { plan: GamePlan; onePagerHref: string; interviewHref?: string }) {
  const { binding, prognosis: pg } = plan;
  return (
    <section id="game-plan" className="space-y-5" aria-labelledby="game-plan-title">
      <SectionHeader
        eyebrow="Game plan"
        title={<span id="game-plan-title">What is holding you back</span>}
        action={
          <a href={onePagerHref} className="text-footnote font-medium text-accent hover:underline">
            Printable one-pager
          </a>
        }
      />
      <Card tone="sunken" padding="md" as="div">
        <p className="text-eyebrow uppercase text-accent">The one thing first</p>
        <p className="mt-2 text-title-3 text-pretty">{binding.sentence}</p>
        <p className="mt-1 text-caption text-subtle">Source: {binding.source}</p>
        {binding.evidence.length > 0 && (
          <ul className="mt-3 space-y-1">
            {binding.evidence.map((e, i) => (
              <EvidenceQuote key={i} e={e} />
            ))}
          </ul>
        )}
        {plan.firstRingyStep && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-footnote">
            <span className="font-semibold">What Ringy does first:</span>
            <Badge tone="accent">{ACTOR_LABEL[plan.firstRingyStep.step.actor]}</Badge>
            <span>{plan.firstRingyStep.step.text}</span>
          </div>
        )}
      </Card>

      <Scorecard checks={plan.checks} />

      <Card as="div" padding="md">
        <h3 className="text-headline">Prognosis</h3>
        <p className="mt-1 text-caption text-subtle">
          Measured by: {pg.metric}. Today: {pg.now}. Source: {pg.source}
        </p>
        <p className="mt-3 text-footnote">{pg.ifNothing}</p>
        <p className="mt-2 text-footnote font-medium">{pg.ifPlan}</p>
        {pg.money && <MoneyHow money={pg.money} />}
        <p className="mt-3 text-caption text-subtle">{pg.note}</p>
      </Card>

      {plan.items.length > 0 && (
        <ol className="space-y-4" aria-label="Plan">
          {plan.items.map((it, i) => (
            <Item key={it.kind} item={it} n={i + 1} />
          ))}
        </ol>
      )}

      <Card as="div" padding="md">
        <h3 className="text-headline">What we&apos;d love to learn from you</h3>
        <p className="mt-1 text-caption text-subtle">A few questions for a short conversation with Ringy. Your answers are saved to your business profile.</p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          {plan.questions.map((q) => (
            <li key={q} className="text-footnote">
              {q}
            </li>
          ))}
        </ol>
        {interviewHref && (
          <ButtonLink size="sm" className="mt-4" href={interviewHref}>
            Answer with Ringy
          </ButtonLink>
        )}
      </Card>
    </section>
  );
}
