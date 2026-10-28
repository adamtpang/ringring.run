import { z } from "zod";
import { ASSUMPTION_QUESTIONS, COACHING } from "./gameplan";
import { INTERVIEW } from "./prescription";
import type { KnowledgeFact } from "./types";
import type { NewKnowledgeFact } from "./store/types";

// Owner interview: Ringy asks the questions from the game plan (interview.json,
// the assumption questions and the check questions) and the owner's answers are
// saved to the business profile as owner-sourced knowledge facts.
//
// Answers are private to the owner: they never go into the phone agent's
// knowledge base and never feed a dollar figure without the owner editing it in.

export const INTERVIEW_REF_PREFIX = "interview:";
export const INTERVIEW_MODES = ["text", "voice"] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];
export const MAX_QUESTIONS = 8;
export const MAX_ANSWER_CHARS = 1000;

/** Every question Ringy is allowed to ask. Anything else is rejected, so a request can't put its own text in the voice prompt. */
export function allowedQuestions(): Set<string> {
  return new Set([...Object.values(INTERVIEW).flat(), ...Object.values(ASSUMPTION_QUESTIONS), ...Object.values(COACHING.check_questions)]);
}

export const isInterviewFact = (f: Pick<KnowledgeFact, "source_type" | "source_ref">) => f.source_type === "owner" && f.source_ref.startsWith(INTERVIEW_REF_PREFIX);

const Question = z.string().refine((q) => allowedQuestions().has(q), "Not one of Ringy's interview questions");

export const QuestionsSchema = z.object({ questions: z.array(Question).min(1).max(MAX_QUESTIONS) });

export const SaveAnswersSchema = z.object({
  mode: z.enum(INTERVIEW_MODES),
  conversation_id: z.string().regex(/^[A-Za-z0-9_-]{4,80}$/).optional(),
  answers: z
    .array(z.object({ question: Question, answer: z.string().trim().max(MAX_ANSWER_CHARS) }))
    .max(MAX_QUESTIONS)
    .transform((a) => a.filter((x) => x.answer.length > 0))
    .refine((a) => a.length > 0, "Answer at least one question"),
});
export type SaveAnswers = z.infer<typeof SaveAnswersSchema>;

export function answersToFacts(businessId: string, body: SaveAnswers, now = new Date()): NewKnowledgeFact[] {
  const ref = `${INTERVIEW_REF_PREFIX}${body.mode}:${now.toISOString()}${body.conversation_id ? `:${body.conversation_id}` : ""}`;
  return body.answers.map((a) => ({ business_id: businessId, kind: "faq", label: a.question, value: a.answer, source_type: "owner", source_ref: ref, quote: null }));
}

export interface SavedAnswer {
  question: string;
  answer: string;
  mode: InterviewMode;
  saved_at: string;
}

/** Newest saved answer per question. */
export function latestAnswers(facts: KnowledgeFact[]): SavedAnswer[] {
  const by = new Map<string, SavedAnswer>();
  for (const f of facts) {
    if (!isInterviewFact(f)) continue;
    const mode: InterviewMode = f.source_ref.slice(INTERVIEW_REF_PREFIX.length).startsWith("voice") ? "voice" : "text";
    const prev = by.get(f.label);
    if (!prev || f.created_at > prev.saved_at) by.set(f.label, { question: f.label, answer: f.value, mode, saved_at: f.created_at });
  }
  return [...by.values()].sort((a, b) => a.saved_at.localeCompare(b.saved_at));
}

// ---------- voice transcript -> answers ----------

export interface Turn {
  role: "agent" | "user";
  message: string;
}

export const TYPE_INSTEAD = "You can type your answers below instead.";

/**
 * Turn a raw voice failure (browser, network, ElevenLabs, or our API) into one
 * plain sentence that always ends by pointing at the typed answers, so a failed
 * call never leaves the owner stuck.
 */
export function voiceErrorMessage(raw: unknown): string {
  const m = (raw instanceof Error ? raw.message : String(raw ?? "")).trim();
  let lead: string;
  if (/notallowed|permission|denied/i.test(m)) lead = "The browser blocked the microphone. Allow it in the address bar and try again.";
  else if (/notfound|requested device|no microphone|device not found|notreadable|could not start audio/i.test(m)) lead = "No working microphone was found. Plug one in or pick it in your sound settings, then try again.";
  else if (/quota|credit|limit|exceed/i.test(m)) lead = "Ringy's voice minutes are used up for now.";
  else if (/unexpected token|not valid json|json/i.test(m)) lead = "The voice service did not answer properly.";
  else if (/socket|connection|network|failed to fetch|load failed|closed/i.test(m)) lead = "The voice connection dropped. Check the internet connection and try again.";
  else lead = m ? (/[.!?]$/.test(m) ? m : `${m}.`) : "Voice is unavailable right now.";
  return `${lead} ${TYPE_INSTEAD}`;
}

/** One short line for a call that ended on an error mid-way (network drop, voice minutes running out). */
export function droppedCallNote(raw: unknown): string {
  const m = raw instanceof Error ? raw.message : String(raw ?? "");
  return /quota|credit|limit|exceed/i.test(m) ? "Ringy's voice minutes ran out during the call." : "The call dropped before it finished.";
}

/** Drop voice style tags like "[calm]" and lone filler like "..." from a spoken turn. */
export function cleanMessage(m: string | null | undefined): string {
  const t = (m ?? "").replace(/\[[a-z][a-z ]{1,24}\]\s*/gi, "").replace(/\s+/g, " ").trim();
  return /[a-z0-9]/i.test(t) ? t : "";
}

const STOP = new Set(["the", "and", "you", "your", "what", "how", "about", "are", "for", "with", "that", "this", "does", "did", "have", "any", "many", "much", "out", "they", "who", "when", "from", "into", "there", "their", "one", "can", "would", "roughly", "normal", "usually"]);
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)));

/** Share of a question's content words that appear in an agent turn (0..1). */
export function questionScore(question: string, turn: string): number {
  const q = words(question);
  if (q.size === 0) return 0;
  const t = words(turn);
  let hit = 0;
  for (const w of q) if (t.has(w)) hit++;
  return hit / q.size;
}

/**
 * Map a conversation to answers. Ringy asks the questions in order; each agent
 * turn that matches a later question (half its content words or more) moves the
 * pointer, and the owner's turns are appended to the current question. Turns
 * before the first question are ignored.
 */
export function mapTranscript(questions: string[], turns: Turn[], threshold = 0.5): Record<string, string> {
  const out: Record<string, string> = Object.fromEntries(questions.map((q) => [q, ""]));
  let cur = -1;
  for (const t of turns) {
    const msg = cleanMessage(t.message);
    if (!msg) continue;
    if (t.role === "agent") {
      let best = -1;
      let bestScore = 0;
      for (let i = Math.max(cur, 0); i < questions.length; i++) {
        const sc = questionScore(questions[i] as string, msg);
        if (sc > bestScore) {
          best = i;
          bestScore = sc;
        }
      }
      // A repeat or clarification of the current question keeps the pointer where it is.
      if (bestScore >= threshold && best > cur) cur = best;
    } else if (cur >= 0) {
      const q = questions[cur] as string;
      out[q] = out[q] ? `${out[q]} ${msg}` : msg;
    }
  }
  return out;
}

// ---------- voice agent prompt ----------

const clean = (s: string, max: number) => s.replace(/[\r\n\t`{}<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function interviewPrompt(businessName: string, questions: string[]) {
  const name = clean(businessName, 80) || "the business";
  const prompt = [
    `You are Ringy from ringring.run: calm, warm and plain-spoken. You are talking with the owner of ${name} in their web browser to confirm a few facts for their diagnosis.`,
    "Rules:",
    "1. Ask the questions below in order, one at a time, close to word for word. Never skip ahead and never ask your own questions.",
    "2. After each answer, give a short neutral acknowledgement of a few words, then ask the next question. If an answer is unclear, ask once to clarify, then move on.",
    "3. Do not give advice, estimates, prices or numbers of your own, and do not promise anything.",
    "4. Speak English only. If the owner uses another language, say in English that you can only talk in English for now.",
    "5. Never ask for passwords, card numbers or account logins. If the owner offers one, say they do not need to share it.",
    "6. After the last question, say: \"Thanks, that's everything. Your answers will show on screen so you can check them before saving.\" Then end the call.",
    "Questions:",
    ...questions.map((q, i) => `${i + 1}. ${q}`),
  ].join("\n");
  const n = questions.length;
  const first_message = `Hi, I'm Ringy. I have ${n} quick ${n === 1 ? "question" : "questions"} about ${name}. First: ${questions[0]}`;
  return { prompt, first_message };
}
