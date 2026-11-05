import type { ReactNode } from "react";
import { MarketingFooter, MarketingHeader } from "./MarketingChrome";

/** Plain reading page (About, Contact, Privacy) inside the marketing chrome. */
export function ProsePage({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <>
      <MarketingHeader />
      <main className="flex-1">
        <article className="mx-auto max-w-2xl px-[var(--space-gutter)] py-[var(--space-section)]">
          <div className="text-eyebrow uppercase text-accent">{eyebrow}</div>
          <h1 className="mt-3 text-title-1 text-balance">{title}</h1>
          <div className="prose-page mt-8 space-y-5 text-body text-pretty [&_a]:text-accent [&_a]:underline [&_h2]:mt-10 [&_h2]:text-title-3 [&_li]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_p]:text-muted [&_li]:text-muted">
            {children}
          </div>
        </article>
      </main>
      <MarketingFooter />
    </>
  );
}
