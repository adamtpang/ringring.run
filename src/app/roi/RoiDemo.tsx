"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ds";
import { Wordmark } from "@/components/Logo";
import { defaultAvgTicket } from "@/lib/roi";
import { STARTER_DEFAULTS, starterResult, type ScanPrefill, type StarterInputs } from "@/lib/starter-roi";

type Key = keyof StarterInputs;

const MONEY: { key: Key; label: string; min: number; max: number; step: number; pct?: boolean; tag: string }[] = [
  { key: "callsPerDay", label: "Calls per day", min: 0, max: 40, step: 1, tag: "Default" },
  { key: "missRate", label: "Miss rate", min: 0, max: 1, step: 0.01, pct: true, tag: "Default" },
  { key: "closeRate", label: "Close rate", min: 0, max: 1, step: 0.01, pct: true, tag: "Default" },
  { key: "avgTicket", label: "Average ticket", min: 0, max: 2000, step: 5, tag: "Category default" },
  { key: "days", label: "Days in this total", min: 1, max: 31, step: 1, tag: "Default" },
  { key: "pricePerMonth", label: "ringring price per month", min: 0, max: 500, step: 1, tag: "Placeholder" },
];

const TIME: { key: Key; label: string; min: number; max: number; step: number }[] = [
  { key: "minutesPerCall", label: "Minutes per call", min: 0, max: 30, step: 1 },
  { key: "daysPerWeek", label: "Days per week", min: 1, max: 7, step: 1 },
  { key: "minutesPerReply", label: "Minutes per reply", min: 0, max: 40, step: 1 },
  { key: "repliesPerWeek", label: "Replies per week", min: 0, max: 20, step: 0.1 },
  { key: "minutesPerSeo", label: "Minutes per SEO fix", min: 0, max: 120, step: 5 },
  { key: "seoTasksPerWeek", label: "SEO fixes per week", min: 0, max: 10, step: 1 },
  { key: "minutesPerWeb", label: "Minutes per website page", min: 0, max: 120, step: 5 },
  { key: "webTasksPerWeek", label: "Website pages per week", min: 0, max: 10, step: 1 },
  { key: "hourlyRate", label: "Your hourly rate", min: 0, max: 200, step: 5 },
];

function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

export function RoiDemo({ scan, embedded = false }: { scan: ScanPrefill | null; embedded?: boolean }) {
  const [inputs, setInputs] = useState<StarterInputs>(() => ({
    ...STARTER_DEFAULTS,
    ...(scan ? { avgTicket: scan.avgTicket } : {}),
  }));
  const [ticketTouched, setTicketTouched] = useState(false);
  const [category, setCategory] = useState(scan?.category ?? "HVAC");

  const result = useMemo(() => {
    try {
      return { ok: true as const, value: starterResult(inputs) };
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : "Check the inputs" };
    }
  }, [inputs]);

  function set<K extends Key>(key: K, value: number) {
    setInputs((prev) => ({ ...prev, [key]: value }));
    if (key === "avgTicket") setTicketTouched(true);
  }

  function onCategory(next: string) {
    setCategory(next);
    if (!ticketTouched) setInputs((prev) => ({ ...prev, avgTicket: defaultAvgTicket(next) }));
  }

  const r = result.ok ? result.value : null;

  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-3xl px-[var(--space-gutter)] py-5 sm:py-8"}>
      {!embedded && (
        <header className="flex items-center justify-between gap-3">
          <Link href="/" aria-label="ringring.run home" className="pressable rounded-sm">
            <Wordmark />
          </Link>
          <Badge tone="warning">Estimate</Badge>
        </header>
      )}

      {!embedded && <p className="mt-5 text-title-2 text-balance">ringring does the work before the owner picks up.</p>}
      {r && (
        <p className={`${embedded ? "mt-1" : "mt-3"} text-display tabular-nums text-balance`}>
          <span className="text-accent">{money(r.recovered)}</span>
          <span className="text-foreground"> recovered, </span>
          <span className="text-warning">{r.hoursPerWeek} hours</span>
          <span className="text-foreground"> a week back</span>
        </p>
      )}
      <p className="mt-2 text-footnote text-muted">
        Per {inputs.days} days, estimate. The starter pack scans reviews and the website, diagnoses problems, then drafts review replies, a missed-call phone agent, local SEO fixes and a website draft.
        The missed-call agent is not answering a live line today. We draft, you post.
      </p>

      {scan && (
        <div className="mt-4 rounded-lg bg-accent-soft p-4">
          <p className="text-eyebrow uppercase text-accent">{scan.sourceLabel}</p>
          <p className="mt-1 text-headline">{scan.name}</p>
          <p className="text-footnote text-muted">
            {scan.category}. {scan.reviewCount.toLocaleString("en-US")} Google reviews.
            {scan.unansweredInSample != null
              ? ` ${scan.unansweredInSample} under-5 reviews in the sample have no reply${scan.sampleRead != null ? ` (${scan.sampleRead} read)` : ""}. That count is not a weekly rate.`
              : ""}
          </p>
        </div>
      )}

      {r && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-accent-soft p-4">
            <p className="text-caption text-accent">Recovered</p>
            <p className="text-title-1 tabular-nums text-accent">{money(r.recovered)}</p>
            <p className="text-caption text-accent">per {inputs.days} days, estimate</p>
          </div>
          <div className={`rounded-lg p-4 ${r.net >= 0 ? "bg-accent-soft" : "bg-danger-soft"}`}>
            <p className={`text-caption ${r.net >= 0 ? "text-accent" : "text-danger"}`}>After the placeholder price</p>
            <p className={`text-title-1 tabular-nums ${r.net >= 0 ? "text-accent" : "text-danger"}`}>{money(r.net)}</p>
            <p className={`text-caption ${r.net >= 0 ? "text-accent" : "text-danger"}`}>
              {r.paybackDays == null ? "No payback" : `Payback ${r.paybackDays} ${r.paybackDays === 1 ? "day" : "days"}`}
            </p>
          </div>
          <div className="rounded-lg bg-warning-soft p-4">
            <p className="text-caption text-warning">Time back</p>
            <p className="text-title-1 tabular-nums text-warning">{r.hoursPerWeek} h</p>
            <p className="text-caption text-warning">{money(r.timeDollarsPerWeek)} / week at ${inputs.hourlyRate}/h, estimate</p>
          </div>
        </div>
      )}

      <section className="mt-6 rounded-lg bg-surface p-4 shadow-card">
        <h2 className="text-eyebrow uppercase text-subtle">Money</h2>
        <p className="mt-1 text-footnote">Recovered = calls per day x miss rate x close rate x average ticket x days.</p>
        <label className="mt-3 block text-caption text-muted">
          Category (sets the ticket default until you edit the ticket)
          <input
            value={category}
            onChange={(e) => onCategory(e.target.value)}
            className="mt-1 h-10 w-full rounded-md bg-surface-2 px-3 text-footnote text-foreground ring-1 ring-inset ring-hairline"
          />
        </label>
        <ul className="mt-2">
          {MONEY.map((row) => (
            <Slider key={row.key} label={row.label} tag={row.tag} min={row.min} max={row.max} step={row.step} pct={row.pct} value={inputs[row.key]} onChange={(v) => set(row.key, v)} />
          ))}
        </ul>
        {r && (
          <div className="mt-3 space-y-1 text-caption text-subtle">
            <p>{r.moneyMath}</p>
            <p>{r.netMath}</p>
            <p>{r.paybackMath}</p>
          </div>
        )}
        <p className="mt-2 text-caption text-warning">Review revenue uplift is not included. There is no cited source for it in this app.</p>
      </section>

      <section className="mt-4 rounded-lg bg-surface p-4 shadow-card">
        <h2 className="text-eyebrow uppercase text-subtle">Time</h2>
        <p className="mt-1 text-footnote">Hours per week = each task&apos;s minutes x its volume, added up, divided by 60.</p>
        <ul className="mt-2">
          {TIME.map((row) => (
            <Slider key={row.key} label={row.label} tag="Default" min={row.min} max={row.max} step={row.step} value={inputs[row.key]} onChange={(v) => set(row.key, v)} />
          ))}
        </ul>
        {r && (
          <ul className="mt-3 space-y-1 text-caption text-subtle">
            {r.tasks.map((t) => (
              <li key={t.id}>
                {t.label}: {t.minutes} min x {t.volume} = {t.hours} h. {t.source}
              </li>
            ))}
            <li>{r.timeMath}</li>
            <li>
              {r.hoursPerWeek} h x ${inputs.hourlyRate} = {money(r.timeDollarsPerWeek)} per week, estimate.
            </li>
          </ul>
        )}
      </section>

      {!result.ok && <p className="mt-3 text-footnote text-danger">{result.message}</p>}
    </div>
  );
}

function Slider({
  label,
  tag,
  min,
  max,
  step,
  pct,
  value,
  onChange,
}: {
  label: string;
  tag: string;
  min: number;
  max: number;
  step: number;
  pct?: boolean;
  value: number;
  onChange: (v: number) => void;
}) {
  const shown = pct ? Math.round(value * 100) : value;
  return (
    <li className="border-b border-hairline py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-footnote font-medium">
          {label}{" "}
          <Badge tone={tag === "Placeholder" ? "warning" : "neutral"} className="ml-1">
            {tag}
          </Badge>
        </p>
        <span className="tabular-nums text-footnote">{pct ? `${shown}%` : shown}</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 min-w-0 flex-1 accent-[#217748]"
        />
        <input
          type="number"
          min={min}
          max={pct ? 100 : max}
          step={pct ? 1 : step}
          value={shown}
          aria-label={`${label} number`}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange(pct ? n / 100 : n);
          }}
          className="h-9 w-20 rounded-md bg-surface-2 px-2 text-right text-footnote tabular-nums ring-1 ring-inset ring-hairline"
        />
      </div>
    </li>
  );
}
