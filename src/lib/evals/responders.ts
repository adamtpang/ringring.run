import type { AgentConfig, KnowledgeItem } from "../agent/schema";
import { createChatLlmClient, type LlmClient } from "../diagnose/llm-client";
import { configured, forceDemo } from "../env";
import { isSuspicious } from "../untrusted";
import type { Responder, RespondInput } from "./types";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CONTACT_ASK = "What's your name and the best number to reach you?";

export function hoursSummary(c: AgentConfig): string {
  if (c.hours.length) {
    // Group consecutive days with identical hours: "Monday to Friday, 8 AM to 5 PM".
    const groups: { from: string; to: string; hours: string }[] = [];
    for (const h of c.hours) {
      const last = groups[groups.length - 1];
      if (last && last.hours === h.hours) last.to = h.day;
      else groups.push({ from: h.day, to: h.day, hours: h.hours });
    }
    return groups.map((g) => `${g.from === g.to ? g.from : DAYS.indexOf(g.to) - DAYS.indexOf(g.from) === 1 ? `${g.from} and ${g.to}` : `${g.from} to ${g.to}`}, ${g.hours}`).join("; ");
  }
  return c.knowledge.find((k) => k.kind === "hours")?.value ?? "";
}

const STOP = new Set(
  "how much what does do you is it the a an for to my of on in your cost costs price prices charge fee quote estimate would can i me get".split(" "),
);
function words(s: string) {
  return s.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}
function matchFact(items: KnowledgeItem[], text: string): KnowledgeItem | undefined {
  const asked = new Set(words(text));
  let best: { k: KnowledgeItem; n: number } | undefined;
  for (const k of items) {
    const n = words(`${k.label} ${k.value}`).filter((w) => asked.has(w)).length;
    if (n > 0 && (!best || n > best.n)) best = { k, n };
  }
  return best?.k;
}

/**
 * Deterministic rule-based stand-in for the voice agent. It only reads the
 * agent config, so it shows what a perfectly obedient agent would say. It is
 * a test harness for the config and the grader, not a claim about model quality.
 */
export function fixtureReply(config: AgentConfig, callerText: string): string {
  const t = callerText.toLowerCase();
  const unknown = `I don't have that information on file, but I can have the owner call you back. ${CONTACT_ASK}`;

  if (isSuspicious(callerText)) {
    return `I can't change how I work. I'm an AI assistant for ${config.business_name} and can only share what the business has on file, or take a message for the owner. ${CONTACT_ASK}`;
  }
  // Spanish or another language: English only for now, never claim otherwise.
  if (/[¿¡ñ]|\b(hablan?|espa[nñ]ol|necesito|ayuda|hola|por favor)\b/i.test(callerText)) {
    return `I'm sorry, I can only help in English right now. I can have the owner call you back. ${CONTACT_ASK}`;
  }
  if (/\b(text|sms|txt)\b(?!\s*(of|on))/.test(t) && /\b(me|us|you)\b/.test(t)) {
    return `I can't send text messages, but I can have the owner call you back. ${CONTACT_ASK}`;
  }
  if (/\b(real person|human|robot|are you (an? )?(ai|bot))\b/.test(t) || /\b(owner|manager|speak to (someone|a person))\b/.test(t)) {
    return `I'm an AI assistant, not a person. I can take a message and have the owner call you back. ${CONTACT_ASK}`;
  }
  if (/ridiculous|angry|frustrat|terrible|unacceptable|nobody (ever )?(picks|answers)|fed up/.test(t)) {
    return `I'm sorry you had trouble reaching us. I can make sure the owner gets your message and calls you back. ${CONTACT_ASK}`;
  }
  if (/\b(open|hours|close[sd]?)\b/.test(t)) {
    const day = DAYS.find((d) => t.includes(d.toLowerCase()));
    const summary = hoursSummary(config);
    if (day) {
      const h = config.hours.find((x) => x.day === day);
      const lead = h
        ? /closed/i.test(h.hours)
          ? `We're closed on ${day}.`
          : `On ${day} our listed hours are ${h.hours}, so outside that we're closed.`
        : `I don't have ${day} hours on file.`;
      return `${lead}${summary ? ` Our listed hours are ${summary}.` : ""} I can have the owner call you back. ${CONTACT_ASK}`;
    }
    return summary ? `Our listed hours are ${summary}.` : unknown;
  }
  if (/\b(book|schedul|appointment|come out|send someone|available)\w*/.test(t)) {
    return `I can't confirm a time myself, but I can take a booking request and the owner will call you to confirm. ${CONTACT_ASK} And what's the service address?`;
  }
  if (/\b(how much|price|cost|charge|fee|quote|estimate)\b/.test(t)) {
    const p = matchFact(config.knowledge.filter((k) => k.kind === "price"), callerText);
    return p ? `The business lists this: ${p.value} For an exact quote, the owner can call you back.` : unknown;
  }
  if (/\b(do you|can you) (do|fix|handle|repair|install)\b/.test(t)) {
    const s = matchFact(config.knowledge.filter((k) => k.kind === "service" || k.kind === "faq"), callerText);
    return s ? `Yes, ${s.value.replace(/\.$/, "")} is on file for us. I can have the owner call you back with details. ${CONTACT_ASK}` : unknown;
  }
  return unknown;
}

export const fixtureResponder: Responder = {
  id: "fixture",
  name: "Fixture (rule-based)",
  status: () => ({ available: true, reason: null }),
  async respond({ config, callerText }) {
    return fixtureReply(config, callerText);
  },
};

export function llmResponder(client?: LlmClient): Responder {
  return {
    id: "llm",
    name: "LLM (text)",
    status() {
      if (client) return { available: true, reason: null };
      if (forceDemo()) return { available: false, reason: "Demo mode is on (FORCE_DEMO)." };
      return configured().llm ? { available: true, reason: null } : { available: false, reason: "Set XAI_API_KEY or LLM_API_KEY to run the LLM responder." };
    },
    async respond({ config, history, callerText }: RespondInput) {
      const c = client ?? createChatLlmClient();
      const transcript = history.map((h) => `${h.role === "agent" ? "Agent" : "Caller"}: ${h.text}`).join("\n");
      const raw = await c.completeJson({
        system: config.system_prompt,
        user: `Phone call transcript so far:\n${transcript}\nCaller: ${callerText}\n\nWrite the agent's next spoken reply.`,
        schemaName: "agent_reply",
        schema: { type: "object", properties: { reply: { type: "string" } }, required: ["reply"], additionalProperties: false },
        timeoutMs: 30_000,
      });
      const parsed = JSON.parse(raw) as { reply?: unknown };
      return typeof parsed.reply === "string" ? parsed.reply : "";
    },
  };
}

/** Placeholder: simulated calls over real audio are Next. Never available. */
export const voiceResponder: Responder = {
  id: "voice",
  name: "Voice (Next)",
  status: () => ({ available: false, reason: "Next: simulated calls over audio are not built yet." }),
  async respond() {
    throw new Error("Voice responder is not built yet");
  },
};

export const RESPONDERS = [fixtureResponder, llmResponder(), voiceResponder];
