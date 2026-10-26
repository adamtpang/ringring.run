import { RingEmblem } from "@/components/Logo";
import { MarketingFooter, MarketingHeader } from "@/components/MarketingChrome";
import { ModeSwitch } from "@/components/ModeSwitch";
import { Badge, ButtonLink, Card, SectionHeader } from "@/components/ds";
import { MODES } from "@/lib/modes";

// Only what the code does today is marked "Live". Everything else says "Next".
const steps = [
  { n: 1, title: "Scan", live: true, body: "Pulls the business from Google Maps: reviews, hours, phone, and website." },
  { n: 2, title: "Diagnose", live: true, body: "Finds problems like missed calls. Each one quotes a review, website line, or listing field." },
  { n: 3, title: "Price", live: true, body: "Estimates monthly value from assumptions you can see and edit." },
  { n: 4, title: "Answer", live: false, body: "A phone agent per business, trained on its hours and services. It says it is an AI." },
];

const principles = [
  { title: "Cited", body: "Quotes that cannot be found in the source are thrown out." },
  { title: "Checkable", body: "Every estimate is plain multiplication. Change a number, the total updates." },
  { title: "Honest", body: "Estimates are labeled. Sample data is labeled. AI says it is AI." },
];

const plan = [
  { label: "Market and single-business scans", live: true },
  { label: "Cited diagnosis with editable ROI", live: true },
  { label: "Per-business agent config, tested by simulated callers", live: true },
  { label: "Answering real calls on a phone number", live: false },
];

function Check({ live }: { live: boolean }) {
  return live ? (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-accent" aria-hidden="true">
      <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2.5" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <MarketingHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-5xl items-center gap-8 px-[var(--space-gutter)] pb-16 pt-12 sm:pt-20 md:grid-cols-[1.2fr_1fr] md:gap-12 md:pb-24">
          <div className="order-2 md:order-1">
            <p className="text-eyebrow uppercase text-accent">AI voice agent for small businesses</p>
            <h1 className="mt-4 text-display text-balance">
              Every missed call, <span className="text-muted">found and priced.</span>
            </h1>
            <p className="mt-5 max-w-lg text-body text-pretty text-muted sm:text-[1.1875rem]">
              Scan a business on Google Maps. See its problems with cited proof and the ROI math.
            </p>
            <div className="mt-8">
              <ModeSwitch size="md" fallback="customers" />
              <dl className="mt-4 grid max-w-lg gap-2 text-footnote">
                {MODES.map((m) => (
                  <div key={m.id} className="flex gap-2">
                    <dt className="w-28 shrink-0 font-medium">{m.label}</dt>
                    <dd className="text-muted">{m.blurb}</dd>
                  </div>
                ))}
              </dl>
              <ButtonLink href="#how" size="sm" variant="plain" className="-ml-3 mt-3">
                How it works
              </ButtonLink>
            </div>
            <p className="mt-2 text-caption text-subtle">Demo runs on labeled sample data until API keys are added.</p>
          </div>
          <div className="order-1 mx-auto w-48 sm:w-64 md:order-2 md:w-full md:max-w-sm">
            <RingEmblem className="aspect-square w-full" />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-14 border-t border-hairline bg-surface-2/60">
          <div className="mx-auto max-w-5xl px-[var(--space-gutter)] py-[var(--space-section)]">
            <SectionHeader eyebrow="How it works" title="From a listing to a phone agent." size="lg" />
            <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s) => (
                <Card key={s.n} as="li" padding="md" className="flex flex-col">
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-pill text-footnote font-semibold ${s.live ? "bg-accent-solid text-accent-fg" : "bg-surface-2 text-muted ring-1 ring-inset ring-hairline"}`}
                    >
                      {s.n}
                    </span>
                    <Badge tone={s.live ? "success" : "neutral"}>{s.live ? "Live" : "Next"}</Badge>
                  </div>
                  <h3 className="mt-5 text-title-3">{s.title}</h3>
                  <p className="mt-1.5 text-footnote text-muted">{s.body}</p>
                </Card>
              ))}
            </ol>
          </div>
        </section>

        {/* Principles */}
        <section className="border-t border-hairline">
          <div className="mx-auto grid max-w-5xl gap-8 px-[var(--space-gutter)] py-[var(--space-section)] md:grid-cols-[1fr_2fr]">
            <SectionHeader eyebrow="Evidence first" title="No guesses." size="lg" />
            <dl className="grid gap-6 sm:grid-cols-3">
              {principles.map((p) => (
                <div key={p.title}>
                  <dt className="text-headline">{p.title}</dt>
                  <dd className="mt-1 text-footnote text-muted">{p.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Pricing (illustrative) */}
        <section id="pricing" className="scroll-mt-14 border-t border-hairline bg-surface-2/60">
          <div className="mx-auto max-w-5xl px-[var(--space-gutter)] py-[var(--space-section)]">
            <SectionHeader eyebrow="Pricing" title="One plan." align="center" size="lg" description="Illustrative pricing. Not on sale yet." />
            <Card padding="lg" className="mx-auto mt-10 max-w-md shadow-float">
              <div className="flex items-center justify-between">
                <h3 className="text-title-3">Starter</h3>
                <Badge tone="warning">Illustrative</Badge>
              </div>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-display tabular-nums">$149</span>
                <span className="text-callout text-muted">/ month</span>
              </p>
              <p className="mt-1 text-footnote text-muted">14-day free trial. Cancel anytime.</p>
              <ul className="mt-6 space-y-3 border-t border-hairline pt-6">
                {plan.map((f) => (
                  <li key={f.label} className="flex items-center gap-3 text-callout">
                    <Check live={f.live} />
                    <span className={f.live ? "" : "text-muted"}>{f.label}</span>
                    {!f.live && <Badge className="ml-auto">Next</Badge>}
                  </li>
                ))}
              </ul>
              <ButtonLink href="/find" size="lg" className="mt-8 w-full">
                Try the demo
              </ButtonLink>
            </Card>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-hairline">
          <div className="mx-auto flex max-w-5xl flex-col items-center px-[var(--space-gutter)] py-[var(--space-section)] text-center">
            <h2 className="text-title-1 text-balance">See it work.</h2>
            <p className="mt-3 max-w-md text-callout text-muted">Find a business nearby and chat with its AI. Owners can scan their own.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/find" size="lg">
                Try the demo
              </ButtonLink>
              <ButtonLink href="/owners" size="lg" variant="secondary">
                For business owners
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
