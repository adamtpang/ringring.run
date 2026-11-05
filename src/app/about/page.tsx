import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/ProsePage";

export const metadata: Metadata = {
  title: "About",
  description: "Who builds ringring.run, what it does today, and what is not live yet.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <ProsePage eyebrow="About" title="About ringring.run">
      <p>
        ringring.run is a consigliere for boring local businesses: HVAC companies, plumbers, cafes, salons, dentists and
        music shops. The product reads what the public already says about a business, shows the owner where customers are
        being lost with real review quotes as proof, ranks the business against anonymized local peers, and hands over a
        short game plan that says plainly who does each step.
      </p>
      <h2>Who runs it</h2>
      <p>
        ringring.run is built and operated by <a href="https://adampang.com">Adam Pang</a>, a software engineer in Austin,
        Texas. The project started at the AITX x MLOps World hackathon in Austin (Antler agents track) in October 2026, and
        the codebase was written from scratch for that event. Questions and feedback go to the{" "}
        <Link href="/contact">contact page</Link>.
      </p>
      <h2>Ringy talks, Rungy runs</h2>
      <p>
        Rungy is the background worker in ringring.run. Rungy scans the Google Maps listing, reviews and website of a
        business, diagnoses problems, benchmarks the business against peers, and builds a cited phone-agent configuration.
        Ringy is the assistant the owner talks to: today that means a short owner interview in the browser, by voice or by
        typing.
      </p>
      <h2>What is live and what is not</h2>
      <ul>
        <li>
          Live: scanning a business from Google Maps, a cited diagnosis, anonymized peer ranking, an editable ROI
          calculator, a 30-day game plan, a printable 1-pager, and the browser owner interview.
        </li>
        <li>
          Not live: phone calls, SMS, calendar booking, payments and any outreach. Nothing in ringring.run answers or places
          a phone call today.
        </li>
        <li>Pricing on the home page is illustrative. Nothing is on sale yet.</li>
      </ul>
      <h2>How ringring.run stays honest</h2>
      <p>
        Every finding in a ringring.run diagnosis quotes a review, a listing field or a line from the business website, and
        a code check drops any quote that cannot be found word for word in the source. Every dollar or percent figure comes
        from data on file or is labeled as an estimate with its math visible. AI agents say they are an AI, and
        ringring.run never contacts a business: the owner starts every conversation.
      </p>
    </ProsePage>
  );
}
