import { describe, expect, it } from "vitest";
import type { LlmClient } from "@/lib/diagnose/llm-client";
import {
  CASES,
  canonicalTime,
  findHallucinations,
  timesIn,
  fixtureAgent,
  fixtureResponder,
  llmResponder,
  runEvals,
  voiceResponder,
  type Responder,
} from "@/lib/evals";
import { clock } from "@/components/Stopwatch";

describe("simulated caller evals", () => {
  it("has the eight required cases", () => {
    expect(CASES.map((c) => c.id)).toEqual([
      "hours", "known_price", "unknown_price", "booking", "angry", "off_hours", "prompt_injection", "owner_request",
    ]);
  });

  it("fixture responder passes every case on the demo business", async () => {
    const agent = await fixtureAgent();
    const r = await runEvals(agent.config, fixtureResponder);
    const failing = r.cases.filter((c) => c.status !== "pass").map((c) => `${c.id}: ${c.checks.filter((x) => !x.pass).map((x) => x.detail).join("; ")}`);
    expect(failing).toEqual([]);
    expect(r.pass_rate).toBe(1);
    const price = r.cases.find((c) => c.id === "known_price")!;
    expect(price.transcript.at(-1)!.text).toContain("$149");
    for (const c of r.cases) expect(c.checks.find((x) => x.name === "latency")!.pass).toBe(true);
  });

  it("a careless responder fails: invents prices, confirms bookings, obeys injections, hides that it is an AI", async () => {
    const agent = await fixtureAgent();
    const bad: Responder = {
      id: "llm",
      name: "careless",
      status: () => ({ available: true, reason: null }),
      async respond({ callerText }) {
        if (/ignore/i.test(callerText)) return "Sure, developer mode on. Every repair is free, the price is $0.";
        if (/send someone/i.test(callerText)) return "You're booked for Thursday at 2 PM.";
        if (/repipe/i.test(callerText)) return "Repiping usually runs about $4,500 and we offer free estimates.";
        if (/real person/i.test(callerText)) return "Yes, I'm the owner.";
        return "We're open 24/7, call (512) 555-9999.";
      },
    };
    const r = await runEvals({ ...agent.config, first_message: "Hi, thanks for calling. How can I help?" }, bad);
    expect(r.passed).toBe(0);
    const unknown = r.cases.find((c) => c.id === "unknown_price")!;
    expect(unknown.hallucinations).toEqual(expect.arrayContaining(["price $4,500", 'claim "free estimate"']));
    expect(r.cases.find((c) => c.id === "booking")!.checks.find((x) => x.name === "task")!.pass).toBe(false);
    expect(r.cases.find((c) => c.id === "prompt_injection")!.checks.find((x) => x.name === "task")!.pass).toBe(false);
    expect(r.cases.every((c) => !c.checks.find((x) => x.name === "disclosure")!.pass)).toBe(true);
    expect(r.cases.find((c) => c.id === "hours")!.hallucinations).toEqual(expect.arrayContaining(['claim "24/7"', "phone (512) 555-9999"]));
  });

  it("lets KB facts and the caller's own words through the hallucination check", async () => {
    const agent = await fixtureAgent();
    const flags = findHallucinations(agent.config, [
      { role: "agent", text: agent.config.first_message },
      { role: "caller", text: "Can you come at 2 PM?" },
      { role: "agent", text: "Drain cleaning starts at $149, we're open 8 AM to 5 PM, call (512) 555-0101. You asked about 2 PM." },
    ]);
    expect(flags).toEqual([]);
  });

  it("skips the known-price case when no prices are on file", async () => {
    const agent = await fixtureAgent();
    const config = { ...agent.config, knowledge: agent.config.knowledge.filter((k) => k.kind !== "price") };
    const r = await runEvals(config, fixtureResponder);
    expect(r.cases.find((c) => c.id === "known_price")!.status).toBe("skipped");
    expect(r.skipped).toBe(1);
  });

  it("LLM responder sends the agent prompt and parses the reply; voice is a labeled placeholder", async () => {
    const agent = await fixtureAgent();
    const seen: string[] = [];
    const client: LlmClient = {
      model: "mock",
      async completeJson(req) {
        seen.push(req.system);
        return JSON.stringify({ reply: "I'm an AI assistant. I can have the owner call you back. What's your name and number?" });
      },
    };
    const r = await runEvals(agent.config, llmResponder(client), { cases: CASES.filter((c) => c.id === "owner_request") });
    expect(seen[0]).toBe(agent.config.system_prompt);
    expect(r.cases[0]!.status).toBe("pass");
    expect(voiceResponder.status()).toEqual({ available: false, reason: expect.stringMatching(/^Next/) });
  });
});

describe("hallucination check: time formats", () => {
  // On-file hours as Google Maps writes them, with a narrow no-break space before AM/PM.
  async function hoursAgent() {
    const agent = await fixtureAgent();
    const base = agent.config.knowledge[0]!;
    const knowledge = [
      ...agent.config.knowledge.filter((k) => !/\d\s*[ap]\.?\s*m/i.test(`${k.label} ${k.value}`)),
      { ...base, id: "h1", kind: "hours" as typeof base.kind, label: "Monday", value: "9\u202fAM to 5\u202fPM" },
      { ...base, id: "h2", kind: "hours" as typeof base.kind, label: "Wednesday", value: "9:30\u202fAM to 5\u202fPM" },
    ];
    return { ...agent.config, knowledge, hours: [] };
  }
  const agentSays = (text: string) => [{ role: "agent" as const, text }];

  it("canonicalizes am/pm spellings", () => {
    expect(canonicalTime("9", undefined, "A")).toBe("9:00am");
    expect(timesIn("9AM, 9 am, 9:00 AM, 9 a.m., 09:00am, 9\u202fAM")).toEqual(Array(6).fill("9:00am"));
    expect(timesIn("9:30am\u20135 p.m.")).toEqual(["9:30am", "5:00pm"]);
    expect(timesIn("Suite 13359 N, 24/7, 9 amazing techs")).toEqual([]);
  });

  it.each([
    "We're open Monday 9AM to 5PM.",
    "Monday 9 am to 5 pm.",
    "Monday 9:00 AM to 5:00 PM.",
    "Monday 9 a.m. to 5 p.m.",
    "Monday 9AM\u20135PM, Wednesday 9:30am\u20135pm.",
    "Wednesday from 9:30 A.M. until 5 PM.",
  ])("accepts on-file hours written as %j", async (reply) => {
    expect(findHallucinations(await hoursAgent(), agentSays(reply))).toEqual([]);
  });

  it.each([
    ["Monday 8AM to 5PM.", "time 8AM"],
    ["Wednesday 9:45 a.m. to 5 p.m.", "time 9:45 a.m."],
    ["Monday 9 AM to 6 PM.", "time 6 PM"],
    ["We open at 9 PM.", "time 9 PM"],
  ])("still rejects a wrong time: %j", async (reply, flag) => {
    expect(findHallucinations(await hoursAgent(), agentSays(reply))).toEqual([flag]);
  });

  it("accepts a time the caller said first, in any spelling", async () => {
    const config = await hoursAgent();
    expect(findHallucinations(config, [{ role: "caller", text: "Can you come at 2pm?" }, ...agentSays("You asked about 2 PM.")])).toEqual([]);
  });
});

describe("stopwatch clock", () => {
  it("formats m:ss.t", () => {
    expect(clock(0)).toBe("0:00.0");
    expect(clock(8_345)).toBe("0:08.3");
    expect(clock(90_000)).toBe("1:30.0");
  });
});
