import type { MetadataRoute } from "next";

// Preview pages (/d, /c, /w) and /founder stay crawlable so crawlers can read
// their X-Robots-Tag noindex header; only the JSON API is kept out.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: "https://ringring.run/sitemap.xml",
    host: "https://ringring.run",
  };
}
