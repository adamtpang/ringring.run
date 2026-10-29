import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerPage } from "@/components/CustomerPage";
import { OwnerPreview } from "@/components/OwnerPreview";
import { caughtCount, parseLog, streak, xpFor, type FounderLog } from "@/lib/founder-log";
import { founderKeyOk } from "@/lib/founder-gate";
import { previewBySlug } from "@/lib/preview-pages";
import { FIT_RULE, NUDGE_RULE, WALK_PLACES, categoryNudge, fitOf, learnedScore, reviewUrl, walkBySlug } from "@/lib/walk";

describe("founder gate", () => {
  it("rejects a missing key and a mismatch", () => {
    expect(founderKeyOk(undefined, "secret")).toBe(false);
    expect(founderKeyOk("secret", undefined)).toBe(false);
    expect(founderKeyOk("nope", "secret")).toBe(false);
    expect(founderKeyOk("secret", "secret")).toBe(true);
  });
});

describe("walk fit and learning", () => {
  it("colors tiers from the Oct 28 rank", () => {
    expect(fitOf("S")).toBe("green");
    expect(fitOf("A")).toBe("amber");
    expect(fitOf("B")).toBe("red");
    expect(fitOf("C")).toBe("red");
    expect(WALK_PLACES.length).toBeGreaterThan(130);
    expect(WALK_PLACES.filter((p) => p.dSlug).map((p) => p.dSlug).sort()).toEqual(
      ["anas-mart", "antler-vc", "blindside-tattoo", "brazos-barbershop", "lees-tailor", "lone-star-souvenir", "lucky-lizard", "pleblab", "sapori", "shop-24", "small-victory", "wild-about-music"].sort(),
    );
  });

  it("nudges a category without changing the scraped score", () => {
    const rows = [
      { category: "Bar", outcome: "signed_up" },
      { category: "Bar", outcome: "said_no" },
      { category: "Cafe", outcome: "signed_up" },
    ];
    expect(categoryNudge("Bar", rows)).toBe(1);
    expect(categoryNudge("Cafe", rows)).toBe(2);
    expect(learnedScore(93.9, 1)).toBe(94.9);
    expect(learnedScore(null, 2)).toBeNull();
    expect(categoryNudge("Bar", Array.from({ length: 10 }, () => ({ category: "Bar", outcome: "signed_up" })))).toBe(6);
  });

  it("counts XP, caught businesses, and the streak", () => {
    const log: FounderLog = {
      visits: { a: "2026-10-28T12:00:00.000Z", b: "2026-10-29T12:00:00.000Z" },
      places: {
        a: { outcome: "pitched", note: "", angle: "replies", at: "2026-10-28T18:00:00.000Z" },
        b: { outcome: "signed_up", note: "left a card", angle: "stand", at: "2026-10-29T18:00:00.000Z" },
      },
    };
    expect(xpFor(log)).toBe(5 + 5 + 10 + 40);
    expect(caughtCount(log)).toBe(2);
    expect(streak(log, "2026-10-29")).toBe(2);
    expect(streak(log, "2026-10-31")).toBe(0);
    expect(parseLog({ places: { a: { outcome: "nope" } } })?.places.a).toBeUndefined();
  });
});

describe("owner and customer pages", () => {
  it("colors the owner page from the rag file", () => {
    const html = renderToStaticMarkup(createElement(OwnerPreview, { page: previewBySlug("small-victory")! }));
    expect(html).toContain("What you&#x27;re doing well");
    expect(html).toContain("What to improve");
    expect(html).toContain("Customer review link");
    expect(html).not.toMatch(/\u2014/);
  });

  it("sends customers straight to the Google review form", () => {
    const place = walkBySlug("small-victory")!;
    const html = renderToStaticMarkup(createElement(CustomerPage, { place }));
    expect(html).toContain(reviewUrl(place.placeId));
    expect(html).toContain("Love us?");
    expect(html).toContain("Write a Google review");
    expect(html).not.toMatch(/<form/i);
    expect(html).not.toMatch(/unhappy|private feedback|filter/i);
  });

  it("keeps the rules free of em dashes", () => {
    expect(FIT_RULE + NUDGE_RULE).not.toMatch(/\u2014/);
  });
});
