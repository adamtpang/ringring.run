import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast, darkPairs, lightPairs, readPalette } from "@/lib/contrast";

const css = readFileSync(new URL("../src/app/tokens.css", import.meta.url), "utf8");

describe("palette contrast (WCAG AA)", () => {
  it("keeps the five coolors hues", () => {
    const p = readPalette(css);
    expect([p.ringy, p.rungy, p.coral, p.yellow, p.lime].map((h) => h?.toLowerCase())).toEqual(["#60d394", "#ff9b85", "#ee6055", "#ffd97d", "#aaf683"]);
  });
  it("raw hues are fills, not text on white", () => {
    for (const h of ["#60d394", "#ff9b85", "#ffd97d", "#aaf683"]) expect(contrast(h, "#ffffff")).toBeLessThan(4.5);
  });
  for (const p of [...lightPairs(css), ...darkPairs(css)]) {
    it(p.label, () => expect(contrast(p.fg, p.bg)).toBeGreaterThanOrEqual(p.min));
  }
});
