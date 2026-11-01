import type { MetadataRoute } from "next";

const BASE = "https://ringring.run";

// Public, indexable pages only. Business pages and owner previews are not listed.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/owners`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/find`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/design`, changeFrequency: "monthly", priority: 0.2 },
  ];
}
