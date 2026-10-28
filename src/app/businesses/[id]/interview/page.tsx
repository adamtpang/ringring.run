"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Badge, Button, Card, cx } from "@/components/ds";
import { useGamePlan } from "@/components/GamePlan";
import { usePeerBoard, usePeerSubject } from "@/components/PeersSection";
import { SnapshotBanner, snapQs, useReportUrl } from "@/components/Snapshot";
import { BackLink, dateTime12, PageShell, usePoll } from "@/components/ui";
import { cleanMessage, droppedCallNote, mapTranscript, MAX_ANSWER_CHARS, voiceErrorMessage, type InterviewMode, type SavedAnswer, type Turn } from "@/lib/interview";
import type { SnapshotMeta } from "@/lib/snapshot";
import type { Business, Finding, KnowledgeFact, Review, RoiEstimate, Run } from "@/lib/types";

interface Report {
  business: Business;
  run: Run | null;
  reviews: Review[];
  findings: Finding[];
  roi: RoiEstimate[];
  knowledge?: KnowledgeFact[];
  interview?: SavedAnswer[];
  interviewVoice?: { available: boolean; reason: string | null };
  snapshot?: SnapshotMeta;
}

export default function InterviewPage() {
  const { id } = useParams<{ id: string }>();
  const url = useReportUrl(id);
  const { data, error } = usePoll<Report>(url, () => false);
  const subject = usePeerSubject(data?.business ?? null, data?.reviews ?? null);
  const board = usePeerBoard(subject);
  const planInput = useMemo(
    () =>
      data && data.business.diagnosis_status === "ok"
        ? { business: data.business, findings: data.findings, roi: data.roi, reviews: data.reviews, knowledge: data.knowledge ?? [], board, subject, scanDate: data.run?.created_at ?? data.business.created_at }
        : null,
    [data, board, subject],
  );
  const plan = useGamePlan(planInput);

  if (error) return <PageShell width="narrow"><p className="rounded-md bg-danger-soft px-4 py-3 text-footnote text-danger">{error}</p></PageShell>;
  if (!data) return <PageShell width="narrow"><p className="text-footnote text-muted">Loading interview…</p></PageShell>;
  const b = data.business;
  const qs = snapQs(data.snapshot);

  return (
    <PageShell width="narrow">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <BackLink href={`/businesses/${b.id}/diagnosis${qs}`}>Diagnosis</BackLink>
        <Link href={`/businesses/${b.id}${qs}`} className="text-footnote font-medium text-accent hover:underline">Full report</Link>
      </div>
      <SnapshotBanner snapshot={data.snapshot} />
      <header>
        <p className="text-eyebrow uppercase text-accent">Step 3 · Owner interview</p>
        <h1 className="mt-1 text-title-1">Talk to Ringy about {b.name}</h1>
        <p className="mt-2 text-callout text-muted">
          A few questions to check the diagnosis against what you know. Your answers are saved to your business profile. They stay private: they are not added to the phone agent and do not change any dollar figure on their own.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>You do this: answer what you can, skip the rest</Badge>
          <Badge tone="accent">Ringy does this after your OK: saves your answers</Badge>
        </div>
      </header>
      {!plan ? (
        <p className="text-footnote text-muted">The interview opens once the diagnosis is finished.</p>
      ) : (
        <Interview
          key={b.id}
          businessId={b.id}
          questions={plan.questions}
          saved={data.interview ?? []}
          voice={data.snapshot ? { available: false, reason: "Voice and saving are off while this page shows a saved snapshot." } : data.interviewVoice ?? { available: false, reason: "Voice is not set up on this server. Type your answers instead." }}
          readOnly={!!data.snapshot}
        />
      )}
    </PageShell>
  );
}

type Phase = "idle" | "connecting" | "live" | "reading" | "done" | "error";

interface Session {
  endSession(): Promise<void>;
  getId(): string;
}

function Interview({ businessId, questions, saved: initialSaved, voice, readOnly }: { businessId: string; questions: string[]; saved: SavedAnswer[]; voice: { available: boolean; reason: string | null }; readOnly: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(questions.map((q) => [q, initialSaved.find((s) => s.question === q)?.answer ?? ""])));
  const [mode, setMode] = useState<InterviewMode>("text");
  const [convId, setConvId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [live, setLive] = useState<Turn[]>([]);
  const [voiceMsg, setVoiceMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const session = useRef<Session | null>(null);
  const liveRef = useRef<Turn[]>([]);

  const apiBase = `/api/businesses/${businessId}/interview`;

  async function readTranscript(id: string, dropped: string | null = null) {
    setPhase("reading");
    let answers: Record<string, string> | null = null;
    let note = "From your conversation. Check and edit before saving.";
    // After a dropped call, don't make the owner wait long for a saved copy that may never come.
    for (let i = 0; i < (dropped ? 3 : 12) && !answers; i++) {
      const r = await fetch(`${apiBase}/voice/transcript`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questions, conversation_id: id }) }).catch(() => null);
      const j = r ? await r.json().catch(() => null) : null;
      if (r?.ok && j && j.status !== "in-progress" && j.status !== "processing" && (j.turns?.length ?? 0) > 0) answers = j.answers;
      else if (r && !r.ok && r.status !== 404) break;
      else await new Promise((res) => setTimeout(res, 2000));
    }
    if (!answers) {
      answers = mapTranscript(questions, liveRef.current);
      note = "From the on-screen transcript (the saved call was not ready yet). Check and edit before saving.";
    }
    const filled = Object.values(answers).filter((a) => a.trim()).length;
    setDrafts((d) => ({ ...d, ...Object.fromEntries(Object.entries(answers).filter(([, a]) => a.trim())) }));
    setMode("voice");
    setConvId(id);
    const result = filled ? `${note} ${filled} of ${questions.length} answered.` : "Ringy didn't catch any answers. You can try again or type them below.";
    setVoiceMsg(dropped ? `${dropped} ${result}` : result);
    setPhase("done");
  }

  async function start() {
    setVoiceMsg(null);
    setLive([]);
    liveRef.current = [];
    setPhase("connecting");
    try {
      const r = await fetch(`${apiBase}/voice`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questions }) });
      const j = await r.json().catch(() => ({ error: `The voice service did not answer properly (HTTP ${r.status}).` }));
      if (!r.ok || !j.signedUrl) throw new Error(j.error ?? "Voice is unavailable right now.");
      const { Conversation } = await import("@elevenlabs/client");
      let id = "";
      const conv = await Conversation.startSession({
        signedUrl: j.signedUrl as string,
        connectionType: "websocket",
        onMessage: (m) => {
          const t: Turn = { role: m.role === "agent" ? "agent" : "user", message: cleanMessage(m.message) };
          if (!t.message) return;
          liveRef.current = [...liveRef.current, t];
          setLive(liveRef.current);
        },
        onModeChange: ({ mode }) => setSpeaking(mode === "speaking"),
        onDisconnect: (details) => {
          session.current = null;
          const dropped = details.reason === "error" ? droppedCallNote(details.message) : null;
          if (id) void readTranscript(id, dropped);
          else setPhase("idle");
        },
        onError: (msg) => setVoiceMsg(String(msg)),
      });
      id = conv.getId();
      session.current = conv;
      setPhase("live");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setVoiceMsg(voiceErrorMessage(msg));
      setPhase("error");
    }
  }

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const body = { mode, ...(convId ? { conversation_id: convId } : {}), answers: questions.map((q) => ({ question: q, answer: drafts[q] ?? "" })) };
      const r = await fetch(apiBase, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `Save failed (HTTP ${r.status})`);
      setSaved(j.answers as SavedAnswer[]);
      setSaveMsg({ ok: true, text: "Saved to your business profile." });
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  const answered = questions.filter((q) => (drafts[q] ?? "").trim()).length;

  return (
    <div className="space-y-6">
      <Card as="section" padding="lg" data-voice-state={phase} aria-labelledby="voice-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="voice-h" className="text-headline">Talk it through</h2>
          <Badge tone={voice.available ? "accent" : "neutral"}>{voice.available ? "Voice in your browser" : "Voice off"}</Badge>
        </div>
        {voice.available ? (
          <>
            <p className="mt-1 text-footnote text-muted">Ringy asks each question out loud and listens through your microphone. No phone call. Up to 5 minutes. Nothing is saved until you press Save below.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {phase === "live" ? (
                <Button variant="secondary" onClick={() => void session.current?.endSession()}>End conversation</Button>
              ) : (
                <Button onClick={() => void start()} disabled={phase === "connecting" || phase === "reading"}>
                  {phase === "connecting" ? "Connecting…" : phase === "reading" ? "Reading your answers…" : phase === "done" ? "Talk again" : "Start talking to Ringy"}
                </Button>
              )}
              {phase === "live" && <span className="text-footnote text-muted" aria-live="polite">{speaking ? "Ringy is talking…" : "Listening…"}</span>}
            </div>
            {live.length > 0 && (
              <ol className="mt-4 max-h-64 space-y-1.5 overflow-y-auto rounded-md bg-surface-2 p-3 text-footnote" aria-label="Transcript" data-transcript>
                {live.map((t, i) => (
                  <li key={i}>
                    <span className="font-semibold">{t.role === "agent" ? "Ringy" : "You"}:</span> {t.message}
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : (
          <p className="mt-1 text-footnote text-muted">{voice.reason}</p>
        )}
        {voiceMsg && <p className={cx("mt-3 text-footnote", phase === "error" ? "text-danger" : "text-muted")} role="status">{voiceMsg}</p>}
      </Card>

      <Card as="section" padding="lg" aria-labelledby="answers-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="answers-h" className="text-headline">Your answers</h2>
          <span className="text-caption text-subtle">{answered} of {questions.length} answered</span>
        </div>
        <p className="mt-1 text-footnote text-muted">Type or edit anything. Rough numbers are fine.</p>
        <ol className="mt-4 space-y-5">
          {questions.map((q, i) => {
            const s = saved.find((x) => x.question === q);
            return (
              <li key={q}>
                <label className="block">
                  <span className="block text-callout font-medium">{i + 1}. {q}</span>
                  <textarea
                    className="mt-2 min-h-20 w-full rounded-md bg-surface-2 px-3.5 py-2.5 text-callout text-foreground ring-1 ring-inset ring-hairline outline-none placeholder:text-subtle focus:ring-2 focus:ring-accent disabled:opacity-60"
                    value={drafts[q] ?? ""}
                    maxLength={MAX_ANSWER_CHARS}
                    disabled={readOnly}
                    placeholder="Your answer"
                    data-question={i}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q]: e.target.value }))}
                  />
                </label>
                {s && <p className="mt-1 text-caption text-subtle" data-saved-answer={i}>Saved {dateTime12(s.saved_at)} ({s.mode === "voice" ? "from a voice interview" : "typed"})</p>}
              </li>
            );
          })}
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} disabled={readOnly || saving || answered === 0}>{saving ? "Saving…" : "Save to my profile"}</Button>
          {readOnly && <span className="text-footnote text-muted">Saving is off while this page shows a saved snapshot.</span>}
          {saveMsg && <span className={cx("text-footnote", saveMsg.ok ? "text-success" : "text-danger")} role="status" data-save-result={saveMsg.ok ? "ok" : "error"}>{saveMsg.text}</span>}
        </div>
      </Card>
    </div>
  );
}
