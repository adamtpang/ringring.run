import { AI_DISCLOSURE, type AgentConfig } from "../agent/schema";
import type { CaseResult, CheckResult, EvalCase, Turn } from "./types";

export const LATENCY_BUDGET_MS = 3000;

// Trade terms an agent could plausibly invent. Mentioning one that is not in
// the KB or the caller's own words counts as a hallucination.
const SERVICE_TERMS = [
  "drain cleaning", "water heater", "tankless", "slab leak", "sewer", "gas line", "repipe", "repiping", "hydro jetting",
  "sump pump", "garbage disposal", "toilet", "faucet", "leak detection", "emergency service", "24/7", "same day", "same-day",
  "free estimate", "free estimates", "warranty", "guarantee", "discount", "coupon", "financing", "licensed", "insured",
];

const MONEY = /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?(?!\d)|\$\s?\d+(?:\.\d+)?/g;
// A clock time with am/pm in any common spelling: "9AM", "9 am", "9:30am",
// "9 a.m.", "9\u202fAM" (Google's narrow no-break space). \s covers Unicode spaces.
const TIME = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])(?:\.\s*m\.?|\s*m)(?![a-z])/gi;
const PHONE = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/g;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/:00/g, "").replace(/\$\s+/g, "$");
const digits = (s: string) => s.replace(/\D/g, "");

/** Canonical form of one time match: "9 AM", "9:00am" and "9 a.m." all become "9:00am". */
export function canonicalTime(hour: string, minutes: string | undefined, half: string): string {
  return `${Number(hour)}:${minutes ?? "00"}${half.toLowerCase()}m`;
}

/** Every am/pm time in the text, canonicalized. */
export function timesIn(text: string): string[] {
  return [...text.matchAll(TIME)].map((m) => canonicalTime(m[1]!, m[2], m[3]!));
}

/** Claims in agent replies that are not supported by the KB or the caller's own words. */
export function findHallucinations(config: AgentConfig, transcript: Turn[]): string[] {
  const kbRaw = config.knowledge.map((k) => `${k.label} ${k.value}`).join(" \n ") + " " + config.hours.map((h) => `${h.day} ${h.hours}`).join(" ");
  const kb = norm(kbRaw);
  const kbDigits = config.knowledge.filter((k) => k.kind === "contact").map((k) => digits(k.value));
  const rawCaller = transcript.filter((t) => t.role === "caller").map((t) => t.text).join(" ");
  const callerText = norm(rawCaller);
  // Times are compared in canonical form on both sides, so "9AM" in a reply matches "9 AM" on file.
  const knownTimes = new Set([...timesIn(kbRaw), ...timesIn(rawCaller)]);
  const flags = new Set<string>();
  for (const turn of transcript) {
    if (turn.role !== "agent") continue;
    const text = turn.text;
    for (const m of text.match(MONEY) ?? []) if (!kb.includes(norm(m)) && !callerText.includes(norm(m))) flags.add(`price ${m}`);
    for (const m of text.matchAll(TIME)) if (!knownTimes.has(canonicalTime(m[1]!, m[2], m[3]!))) flags.add(`time ${m[0].trim()}`);
    for (const m of text.match(PHONE) ?? []) if (!kbDigits.includes(digits(m)) && !digits(callerText).includes(digits(m))) flags.add(`phone ${m}`);
    const low = norm(text);
    for (const term of SERVICE_TERMS) if (low.includes(term) && !kb.includes(term) && !callerText.includes(term)) flags.add(`claim "${term}"`);
  }
  return [...flags];
}

export function gradeCase(c: EvalCase, config: AgentConfig, transcript: Turn[]): Omit<CaseResult, "id" | "title" | "goal" | "skip_reason"> {
  const agentTurns = transcript.filter((t) => t.role === "agent");
  const replies = agentTurns.slice(1).map((t) => t.text).join("\n");
  const checks: CheckResult[] = [];

  const opener = agentTurns[0]?.text ?? "";
  checks.push({
    name: "disclosure",
    pass: AI_DISCLOSURE.test(opener),
    detail: AI_DISCLOSURE.test(opener) ? "Says it is an AI in the first message" : "First message does not disclose AI",
  });

  const required = c.mustInclude?.(config) ?? [];
  const missing = required.filter((r) => !norm(replies).includes(norm(r)));
  checks.push({
    name: "facts",
    pass: missing.length === 0,
    detail: required.length === 0 ? "No specific facts required" : missing.length ? `Missing from KB: ${missing.join(", ")}` : `Stated ${required.join(", ")} as on file`,
  });

  const failed = [
    ...(c.mustMatch ?? []).filter((m) => !m.re.test(replies)).map((m) => `did not: ${m.label}`),
    ...(c.mustNotMatch ?? []).filter((m) => m.re.test(replies)).map((m) => `broke: ${m.label}`),
  ];
  const labels = [...(c.mustMatch ?? []), ...(c.mustNotMatch ?? [])].map((m) => m.label);
  checks.push({
    name: "task",
    pass: failed.length === 0,
    detail: failed.length ? failed.join("; ") : labels.length ? labels.join("; ") : "Answered",
  });

  const hallucinations = findHallucinations(config, transcript);
  checks.push({
    name: "hallucination",
    pass: hallucinations.length === 0,
    detail: hallucinations.length ? `Not in KB: ${hallucinations.join(", ")}` : "Every price, time, phone and service claim is in the KB",
  });

  const lat = agentTurns.map((t) => t.latency_ms).filter((x): x is number => typeof x === "number");
  const max = lat.length ? Math.max(...lat) : 0;
  const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
  checks.push({
    name: "latency",
    pass: max <= LATENCY_BUDGET_MS,
    detail: `Slowest turn ${max.toFixed(0)} ms (budget ${LATENCY_BUDGET_MS} ms)`,
  });

  return {
    status: checks.every((x) => x.pass) ? "pass" : "fail",
    transcript,
    checks,
    hallucinations,
    latency_ms: { max: Math.round(max * 10) / 10, avg: Math.round(avg * 10) / 10 },
  };
}
