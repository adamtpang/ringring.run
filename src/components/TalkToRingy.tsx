"use client";

import { useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Card, Field, SectionHeader, cx } from "@/components/ds";
import { CHANNELS, channelOf, CONSENT_VERSION, consentText, type ChannelState } from "@/lib/channels";
import type { ChannelId } from "@/lib/types";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function stateLabel(s?: ChannelState): string | null {
  if (!s || s.status === "none") return null;
  if (s.status === "withdrawn") return `Withdrawn ${when(s.consented_at!)}`;
  const to = s.contact ? ` (${s.contact})` : "";
  return s.status === "opted_in" ? `You opted in ${when(s.consented_at!)}` : `On the list ${when(s.consented_at!)}${to}`;
}

/** The owner picks how Ringy reaches them. Saves a consent record; sends nothing. */
export function TalkToRingy({ businessId, businessName, interviewHref, readOnly }: { businessId: string; businessName: string; interviewHref: string; readOnly?: boolean }) {
  const [pick, setPick] = useState<ChannelId>("browser_voice");
  const [contact, setContact] = useState("");
  const [agree, setAgree] = useState(false);
  const [states, setStates] = useState<ChannelState[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const url = `/api/businesses/${businessId}/channels`;

  useEffect(() => {
    if (readOnly) return;
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d?.channels && setStates(d.channels))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url, readOnly]);

  const ch = channelOf(pick);
  const cur = states.find((s) => s.channel === pick);
  const active = cur && (cur.status === "opted_in" || cur.status === "waitlist");

  async function send(action: "opt_in" | "withdraw") {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel: pick, action, consent: agree, contact: contact || undefined, consent_version: CONSENT_VERSION }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Could not save.");
      setStates(d.channels);
      setAgree(false);
      setMsg({ ok: true, text: action === "withdraw" ? "Withdrawn. Ringy will not use this channel." : ch.live ? "Saved. Start a voice session whenever you like." : "Saved. You are on the list; nothing will be sent until you confirm again." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="lg" id="talk">
      <SectionHeader
        eyebrow="Talk to Ringy"
        title="Choose how Ringy reaches you"
        description="You opt in first. Ringy does not call, text or email a business that has not asked, and today only browser voice works."
      />
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label="Channel">
        {CHANNELS.map((c) => {
          const label = stateLabel(states.find((s) => s.channel === c.id));
          const on = c.id === pick;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setPick(c.id);
                setAgree(false);
                setMsg(null);
              }}
              className={cx(
                "pressable flex min-w-0 flex-col items-start gap-1.5 rounded-md p-3 text-left ring-1 ring-inset transition-shadow",
                on ? "bg-accent-soft ring-2 ring-accent" : "bg-sunken ring-hairline hover:ring-hairline-strong",
              )}
            >
              <span className="flex w-full flex-wrap items-center justify-between gap-1">
                <span className="text-footnote font-semibold">{c.label}</span>
                <Badge tone={c.live ? "success" : "neutral"}>{c.live ? "Live" : "Coming soon"}</Badge>
              </span>
              {label && <span className="text-caption font-medium text-accent">{label}</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-md bg-sunken p-4 ring-1 ring-inset ring-hairline">
        <p className="text-footnote font-semibold">{ch.label}</p>
        <p className="mt-0.5 text-footnote text-muted">{ch.today}</p>
        {readOnly ? (
          <p className="mt-3 text-caption text-subtle">Saving is off in the saved snapshot. Open a live report to choose a channel.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {ch.contact !== "none" && (
              <Field
                label={ch.contact === "email" ? "Your email" : "Your mobile number"}
                type={ch.contact === "email" ? "email" : "tel"}
                autoComplete={ch.contact === "email" ? "email" : "tel"}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={ch.contact === "email" ? "you@yourbusiness.com" : "+1 512 555 0100"}
                className="max-w-sm"
              />
            )}
            <label className="flex items-start gap-2.5">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" />
              <span className="text-footnote">{consentText(pick, businessName)}</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={!agree || busy} onClick={() => send("opt_in")}>
                {ch.live ? "Save my choice" : "Join the list"}
              </Button>
              {ch.live && (
                <ButtonLink size="sm" variant="secondary" href={interviewHref}>
                  Start a voice session
                </ButtonLink>
              )}
              {active && (
                <Button size="sm" variant="plain" disabled={busy} onClick={() => send("withdraw")}>
                  Withdraw
                </Button>
              )}
            </div>
            {msg && <p className={cx("text-footnote", msg.ok ? "text-success" : "text-danger")} role="status">{msg.text}</p>}
            <p className="text-caption text-subtle">We store your choice, the words above and the time you agreed. Contacts stay on the server and show masked here.</p>
          </div>
        )}
      </div>
    </Card>
  );
}
