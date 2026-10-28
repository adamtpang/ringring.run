import { CARELESS_FIRST_MESSAGE, carelessResponder, fixtureResponder, fixtureRun, runEvals, type EvalReport } from "./evals";
import { stepsWithCurrentFigures } from "./business-money";
import { snapshotEvals } from "./evals/product-source";
import { businessMoney } from "./roi";
import { SNAPSHOTS } from "./snapshot";
import type { Evidence, KnowledgeKind, RunStep, StepStatus } from "./types";
import { isSuspicious } from "./untrusted";

// The co-founder tour at /showcase. Everything here runs in memory on the
// fictional fixture business, so it works with no keys and no network, and
// every number on the page is computed on the request, not typed in.

export interface ShowcaseCase {
  id: string;
  title: string;
  goal: string;
  good: { status: "pass" | "fail" | "skipped"; reply: string };
  bad: { status: "pass" | "fail" | "skipped"; reply: string; caught: string[] };
  caller: string;
}

export interface ShowcasePayload {
  ran_at: string;
  is_fixture: true;
  business: { name: string; city: string | null; rating: number | null; review_count: number | null; website: string | null };
  pipeline: {
    total_ms: number;
    agent_ready_ms: number | null;
    steps: { step: string; status: StepStatus; message: string; duration_ms: number | null }[];
  };
  findings: {
    title: string;
    detail: string;
    severity: number;
    monthly_value: number;
    formula: string;
    /** Set when this estimate overlaps a larger one and is not added to the total. */
    counted_once_with: string | null;
    evidence: Evidence[];
  }[];
  /** Overlap rule applied: problems that share the same customers are counted once. */
  monthly_total: number | null;
  overlap_rule: string | null;
  knowledge: { id: string; kind: KnowledgeKind; text: string; source: string; quote: string | null }[];
  injections_blocked: { where: string; text: string }[];
  agent: { first_message: string; prompt_head: string[]; rule_count: number; fact_count: number };
  evals: {
    good: Pick<EvalReport, "passed" | "failed" | "skipped" | "pass_rate"> & { slowest_ms: number; hallucinations: number };
    bad: Pick<EvalReport, "passed" | "failed" | "skipped"> & { hallucinations: number };
    cases: ShowcaseCase[];
  };
  real_reports: { checks: { title: string; pass: number; fail: number }[]; label: string; link: { name: string; href: string } | null };
}

const STEP_ORDER = ["scrape", "dedupe", "store", "website", "diagnose", "validate", "roi", "agent"];

function lastAgentReply(transcript: { role: string; text: string }[]): string {
  return [...transcript].reverse().find((t) => t.role === "agent")?.text ?? "";
}

export async function buildShowcase(): Promise<ShowcasePayload> {
  const t0 = performance.now();
  const { store, runId, business, agent } = await fixtureRun();
  const total_ms = performance.now() - t0;

  const [run, steps, findings, rois, reviews, pages] = await Promise.all([
    store.getRun(runId),
    store.listSteps(runId),
    store.listFindings(business.id),
    store.listRoi(business.id),
    store.listReviews(business.id),
    store.listWebPages(business.id),
  ]);

  const good = await runEvals(agent.config, fixtureResponder, { agentId: agent.id });
  const bad = await runEvals({ ...agent.config, first_message: CARELESS_FIRST_MESSAGE }, carelessResponder, { agentId: agent.id });

  const injections_blocked = [
    ...reviews.filter((r) => isSuspicious(r.text)).map((r) => ({ where: `Review (${r.rating ?? "?"}★)`, text: r.text })),
    ...pages.flatMap((p) => p.text.split("\n").filter((l) => isSuspicious(l)).map((l) => ({ where: "Business website", text: l.trim() }))),
  ];

  const money = businessMoney(findings, rois);
  const roiByFinding = new Map(rois.map((r) => [r.finding_id, r]));
  const shownFindings = findings
    .map((f) => {
      const roi = roiByFinding.get(f.id);
      const dropped = money.dropped.find((d) => d.title === f.title);
      return {
        title: f.title,
        detail: f.detail,
        severity: f.severity,
        monthly_value: roi?.monthly_value ?? 0,
        formula: roi?.formula ?? "",
        counted_once_with: dropped?.keptTitle ?? null,
        evidence: f.evidence,
      };
    })
    .sort((a, b) => b.monthly_value - a.monthly_value);

  const promptLines = agent.config.system_prompt.split("\n");
  const product = snapshotEvals();
  const snap = SNAPSHOTS[0];

  return {
    ran_at: new Date().toISOString(),
    is_fixture: true,
    business: { name: business.name, city: business.city, rating: business.rating, review_count: business.review_count, website: business.website },
    pipeline: {
      total_ms: Math.round(total_ms * 10) / 10,
      agent_ready_ms: run?.agent_ready_ms ?? agent.ready_ms,
      steps: summarizeSteps(stepsWithCurrentFigures(steps, [{ id: business.id, name: business.name, money }])),
    },
    findings: shownFindings,
    monthly_total: money.total,
    overlap_rule: money.rule,
    knowledge: agent.config.knowledge.map((k) => ({
      id: k.id,
      kind: k.kind,
      text: `${k.label}: ${k.value}`,
      source: `${k.source_type} ${k.source_ref}`,
      quote: k.quote,
    })),
    injections_blocked,
    agent: {
      first_message: agent.config.first_message,
      prompt_head: promptLines.slice(0, promptLines.findIndex((l) => /^12\./.test(l)) + 1).filter(Boolean),
      rule_count: promptLines.filter((l) => /^\d+\./.test(l)).length,
      fact_count: agent.config.knowledge.length,
    },
    evals: {
      good: {
        passed: good.passed,
        failed: good.failed,
        skipped: good.skipped,
        pass_rate: good.pass_rate,
        slowest_ms: Math.max(0, ...good.cases.map((c) => c.latency_ms.max)),
        hallucinations: good.cases.reduce((s, c) => s + c.hallucinations.length, 0),
      },
      bad: { passed: bad.passed, failed: bad.failed, skipped: bad.skipped, hallucinations: bad.cases.reduce((s, c) => s + c.hallucinations.length, 0) },
      cases: good.cases.map((g) => {
        const b = bad.cases.find((x) => x.id === g.id)!;
        const callerTurns = g.transcript.filter((t) => t.role === "caller").map((t) => t.text);
        return {
          id: g.id,
          title: g.title,
          goal: g.goal,
          caller: callerTurns[callerTurns.length - 1] ?? "",
          good: { status: g.status, reply: lastAgentReply(g.transcript) },
          bad: { status: b.status, reply: lastAgentReply(b.transcript), caught: b.checks.filter((x) => !x.pass && x.name !== "disclosure").map((x) => x.detail) },
        };
      }),
    },
    real_reports: {
      label: product.source.label,
      checks: product.checks.map((c) => ({ title: c.title, pass: c.pass, fail: c.fail })),
      link: snap ? { name: snap.name, href: `/businesses/${snap.business_id}/diagnosis` } : null,
    },
  };
}

/** One row per step name, in pipeline order, with the final status and summed time. */
function summarizeSteps(steps: RunStep[]) {
  const by = new Map<string, { step: string; status: StepStatus; message: string; duration_ms: number | null }>();
  for (const s of steps) {
    const prev = by.get(s.step);
    by.set(s.step, {
      step: s.step,
      status: s.status,
      message: s.message,
      duration_ms: s.duration_ms == null ? (prev?.duration_ms ?? null) : (prev?.duration_ms ?? 0) + s.duration_ms,
    });
  }
  return [...by.values()].sort((a, b) => rank(a.step) - rank(b.step));
}

const rank = (s: string) => (STEP_ORDER.indexOf(s) === -1 ? 99 : STEP_ORDER.indexOf(s));
