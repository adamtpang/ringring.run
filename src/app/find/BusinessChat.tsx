"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, cx, inputClass } from "@/components/ds";
import type { ChatSource } from "@/lib/chat/chat";
import type { Place } from "@/lib/places/types";

interface Msg {
  role: "user" | "assistant";
  text: string;
  sources?: ChatSource[];
  note?: string;
}

const SOURCE_LABEL: Record<ChatSource["source_type"], string> = {
  osm: "OpenStreetMap",
  listing: "Google listing",
  website: "Website",
  review: "Google review",
  owner: "Owner",
};

const SUGGESTIONS = ["Are you open on Sunday?", "What's the address?", "Do you have outdoor seating?"];

/** Chat with a business's AI. Answers only from facts on file; each answer shows the facts it used. */
const DAYS = new Set(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);

type Chip = { id: string; label: string; source_type: ChatSource["source_type"]; title: string };

/** One chip per fact, except per-day hours, which collapse into one "Hours" chip per source. */
function chips(sources: ChatSource[]): Chip[] {
  const out: Chip[] = [];
  const hours = new Map<string, Chip>();
  for (const s of sources) {
    const line = `${s.label}: ${s.value}`;
    const h = DAYS.has(s.label) ? hours.get(s.source_type) : undefined;
    if (h) {
      h.title += `\n${line}`;
    } else if (DAYS.has(s.label)) {
      const chip: Chip = { id: s.id, label: "Hours", source_type: s.source_type, title: line };
      hours.set(s.source_type, chip);
      out.push(chip);
    } else {
      out.push({ id: s.id, label: s.label, source_type: s.source_type, title: `${line} (${SOURCE_LABEL[s.source_type]} ${s.source_ref})` });
    }
  }
  return out;
}

export function BusinessChat({ place, onClose }: { place: Place; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [meta, setMeta] = useState<{ responder: "llm" | "demo"; agent_source: "osm" | "scan"; facts: number } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ place, history: [] }) })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? "Chat is unavailable");
        if (!alive) return;
        setMeta({ responder: b.responder, agent_source: b.agent_source, facts: b.facts });
        setMsgs([{ role: "assistant", text: b.reply }]);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [place]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [msgs.length, busy]);

  async function send(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    const history = msgs.map(({ role, text }) => ({ role, text }));
    setMsgs((x) => [...x, { role: "user", text: m }]);
    setText("");
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place, history, message: m }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Chat is unavailable");
      setMsgs((x) => [...x, { role: "assistant", text: b.reply, sources: b.sources, note: b.note }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={`Chat with ${place.name}'s AI`} className="flex min-h-0 flex-col">
      <header className="flex items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <h3 className="truncate text-headline">{place.name}</h3>
          <p className="mt-0.5 text-caption text-muted">
            AI assistant
            {meta && ` · ${meta.facts} facts from ${meta.agent_source === "scan" ? "a scan" : "OpenStreetMap"}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {meta?.responder === "demo" && (
            <Badge tone="warning" title="No LLM key is set, so a rule-based responder answers from the same facts.">
              Demo responder
            </Badge>
          )}
          <Button variant="plain" size="sm" onClick={onClose} aria-label="Close chat">
            Done
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg bg-surface-2 p-3 ring-1 ring-inset ring-hairline" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={cx("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
            <p
              className={cx(
                "max-w-[85%] rounded-lg px-3 py-2 text-callout",
                m.role === "user" ? "bg-accent-solid text-white" : "bg-surface text-foreground shadow-card",
              )}
            >
              {m.text}
            </p>
            {m.sources && m.sources.length > 0 && (
              <ul className="mt-1.5 flex max-w-[85%] flex-wrap gap-1" aria-label="Facts used">
                {chips(m.sources).map((s) => (
                  <li
                    key={s.id}
                    title={s.title}
                    className="rounded-pill bg-surface px-2 py-0.5 text-caption text-muted ring-1 ring-inset ring-hairline"
                  >
                    {s.label} · {SOURCE_LABEL[s.source_type]}
                  </li>
                ))}
              </ul>
            )}
            {m.note && <p className="mt-1 text-caption text-subtle">{m.note}</p>}
          </div>
        ))}
        {busy && <p className="text-caption text-muted">Thinking…</p>}
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-footnote text-danger">
            {error}
          </p>
        )}
        <div ref={end} />
      </div>

      {msgs.length <= 1 && (
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={busy || !msgs.length}
              className="pressable shrink-0 rounded-pill bg-surface-2 px-3 py-1.5 text-footnote text-foreground ring-1 ring-inset ring-hairline hover:bg-sunken disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <label className="sr-only" htmlFor="chat-input">
          Message
        </label>
        <input
          id="chat-input"
          className={inputClass}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about hours, address, services"
          maxLength={500}
          autoComplete="off"
        />
        <Button type="submit" disabled={busy || !text.trim()} className="h-11">
          Send
        </Button>
      </form>
      <p className="mt-2 text-caption text-subtle">Preview of this business&apos;s AI. Messages are not sent to the business. Owner callbacks: Next.</p>
    </section>
  );
}
