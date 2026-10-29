import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WalkReport } from "@/components/WalkReport";
import { WALK_PLACES, walkByPlaceId } from "@/lib/walk";

const robots: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
};

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return WALK_PLACES.filter((p) => !p.dSlug).map((p) => ({ placeId: p.placeId }));
}

export async function generateMetadata({ params }: { params: Promise<{ placeId: string }> }): Promise<Metadata> {
  const { placeId } = await params;
  const place = walkByPlaceId(placeId);
  if (!place || place.dSlug) return { title: "Not found", robots };
  return { title: place.name, description: `Public Google data for ${place.name}, pulled Oct 28, 2026.`, robots };
}

export default async function Page({ params }: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await params;
  const place = walkByPlaceId(placeId);
  if (!place || place.dSlug) notFound();
  return <WalkReport place={place} />;
}
