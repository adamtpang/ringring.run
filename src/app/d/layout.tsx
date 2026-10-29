import type { Metadata } from "next";

/** Every /d page is a handout preview. Keep it out of search. */
export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
