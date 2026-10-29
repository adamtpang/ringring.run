import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OwnerPreview } from "@/components/OwnerPreview";
import { PREVIEW_SLUGS, previewBySlug } from "@/lib/preview-pages";

const robots: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
};

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return PREVIEW_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = previewBySlug(slug);
  if (!page) return { title: "Not found", robots };
  return {
    title: page.name,
    description: `Public Google data for ${page.name}, pulled Oct 28, 2026.`,
    robots,
  };
}

export default async function PreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = previewBySlug(slug);
  if (!page) notFound();
  return <OwnerPreview page={page} />;
}
