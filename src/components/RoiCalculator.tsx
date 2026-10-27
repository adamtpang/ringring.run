"use client";

import { useMemo, useState } from "react";
import { Badge, Card, SectionHeader, Stat, StatGrid, cx } from "@/components/ds";
import { applyCalcEdits, combineRoi, computeRoi, defaultFields, fmtField, fmtMonths, fmtUsd, type CalcField, type CalcRow, type FieldStatus } from "@/lib/calculator";
import { verticalFor } from "@/lib/prescription";
import { KIND_LABELS } from "@/lib/solutions";
import { FINDING_KINDS, type Business, type Finding, type FindingKind, type RoiEstimate } from "@/lib/types";

export interface CalcBase {
  kind: FindingKind;
  label: string;
  fields: CalcField[];
}

/** Calculator rows for every finding with ROI inputs on file. Defaults only; nothing here is saved. */
export function useCalcBase(business: Business | null, findings: Finding[] | null, roi: RoiEstimate[] | null): CalcBase[] {
  return useMemo(() => {
    if (!business || !findings || !roi) return [];
    const byFinding = new Map(roi.map((r) => [r.finding_id, r]));
    const vertical = verticalFor(business.category);
    const seen = new Set<string>();
    const out: CalcBase[] = [];
    for (const f of findings) {
      const r = byFinding.get(f.id);
      if (!r || !r.assumptions.length || seen.has(f.kind) || !(FINDING_KINDS as readonly string[]).includes(f.kind)) continue;
      seen.add(f.kind);
      out.push({ kind: f.kind, label: KIND_LABELS[f.kind] ?? f.title, fields: defaultFields(f.kind, vertical, r.assumptions) });
    }
    return out;
  }, [business, findings, roi]);
}

const STATUS: Record<FieldStatus, { tone: "success" | "warning" | "neutral" | "accent"; text: string }> = {
  sourced: { tone: "success", text: "Sourced" },
  calendar: { tone: "neutral", text: "Calendar" },
  assumed: { tone: "warning", text: "Estimate" },
  edited: { tone: "accent", text: "Your number" },
};

function FieldRow({ f, raw, onChange, dense }: { f: CalcField; raw: string | undefined; onChange: (v: string) => void; dense: boolean }) {
  const shown = raw ?? String(f.value);
  return (
    <li className={cx("grid grid-cols-[1fr_auto] items-start gap-3", dense ? "py-1" : "py-2.5")}>
      <div className="min-w-0">
        <p className={cx("flex flex-wrap items-center gap-1.5", dense ? "text-caption font-medium" : "text-footnote font-medium")}>
          {f.label}
          <Badge tone={STATUS[f.status].tone} className={cx("px-2", dense ? "h-4 text-[0.625rem]" : "h-5")}>{STATUS[f.status].text}</Badge>
        </p>
        <p className={cx("text-subtle", dense ? "text-[0.625rem] leading-snug" : "text-caption")}>
          {f.url ? (
            <a href={f.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{f.source}</a>
          ) : (
            f.source
          )}
        </p>
      </div>
      <label className="text-right">
        <span className="sr-only">{`${f.label} (${STATUS[f.status].text.toLowerCase()})`}</span>
        <input
          type="number"
          inputMode="decimal"
          step={f.unit === "ratio" || f.unit === "multiplier" ? 0.01 : f.unit === "hours" ? 0.25 : 1}
          min={0}
          max={f.unit === "ratio" ? 1 : undefined}
          value={shown}
          onChange={(e) => onChange(e.target.value)}
          className={cx(
            "rounded-sm bg-surface px-2 text-right tabular-nums ring-1 ring-inset ring-hairline outline-none focus:ring-2 focus:ring-accent print:ring-0",
            dense ? "h-6 w-20 text-caption" : "h-9 w-24 text-footnote",
          )}
        />
        <span className={cx("block text-subtle", dense ? "text-[0.5625rem]" : "text-[0.6875rem]")}>
          {f.unit === "ratio" ? fmtField({ unit: "ratio", value: Number(shown) || 0 }) : f.unit === "usd" ? "dollars" : f.unit === "hours" ? "hours" : f.unit === "multiplier" ? "weeks" : "count"}
        </span>
      </label>
    </li>
  );
}

function Results({ r, dense }: { r: CalcRow["result"]; dense: boolean }) {
  const cell = "rounded-md bg-surface px-3 py-2";
  const v = dense ? "text-footnote font-semibold tabular-nums" : "text-headline tabular-nums";
  const l = dense ? "text-[0.625rem] text-subtle" : "text-caption text-subtle";
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className={cell}><p className={l}>At risk now</p><p className={cx(v, "text-warning")}>{fmtUsd(r.atRisk)}/mo</p></div>
      <div className={cell}><p className={l}>Won back</p><p className={cx(v, "text-warning")}>{fmtUsd(r.gain)}/mo</p></div>
      <div className={cell}><p className={l}>Monthly net</p><p className={cx(v, r.net > 0 ? "text-success" : "text-danger")}>{r.net < 0 ? "−" : ""}{fmtUsd(Math.abs(r.net))}/mo</p></div>
      <div className={cell}><p className={l}>Payback</p><p className={v}>{fmtMonths(r.paybackMonths)}</p></div>
    </div>
  );
}

export function RoiRow({ base, edits, setEdits, dense = false, heading = true }: { base: CalcBase; edits: Record<string, string>; setEdits: (e: Record<string, string>) => void; dense?: boolean; heading?: boolean }) {
  let fields = base.fields;
  let err: string | null = null;
  try {
    fields = applyCalcEdits(base.fields, edits);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  const r = computeRoi(fields);
  const loss = base.fields.filter((f) => f.group === "loss");
  const fix = base.fields.filter((f) => f.group === "fix");
  const list = (fs: CalcField[]) => (
    <ul className="divide-y divide-hairline">
      {fs.map((f) => (
        <FieldRow key={f.key} f={fields.find((x) => x.key === f.key) ?? f} raw={edits[f.key]} onChange={(v) => setEdits({ ...edits, [f.key]: v })} dense={dense} />
      ))}
    </ul>
  );
  return (
    <div className={cx("op-avoid rounded-md bg-surface-2", dense ? "p-2.5" : "p-4 sm:p-5")} id={`roi-${base.kind}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {heading ? <h3 className={dense ? "text-footnote font-semibold" : "text-headline"}>{base.label}</h3> : <h3 className="text-eyebrow uppercase text-muted">Is the fix worth it?</h3>}
        {Object.keys(edits).length > 0 && (
          <button type="button" onClick={() => setEdits({})} className="text-caption font-medium text-accent hover:underline print:hidden">Reset to defaults</button>
        )}
      </div>
      <div className={cx("mt-2 grid gap-x-6", dense ? "grid-cols-2" : "md:grid-cols-2")}>
        <div>
          <p className={cx("text-eyebrow uppercase text-muted", dense && "text-[0.5625rem]")}>What it may cost you now</p>
          {list(loss)}
        </div>
        <div>
          <p className={cx("text-eyebrow uppercase text-muted", dense && "text-[0.5625rem]")}>What the fix costs</p>
          {list(fix)}
        </div>
      </div>
      {err ? (
        <p className="mt-2 text-caption text-danger">{err}</p>
      ) : (
        <>
          <div className="mt-3"><Results r={r} dense={dense} /></div>
          <ol className={cx("mt-2 space-y-0.5 text-subtle", dense ? "text-[0.5625rem] leading-snug" : "text-caption")} aria-label={`How the ${base.label.toLowerCase()} numbers are worked out`}>
            {r.math.map((m) => <li key={m}>{m}</li>)}
          </ol>
        </>
      )}
    </div>
  );
}

export type RowEdits = Record<string, Record<string, string>>;

/** Edits per recommendation, the computed rows and the overlap-aware total. In memory only. */
export function useRoiState(rows: CalcBase[]) {
  const [edits, setEdits] = useState<RowEdits>({});
  const computed: CalcRow[] = rows.map((b) => {
    let fields = b.fields;
    try {
      fields = applyCalcEdits(b.fields, edits[b.kind] ?? {});
    } catch {
      /* the row shows the error; totals use defaults for it */
    }
    return { kind: b.kind, label: b.label, result: computeRoi(fields) };
  });
  const fieldsFor = (kind: string): CalcField[] | null => {
    const b = rows.find((r) => r.kind === kind);
    if (!b) return null;
    try {
      return applyCalcEdits(b.fields, edits[kind] ?? {});
    } catch {
      return null;
    }
  };
  return {
    edits,
    setRow: (kind: string, e: Record<string, string>) => setEdits((all) => ({ ...all, [kind]: e })),
    computed,
    total: combineRoi(computed),
    fieldsFor,
  };
}

export const ROI_INTRO =
  "Estimates, not facts. Yellow inputs are assumptions; change any of them to your real numbers. Green ones come from your Google listing or a vendor's public pricing page. Nothing you type here is saved.";

export function RoiTotals({ total, dense = false }: { total: ReturnType<typeof combineRoi>; dense?: boolean }) {
  return (
    <div className={dense ? "space-y-1" : "space-y-2"}>
      {dense ? (
        <p className="text-caption">
          <span className="font-semibold">All fixes: </span>
          {total.net < 0 ? "−" : ""}{fmtUsd(Math.abs(total.net))}/mo net, payback {fmtMonths(total.paybackMonths).toLowerCase()} (estimate).
        </p>
      ) : (
        <StatGrid>
          <Stat label="Net / month" value={`${total.net < 0 ? "−" : ""}${fmtUsd(Math.abs(total.net))}`} hint="estimate, all fixes" emphasis estimate />
          <Stat label="Payback" value={fmtMonths(total.paybackMonths)} hint={`${fmtUsd(total.setupCost)} setup, once`} />
          <Stat label="Won back / month" value={fmtUsd(total.gain)} hint="estimate" />
          <Stat label="Fix costs / month" value={fmtUsd(total.monthlyCost)} hint="tools + your time" />
        </StatGrid>
      )}
      <p className={cx("text-subtle", dense ? "text-[0.5625rem] leading-snug" : "text-caption")}>
        How the total works: {total.math}.{" "}
        {total.dropped.length > 0 && `Not added: ${total.dropped.map((d) => `${d.label.toLowerCase()} (${fmtUsd(d.gain)}/mo won back), the same customers as ${d.keptLabel.toLowerCase()}`).join("; ")}. `}
        {total.rule} Net is revenue won back minus the fix&apos;s cost, before your own job costs.
      </p>
    </div>
  );
}

/**
 * Adjustable ROI calculator. Edits live in this component only: never sent to the
 * server, never saved, so a real business's profile is never changed by trying numbers.
 */
export function RoiCalculator({ rows, dense = false, title = "Is each fix worth it?" }: { rows: CalcBase[]; dense?: boolean; title?: string }) {
  const s = useRoiState(rows);
  if (!rows.length) return null;
  return (
    <section id="roi" aria-labelledby="roi-title" className={cx("scroll-mt-24", dense ? "space-y-2" : "space-y-4")}>
      {dense ? (
        <div>
          <h2 id="roi-title" className="text-headline">{title}</h2>
          <p className="text-[0.625rem] leading-snug text-subtle">{ROI_INTRO}</p>
        </div>
      ) : (
        <SectionHeader eyebrow="ROI calculator" title={<span id="roi-title">{title}</span>} description={ROI_INTRO} />
      )}
      <RoiTotals total={s.total} dense={dense} />
      <div className={dense ? "space-y-2" : "space-y-3"}>
        {rows.map((b) => (
          <RoiRow key={b.kind} base={b} edits={s.edits[b.kind] ?? {}} setEdits={(e) => s.setRow(b.kind, e)} dense={dense} />
        ))}
      </div>
    </section>
  );
}

export function RoiCalculatorCard(props: Parameters<typeof RoiCalculator>[0]) {
  return (
    <Card padding="lg">
      <RoiCalculator {...props} />
    </Card>
  );
}
