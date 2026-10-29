import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerPage } from "@/components/CustomerPage";
import { WALK_PLACES, walkBySlug } from "@/lib/walk";

const robots: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
};

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return WALK_PLACES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const place = walkBySlug(slug);
  if (!place) return { title: "Not found", robots };
  return { title: place.name, description: `Write a Google review for ${place.name}.`, robots };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const place = walkBySlug(slug);
  if (!place) notFound();
  return <CustomerPage place={place} />;
}
