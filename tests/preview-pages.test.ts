import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { OwnerPreview } from "@/components/OwnerPreview";
import {
  CLAIM_LABEL,
  COMING_SOON,
  CONTACT_EMAIL,
  DRAFTS_LINE,
  PREVIEW_BANNER,
  PREVIEW_PAGES,
  PREVIEW_SLUGS,
  previewBySlug,
  sampleDraft,
  unansweredCount,
} from "@/lib/preview-pages";

const SLUGS = [
  "lees-tailor",
  "brazos-barbershop",
  "wild-about-music",
  "lucky-lizard",
  "sapori",
  "anas-mart",
  "antler-vc",
  "pleblab",
  "blindside-tattoo",
  "shop-24",
  "small-victory",
  "lone-star-souvenir",
];

const PLACE_IDS: Record<string, string> = {
  "lees-tailor": "ChIJj3oyW6e1RIYRi2l6b46OTME",
  "brazos-barbershop": "ChIJGy_IiCi1RIYR1yu7GQiwJ50",
  "wild-about-music": "ChIJb-aJ0Qm1RIYRlaPGsEQ2FBk",
  "lucky-lizard": "ChIJpduvU6a1RIYR7OsAQa0VsJk",
  sapori: "ChIJp7tO_dy1RIYRW9_xLOG_ehs",
  "anas-mart": "ChIJCUKHRae1RIYRnZkmnukUCY0",
  "antler-vc": "ChIJN0jxIgC1RIYR_Z1uL-sbR44",
  pleblab: "ChIJjY-oGla1RIYRPtgk7Fl4TPo",
  "blindside-tattoo": "ChIJ877Bgqe1RIYRrAUoBg8zMpg",
  "shop-24": "ChIJJRkLgqe1RIYRQvbDSMn4kok",
  "small-victory": "ChIJKakp4Am1RIYRB-4OSSKKrPo",
  "lone-star-souvenir": "ChIJr3szW6a1RIYRkM7LRpnBIO0",
};

const PEER_SLUGS = ["wild-about-music", "lucky-lizard", "anas-mart", "shop-24", "small-victory", "lone-star-souvenir"];

describe("preview page data", () => {
  it("has the 12 slugs and the place ids from the scrape", () => {
    expect(PREVIEW_SLUGS).toEqual(SLUGS);
    expect(previewBySlug("nope")).toBeUndefined();
    for (const slug of SLUGS) {
      const page = previewBySlug(slug);
      expect(page?.placeId).toBe(PLACE_IDS[slug]);
    }
  });

  it("prints ages in the required form and drops the Brazos year count", () => {
    const age = (slug: string) => previewBySlug(slug)!.ageLine;
    expect(age("lees-tailor")).toBe("unclear");
    expect(age("brazos-barbershop")).toBe("unclear");
    expect(age("lucky-lizard")).toBe("unclear");
    expect(age("antler-vc")).toBe("unclear");
    expect(age("blindside-tattoo")).toBe("Est. 2005");
    expect(age("pleblab")).toBe("Since 2021");
    for (const slug of ["wild-about-music", "sapori", "anas-mart", "shop-24", "small-victory", "lone-star-souvenir"]) {
      expect(age(slug)).toMatch(/^On Texas record since [A-Z][a-z]{2} \d{4}$/);
      expect(age(slug)).not.toMatch(/yrs/);
    }
    expect(JSON.stringify(PREVIEW_PAGES)).not.toMatch(/\d+ yrs/);
  });

  it("shows a peer table only for the six businesses with enough peers", () => {
    for (const page of PREVIEW_PAGES) {
      if (PEER_SLUGS.includes(page.slug)) {
        expect(page.peers?.rows.length).toBeGreaterThanOrEqual(4);
        expect(page.peers?.rows.some((r) => r.you)).toBe(true);
        expect(page.peers?.rows.filter((r) => !r.you).every((r) => r.reviews >= 10)).toBe(true);
      } else {
        expect(page.peers).toBeNull();
      }
    }
    const sv = previewBySlug("small-victory")!;
    expect(sv.peers?.rows.map((r) => r.name)).toEqual([
      "Bar Grotta",
      "Upstairs at Caroline",
      "Small Victory",
      "Sans Bar",
      "The Rustic Tap",
      "Star Bar",
    ]);
  });

  it("keeps Small Victory on the scraped figures", () => {
    const sv = previewBySlug("small-victory")!;
    expect(sv.rating).toBe(4.7);
    expect(sv.reviewCount).toBe(507);
    expect(sv.non5Total).toBe(98);
    expect(sv.tickets).toHaveLength(10);
    expect(unansweredCount(sv)).toBe(10);
    expect(sv.recency).toMatchObject({ newest: "2026-10-24", n90: 12, complete90: true, sun: "Oct 24, 2026 (2★)" });
    expect(sv.tickets[0]?.text.startsWith("Worst cocktails")).toBe(true);
    expect(sv.phone).toBe("(512) 666-8718");
    expect(sv.wednesdayHours).toBe("5 PM to 1 AM");
    expect(sv.distribution && sv.distribution.one + sv.distribution.two + sv.distribution.three + sv.distribution.four + sv.distribution.five).toBe(507);
  });

  it("leaves Antler and PlebLab without invented reviews", () => {
    const antler = previewBySlug("antler-vc")!;
    expect(antler.reviewCount).toBe(2);
    expect(antler.tickets).toEqual([]);
    expect(antler.recency).toBeNull();
    expect(antler.distribution).toBeNull();
    expect(antler.phone).toBeNull();
    expect(antler.website).toBeNull();
    const pleb = previewBySlug("pleblab")!;
    expect(pleb.reviewCount).toBe(7);
    expect(pleb.tickets).toEqual([]);
    expect(pleb.rating).toBe(5);
    expect(pleb.website).toBe("https://pleblab.dev/");
  });

  it("uses one generic sample draft and does not call it AI", () => {
    const draft = sampleDraft("Small Victory", "(512) 666-8718");
    expect(draft).toContain("(512) 666-8718");
    expect(draft).toContain("We're sorry your experience fell short.");
    expect(draft).not.toMatch(/AI|office|manager|work did not meet|drink quality/i);
    expect(sampleDraft("Antler VC", null)).not.toMatch(/call us at/);
  });
});

describe("preview page html", () => {
  it("renders the required lines and disables claim", () => {
    const html = renderToStaticMarkup(createElement(OwnerPreview, { page: previewBySlug("small-victory")! }));
    expect(html).toContain(PREVIEW_BANNER);
    expect(html).toContain(DRAFTS_LINE);
    expect(html).toContain(CONTACT_EMAIL);
    expect(html).toContain(CLAIM_LABEL);
    expect(html).toContain(COMING_SOON);
    expect(html).toContain("Sample draft");
    expect(html).toContain("disabled");
    expect(html).not.toMatch(/<form/i);
    expect(html).not.toMatch(/\bSMS\b|WhatsApp|24\/7/);
    expect(html).toContain("#3 of 6");
    expect(html).toContain("On Texas record since Nov 2015");
  });

  it("omits the peer panel and prints unclear for Lee's", () => {
    const html = renderToStaticMarkup(createElement(OwnerPreview, { page: previewBySlug("lees-tailor")! }));
    expect(html).not.toContain("How you rank nearby");
    expect(html).toContain("unclear");
    expect(html).toContain("Not listed");
    expect(html).toContain("Quite rude.");
  });

  it("sets noindex on /d responses", async () => {
    const rules = await nextConfig.headers?.();
    const hit = rules?.find((rule) => rule.source === "/d/:slug");
    expect(hit?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
  });
});
