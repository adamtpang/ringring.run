"use client";

import { useState } from "react";
import { Badge, Button, ButtonLink, Card, SectionHeader } from "./ds";
import type { AgentRecord, KnowledgeFact } from "@/lib/types";

export interface VoiceStatus {
  id: string;
  name: string;
  configured: boolean;
  missing: string[];
  reason: string | null;
}

const SOURCE_LABEL: Record<KnowledgeFact["source_type"], string> = {
  listing: "Google listing",
  website: "Website",
  review: "Google review",
  owner: "Owner",
};

export function seconds(ms: number | null | undefined) {
  if (ms == null) return "n/a";
  return `${(ms / 1000).toFixed(1)} s`;
}

/** The generated phone agent: what it says first, what it knows (with sources), its rules, and deploy state. */
export function AgentPanel({
  agent,
  voice,
  isFixture,
  onDeployed,
}: {
  agent: AgentRecord;
  voice: VoiceStatus | null;
  isFixture: boolean;
  onDeployed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const c = agent.config;
  const canDeploy = Boolean(voice?.configured) && agent.status !== "deployed";

  async function deploy() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/businesses/${agent.business_id}/agent/deploy`, { method: "POST" });
      const out = await res.json();
      setMsg(out.message ?? out.error ?? (res.ok ? "Deployed" : `HTTP ${res.status}`));
      onDeployed();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const status =
    agent.status === "deployed" ? (
      <Badge tone="success" dot>Deployed to {voice?.name ?? agent.provider}</Badge>
    ) : agent.status === "deploy_failed" ? (
      <Badge tone="danger" dot>Deploy failed</Badge>
    ) : (
      <Badge tone="accent" dot>Ready · not deployed</Badge>
    );

  return (
    <Card padding="lg" className="space-y-6" id="agent">
      <SectionHeader
        eyebrow="Phone agent"
        title="Agent built from this report"
        size="sm"
        description="Generated from the stored facts below. It answers only from these facts and offers an owner callback for anything else."
        action={status}
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-footnote text-muted">
        <span>
          Ready in <span className="font-mono tabular-nums text-foreground">{seconds(agent.ready_ms)}</span> from the run start
        </span>
        <span>
          <span className="font-mono tabular-nums text-foreground">{c.knowledge.length}</span> cited facts
        </span>
        {isFixture && <Badge tone="warning">Demo data</Badge>}
      </div>

      <div>
        <h3 className="text-eyebrow uppercase text-muted">First message</h3>
        <p className="mt-2 rounded-md bg-surface-2 px-4 py-3 text-callout">&ldquo;{c.first_message}&rdquo;</p>
      </div>

      <div>
        <h3 className="text-eyebrow uppercase text-muted">Knowledge, with sources</h3>
        <ul className="mt-2 divide-y divide-hairline">
          {c.knowledge.map((k) => (
            <li key={k.id} className="grid grid-cols-[2.5rem_1fr] gap-x-3 gap-y-0.5 py-2.5 sm:grid-cols-[2.5rem_5rem_1fr_8rem]">
              <span className="font-mono text-caption tabular-nums text-subtle">{k.id}</span>
              <span className="text-caption font-medium uppercase tracking-wider text-subtle">{k.kind}</span>
              <span className="col-start-2 min-w-0 text-footnote sm:col-start-auto">
                <span className="text-muted">{k.label}: </span>
                {k.value}
                {k.quote && k.quote !== k.value && (
                  <span className="mt-0.5 block text-caption text-muted">&ldquo;{k.quote}&rdquo;</span>
                )}
              </span>
              <span className="col-start-2 text-caption text-subtle sm:col-start-auto sm:text-right">
                {SOURCE_LABEL[k.source_type]}
                {k.source_type === "listing" && <span className="block font-mono">{k.source_ref}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-eyebrow uppercase text-muted">Rules</h3>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["Unknown answers", c.policies.unknown_answer],
              ["Booking", c.policies.booking],
              ["Owner handoff", c.policies.handoff],
              ["After hours", c.policies.after_hours],
            ] as const
          ).map(([t, v]) => (
            <div key={t} className="rounded-md bg-surface-2 p-3">
              <dt className="text-footnote font-medium">{t}</dt>
              <dd className="mt-0.5 text-caption text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {c.built_for.length > 0 && (
        <p className="text-footnote text-muted">
          Built to fix: {c.built_for.map((f) => f.title).join(" · ")}
        </p>
      )}

      <details className="rounded-md bg-surface-2 p-4">
        <summary className="cursor-pointer text-footnote font-medium">System prompt</summary>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap font-mono text-caption text-muted">{c.system_prompt}</pre>
      </details>

      <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
        <Button onClick={deploy} disabled={!canDeploy || busy} title={voice?.reason ?? undefined}>
          {busy ? "Deploying…" : "Deploy agent"}
        </Button>
        <ButtonLink href={`/evals?businessId=${agent.business_id}`} variant="secondary">
          Run simulated calls
        </ButtonLink>
        <p className="basis-full text-caption text-muted">
          {agent.status === "deployed"
            ? `Deployed as ${agent.external_agent_id}.`
            : voice?.configured
              ? `Creates an agent on ${voice.name} and assigns your phone number to it.`
              : (voice?.reason ?? "Voice is not configured.") + " The agent config is ready; no calls are placed or answered yet."}
        </p>
        {msg && <p className="basis-full text-caption text-muted">{msg}</p>}
        {agent.deploy_message && agent.status !== "ready" && !msg && <p className="basis-full text-caption text-muted">{agent.deploy_message}</p>}
      </div>
    </Card>
  );
}
