import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/ProsePage";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach Adam Pang, who builds and runs ringring.run.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <ProsePage eyebrow="Contact" title="Contact ringring.run">
      <p>
        ringring.run is run by Adam Pang in Austin, Texas. Business owners who want their business scanned, people with
        feedback on a diagnosis, and anyone asking about data or privacy can reach Adam directly by email or by booking a
        short call. Messages are read by a person, not answered by an AI.
      </p>
      <ul>
        <li>
          Email: <a href="mailto:adamtpang@gmail.com">adamtpang@gmail.com</a>
        </li>
        <li>
          Book a call: <a href="https://cal.com/adamtpang">cal.com/adamtpang</a>
        </li>
        <li>
          Personal site: <a href="https://adampang.com">adampang.com</a>
        </li>
      </ul>
      <p>
        Owners can also try ringring.run without writing in first: the <Link href="/owners">owners page</Link> scans a
        business by name, and the <Link href="/find">demo</Link> shows nearby businesses on a map. To ask for a business
        profile or saved interview answers to be removed, email the address above with the business name.
      </p>
    </ProsePage>
  );
}
