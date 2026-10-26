"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, Field, SectionHeader } from "@/components/ds";
import { PageShell } from "@/components/ui";
import { useStartScan } from "@/components/useStartScan";

// Only what runs today is "Live". Phone and SMS are labeled "Next".
const flow = [
  { title: "Scan", live: true, body: "Your Google Maps listing, reviews, and website." },
  { title: "Report", live: true, body: "Problems like missed calls, each with a quote as proof, and the ROI math." },
  { title: "Agent", live: true, body: "An AI receptionist built from your facts, tested by simulated callers." },
  { title: "Phone and SMS", live: false, body: "Answering real calls and texts on your number." },
];

export function OwnersClient() {
  const [name, setName] = useState("");
  const [city, setCity] = useState("Austin TX");
  const { start, submitting, error } = useStartScan();

  return (
    <PageShell width="narrow">
      <SectionHeader level={1} size="lg" title="Find your business" description="See the calls you miss, with cited proof and the math behind every estimate." />

      <Card padding="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void start({ name, city });
          }}
          className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
        >
          <Field
            label="Business name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={120}
            placeholder="Joe's Plumbing"
            autoComplete="organization"
          />
          <Field label="City" value={city} onChange={(e) => setCity(e.target.value)} required minLength={2} maxLength={80} />
          <Button type="submit" disabled={submitting} className="h-11">
            {submitting ? "Starting…" : "Scan"}
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-footnote text-danger">
            {error}
          </p>
        )}
        <p className="mt-4 text-caption text-subtle">
          Takes about a minute. Want a whole market?{" "}
          <Link href="/dashboard" className="font-medium text-accent hover:underline">
            Scan a category
          </Link>
        </p>
      </Card>

      <ol className="grid gap-3 sm:grid-cols-2">
        {flow.map((s, i) => (
          <Card key={s.title} as="li" padding="sm" tone="sunken" className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-surface text-footnote font-semibold text-muted ring-1 ring-inset ring-hairline">
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-headline">{s.title}</h2>
                <Badge tone={s.live ? "success" : "neutral"}>{s.live ? "Live" : "Next"}</Badge>
              </div>
              <p className="mt-0.5 text-footnote text-muted">{s.body}</p>
            </div>
          </Card>
        ))}
      </ol>
    </PageShell>
  );
}
