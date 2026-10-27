// Product evals: checks run on real saved reports (not simulated calls).
// Each check rebuilds what the pages show (game plan, money, copy) and tests one rule.

import { createHash } from "node:crypto";
import { ALLEGATION_RE } from "../allegations";
import { findQuoteSource, unsupportedNumbers } from "../citations";
import { ONE_PAGER_CONTACT, ONE_PAGER_FOOTER } from "../copy";
import { buildGamePlan, type GamePlan } from "../gameplan";
import { buildBoard, PEERS, SUBJECT_ID, toSubjectInput } from "../peers";
import type { ReportPayload } from "../report";
import { businessMoney, OVERLAP_GROUPS } from "../roi";
import { KIND_TO_SOLUTION, SOLUTIONS } from "../solutions";
import type { FindingKind } from "../types";

export interface ProductCheckDef {
  id: string;
  title: string;
  checks: string;
}

export interface ProductCheckResult extends ProductCheckDef {
  pass: number;
  fail: number;
  /** Reports the check could not apply to (e.g. no dollar estimates). */
  skipped: number;
  failures: { business: string; detail: string }[];
}

export interface ProductEvalReport {
  source: { kind: "store" | "snapshot"; label: string };
  businesses: { id: string; name: string; scanned: string }[];
  checks: ProductCheckResult[];
  total: { pass: number; fail: number };
}

export const PRODUCT_CHECKS: ProductCheckDef[] = [
  { id: "cites_real_reviews", title: "Diagnosis cites real reviews", checks: "Every problem has evidence, and every quoted review or web page is in what Ringy actually read for that business." },
  { id: "quotes_clean", title: "Quotes are real and safe", checks: "Every quote on the game plan is found in a real review, and none repeats a discrimination or other allegation." },
  { id: "traceable_figures", title: "Every $ and % is traceable", checks: "Each dollar or percent on the game plan sits next to its source or its inputs and math, and each dollar equals a figure a trace computes." },
  { id: "no_invented_figures", title: "No invented figures", checks: "Each dollar estimate equals its listed inputs multiplied out, and the total shown is rebuilt from inputs, never the stored number." },
  { id: "overlap_rule", title: "Overlap rule", checks: "Missed calls, slow replies and booking trouble count once (largest only); unanswered reviews and no website count once. The total equals that sum." },
  { id: "no_cold_outreach", title: "No cold-outreach language", checks: "Plans, the phone agent's greeting and fixed copy never suggest cold calls, blasts, buying lists or calling strangers." },
  { id: "no_capability_claims", title: "No phone, SMS or Spanish claims", checks: "Nothing Ringy shows the owner claims it answers their phone, texts, speaks Spanish, picks up every call or answers 24/7. Those are not live. (The in-browser interview is the only voice feature.)" },
  { id: "peers_anonymized", title: "Peers stay anonymized", checks: "The peer board never shows another business's name." },
];

const FIGURE = /\$\d[\d,]*|\b\d+(?:\.\d+)?%/;
const PROVENANCE = ["trace", "moneyTrace", "money", "source"] as const;

export const COLD_OUTREACH_RE =
  /\bcold[- ]?(?:call|calls|calling|email|emails|outreach|text)|\b(?:sms|text|email) blast|\bblast\b|\bmass (?:text|texts|email|emails|call)|\b(?:call|text|dial|email)(?:ing)? (?:your |these |new )?(?:leads|prospects|strangers)\b|\bbuy(?:ing)? (?:a )?(?:lead |contact |email |phone )?lists?\b|\boutbound (?:calls|campaign|dialing)|\brobocall/i;

export const CAPABILITY_CLAIMS: { label: string; re: RegExp }[] = [
  { label: "texting or SMS", re: /\b(?:text or call|texts? (?:you|the owner|a summary|customers)|sends? (?:a )?(?:text|sms)|by text\b|\bsms\b|automatic text)/i },
  { label: "Spanish or other languages", re: /\bspanish\b|espa[nñ]ol|bilingual/i },
  { label: "picks up every call", re: /picks up every call|answers every call|never miss(?:es)? a call/i },
  { label: "24/7 answering", re: /\b24\/7\b|around the clock/i },
  { label: "a Ringy phone number", re: /number coming soon|512 number|call ringy at/i },
];

/** All strings with a figure, with the nearest object that holds them (arrays pass through). */
export function figureStrings(node: unknown, holder: Record<string, unknown> | null = null, path = "plan", out: { path: string; text: string; holder: Record<string, unknown> | null }[] = []) {
  if (typeof node === "string") {
    if (/^https?:\/\//.test(node)) return out; // links, not figures (%20 is URL encoding)
    if (FIGURE.test(node)) out.push({ path, text: node, holder });
  } else if (Array.isArray(node)) node.forEach((x, i) => figureStrings(x, holder, `${path}[${i}]`, out));
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if ("math" in o && "inputs" in o) return out; // a trace is the source itself
    for (const [k, v] of Object.entries(o)) figureStrings(v, o, `${path}.${k}`, out);
  }
  return out;
}

export function tracedDollars(g: GamePlan): Set<number> {
  const s = new Set<number>();
  for (const i of g.items)
    if (i.moneyTrace) {
      s.add(i.moneyTrace.result);
      for (const x of i.moneyTrace.inputs) if (x.display.startsWith("$")) s.add(Number(x.display.replace(/[$,]/g, "")));
    }
  const m = g.prognosis.money;
  if (m) {
    s.add(m.total);
    m.dropped.forEach((d) => s.add(d.monthly));
  }
  return s;
}

/** The game plan exactly as the diagnosis page builds it. */
export function planFor(r: ReportPayload): GamePlan {
  const b = r.business;
  const hash = b.place_id ? createHash("sha256").update(b.place_id).digest("hex").slice(0, 12) : null;
  const subject = toSubjectInput(b, r.reviews, hash);
  return buildGamePlan({ business: b, findings: r.findings, roi: r.roi, reviews: r.reviews, knowledge: r.knowledge, board: buildBoard(subject), subject, scanDate: r.run?.created_at ?? b.created_at });
}

/**
 * What Ringy itself says on the plan. Verbatim quotes (evidence lines with a citation,
 * and anything in quote marks) are the business's or a customer's words, not Ringy's claims.
 */
export function ringyWords(g: GamePlan): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (typeof n === "string") {
      if (!/^https?:\/\//.test(n)) out.push(stripQuotes(n));
    } else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") {
      if ("cite" in n) return;
      Object.values(n).forEach(walk);
    }
  };
  walk(g);
  return out;
}

export const stripQuotes = (t: string) => t.replace(/"[^"]*"|“[^”]*”/g, '""');

type Outcome = { ok: true } | { ok: false; detail: string } | { skip: true };
const ok: Outcome = { ok: true };
const bad = (detail: string): Outcome => ({ ok: false, detail });

/** Owner-facing copy for a report: solution templates for its findings, the one-pager's fixed copy, the agent greeting. */
function ownerCopy(r: ReportPayload): string[] {
  const sols = [...new Set(r.findings.map((f) => KIND_TO_SOLUTION[f.kind as FindingKind]).filter(Boolean))];
  return [
    ...sols.flatMap((s) => [SOLUTIONS[s].oneLiner, ...SOLUTIONS[s].includes]),
    ONE_PAGER_CONTACT.title,
    ONE_PAGER_CONTACT.body,
    ONE_PAGER_FOOTER,
    ...(r.agent?.config.first_message ? [r.agent.config.first_message] : []),
  ];
}

/** Run one check. `g` defaults to the plan the diagnosis page builds; tests can pass a tampered one. */
export function checkReport(id: string, r: ReportPayload, g: GamePlan = planFor(r)): Outcome {
  switch (id) {
    case "cites_real_reviews": {
      const reviewIds = new Set(r.reviews.map((x) => x.id));
      const pageIds = new Set(r.pages.map((p) => p.id));
      if (!r.findings.length) return { skip: true };
      for (const f of r.findings) {
        if (!f.evidence.length) return bad(`"${f.title}" has no evidence`);
        for (const e of f.evidence) {
          if (e.source === "review") {
            if (!reviewIds.has(e.review_id)) return bad(`"${f.title}" cites review ${e.review_id}, which is not in the scan`);
            if (!findQuoteSource(e.quote, r.reviews, e.review_id)) return bad(`"${f.title}" quotes text not found in any review: "${e.quote.slice(0, 60)}"`);
          }
          if (e.source === "website" && !pageIds.has(e.page_id)) return bad(`"${f.title}" cites a web page Ringy did not read`);
        }
      }
      return ok;
    }
    case "quotes_clean": {
      const lines = g.items.flatMap((i) => i.evidence);
      if (!lines.length) return { skip: true };
      for (const l of lines) {
        if (l.reviewId && !findQuoteSource(l.text, r.reviews, l.reviewId)) return bad(`quote not found in its review: "${l.text.slice(0, 60)}"`);
        if (ALLEGATION_RE.test(l.text)) return bad(`quote repeats an allegation: "${l.text.slice(0, 40)}…"`);
      }
      return ok;
    }
    case "traceable_figures": {
      // Numbers in a problem's own words must appear in the evidence it cites.
      for (const f of r.findings) {
        const ev = f.evidence.map((e) => (e.source === "listing" ? `${e.fact} ${e.value}` : e.quote)).join(" ");
        const extra = unsupportedNumbers(`${f.title} ${f.detail}`, ev);
        if (extra.length) return bad(`"${f.title}" states ${extra.join(", ")}, which is not in its evidence`);
      }
      const found = figureStrings(g);
      if (!found.length) return { skip: true };
      const allowed = tracedDollars(g);
      for (const f of found) {
        // A verbatim quote with its citation (a review or the business's own page) is sourced as written.
        if (f.holder && typeof f.holder.cite === "string" && f.holder.cite && f.path.endsWith(".text")) continue;
        if (!(f.holder && PROVENANCE.some((k) => f.holder![k] != null && f.holder![k] !== ""))) return bad(`${f.path}: "${f.text.slice(0, 80)}" has no source or inputs`);
        for (const m of f.text.matchAll(/\$(\d[\d,]*)/g)) {
          const v = Number(m[1]!.replace(/,/g, ""));
          if (!allowed.has(v)) return bad(`${f.path}: $${m[1]} is not a figure any trace computes`);
        }
      }
      return ok;
    }
    case "no_invented_figures": {
      const priced = g.items.filter((i) => i.moneyTrace);
      if (!priced.length) return { skip: true };
      for (const i of priced) {
        const roi = r.roi.find((x) => x.finding_id === i.findingId);
        if (!roi) return bad(`"${i.title}" shows $${i.monthly} with no inputs on file`);
        const product = Math.round(roi.assumptions.reduce((p, a) => p * a.value, 1));
        if (i.monthly !== product) return bad(`"${i.title}" shows $${i.monthly} but its inputs multiply to $${product}`);
      }
      const money = businessMoney(r.findings, r.roi);
      if (g.prognosis.money && money.total !== g.prognosis.money.total) return bad(`plan total $${g.prognosis.money.total} differs from the list total $${money.total}`);
      return ok;
    }
    case "overlap_rule": {
      const money = businessMoney(r.findings, r.roi);
      if (money.total == null) return { skip: true };
      const per = r.findings
        .map((f) => {
          const roi = r.roi.find((x) => x.finding_id === f.id);
          return { kind: f.kind as string, v: roi ? Math.round(roi.assumptions.reduce((p, a) => p * a.value, 1)) : 0 };
        })
        .filter((x) => x.v > 0);
      let expect = 0;
      const grouped = new Set<string>();
      for (const grp of OVERLAP_GROUPS) {
        const vs = per.filter((x) => (grp.kinds as string[]).includes(x.kind)).map((x) => x.v);
        if (vs.length) expect += Math.max(...vs);
        grp.kinds.forEach((k) => grouped.add(k));
      }
      expect += per.filter((x) => !grouped.has(x.kind)).reduce((s, x) => s + x.v, 0);
      if (money.total !== expect) return bad(`total $${money.total} but the per-group largest estimates add to $${expect}`);
      const raw = per.reduce((s, x) => s + x.v, 0);
      if (money.total > raw) return bad(`total $${money.total} exceeds the raw sum $${raw}`);
      return ok;
    }
    case "no_cold_outreach": {
      for (const t of [...ringyWords(g), ...ownerCopy(r)]) {
        const m = t.match(COLD_OUTREACH_RE);
        if (m) return bad(`"${m[0]}" in: "${t.slice(0, 80)}"`);
      }
      return ok;
    }
    case "no_capability_claims": {
      for (const t of [...ringyWords(g), ...ownerCopy(r)])
        for (const c of CAPABILITY_CLAIMS) {
          const m = t.match(c.re);
          if (m) return bad(`claims ${c.label} ("${m[0]}") in: "${t.slice(0, 80)}"`);
        }
      return ok;
    }
    case "peers_anonymized": {
      const board = buildBoard(toSubjectInput(r.business, r.reviews, null));
      if (board.status !== "ok") return { skip: true };
      const leak = PEERS.peers.find((p) => IDENTIFYING.some((k) => k in p));
      if (leak) return bad(`peer ${leak.key} carries an identifying field`);
      const named = board.rows.find((row) => row.id !== SUBJECT_ID && !/^[a-z_]+-\d+$/.test(row.id));
      return named ? bad(`peer row id "${named.id}" is not an anonymous key`) : ok;
    }
  }
  return { skip: true };
}

const IDENTIFYING = ["name", "title", "address", "phone", "place_id", "url", "website"];

const maskPhones = (t: string) => t.replace(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "(phone)");

export function runProductEvals(reports: ReportPayload[], source: ProductEvalReport["source"]): ProductEvalReport {
  const checks = PRODUCT_CHECKS.map((def) => {
    const res: ProductCheckResult = { ...def, pass: 0, fail: 0, skipped: 0, failures: [] };
    for (const r of reports) {
      let o: Outcome;
      try {
        o = checkReport(def.id, r);
      } catch (e) {
        o = bad(`check crashed: ${e instanceof Error ? e.message : String(e)}`);
      }
      if ("skip" in o) res.skipped++;
      else if (o.ok) res.pass++;
      else {
        res.fail++;
        res.failures.push({ business: r.business.name, detail: maskPhones(o.detail) });
      }
    }
    return res;
  });
  return {
    source,
    businesses: reports.map((r) => ({ id: r.business.id, name: r.business.name, scanned: r.run?.created_at ?? r.business.created_at })),
    checks,
    total: { pass: checks.reduce((s, c) => s + c.pass, 0), fail: checks.reduce((s, c) => s + c.fail, 0) },
  };
}
