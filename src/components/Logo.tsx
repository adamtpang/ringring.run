/** Handset glyph, 24x24 box. */
export const HANDSET_PATH =
  "M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z";

/** The ringring mark: a handset on a filled disc, inside one ring. */
export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="14.75" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.32" />
      <circle cx="16" cy="16" r="10.5" fill="currentColor" />
      <path d={HANDSET_PATH} fill="white" transform="translate(9.4 9.4) scale(0.55)" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-headline font-semibold tracking-[-0.02em] ${className}`}>
      <LogoMark className="h-[1.5rem] w-[1.5rem] text-accent-solid" />
      <span>
        ringring<span className="text-subtle">.run</span>
      </span>
    </span>
  );
}

/** Hero emblem: the mark at scale with rings radiating out. Reduced motion shows static rings. */
export function RingEmblem({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={`text-accent-solid ${className}`} aria-hidden="true">
      <circle className="ring-wave" cx="200" cy="200" r="118" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle className="ring-wave ring-wave-2" cx="200" cy="200" r="118" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle className="ring-wave ring-wave-3" cx="200" cy="200" r="118" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="200" cy="200" r="86" fill="currentColor" opacity="0.08" />
      <circle cx="200" cy="200" r="58" fill="currentColor" />
      <path d={HANDSET_PATH} fill="white" transform="translate(170 170) scale(2.5)" />
    </svg>
  );
}
