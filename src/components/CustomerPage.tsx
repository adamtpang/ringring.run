import { Wordmark } from "@/components/Logo";
import { reviewUrl, type WalkPlace } from "@/lib/walk";

/** Public page for the business's customers. One path to Google. No private detour. */
export function CustomerPage({ place }: { place: WalkPlace }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-[var(--space-gutter)] py-8">
      <Wordmark />
      <h1 className="mt-8 text-title-1">{place.name}</h1>
      {place.category && <p className="mt-1 text-footnote text-muted">{place.category}</p>}
      <p className="mt-6 text-title-2">Love us?</p>
      <p className="mt-1 text-footnote text-muted">A Google review helps the next person find us.</p>
      <a
        href={reviewUrl(place.placeId)}
        className="pressable mt-4 inline-flex h-12 items-center justify-center rounded-pill bg-accent-solid px-6 text-body font-medium text-accent-fg"
      >
        Write a Google review
      </a>
      {(place.address || place.phone || place.website) && (
        <section className="mt-8">
          <h2 className="text-eyebrow uppercase text-subtle">Reach {place.name}</h2>
          <ul className="mt-2 space-y-1 text-footnote">
            {place.address && <li>{place.address}</li>}
            {place.phone && <li>{place.phone}</li>}
            {place.website && (
              <li>
                <a href={place.website} className="break-all text-accent" target="_blank" rel="noreferrer">
                  {place.website}
                </a>
              </li>
            )}
          </ul>
        </section>
      )}
      <p className="mt-auto pt-10 text-caption text-subtle">Public Google listing, pulled Oct 28, 2026.</p>
    </div>
  );
}
