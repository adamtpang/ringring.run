import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

// Inter for UI (optical size axis, tabular figures). Geist Mono for timings and IDs.
// next/font self-hosts both at build time and sizes fallbacks to avoid layout shift.
const inter = Inter({ subsets: ["latin"], axes: ["opsz"], display: "swap", variable: "--font-inter" });
const mono = Geist_Mono({ subsets: ["latin"], display: "swap", variable: "--font-geist-mono" });

const title = "ringring.run | Every missed call, found and priced";
const description =
  "AI voice agent for small businesses. Scans a business on Google Maps, cites the evidence, and prices what missed calls cost.";

export const metadata: Metadata = {
  metadataBase: new URL("https://ringring.run"),
  title: { default: title, template: "%s | ringring.run" },
  description,
  applicationName: "ringring.run",
  openGraph: { title, description, siteName: "ringring.run", type: "website", url: "/" },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
