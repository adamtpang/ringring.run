import { describe, expect, it } from "vitest";
import { stubDiagnoser } from "@/lib/diagnose";
import { FIXTURE_PLACES } from "@/lib/fixtures/google-places.fixture";
import { createRun, executeRun, type PipelineDeps } from "@/lib/pipeline";
import { fixtureScraper, type Scraper } from "@/lib/scraper";
import { createLocalStore } from "@/lib/store/local";
import type { ScanInput } from "@/lib/types";

function deps(over: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    store: createLocalStore({ file: null }),
    scraper: fixtureScraper(),
    diagnoser: stubDiagnoser(),
    mode: { scraper: "fixture", diagnoser: "stub", store: "local", llm_model: null },
    retry: { baseDelayMs: 0, jitter: false },
    ...over,
  };
}

async function scan(input: ScanInput, d = deps()) {
  const run = await createRun(input, d);
  const summary = await executeRun(run.id, d);
  const businesses = await d.store.listBusinesses({ runId: run.id });
  const steps = await d.store.listSteps(run.id);
  return { run: await d.store.getRun(run.id), summary, businesses, steps, d };
}

describe("pipeline in fixture mode", () => {
  it("scans 12 fictional businesses and keeps going when one fails", async () => {
    const { run, summary, businesses, steps } = await scan({ category: "plumbers", city: "Austin TX", maxCount: 12 });
    expect(summary.businessCount).toBe(12);
    expect(summary.failedCount).toBe(1);
    expect(summary.diagnosedCount).toBe(11);
    expect(run?.status).toBe("completed_with_errors");
    const flaky = businesses.find((b) => b.name === "Example Flaky Diagnosis LLC");
    expect(flaky?.diagnosis_status).toBe("failed");
    const dStep = steps.find((s) => s.business_id === flaky?.id && s.step === "diagnose");
    expect(dStep).toMatchObject({ status: "error", attempt: 3 });
    // Others after it still finished.
    expect(businesses.filter((b) => b.diagnosis_status === "ok")).toHaveLength(11);
    // Ranked by value, all fixtures.
    expect(businesses[0].est_monthly_value).toBeGreaterThanOrEqual(businesses[1].est_monthly_value);
    expect(businesses.every((b) => b.is_fixture)).toBe(true);
  });

  it("drops the hallucinated quote", async () => {
    const { summary, steps } = await scan({ category: "plumbers", city: "Austin TX", maxCount: 12 });
    expect(summary.droppedFindings).toBe(1);
    expect(steps.some((s) => s.step === "validate" && s.status === "warn" && /not found/.test(s.message))).toBe(true);
  });

  it("reads websites, cites them, and survives a failed read", async () => {
    const { businesses, steps, d } = await scan({ category: "plumbers", city: "Austin TX", maxCount: 12 });
    const co = businesses.find((b) => b.name === "Example Plumbing Co")!;
    const findings = await d.store.listFindings(co.id);
    const web = findings.flatMap((f) => f.evidence).find((e) => e.source === "website");
    expect(web).toMatchObject({ source: "website", quote: "To schedule service, call our office during business hours" });

    const rooter = businesses.find((b) => b.name === "Demo Rooter Services")!;
    const pages = await d.store.listWebPages(rooter.id);
    expect(pages[0].status).toBe("failed");
    expect(rooter.diagnosis_status).toBe("ok");
    expect(steps.some((s) => s.business_id === rooter.id && s.step === "website" && s.status === "warn")).toBe(true);

    const noSite = businesses.find((b) => b.name === "Sample Drain and Sewer (Demo)")!;
    expect(steps.some((s) => s.business_id === noSite.id && s.step === "website" && s.status === "skipped")).toBe(true);
  });

  it("stores knowledge facts with sources", async () => {
    const { businesses, d } = await scan({ category: "plumbers", city: "Austin TX", maxCount: 1 });
    const facts = await d.store.listKnowledgeFacts(businesses[0].id);
    expect(facts.some((f) => f.kind === "contact" && f.label === "Phone" && f.source_type === "listing")).toBe(true);
    expect(facts.some((f) => f.kind === "hours" && f.source_type === "listing")).toBe(true);
    const svc = facts.filter((f) => f.kind === "service" && f.source_type === "website");
    expect(svc.map((f) => f.value)).toContain("drain cleaning");
    expect(svc.every((f) => f.quote && f.source_ref)).toBe(true);
  });

  it("looks up one business by name", async () => {
    const { run, businesses } = await scan({ kind: "name", category: "Example Water Heater Pros", city: "Austin TX", maxCount: 1 });
    expect(run?.search_kind).toBe("name");
    expect(businesses.map((b) => b.name)).toEqual(["Example Water Heater Pros"]);
  });

  it("warns that demo mode cannot look up a real business name", async () => {
    const { businesses, steps } = await scan({ kind: "name", category: "Joe's Plumbing", city: "Austin TX", maxCount: 1 });
    expect(businesses).toHaveLength(1);
    expect(businesses[0].is_fixture).toBe(true);
    expect(businesses[0].name).not.toMatch(/Joe/);
    expect(steps.some((s) => s.status === "warn" && /cannot look up real businesses/.test(s.message))).toBe(true);
  });

  it("dedupes places by Google place id", async () => {
    const dupe: Scraper = {
      mode: "fixture",
      scrape: async () => [FIXTURE_PLACES[0], FIXTURE_PLACES[1], structuredClone(FIXTURE_PLACES[0])].map((p) => structuredClone(p)),
    };
    const { businesses, steps } = await scan({ category: "plumbers", city: "Austin TX", maxCount: 10 }, deps({ scraper: dupe }));
    expect(businesses).toHaveLength(2);
    expect(steps.find((s) => s.step === "scrape")?.message).toMatch(/removed 1 duplicate/);
  });

  it("marks the run failed (without throwing) when the scrape fails", async () => {
    const broken: Scraper = { mode: "fixture", scrape: async () => { throw new Error("boom"); } };
    const { run, summary } = await scan({ category: "plumbers", city: "Austin TX", maxCount: 3 }, deps({ scraper: broken, retry: { retries: 0 } }));
    expect(summary.status).toBe("failed");
    expect(run?.error).toMatch(/boom/);
  });

  it("continues when the website reader throws", async () => {
    const { summary } = await scan(
      { category: "plumbers", city: "Austin TX", maxCount: 3 },
      deps({ readSite: async () => { throw new Error("socket hang up"); } }),
    );
    expect(summary.diagnosedCount).toBe(3);
  });
});
