import type { Metadata } from "next";
import { FindClient } from "./FindClient";

export const metadata: Metadata = { title: "Find a business", alternates: { canonical: "/find" } };

export default function FindPage() {
  return <FindClient />;
}
