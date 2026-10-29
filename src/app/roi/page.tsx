import type { Metadata } from "next";
import { previewBySlug, unansweredCount } from "@/lib/preview-pages";
import { prefillFromCategories, type ScanPrefill } from "@/lib/starter-roi";
import { RoiDemo } from "./RoiDemo";

export const metadata: Metadata = {
  title: "Time and money",
  description: "Estimate of revenue recovered and owner hours back if the starter pack does the work. Assumptions are labeled.",
};

export default async function RoiPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const { slug } = await searchParams;
  const page = slug ? previewBySlug(slug) : undefined;
  const scan: ScanPrefill | null = page
    ? prefillFromCategories(page.categories, page.reviewCount, page.sample ? unansweredCount(page) : null, page.sample?.read ?? null, page.slug, page.name)
    : null;
  return <RoiDemo scan={scan} />;
}
