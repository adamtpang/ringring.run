import { runChecks, type CheckStatus } from "./gameplan";
import { METRICS, MIN_NEGATIVE_FOR_REPLY, PEERS, buildBoard, toSubjectInput, type Board } from "./peers";
import { PREVIEW_SLUGS, fmtDate, previewBySlug, sampleDraft, unansweredCount, type PreviewPage } from "./preview-pages";
import { defaultAvgTicket } from "./roi";
import { findSnapshot, snapshotLabel, SNAPSHOTS } from "./snapshot";
import type { ScanPrefill } from "./starter-roi";
import { reviewUrl } from "./walk";

/** Left out of this demo on purpose. */
export const PATH_EXCLUDED = ["antler-vc", "pleblab"] as const;

/** The three cached businesses on the picker. Aire Serv leads. Lone Star does not. */
export const PATH_DEMOS = [
  { id: "aire-serv", name: "Aire Serv of Central and North Austin" },
  { id: "small-victory", name: "Small Victory" },
  { id: "sapori", name: "Sapori Italian Roots" },
] as const;

export const PATH_DEFAULT_ID = "aire-serv";

/** Labeled default. Not measured, and not a cited review-uplift study. */
export const EXTRA_REVIEWS_PER_WEEK = 1;

const PHONE = /\(?\b\d{3}\)?[ .-]?\d{3}[ .-]\d{4}\b/;

export interface PathRow {
  name: string;
  you: boolean;
  rating: number | null;
  reviews: number | null;
  score: number | null;
  rank: number | null;
}

export interface PathDraft {
  stars: number;
  date: string;
  text: string;
  draft: string;
}

export interface PathCheck {
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface PathGap {
  ratingNow: number | null;
  ratingFirst: number | null;
  /** Displayed stars at #1 minus this business. Null when either rating is missing. */
  ratingGap: number | null;
  reviewsNow: number | null;
  reviewsFirst: number | null;
  /** How many more reviews to match #1's count. 0 when this business already has at least that many. */
  reviewGap: number | null;
  replyNote: string;
  /** Reviews in a complete 90-day window, or null when the scan cannot support a pace. */
  per90: number | null;
  paceNote: string;
}

export interface PathModel {
  id: string;
  name: string;
  category: string;
  sourceLabel: string;
  callsAllowed: false;
  rankLabel: string | null;
  rank: number | null;
  of: number | null;
  score: number | null;
  formula: string;
  rankNote: string;
  noRankReason: string | null;
  rows: PathRow[];
  gap: PathGap | null;
  drafts: PathDraft[];
  draftNote: string;
  profile: PathCheck[];
  reviewHref: string | null;
  roi: ScanPrefill;
}

export interface PathMatch {
  id: string;
  name: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Fixed words. Not written from the review text. Two templates, split only by the star group. */
export function fixedDraft(name: string, stars: number): string {
  if (stars >= 5) return `Thank you for taking the time to share this. We appreciate you choosing us. The ${name} team`;
  return sampleDraft(name, null);
}

export const DRAFT_NOTE =
  "Fixed template. The same words for every review in that star group. Not written from the review text. Drafts, you approve, you paste. ringring.run never posts to Google.";

function formulaBenchmark(): string {
  const parts = METRICS.map((m) => `${m.label} ${Math.round(m.weight * 100)}%`).join(", ");
  return `ringring's score is a weighted percentile in this group: ${parts}. A signal that was not measured is left out and the other weights scale up. A score needs a rating and a review count. This is ringring's score, not Google's ranking.`;
}

const NEARBY_FORMULA =
  "Order: displayed stars, then review count. This is ringring's order of the Oct 28 nearby sample, not Google's ranking. Recency and reply rate are not in the order. The peer rows do not include them.";

function boardRows(board: Extract<Board, { status: "ok" }>): PathRow[] {
  return board.rows.map((r) => ({
    name: r.id === "subject" ? board.meta.singular : `${board.meta.singular} #${r.position}`,
    you: r.id === "subject",
    rating: r.metrics.rating,
    reviews: r.metrics.reviews,
    score: r.score,
    rank: r.rank,
  }));
}

function firstRow(rows: PathRow[]): PathRow | null {
  return rows.find((r) => r.rank === 1) ?? rows[0] ?? null;
}

function ratingPaceNote(now: number | null, first: number | null): string {
  if (now == null || first == null) return "Displayed ratings are missing, so there is no rating gap to estimate.";
  if (now >= first) return `Displayed rating ${now.toFixed(1)} is already at or above #1 on this list (${first.toFixed(1)}).`;
  const gap = round1(first - now);
  return `Displayed rating ${now.toFixed(1)} versus ${first.toFixed(1)} at #1, a gap of ${gap} stars. The scan has no raw star total, so this page does not estimate how many new reviews would move the displayed rating.`;
}

function gapFromRows(rows: PathRow[], replyNote: string, per90: number | null, paceNote: string): PathGap | null {
  const you = rows.find((r) => r.you);
  const top = firstRow(rows.filter((r) => !r.you));
  if (!you || !top) return null;
  const reviewGap = you.reviews == null || top.reviews == null ? null : Math.max(0, top.reviews - you.reviews);
  return {
    ratingNow: you.rating,
    ratingFirst: top.rating,
    ratingGap: you.rating == null || top.rating == null ? null : round1(top.rating - you.rating),
    reviewsNow: you.reviews,
    reviewsFirst: top.reviews,
    reviewGap,
    replyNote,
    per90,
    paceNote: `${paceNote} ${ratingPaceNote(you.rating, top.rating)}`.trim(),
  };
}

function sanitizeDetail(detail: string, id: string): string {
  if (id === "phone") return "A phone is on the Google listing. This page does not show the number and does not call it.";
  return detail.replaceAll("[phone on Google listing]", "the listing");
}

function aireModel(): PathModel {
  const snap = SNAPSHOTS[0]!;
  const report = snap.report;
  const b = report.business;
  const subject = toSubjectInput(b, report.reviews, null);
  const board = buildBoard(subject);
  const ok = board.status === "ok" ? board : null;
  const rows = ok ? boardRows(ok).map((r) => (r.you ? { ...r, name: b.name } : r)) : [];
  const unanswered = report.reviews.filter((r) => !r.owner_response?.trim());
  const under5 = unanswered.filter((r) => r.rating != null && r.rating < 5);
  const neg = report.reviews.filter((r) => r.rating != null && r.rating <= 2);
  const replied = report.reviews.filter((r) => !!r.owner_response?.trim()).length;
  const replyNote =
    neg.length < MIN_NEGATIVE_FOR_REPLY
      ? `Reply rate is not in this score. The benchmark needs at least ${MIN_NEGATIVE_FOR_REPLY} reviews at 1 or 2 stars, and this sample has ${neg.length}. Of the ${report.reviews.length} reviews read, ${replied} have an owner reply. ${unanswered.length} have none. Ringy's sample, not a Google figure.`
      : `Reply rate is in the score when enough 1 or 2 star reviews were read.`;
  const scanMs = new Date(b.created_at).getTime();
  const in90 = report.reviews.filter((r) => r.published_at && scanMs - new Date(r.published_at).getTime() <= 90 * 86400000).length;
  const paceNote = `Current pace is not estimated. Of the ${report.reviews.length} reviews read, ${in90} ${in90 === 1 ? "is" : "are"} dated within 90 days of the scan. That sample is not a full count of new reviews. Google lists ${b.review_count ?? "an unknown number of"} reviews in total.`;
  const checks = runChecks({
    business: b,
    findings: report.findings,
    roi: report.roi,
    reviews: report.reviews,
    knowledge: report.knowledge,
    board: ok,
    subject,
    scanDate: b.created_at,
  }).map((c) => ({ label: c.label, status: c.status, detail: sanitizeDetail(c.detail, c.id) }));
  const missing = ok ? ok.missing.map((k) => METRICS.find((m) => m.key === k)?.label ?? k) : [];
  return {
    id: "aire-serv",
    name: b.name,
    category: b.category ?? "HVAC contractor",
    sourceLabel: snapshotLabel(snap.saved_at),
    callsAllowed: false,
    rankLabel: ok ? `#${ok.subject.rank} of ${ok.rows.length}` : null,
    rank: ok?.subject.rank ?? null,
    of: ok?.rows.length ?? null,
    score: ok?.subject.score ?? null,
    formula: formulaBenchmark(),
    rankNote: ok
      ? `${ok.meta.plural}, scanned ${PEERS.scan_date}. Peers are anonymous. ${missing.length ? `Left out of this score: ${missing.join(", ")}.` : ""} This is ringring's score, not a nearby-miles list and not Google's ranking.`
      : board.status === "no_industry"
        ? board.reason
        : "No rank.",
    noRankReason: ok ? null : "no rank",
    rows,
    gap: gapFromRows(rows, replyNote, null, paceNote),
    drafts: unanswered.map((r) => ({
      stars: r.rating ?? 0,
      date: r.published_at ? fmtDate(r.published_at.slice(0, 10)) : "",
      text: (r.text ?? "").replace(/\s+/g, " ").trim(),
      draft: fixedDraft(b.name, r.rating ?? 0),
    })),
    draftNote: DRAFT_NOTE,
    profile: checks,
    reviewHref: reviewUrl(b.place_id),
    roi: {
      slug: "aire-serv",
      name: b.name,
      category: b.category ?? "HVAC contractor",
      reviewCount: b.review_count ?? 0,
      unansweredInSample: under5.length,
      sampleRead: report.reviews.length,
      avgTicket: defaultAvgTicket(b.category),
      sourceLabel: snapshotLabel(snap.saved_at),
    },
  };
}

function nearbyRows(page: PreviewPage): PathRow[] {
  if (!page.peers) return [];
  const sorted = [...page.peers.rows].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews || a.name.localeCompare(b.name));
  let lastKey = "";
  let lastRank = 0;
  return sorted.map((r, i) => {
    const key = `${r.rating}|${r.reviews}`;
    if (key !== lastKey) {
      lastRank = i + 1;
      lastKey = key;
    }
    return { name: r.name, you: r.you, rating: r.rating, reviews: r.reviews, score: null, rank: lastRank };
  });
}

function previewModel(page: PreviewPage): PathModel {
  const city = /Austin/i.test(page.address) ? "Austin" : null;
  const subject = toSubjectInput(
    {
      id: page.slug,
      name: page.name,
      category: page.categories[0] ?? null,
      city,
      rating: page.rating,
      review_count: page.reviewCount,
    },
    [],
    null,
  );
  const board = buildBoard(subject);
  const useBoard = board.status === "ok" && !page.peers;
  const rows = useBoard ? boardRows(board).map((r) => (r.you ? { ...r, name: page.name } : r)) : nearbyRows(page);
  const unanswered = page.tickets.filter((t) => !t.replied);
  const replyBits = page.peers
    ? `${unansweredCount(page)} under-5 reviews in the sample have no reply${page.sample ? ` (${page.sample.read} read)` : ""}. Peer reply rates are not in this nearby sample, so they are not in the order.`
    : useBoard
      ? `Reply rate is not in this score. The preview page does not include the full 1 and 2 star sample the benchmark needs.`
      : "No peer sample is in the saved scan.";
  let per90: number | null = null;
  let pace = "Current pace is not estimated. The saved scan has no complete 90-day review count.";
  if (page.recency?.complete90) {
    per90 = page.recency.n90;
    pace = `Current pace from the saved scan: ${page.recency.n90} reviews in the 90 days before the pull, and that window was fully read.`;
  } else if (page.recency) {
    pace = `Current pace is not estimated. The 90-day window was not fully read (${page.recency.n90} reviews in the sample are inside it).`;
  }
  const you = rows.find((r) => r.you);
  const profile: PathCheck[] = [
    { label: "Category", status: "pass", detail: page.categories.join(" / ") || "No category in the scan." },
    { label: "Rating and reviews", status: "pass", detail: `${page.rating.toFixed(1)} stars from ${page.reviewCount.toLocaleString("en-US")} Google reviews.` },
    {
      label: "Website",
      status: page.websiteStatus === "listed" ? "pass" : page.websiteStatus === "not_captured" ? "unknown" : "gap",
      detail: page.websiteStatus === "listed" ? "A website is on the listing." : page.websiteStatus === "x_link_only" ? "Only an X link is on the listing." : page.websiteStatus === "not_captured" ? "Website was not captured." : "No website on the listing.",
    },
    {
      label: "Phone",
      status: page.phoneStatus === "listed" ? "pass" : page.phoneStatus === "not_captured" ? "unknown" : "gap",
      detail: page.phoneStatus === "listed" ? "A phone is on the Google listing. This page does not show the number and does not call it." : page.phoneStatus === "not_captured" ? "Phone was not captured." : "No phone on the listing.",
    },
    { label: "Wednesday hours", status: page.wednesdayHours ? "pass" : "unknown", detail: page.wednesdayHours ? page.wednesdayHours : "Wednesday hours were not in the scan." },
    {
      label: "Unanswered reviews in the sample",
      status: unanswered.length ? "gap" : "pass",
      detail: unanswered.length ? `${unanswered.length} reviews on this page have no reply.` : "Every review on this page has a reply.",
    },
  ];
  const rank = you?.rank ?? null;
  const of = rows.length || null;
  return {
    id: page.slug,
    name: page.name,
    category: page.categories.join(" / "),
    sourceLabel: "Oct 28, 2026 scan",
    callsAllowed: false,
    rankLabel: rank && of ? `#${rank} of ${of}` : null,
    rank,
    of,
    score: useBoard ? board.subject.score : null,
    formula: useBoard ? formulaBenchmark() : page.peers ? NEARBY_FORMULA : "No peer list is in the saved scan, so there is no score.",
    rankNote: useBoard
      ? `${board.meta.plural}. Peers are anonymous. This is ringring's score, not Google's ranking.`
      : page.peers
        ? `${page.peers.note}. A sample, not every place nearby.`
        : "The saved scan has no peer list for this business. Nothing was invented to fill it.",
    noRankReason: rows.length ? null : "The saved scan has no peer list for this business.",
    rows,
    gap: rows.length ? gapFromRows(rows, replyBits, per90, pace) : null,
    drafts: unanswered.map((t) => ({
      stars: t.stars,
      date: fmtDate(t.date),
      text: t.text.replace(/\s+/g, " ").trim(),
      draft: fixedDraft(page.name, t.stars),
    })),
    draftNote: DRAFT_NOTE,
    profile,
    reviewHref: reviewUrl(page.placeId),
    roi: {
      slug: page.slug,
      name: page.name,
      category: page.categories.join(" / "),
      reviewCount: page.reviewCount,
      unansweredInSample: page.sample ? unansweredCount(page) : null,
      sampleRead: page.sample?.read ?? null,
      avgTicket: defaultAvgTicket(page.categories.join(" ")),
      sourceLabel: "From the Oct 28 scan",
    },
  };
}

export function pathModel(id: string): PathModel | null {
  if ((PATH_EXCLUDED as readonly string[]).includes(id)) return null;
  if (id === "aire-serv") return aireModel();
  const page = previewBySlug(id);
  return page ? previewModel(page) : null;
}

export function pathCatalog(): PathMatch[] {
  const pages = PREVIEW_SLUGS.filter((id) => !(PATH_EXCLUDED as readonly string[]).includes(id));
  return [{ id: "aire-serv", name: PATH_DEMOS[0].name }, ...pages.map((id) => ({ id, name: previewBySlug(id)?.name ?? id }))];
}

export function searchCache(query: string): PathMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const snap = findSnapshot({ name: q });
  const hits: PathMatch[] = [];
  if (snap) hits.push({ id: "aire-serv", name: snap.name });
  for (const row of pathCatalog()) {
    if (row.id === "aire-serv") continue;
    if (row.name.toLowerCase().includes(q) || row.id.includes(q.replace(/\s+/g, "-"))) hits.push(row);
  }
  return hits;
}

export function resolvePath(input: { b?: string; q?: string }): { model: PathModel; note: string | null; matches: PathMatch[] } {
  const q = input.q?.trim() ?? "";
  if (q) {
    const matches = searchCache(q);
    if (matches.length === 0) {
      return {
        model: pathModel(PATH_DEFAULT_ID)!,
        note: `No saved scan matches "${q}". Showing Aire Serv. Antler and PlebLab are left out of this demo. A live scan was not started.`,
        matches: [],
      };
    }
    const model = pathModel(matches[0]!.id)!;
    return { model, note: matches.length > 1 ? `${matches.length} saved scans match. Showing the first.` : null, matches };
  }
  const id = input.b && pathModel(input.b) ? input.b : PATH_DEFAULT_ID;
  return { model: pathModel(id)!, note: null, matches: [] };
}

/** Days to close a review-count gap. Null when there is no gap or the weekly add is 0. */
export function daysToMatchReviews(reviewGap: number, per90: number | null, extraPerWeek: number): number | null {
  if (reviewGap <= 0) return null;
  const perDay = (per90 != null && per90 > 0 ? per90 / 90 : 0) + (extraPerWeek > 0 ? extraPerWeek / 7 : 0);
  if (perDay <= 0) return null;
  return Math.ceil(reviewGap / perDay);
}

export function modelHasPhone(model: PathModel): boolean {
  return PHONE.test(JSON.stringify(model)) || JSON.stringify(model).includes("[phone on Google listing]") || JSON.stringify(model).includes("tel:");
}
