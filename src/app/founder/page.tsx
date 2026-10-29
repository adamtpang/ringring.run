import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { FOUNDER_COOKIE, founderKeyOk } from "@/lib/founder-gate";
import { FounderClient } from "./FounderClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Founder walk",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default async function FounderPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const sp = await searchParams;
  const jar = await cookies();
  const presented = sp.key || jar.get(FOUNDER_COOKIE)?.value;
  if (!founderKeyOk(presented)) notFound();
  return <FounderClient />;
}
