import Link from "next/link";
import { Wordmark } from "@/components/Logo";

const steps = [
  {
    n: "1",
    title: "Scan",
    status: "In the demo",
    body: "Pulls the business from Google Maps with its reviews: phone, website, hours, rating, and what customers actually say.",
  },
  {
    n: "2",
    title: "Diagnose with ROI",
    status: "In the demo",
    body: "Finds evidence-backed problems like missed calls or unanswered reviews, then prices each one from stated assumptions you can see and edit.",
  },
  {
    n: "3",
    title: "Owner call",
    status: "Coming soon",
    body: "An AI interviews the owner about what the scan found. It only calls with consent, and it always says it is an AI.",
  },
  {
    n: "4",
    title: "Deploy voice agent",
    status: "Coming soon",
    body: "An AI phone agent that answers as that business, trained on its hours and services, so no customer call goes unanswered.",
  },
];

const principles = [
  {
    title: "Cites its sources",
    body: "Every finding points to the exact review text or listing field behind it. A quote that cannot be found in the source is thrown out.",
  },
  {
    title: "Shows the math",
    body: "Each estimate is plain multiplication, like missed calls per week times close rate times average ticket. Change any number and the estimate updates. Estimates are labeled as estimates.",
  },
  {
    title: "Says it is AI",
    body: "Owner calls happen only with consent, and the agent always discloses that it is an AI. A person approves anything sent to a business.",
  },
];

function Rings() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full text-accent" aria-hidden="true">
      <circle className="ring-pulse" cx="200" cy="200" r="120" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle className="ring-pulse ring-pulse-2" cx="200" cy="200" r="120" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle className="ring-pulse ring-pulse-3" cx="200" cy="200" r="120" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="200" cy="200" r="64" fill="currentColor" opacity="0.08" />
      <circle cx="200" cy="200" r="44" fill="currentColor" />
      <path
        d="M186 184c0-2 1.6-3.6 3.6-3.6h4.2c1.6 0 3 1 3.4 2.6l1.6 5.6c.4 1.4-.1 2.9-1.2 3.8l-2.3 1.8a22 22 0 0 0 10.9 10.9l1.8-2.3c.9-1.1 2.4-1.6 3.8-1.2l5.6 1.6c1.6.4 2.6 1.8 2.6 3.4v4.2c0 2-1.6 3.6-3.6 3.6h-1.8C198.3 218 182 201.7 182 185.8V184z"
        fill="white"
        transform="translate(-2 -2)"
      />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="flex-1">
      <header className="sticky top-0 z-10 border-b border-hairline bg-background/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" aria-label="ringring.run home">
            <Wordmark />
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-85"
          >
            Try the demo
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-5xl items-center gap-10 px-6 pb-20 pt-16 md:grid-cols-[1.15fr_1fr] md:pt-24">
        <div>
          <p className="text-sm font-medium text-accent">AI voice agent for small businesses</p>
          <h1 className="mt-3 text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Every call answered.
            <br />
            <span className="text-muted">Every leak priced.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            ringring.run is AI that picks up every call and finds where AI saves the business money. It
            learns a business from the outside, shows the evidence for each problem, and prices it with
            math you can check.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/dashboard"
              className="rounded-full bg-accent px-6 py-3 text-base font-medium text-white shadow-sm transition hover:opacity-90"
            >
              Try the demo
            </Link>
            <span className="text-sm text-muted">The demo uses clearly labeled sample data until API keys are added.</span>
          </div>
        </div>
        <div className="mx-auto aspect-square w-full max-w-sm">
          <Rings />
        </div>
      </section>

      <section id="how-it-works" className="border-t border-hairline bg-white">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">How it works</h2>
          <p className="mt-3 max-w-2xl text-lg text-muted">
            Four steps from a Google Maps listing to a phone agent that answers for the business.
          </p>
          <ol className="mt-12 grid gap-5 sm:grid-cols-2">
            {steps.map((s) => {
              const live = s.status === "In the demo";
              return (
                <li key={s.n} className="rounded-3xl border border-hairline bg-background p-7">
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-white">
                      {s.n}
                    </span>
                    <span
                      className={
                        "rounded-full px-3 py-1 text-xs font-medium " +
                        (live ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500")
                      }
                    >
                      {s.status}
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="border-t border-hairline">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Built on evidence, not guesses</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {principles.map((p) => (
              <div key={p.title}>
                <h3 className="text-lg font-semibold tracking-tight">{p.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-hairline bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">See it work.</h2>
          <p className="mt-3 max-w-xl text-lg text-muted">
            Run a scan, watch the agent work step by step, and open a report with quotes, assumptions, and a
            suggested fix.
          </p>
          <Link
            href="/dashboard"
            className="mt-8 rounded-full bg-accent px-6 py-3 text-base font-medium text-white shadow-sm transition hover:opacity-90"
          >
            Try the demo
          </Link>
        </div>
      </section>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <Wordmark />
          <span>Built at the AITX x MLOps World hackathon in Austin.</span>
        </div>
      </footer>
    </main>
  );
}
