import data from "@/data/preview-pages.json";

/** Fixed owner-facing lines. The draft is the app's generic template, not an AI reply. */
export const PREVIEW_BANNER = "Preview, sample from public Google data, pulled Oct 28, 2026";
export const DRAFTS_LINE = "Drafts, you approve, you paste. ringring.run never posts to Google.";
export const CONTACT_EMAIL = "hi@ringring.run";
export const CLAIM_LABEL = "Sign in with Google to claim";
export const COMING_SOON = "Coming soon";
export const PULLED = "Oct 28, 2026";

export interface PreviewTicket {
  stars: number;
  date: string;
  text: string;
  replied: boolean;
  themes: string[];
}

export interface PreviewPeerRow {
  name: string;
  you: boolean;
  rating: number;
  reviews: number;
  awayM: number | null;
}

export interface PreviewPage {
  slug: string;
  kit: string;
  placeId: string;
  name: string;
  categories: string[];
  address: string;
  rating: number;
  reviewCount: number;
  phone: string | null;
  phoneStatus: "listed" | "not_listed" | "not_captured";
  website: string | null;
  websiteStatus: "listed" | "not_listed" | "x_link_only" | "not_captured";
  wednesdayHours: string;
  ageLine: string;
  mapsUrl: string | null;
  distribution: { one: number; two: number; three: number; four: number; five: number } | null;
  non5Total: number | null;
  sample: { read: number; total: number; full: boolean } | null;
  tickets: PreviewTicket[];
  recency: {
    newest: string;
    n90: number;
    complete90: boolean;
    sun: string;
    read: number;
    total: number;
  } | null;
  peers: { note: string; rows: PreviewPeerRow[] } | null;
  sources: {
    listing: string;
    reviews: string | null;
    recency: string | null;
    age: string;
    peers: string | null;
  };
}

const file = data as { pulled: string; pages: PreviewPage[] };

export const PREVIEW_PAGES: PreviewPage[] = file.pages;
export const PREVIEW_SLUGS: string[] = PREVIEW_PAGES.map((p) => p.slug);

const bySlug = new Map(PREVIEW_PAGES.map((p) => [p.slug, p]));

export function previewBySlug(slug: string): PreviewPage | undefined {
  return bySlug.get(slug);
}

const THEME_LABEL: Record<string, string> = {
  billing_price: "Price",
  quality: "Quality",
  crowd_noise: "Crowd",
  staff_attitude: "Staff",
  booking_comms: "Booking",
  cleanliness: "Cleanliness",
  wait_speed: "Wait",
  door_security: "Door",
  hours_reliability: "Hours",
};

/** Theme chips worth showing. "other" and "no_text" add no information. */
export function themeLabels(themes: string[]): string[] {
  return themes.map((t) => THEME_LABEL[t]).filter((t): t is string => Boolean(t));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const month = MONTHS[Number(m) - 1];
  if (!month || !d || !y) return iso;
  return `${month} ${Number(d)}, ${y}`;
}

export function fmtInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function fmtRating(n: number): string {
  return n.toFixed(1);
}

export function unansweredCount(page: PreviewPage): number {
  return page.tickets.reduce((n, t) => n + (t.replied ? 0 : 1), 0);
}

export function peerRank(page: PreviewPage): { rank: number; of: number } | null {
  if (!page.peers) return null;
  const i = page.peers.rows.findIndex((r) => r.you);
  if (i < 0) return null;
  return { rank: i + 1, of: page.peers.rows.length };
}

/** First unanswered low review, in the baked worst-then-newest order. */
export function featuredTicket(page: PreviewPage): PreviewTicket | null {
  return page.tickets.find((t) => !t.replied) ?? null;
}

/** One generic reply. No theme-specific sentence: those mislabel a bar as "work". */
export function sampleDraft(name: string, phone: string | null): string {
  const open =
    "Thank you for taking the time to share this. We're sorry your experience fell short. We take this seriously and would like to understand what happened.";
  const call = phone ? ` Please call us at ${phone} so we can follow up with you directly.` : "";
  return `${open}${call} The ${name} team`;
}

export function snip(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  const base = (space > 80 ? cut.slice(0, space) : cut).replace(/[.,;:]+$/, "");
  return `${base}…`;
}

export function sampleCaption(page: PreviewPage): string {
  if (!page.sample) return "Review texts were not read. Rating and review count only.";
  const n = page.tickets.length;
  const { read, total, full } = page.sample;
  if (full) return `${fmtInt(n)} under 5★ in all ${fmtInt(total)} reviews.`;
  const pct = Math.round((read / total) * 1000) / 10;
  const pctText = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
  const google = page.non5Total == null ? "" : ` Google lists ${fmtInt(page.non5Total)} under 5★.`;
  return `${fmtInt(n)} under 5★ in the ${fmtInt(read)} newest of ${fmtInt(total)} (${pctText}%).${google}`;
}
