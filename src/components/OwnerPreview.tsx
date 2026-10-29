import Link from "next/link";
import { Badge, Button, Card } from "@/components/ds";
import { Wordmark } from "@/components/Logo";
import { OwnerRag, ragTone } from "@/components/OwnerRag";
import { ragSections } from "@/lib/walk";
import {
  CLAIM_LABEL,
  COMING_SOON,
  CONTACT_EMAIL,
  DRAFTS_LINE,
  PREVIEW_BANNER,
  PULLED,
  featuredTicket,
  fmtDate,
  fmtInt,
  fmtRating,
  peerRank,
  sampleCaption,
  sampleDraft,
  snip,
  themeLabels,
  unansweredCount,
  type PreviewPage,
  type PreviewTicket,
} from "@/lib/preview-pages";

const STAR_ROWS = [
  ["five", "5"],
  ["four", "4"],
  ["three", "3"],
  ["two", "2"],
  ["one", "1"],
] as const;

function Tile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="min-w-0 rounded-md bg-surface p-3 shadow-card sm:p-4">
      <div className="text-title-2 font-semibold tabular-nums tracking-tight">{value}</div>
      <p className="mt-1 text-caption text-muted">{label}</p>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-2 text-footnote last:border-b-0">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-right font-medium">{children}</span>
    </div>
  );
}

function Listed({ children }: { children: React.ReactNode }) {
  return (
    <span className="break-words">
      <span className="text-accent">✓ </span>
      {children}
    </span>
  );
}

function ReviewRow({ ticket }: { ticket: PreviewTicket }) {
  const labels = themeLabels(ticket.themes);
  const quote = snip(ticket.text);
  return (
    <li className="border-b border-hairline py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-footnote font-semibold tabular-nums">{ticket.stars}★</span>
        <span className="text-caption text-subtle">{fmtDate(ticket.date)}</span>
        {ticket.replied ? (
          <Badge tone="success">Replied</Badge>
        ) : (
          <span className="text-caption text-subtle">No reply</span>
        )}
        {labels.map((label) => (
          <Badge key={label} tone="neutral">
            {label}
          </Badge>
        ))}
      </div>
      {quote ? (
        <p className="mt-1 text-footnote text-foreground">“{quote}”</p>
      ) : (
        <p className="mt-1 text-footnote text-subtle">No written text.</p>
      )}
    </li>
  );
}

export function OwnerPreview({ page }: { page: PreviewPage }) {
  const rank = peerRank(page);
  const unanswered = unansweredCount(page);
  const featured = featuredTicket(page);
  const draft = featured ? sampleDraft(page.name, page.phone) : null;
  const featuredQuote = featured ? featured.text.replace(/\s+/g, " ").trim() : "";
  const rag = ragSections(page.kit);
  const ratingTone = ragTone(rag.header?.status);

  return (
    <div className="mx-auto w-full max-w-5xl px-[var(--space-gutter)] py-5 sm:py-8">
      <header className="flex items-center justify-between gap-3">
        <Link href="/" aria-label="ringring.run home" className="pressable rounded-sm">
          <Wordmark />
        </Link>
        <Badge tone="warning">Preview</Badge>
      </header>

      <p className="mt-4 rounded-md bg-warning-soft px-3 py-2 text-footnote font-medium text-warning">{PREVIEW_BANNER}</p>

      <div className="mt-4 flex flex-col gap-3 rounded-lg bg-inverse px-4 py-4 text-inverse-fg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-headline">Is this your business? Claim it.</p>
          <p className="mt-1 text-caption opacity-80">Until then, this is a public preview.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="md" disabled aria-describedby="claim-soon">
            {CLAIM_LABEL}
          </Button>
          <span id="claim-soon">
            <Badge tone="warning">{COMING_SOON}</Badge>
          </span>
        </div>
      </div>

      <div className="mt-6">
        <h1 className="text-title-1">{page.name}</h1>
        <p className="mt-1 text-footnote text-muted">
          {page.categories.join(" / ")} · {page.address}
        </p>
      </div>

      <OwnerRag kit={page.kit} />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile value={<span className={ratingTone}>{`${fmtRating(page.rating)}★`}</span>} label={`${fmtInt(page.reviewCount)} Google reviews`} />
        {page.non5Total != null && <Tile value={fmtInt(page.non5Total)} label="reviews under 5★ on Google" />}
        {page.sample && page.tickets.length > 0 && (
          <Tile value={`${unanswered} of ${page.tickets.length}`} label="under 5★ we read, no reply" />
        )}
        {page.recency && (
          <Tile
            value={page.recency.complete90 ? fmtInt(page.recency.n90) : `${fmtInt(page.recency.n90)}+`}
            label="new reviews, last 90 days"
          />
        )}
        {rank && <Tile value={`#${rank.rank} of ${rank.of}`} label="nearby, by rating" />}
      </div>

      <div className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <Card as="section" padding="sm" className="order-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-eyebrow uppercase text-subtle">Reviews</h2>
              <p className="text-caption text-subtle">
                {page.tickets.length > 0 ? `${page.tickets.length} under 5★ · worst, then newest` : "Backlog"}
              </p>
            </div>
            <p className="mt-1 text-footnote font-medium">{DRAFTS_LINE}</p>
            {page.tickets.length > 0 ? (
              <ul className="mt-2 max-h-96 overflow-y-auto">
                {page.tickets.map((ticket, i) => (
                  <ReviewRow key={`${ticket.date}-${ticket.stars}-${i}`} ticket={ticket} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-footnote text-muted">{sampleCaption(page)}</p>
            )}
            {featured && draft && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md bg-surface-2 p-3">
                  <p className="text-caption font-medium uppercase tracking-wide text-subtle">
                    Review · {featured.stars}★ · {fmtDate(featured.date)}
                  </p>
                  {featuredQuote ? (
                    <p className="mt-1 text-footnote">“{featuredQuote}”</p>
                  ) : (
                    <p className="mt-1 text-footnote text-subtle">No written text.</p>
                  )}
                </div>
                <div className="rounded-md bg-surface-2 p-3">
                  <p className="text-caption font-medium uppercase tracking-wide text-subtle">Sample draft</p>
                  <p className="mt-1 text-footnote">{draft}</p>
                </div>
              </div>
            )}
            {page.tickets.length > 0 && <p className="mt-3 text-caption text-subtle">{sampleCaption(page)} Quotes as written.</p>}
          </Card>

          <Card as="section" padding="sm" className="order-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-eyebrow uppercase text-subtle">Missed calls</h2>
              <Badge tone="neutral">{COMING_SOON}</Badge>
            </div>
            <div className="mt-3 rounded-md border border-dashed border-hairline-strong px-3 py-5 text-center">
              <p className="text-footnote font-semibold">No calls yet</p>
              <p className="mt-1 text-caption text-muted">
                Ringy is not answering the phone. When it does, missed calls will show here.
              </p>
            </div>
          </Card>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <Card as="section" padding="sm" className="order-2">
            <h2 className="text-eyebrow uppercase text-subtle">Recency</h2>
            {page.recency ? (
              <>
                <Fact label="Newest review">{fmtDate(page.recency.newest)}</Fact>
                <Fact label="Last 90 days">{page.recency.complete90 ? `${fmtInt(page.recency.n90)} new` : `At least ${fmtInt(page.recency.n90)}`}</Fact>
                <Fact label="Newest unanswered 1–3★">{page.recency.sun}</Fact>
              </>
            ) : (
              <p className="mt-2 text-footnote text-muted">Review dates were not pulled. Rating and review count only.</p>
            )}
            {page.distribution && (
              <ul className="mt-3 space-y-1.5" aria-label="Star split on Google">
                {STAR_ROWS.map(([key, label]) => {
                  const count = page.distribution ? page.distribution[key] : 0;
                  const width = page.reviewCount ? (count / page.reviewCount) * 100 : 0;
                  return (
                    <li key={key} className="flex items-center gap-2 text-caption">
                      <span className="w-6 shrink-0 tabular-nums">{label}★</span>
                      <span className="h-2 min-w-0 flex-1 rounded-sm bg-surface-2">
                        <span className="block h-2 rounded-sm bg-foreground" style={{ width: `${width}%` }} />
                      </span>
                      <span className="w-12 shrink-0 text-right tabular-nums">{fmtInt(count)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {page.distribution && page.recency && (
              <p className="mt-3 text-caption text-subtle">
                Star split of all {fmtInt(page.reviewCount)} on Google.
                {page.sample?.full ? " Dates from every review." : ` Dates from the newest ${fmtInt(page.recency.read)} reviews read.`}
              </p>
            )}
          </Card>

          {page.peers && (
            <Card as="section" padding="sm" className="order-3">
              <h2 className="text-eyebrow uppercase text-subtle">How you rank nearby</h2>
              <div className="mt-2 flex items-baseline gap-2 px-2 text-caption text-subtle">
                <span className="w-6 shrink-0">#</span>
                <span className="min-w-0 flex-1">Place</span>
                <span className="w-8 shrink-0 text-right">★</span>
                <span className="w-14 shrink-0 text-right">Reviews</span>
                <span className="w-14 shrink-0 text-right">Away</span>
              </div>
              <ul>
                {page.peers.rows.map((row, i) => (
                  <li
                    key={row.name}
                    className={
                      row.you
                        ? "flex items-baseline gap-2 rounded-sm bg-accent-soft px-2 py-1.5 text-footnote font-semibold"
                        : "flex items-baseline gap-2 px-2 py-1.5 text-footnote"
                    }
                  >
                    <span className="w-6 shrink-0 tabular-nums text-subtle">#{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      {row.name}
                      {row.you ? " (you)" : ""}
                    </span>
                    <span className="w-8 shrink-0 text-right tabular-nums">{fmtRating(row.rating)}</span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-muted">{fmtInt(row.reviews)}</span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-subtle">{row.awayM == null ? "" : `${fmtInt(row.awayM)} m`}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-caption text-subtle">
                {page.peers.note}. 10 or more reviews. Ranked by stars, then review count. Straight-line distance. A sample, not every place nearby.
              </p>
            </Card>
          )}

          <Card as="section" padding="sm" className="order-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-eyebrow uppercase text-subtle">Google listing</h2>
              {page.mapsUrl && (
                <a href={page.mapsUrl} target="_blank" rel="noreferrer" className="text-caption text-accent">
                  Google listing
                </a>
              )}
            </div>
            <Fact label="Location">{page.address}</Fact>
            <Fact label="Category">{page.categories.join(" / ")}</Fact>
            <Fact label="Business age">{page.ageLine}</Fact>
            <Fact label="Website">
              {page.websiteStatus === "listed" && page.website ? (
                <Listed>
                  <a href={page.website} target="_blank" rel="noreferrer" className="break-all">
                    {page.website}
                  </a>
                </Listed>
              ) : page.websiteStatus === "x_link_only" && page.website ? (
                <span>
                  X link only ·{" "}
                  <a href={page.website} target="_blank" rel="noreferrer" className="break-all">
                    {page.website}
                  </a>
                </span>
              ) : page.websiteStatus === "not_captured" ? (
                "Not captured"
              ) : (
                "Not listed"
              )}
            </Fact>
            <Fact label="Wednesday hours">
              <Listed>{page.wednesdayHours}</Listed>
            </Fact>
            <Fact label="Phone">
              {page.phoneStatus === "listed" && page.phone ? (
                <Listed>{page.phone}</Listed>
              ) : page.phoneStatus === "not_captured" ? (
                "Not captured"
              ) : (
                "Not listed"
              )}
            </Fact>
          </Card>
        </div>
      </div>

      <footer className="mt-6 flex flex-col gap-1 border-t border-hairline pt-3 text-caption text-subtle sm:flex-row sm:items-center sm:justify-between">
        <p>Public Google data, scraped {PULLED}. Nothing on this page is estimated.</p>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <a href={`/path?b=${page.slug}`} className="text-accent">
            Your path to #1
          </a>
          <a href={`/roi?slug=${page.slug}`} className="text-accent">
            Time and money
          </a>
          <a href={`/c/${page.slug}`} className="text-accent">
            Customer review link
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent">
            {CONTACT_EMAIL}
          </a>
        </span>
      </footer>
    </div>
  );
}
