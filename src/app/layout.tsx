import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "ringring.run | AI that picks up every call";
const description =
  "ringring.run is an AI voice agent for small businesses. It picks up every call and finds where AI saves the business money, with evidence and ROI math you can check.";

export const metadata: Metadata = {
  metadataBase: new URL("https://ringring.run"),
  title,
  description,
  applicationName: "ringring.run",
  openGraph: {
    title,
    description,
    siteName: "ringring.run",
    type: "website",
    url: "/",
  },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = {
  themeColor: "#fbfbfd",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
