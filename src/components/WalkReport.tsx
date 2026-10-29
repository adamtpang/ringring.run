import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { fitOf, type WalkPlace } from "@/lib/walk";

const FIT_TEXT = { green: "text-accent", amber: "text-warning", red: "text-danger" } as const;

/** Short report for a place that does not have an owner preview at /d. */
export function WalkReport({ place }: { place: WalkPlace }) {
  const fit = fitOf(place.tier);
  return (
    <div className="mx-auto w-full max-w-lg px-[var(--space-gutter)] py-6">
      <Wordmark />
      <p className="mt-4 text-caption text-subtle">Public Google data, pulled Oct 28, 2026. We draft, you post.</p>
      <h1 className="mt-3 text-title-1">{place.name}</h1>
      <p className="mt-1 text-footnote text-muted">
        {place.category}
        {place.address ? ` · ${place.address}` : ""}
      </p>
      <p className={`mt-4 text-title-2 font-semibold ${FIT_TEXT[fit]}`}>
        {place.rating != null ? `${place.rating.toFixed(1)}★` : "No rating"}{" "}
        <span className="text-footnote font-medium text-muted">
          {place.reviewCount != null ? `${place.reviewCount} Google reviews` : ""} · tier {place.tier}
          {place.score != null ? ` · score ${place.score}` : ""}
        </span>
      </p>
      <p className="mt-3 text-footnote">{place.why}</p>
      {place.wedHours && <p className="mt-2 text-footnote text-muted">Wednesday hours: {place.wedHours}</p>}
      {place.problems.length > 0 && (
        <section className="mt-4">
          <h2 className="text-eyebrow uppercase text-subtle">Top problems in the reviews we read</h2>
          <ul className="mt-2 space-y-1 text-footnote">
            {place.problems.map((p) => (
              <li key={p.label}>
                {p.label}
                {p.detail ? ` · ${p.detail}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-6 text-footnote">
        <Link href={`/c/${place.slug}`} className="text-accent">
          Customer review link
        </Link>
      </p>
    </div>
  );
}
