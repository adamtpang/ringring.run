import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/ProsePage";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What ringring.run collects, why, and which services process it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <ProsePage eyebrow="Privacy" title="Privacy policy">
      <p>
        This privacy policy describes what ringring.run, operated by Adam Pang, actually collects and which outside services
        process it. Last updated November 1, 2026. ringring.run runs no advertising, sells no data, and loads no analytics or
        tracking scripts.
      </p>
      <h2>Public business data</h2>
      <p>
        ringring.run scans public information about businesses: the Google Maps listing (name, address, hours, phone,
        rating), public reviews, and the public business website. Scans run through Apify, which fetches the Google Maps
        listing. Scraped listings, reviews and diagnoses are stored in a Supabase Postgres database. Reviewer names may
        appear in stored reviews because they are part of the public review.
      </p>
      <h2>What owners give us</h2>
      <ul>
        <li>
          Owner interview answers, typed or spoken, saved to the business profile only after the owner reviews them and
          presses Save.
        </li>
        <li>
          Channel choices on Talk to Ringy: the channel, the email or phone number the owner typed, the exact consent text and
          the time. Email, phone, SMS and WhatsApp are a waitlist; nothing is sent on them.
        </li>
        <li>Questions typed into the customer chat and the search box on the demo, which are answered and not saved.</li>
      </ul>
      <h2>Services that process data</h2>
      <ul>
        <li>Vercel hosts the site and keeps standard request logs (such as IP address and user agent).</li>
        <li>
          Supabase stores businesses, reviews, diagnoses, interview answers and channel choices. The browser never talks to
          Supabase directly.
        </li>
        <li>Apify scrapes Google Maps listings and reviews for scans.</li>
        <li>xAI (Grok) writes diagnoses from the scraped data and answers the customer chat and search box.</li>
        <li>
          ElevenLabs runs the browser voice interview. Microphone audio goes from the browser to ElevenLabs, and the
          transcript is read back to save answers.
        </li>
        <li>
          OpenStreetMap serves map tiles to the browser on the map pages, and its Nominatim and Overpass services (through
          public mirrors) turn a typed place or a location into nearby businesses.
        </li>
      </ul>
      <h2>Location, cookies and browser storage</h2>
      <p>
        The demo map asks the browser for a location only when a visitor presses the button to use it. The location is sent
        to ringring.run to find nearby businesses and is not saved. ringring.run sets no tracking cookies. The browser keeps
        the chosen mode (customers or owners) in local storage, and one private founder page uses a single access cookie.
      </p>
      <h2>Your choices</h2>
      <p>
        Owners can withdraw a channel choice at any time from the Talk to Ringy section of their diagnosis page. To remove a
        business profile, interview answers or a channel choice, or to ask what ringring.run holds, email{" "}
        <a href="mailto:adamtpang@gmail.com">adamtpang@gmail.com</a>. More ways to reach us are on the{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </ProsePage>
  );
}
