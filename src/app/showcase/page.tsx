"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Card, SectionHeader, Stat, StatGrid, cx } from "@/components/ds";
import { money, PageShell, usePoll } from "@/components/ui";
import type { ShowcasePayload } from "@/lib/showcase";

// The co-founder tour: one page, seven chapters, every number computed on load
// by running the whole pipeline in memory on the fictional demo business.
// Arrow keys or the buttons move between chapters.

const CHAPTERS = [
  { id: "why", label: "Why" },
  { id: "scan", label: "Scan" },
  { id: "proof", label: "Proof" },
  { id: "price", label: "Price" },
  { id: "agent", label: "Agent" },
  { id: "evals", label: "Evals" },
  { id: "real", label: "Real data" },
  { id: "next", label: "Live vs next" },
] as const;

const STEP_LABEL: Record<string, string> = {
  scrape: "Scrape Google Maps listing",
  store: "Store listing and reviews",
  website: "Read the business website",
  diagnose: "Diagnose problems",
  validate: "Check every citation",
  roi: "Estimate monthly value",
  agent: "Build the phone agent",
  rank: "Rank businesses",
};

function Pass({ status }: { status: "pass" | "fail" | "skipped" }) {
  return (
    <Badge tone={status === "pass" ? "success" : status === "fail" ? "danger" : "neutral"} dot>
      {status === "pass" ? "Pass" : status === "fail" ? "Fail" : "Skipped"}
    </Badge>
  );
}

function Quote({ children, source }: { children: React.ReactNode; source: string }) {
  return (
    <figure className="rounded-md bg-surface-2 px-4 py-3">
      <blockquote className="text-callout">“{children}”</blockquote>
      <figcaption className="mt-1 text-caption text-subtle">{source}</figcaption>
    </figure>
  );
}

function Why() {
  return (
    <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
      <div className="space-y-4">
        <p className="text-title-2 text-balance">
          Local service businesses lose jobs every week to calls nobody answers. Their own reviews say so.
        </p>
        <p className="text-callout text-muted">
          ringring.run reads what the public already says about a business, proves where it is losing customers with quotes that a code check
          verifies word for word, prices each problem with math the owner can edit, and builds a phone agent that only says what is on file.
          Then it puts that agent through scripted callers before it goes anywhere near a phone.
        </p>
        <p className="text-callout text-muted">
          <strong className="text-foreground">Ringy talks</strong> with the owner. <strong className="text-foreground">Rungy runs</strong> the
          background work: scan, diagnose, benchmark, build, re-check.
        </p>
      </div>
      <Card tone="sunken" padding="md" className="space-y-3">
        <h3 className="text-headline">What you are about to see</h3>
        <ol className="list-decimal space-y-1.5 pl-5 text-footnote text-muted">
          <li>A full scan of a business, timed.</li>
          <li>Problems found, each with a cited quote.</li>
          <li>A dollar estimate built from visible assumptions.</li>
          <li>The phone agent it generates, every fact sourced.</li>
          <li>14 scripted callers grading that agent, and a deliberately bad agent failing the same test.</li>
          <li>The same checks on a real Austin business.</li>
        </ol>
        <p className="text-caption text-subtle">
          Everything here ran on this page load, in memory, on a fictional business (Example Plumbing Co, 555 numbers). No keys, no network.
        </p>
      </Card>
    </div>
  );
}

function Scan({ d }: { d: ShowcasePayload }) {
  return (
    <div className="space-y-5">
      <StatGrid>
        <Stat label="Business" value={d.business.name} hint={`${d.business.city ?? ""} · ${d.business.rating ?? "?"}★ · ${d.business.review_count ?? "?"} reviews`} />
        <Stat label="Named → agent ready" value={`${d.pipeline.agent_ready_ms ?? "?"} ms`} hint="This run, fixture data, in memory" emphasis />
        <Stat label="Live, by name" value="70.4 s" hint="Real Apify + xAI run, Oct 26" />
        <Stat label="Target" value="90 s" hint="Business named to agent ready" />
      </StatGrid>
      <Card padding="md">
        <ol className="space-y-2">
          {d.pipeline.steps.map((s, i) => (
            <li key={s.step} className="grid grid-cols-[1.5rem_1fr_auto] items-start gap-3 text-footnote">
              <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-accent-soft text-caption font-semibold text-accent">{i + 1}</span>
              <span>
                <span className="font-medium">{STEP_LABEL[s.step] ?? s.step}</span>
                <span className="block text-muted">{s.message}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-caption tabular-nums text-subtle">{s.duration_ms ?? 0} ms</span>
                <Badge tone={s.status === "ok" ? "success" : s.status === "warn" ? "warning" : s.status === "error" ? "danger" : "neutral"}>{s.status}</Badge>
              </span>
            </li>
          ))}
        </ol>
      </Card>
      <p className="text-caption text-subtle">
        Live runs use the Apify Google Maps actor for listings and reviews and xAI for diagnosis. One failing business never fails the run.
      </p>
    </div>
  );
}

function Proof({ d }: { d: ShowcasePayload }) {
  return (
    <div className="space-y-5">
      <ul className="grid gap-4 lg:grid-cols-2">
        {d.findings.map((f) => (
          <Card as="li" key={f.title} padding="md" className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-headline">{f.title}</h3>
              <Badge tone="danger">Severity {f.severity}/5</Badge>
            </div>
            <p className="text-footnote text-muted">{f.detail}</p>
            {f.evidence.map((e, i) =>
              e.source === "review" ? (
                <Quote key={i} source={`Google review, ${e.rating ?? "?"}★ · found word for word`}>{e.quote}</Quote>
              ) : e.source === "website" ? (
                <Quote key={i} source={`Business website · found word for word`}>{e.quote}</Quote>
              ) : (
                <Quote key={i} source={`Listing fact: ${e.fact}`}>{e.value}</Quote>
              ),
            )}
          </Card>
        ))}
      </ul>
      {d.injections_blocked.length > 0 && (
        <Card tone="danger" padding="md" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-headline">Prompt injection ignored</h3>
            <Badge tone="success" dot>
              {d.injections_blocked.length} blocked
            </Badge>
          </div>
          <p className="text-footnote text-muted">
            Reviews and websites are written by strangers. These lines tried to give the AI orders. They were fenced as data, stripped, and kept out of
            the agent&apos;s knowledge, so the agent never repeats them.
          </p>
          <ul className="space-y-2">
            {d.injections_blocked.map((x, i) => (
              <li key={i} className="rounded-md bg-danger-soft px-4 py-2 text-footnote">
                <span className="font-medium text-danger">{x.where}: </span>
                <span className="line-through decoration-danger/60">{x.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Price({ d }: { d: ShowcasePayload }) {
  return (
    <div className="space-y-5">
      <StatGrid className="sm:grid-cols-2">
        <Stat
          label="Estimated monthly value at stake"
          value={d.monthly_total == null ? "Not estimated" : `${money(d.monthly_total)}/mo`}
          hint="Estimate from default assumptions the owner can edit"
          emphasis
          estimate
        />
        <Stat label="Problems priced" value={d.findings.length} hint={`${d.findings.filter((f) => f.counted_once_with).length} overlap a larger one, counted once`} />
      </StatGrid>
      <Card padding="md">
        <ul className="divide-y divide-hairline">
          {d.findings.map((f) => (
            <li key={f.title} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:gap-4">
              <div>
                <p className="text-callout font-medium">{f.title}</p>
                <p className="text-caption text-muted">{f.formula}</p>
                {f.counted_once_with && <p className="text-caption text-subtle">Same customers as “{f.counted_once_with}”, so not added to the total.</p>}
              </div>
              <p className={cx("font-semibold tabular-nums", f.counted_once_with ? "text-subtle line-through" : "text-warning")}>{money(f.monthly_value)}/mo</p>
            </li>
          ))}
        </ul>
      </Card>
      {d.overlap_rule && <p className="text-caption text-subtle">{d.overlap_rule}</p>}
    </div>
  );
}

function Agent({ d }: { d: ShowcasePayload }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <Card padding="md" className="space-y-2">
          <h3 className="text-headline">First thing a caller hears</h3>
          <p className="rounded-md bg-accent-soft px-4 py-3 text-callout">{d.agent.first_message}</p>
          <p className="text-caption text-subtle">The schema rejects any config whose first message does not say it is an AI.</p>
        </Card>
        <Card padding="md" className="space-y-2">
          <h3 className="text-headline">
            Its rules <span className="text-muted">({d.agent.rule_count})</span>
          </h3>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-3 font-mono text-caption leading-relaxed">{d.agent.prompt_head.join("\n")}</pre>
        </Card>
      </div>
      <Card padding="md" className="space-y-2">
        <h3 className="text-headline">
          What it knows <span className="text-muted">({d.agent.fact_count} facts, each cited)</span>
        </h3>
        <ul className="max-h-[32rem] space-y-1.5 overflow-auto pr-1">
          {d.knowledge.map((k) => (
            <li key={k.id} className="rounded-md bg-surface-2 px-3 py-2 text-footnote">
              <span className="mr-2 font-mono text-caption text-subtle">[{k.id}]</span>
              {k.text}
              <span className="mt-0.5 block text-caption text-subtle">
                {k.kind} · source: {k.source}
                {k.quote ? ` · “${k.quote}”` : ""}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Evals({ d }: { d: ShowcasePayload }) {
  const g = d.evals.good;
  const b = d.evals.bad;
  return (
    <div className="space-y-5">
      <StatGrid>
        <Stat label="Generated agent" value={`${g.passed}/${g.passed + g.failed}`} hint="Scripted callers passed" emphasis />
        <Stat label="Hallucination flags" value={g.hallucinations} hint="Prices, times, phones, trade claims not on file" />
        <Stat label="Careless agent" value={`${b.passed}/${b.passed + b.failed}`} hint={`Grader caught ${b.failed} of ${b.passed + b.failed}`} />
        <Stat label="Live LLM run" value="8/8" hint="grok, Oct 26, before 6 new cases" />
      </StatGrid>
      <p className="text-footnote text-muted">
        Each caller is graded on five checks: says it is an AI, states facts as on file, does the task, invents nothing, and answers within 3 s.
        The careless agent breaks the rules on purpose. If the grader ever let it pass, the grader would be the bug.
      </p>
      <ul className="space-y-3 sm:hidden">
        {d.evals.cases.map((c) => (
          <Card as="li" key={c.id} padding="sm" className="space-y-2 text-footnote">
            <p className="font-medium">{c.title}</p>
            <p className="text-muted">“{c.caller}”</p>
            <div className="rounded-md bg-success-soft/50 p-2">
              <Pass status={c.good.status} /> <span className="text-caption text-subtle">Generated agent</span>
              <p className="mt-1">{c.good.reply}</p>
            </div>
            <div className="rounded-md bg-danger-soft/50 p-2">
              <Pass status={c.bad.status} /> <span className="text-caption text-subtle">Careless agent</span>
              <p className="mt-1 text-muted">{c.bad.reply}</p>
              {c.bad.caught.length > 0 && <p className="mt-1 text-caption text-danger">Caught: {c.bad.caught.join("; ")}</p>}
            </div>
          </Card>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[44rem] border-separate border-spacing-y-2 text-left text-footnote">
          <thead className="text-caption uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-3 font-medium">Caller</th>
              <th className="px-3 font-medium">Generated agent</th>
              <th className="px-3 font-medium">Careless agent</th>
            </tr>
          </thead>
          <tbody>
            {d.evals.cases.map((c) => (
              <tr key={c.id} className="align-top">
                <td className="w-[30%] rounded-l-md bg-surface px-3 py-2.5 shadow-card">
                  <p className="font-medium">{c.title}</p>
                  <p className="text-muted">“{c.caller}”</p>
                </td>
                <td className="w-[35%] bg-surface px-3 py-2.5 shadow-card">
                  <div className="mb-1">
                    <Pass status={c.good.status} />
                  </div>
                  {c.good.reply}
                </td>
                <td className="w-[35%] rounded-r-md bg-surface px-3 py-2.5 shadow-card">
                  <div className="mb-1">
                    <Pass status={c.bad.status} />
                  </div>
                  <span className="text-muted">{c.bad.reply}</span>
                  {c.bad.caught.length > 0 && <span className="mt-1 block text-caption text-danger">Caught: {c.bad.caught.join("; ")}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-caption text-subtle">
        The generated agent here is answered by a rule-based stand-in that follows the config exactly, so it tests the config and the grader, not a model.
        With an LLM key, <Link className="text-accent hover:underline" href="/evals">/evals</Link> runs the same callers against the real model. CI runs
        these on every push.
      </p>
    </div>
  );
}

function Real({ d }: { d: ShowcasePayload }) {
  return (
    <div className="space-y-5">
      <p className="text-callout text-muted">
        Fixtures prove the plumbing. These rule checks run on a real report saved from a live scan: {d.real_reports.label}.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {d.real_reports.checks.map((c) => (
          <Card as="li" key={c.title} padding="sm" className="flex items-center justify-between gap-3">
            <span className="text-footnote font-medium">{c.title}</span>
            <Badge tone={c.fail ? "danger" : "success"} dot>
              {c.fail ? `${c.fail} fail` : "Pass"}
            </Badge>
          </Card>
        ))}
      </ul>
      {d.real_reports.link && (
        <ButtonLink href={d.real_reports.link.href} variant="secondary">
          Open the real {d.real_reports.link.name} report
        </ButtonLink>
      )}
    </div>
  );
}

const LIVE = [
  "Scan by name or category and city (Apify, Google Maps)",
  "Diagnosis with verified citations (xAI)",
  "Editable dollar estimates, overlaps counted once",
  "Anonymized peer tiers and a game plan",
  "Phone-agent config per business, every fact cited",
  "14 scripted callers plus a red-team agent, in CI",
  "Owner interview by voice in the browser (ElevenLabs)",
  "Customer map and chat with a business's AI",
];
const NEXT = [
  "Answering real phone calls (deploy adapter written, untested live)",
  "SMS and calendar booking",
  "Spanish",
  "Simulated calls over real audio",
  "A real pilot business",
];

function Next() {
  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <Card padding="md" className="space-y-3">
          <h3 className="flex items-center gap-2 text-headline">
            <Badge tone="success" dot>
              Live
            </Badge>
            Works today
          </h3>
          <ul className="space-y-1.5 text-footnote">
            {LIVE.map((x) => (
              <li key={x}>✓ {x}</li>
            ))}
          </ul>
        </Card>
        <Card tone="sunken" padding="md" className="space-y-3">
          <h3 className="flex items-center gap-2 text-headline">
            <Badge tone="neutral">Next</Badge>
            Not built yet
          </h3>
          <ul className="space-y-1.5 text-footnote text-muted">
            {NEXT.map((x) => (
              <li key={x}>○ {x}</li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/owners">Scan a business</ButtonLink>
        <ButtonLink href="/find" variant="secondary">
          Customer map and chat
        </ButtonLink>
        <ButtonLink href="/evals" variant="secondary">
          All evals
        </ButtonLink>
        <ButtonLink href="/health" variant="plain">
          Health
        </ButtonLink>
      </div>
    </div>
  );
}

export default function ShowcasePage() {
  const [nonce, setNonce] = useState(0);
  const { data, error } = usePoll<ShowcasePayload>(`/api/showcase?n=${nonce}`, () => false);
  const [i, setI] = useState(0);
  const go = useCallback((n: number) => setI((cur) => Math.min(CHAPTERS.length - 1, Math.max(0, cur + n))), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const ch = CHAPTERS[i]!;
  const titles: Record<(typeof CHAPTERS)[number]["id"], { title: string; desc: string }> = {
    why: { title: "Missed calls are lost jobs.", desc: "The problem, and what ringring.run does about it." },
    scan: { title: "From a name to an agent, timed.", desc: "Every step writes a log row. This is the run that just happened." },
    proof: { title: "Every problem quotes its source.", desc: "A code check drops any quote it cannot find word for word in the review or website." },
    price: { title: "Dollar figures you can check.", desc: "Each estimate is plain multiplication of named assumptions. Change one and the total updates." },
    agent: { title: "An agent that only says what is on file.", desc: "Generated from the cited facts above and validated by a schema before it is stored." },
    evals: { title: "Graded by scripted callers.", desc: "The generated agent against a deliberately careless one, on the same 14 calls." },
    real: { title: "Same checks, real business.", desc: "Rule checks on a real saved report from a live scan." },
    next: { title: "What is live, and what is next.", desc: "Nothing here claims more than the code does." },
  };

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Chapters" className="flex flex-wrap gap-1.5">
          {CHAPTERS.map((c, n) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setI(n)}
              aria-current={n === i ? "step" : undefined}
              className={cx(
                "pressable rounded-pill px-3 py-1 text-footnote font-medium",
                n === i ? "bg-accent-solid text-accent-fg" : "bg-surface-2 text-muted hover:text-foreground",
              )}
            >
              {n + 1}. {c.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Badge tone="warning">Demo data</Badge>
          <Button size="sm" variant="secondary" onClick={() => setNonce((n) => n + 1)} title="Run the whole pipeline and every eval again">
            Run it again
          </Button>
        </div>
      </div>

      <SectionHeader level={1} size="lg" eyebrow={`${i + 1} of ${CHAPTERS.length} · ${ch.label}`} title={titles[ch.id].title} description={titles[ch.id].desc} />

      {error && <p className="rounded-md bg-danger-soft px-4 py-3 text-footnote text-danger">{error}</p>}
      {ch.id === "why" ? (
        <Why />
      ) : !data ? (
        !error && <p className="text-footnote text-muted">Running the pipeline and 28 simulated calls…</p>
      ) : (
        <div key={`${ch.id}-${data.ran_at}`} className="animate-[fadein_.25s_ease-out]">
          {ch.id === "scan" && <Scan d={data} />}
          {ch.id === "proof" && <Proof d={data} />}
          {ch.id === "price" && <Price d={data} />}
          {ch.id === "agent" && <Agent d={data} />}
          {ch.id === "evals" && <Evals d={data} />}
          {ch.id === "real" && <Real d={data} />}
          {ch.id === "next" && <Next />}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-hairline pt-5">
        <Button variant="secondary" onClick={() => go(-1)} disabled={i === 0}>
          ← Back
        </Button>
        <span className="hidden text-caption text-subtle sm:block">Use ← and → keys</span>
        <Button onClick={() => go(1)} disabled={i === CHAPTERS.length - 1}>
          {i === CHAPTERS.length - 1 ? "Done" : `Next: ${CHAPTERS[i + 1]!.label} →`}
        </Button>
      </div>
    </PageShell>
  );
}
