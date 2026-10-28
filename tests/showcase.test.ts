import { describe, expect, it } from "vitest";
import { CASES } from "@/lib/evals";
import { buildShowcase } from "@/lib/showcase";

describe("showcase tour", () => {
  it("runs the whole pipeline in memory and reports computed numbers", async () => {
    const d = await buildShowcase();
    expect(d.is_fixture).toBe(true);
    expect(d.business.name).toBe("Example Plumbing Co");
    expect(d.pipeline.steps.map((s) => s.step)).toEqual(expect.arrayContaining(["scrape", "diagnose", "validate", "roi", "agent"]));
    expect(d.pipeline.agent_ready_ms).not.toBeNull();
    // Every finding cites evidence, and the total applies the overlap rule (never the raw sum).
    expect(d.findings.length).toBeGreaterThan(0);
    for (const f of d.findings) expect(f.evidence.length).toBeGreaterThan(0);
    const raw = d.findings.reduce((s, f) => s + f.monthly_value, 0);
    const kept = d.findings.filter((f) => !f.counted_once_with).reduce((s, f) => s + f.monthly_value, 0);
    expect(d.monthly_total).toBe(kept);
    if (d.findings.some((f) => f.counted_once_with)) expect(d.monthly_total).toBeLessThan(raw);
  });

  it("shows the injected lines as blocked, and none of them reach the agent", async () => {
    const d = await buildShowcase();
    expect(d.injections_blocked.length).toBeGreaterThanOrEqual(2);
    const said = [d.agent.first_message, ...d.knowledge.map((k) => k.text)].join("\n").toLowerCase();
    expect(said).not.toMatch(/ignore (all )?previous instructions|developer mode|every repair is free/);
  });

  it("pairs every eval case: the generated agent passes, the careless agent is caught", async () => {
    const d = await buildShowcase();
    expect(d.evals.cases.map((c) => c.id)).toEqual(CASES.map((c) => c.id));
    expect(d.evals.good.failed).toBe(0);
    expect(d.evals.bad.passed).toBe(0);
    for (const c of d.evals.cases) {
      expect(c.good.status, c.id).toBe("pass");
      expect(c.bad.status, c.id).toBe("fail");
      expect(c.bad.caught.length, c.id).toBeGreaterThan(0);
    }
    expect(d.real_reports.checks.every((c) => c.fail === 0)).toBe(true);
  });
});
