import type { Metadata } from "next";
import { OwnersClient } from "./OwnersClient";

export const metadata: Metadata = { title: "For owners", alternates: { canonical: "/owners" } };

export default function OwnersPage() {
  return <OwnersClient />;
}
