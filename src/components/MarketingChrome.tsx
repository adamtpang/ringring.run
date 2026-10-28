import Link from "next/link";
import { ButtonLink } from "./ds";
import { Wordmark } from "./Logo";

export function MarketingHeader() {
  return (
    <header className="material-bar sticky top-0 z-20 shadow-[0_1px_0_var(--color-hairline-raw)]">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-[var(--space-gutter)]">
        <Link href="/" aria-label="ringring.run home" className="pressable rounded-sm">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1 text-footnote">
          <Link href="/#how" className="pressable hidden rounded-pill px-3 py-1.5 text-muted hover:text-foreground sm:block">
            How it works
          </Link>
          <Link href="/#pricing" className="pressable hidden rounded-pill px-3 py-1.5 text-muted hover:text-foreground sm:block">
            Pricing
          </Link>
          <ButtonLink href="/find" size="sm" variant="inverse" className="ml-2">
            Try the demo
          </ButtonLink>
        </div>
      </nav>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-[var(--space-gutter)] py-8 text-footnote text-muted sm:flex-row sm:items-center sm:justify-between">
        <Wordmark />
        <span className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/find" className="hover:text-foreground">Demo</Link>
          <Link href="/showcase" className="hover:text-foreground">Tour</Link>
          <Link href="/evals" className="hover:text-foreground">Evals</Link>
          <Link href="/design" className="hover:text-foreground">Design</Link>
          <Link href="/health" className="hover:text-foreground">Health</Link>
          <span>Built at AITX × MLOps World, Austin</span>
        </span>
      </div>
    </footer>
  );
}
