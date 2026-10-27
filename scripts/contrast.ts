/** Prints WCAG contrast for every palette text pairing in src/app/tokens.css. Exits 1 if any fails. */
import { readFileSync } from "node:fs";
import { contrast, darkPairs, lightPairs } from "../src/lib/contrast";

const css = readFileSync(new URL("../src/app/tokens.css", import.meta.url), "utf8");
let bad = 0;
for (const p of [...lightPairs(css), ...darkPairs(css)]) {
  const r = contrast(p.fg, p.bg);
  const ok = r >= p.min;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(5)}:1  (min ${p.min})  ${p.label}`);
}
process.exit(bad ? 1 : 0);
