import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentConfigSchema, elevenLabsProvider, generateAgentConfig } from "@/lib/agent";
import { createRun, executeRun } from "@/lib/pipeline";
import { deps, exampleAgent } from "./helpers";

describe("agent generator", () => {
  it("builds a valid, cited agent for each business and times the run", async () => {
    const { run, summary, agent } = await exampleAgent();
    expect(summary.agentsReady).toBe(1);
    expect(run?.agent_ready_ms).toBeTypeOf("number");
    expect(run!.agent_ready_ms!).toBeGreaterThanOrEqual(0);
    expect(run!.agent_ready_ms!).toBeLessThan(90_000);
    expect(agent.ready_ms).toBe(run?.agent_ready_ms);
    expect(() => AgentConfigSchema.parse(agent.config)).not.toThrow();
  });

  it("discloses AI first, cites every fact, and keeps injected text out", async () => {
    const { agent } = await exampleAgent();
    const c = agent.config;
    expect(c.system_prompt.split("\n")[0]).toMatch(/\bAI\b/);
    expect(c.first_message).toMatch(/\bAI\b/);
    expect(c.system_prompt).toMatch(/Answer ONLY from the facts in KNOWLEDGE/);
    for (const k of c.knowledge) {
      expect(k.source_ref.length).toBeGreaterThan(0);
      if (k.source_type === "website" || k.source_type === "review") expect(k.quote).toBeTruthy();
    }
    const prices = c.knowledge.filter((k) => k.kind === "price").map((k) => k.value);
    expect(prices).toContain("Drain cleaning starts at $149.");
    expect(c.knowledge.some((k) => k.kind === "faq" && k.source_type === "review")).toBe(true);
    const all = JSON.stringify(c).toLowerCase();
    expect(all).not.toContain("price is $0");
    expect(all).not.toContain("every repair is free");
    expect(all).not.toContain("developer mode");
  });

  it("still builds an agent when diagnosis fails", async () => {
    const d = deps();
    const run = await createRun({ category: "plumbers", city: "Austin TX", maxCount: 12 }, d);
    const summary = await executeRun(run.id, d);
    expect(summary.agentsReady).toBe(12);
    expect((await d.store.listAgents({ runId: run.id })).length).toBe(12);
  });

  it("rejects a config without an AI disclosure", () => {
    const c = generateAgentConfig({
      business: { id: "b", name: "Test Co", phone: "(512) 555-0100", opening_hours: [] },
      facts: [], reviews: [], findings: [],
    });
    expect(AgentConfigSchema.safeParse({ ...c, first_message: "Hi, this is Sam at Test Co. How can I help?" }).success).toBe(false);
    expect(AgentConfigSchema.safeParse({ ...c, system_prompt: "You are Sam.\n" + "x".repeat(300) }).success).toBe(false);
  });
});

describe("ElevenLabs adapter", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is a no-op with a clear status when keys are missing", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("ELEVENLABS_PHONE_NUMBER_ID", "");
    const st = elevenLabsProvider.status();
    expect(st.configured).toBe(false);
    expect(st.missing).toEqual(["ELEVENLABS_API_KEY", "ELEVENLABS_PHONE_NUMBER_ID"]);
    const fetchSpy = vi.fn();
    const { agent } = await exampleAgent();
    const r = await elevenLabsProvider.deploy(agent.config, { fetch: fetchSpy as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, status: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates an agent and assigns the number when configured (mocked HTTP)", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("ELEVENLABS_PHONE_NUMBER_ID", "phnum_123");
    vi.stubEnv("FORCE_DEMO", "");
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(url.endsWith("/agents/create") ? { agent_id: "agent_abc" } : {}), { status: 200 });
    }) as unknown as typeof fetch;
    const { agent } = await exampleAgent();
    const r = await elevenLabsProvider.deploy(agent.config, { fetch: fake });
    expect(r).toMatchObject({ ok: true, external_agent_id: "agent_abc", phone_number_id: "phnum_123" });
    expect(calls[0]?.url).toBe("https://api.elevenlabs.io/v1/convai/agents/create");
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.conversation_config.agent.first_message).toMatch(/\bAI\b/);
    expect(calls[1]?.url).toBe("https://api.elevenlabs.io/v1/convai/phone-numbers/phnum_123");
    expect(calls[1]?.init.method).toBe("PATCH");
  });
});
