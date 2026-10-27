// Re-check every case study: the URL answers and the exact quote is on the page.
// Network only; not part of `pnpm test`. Some publishers block scripted fetches (403); check those by hand.
import { readFileSync } from "node:fs";
const { studies } = JSON.parse(readFileSync(new URL("../src/data/case-studies.json", import.meta.url), "utf8"));
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const norm = (s) => s.replace(/&nbsp;|\u00a0/g, " ").replace(/&#8217;|&rsquo;/g, "’").replace(/\s+/g, " ");
let bad = 0;
for (const s of studies) {
  try {
    const r = await fetch(s.url, { headers: { "user-agent": UA }, redirect: "follow" });
    const html = norm(await r.text());
    const found = html.includes(norm(s.quote));
    const status = r.status === 403 ? "BLOCKED (check by hand)" : !r.ok ? "FAIL" : found ? "OK" : "QUOTE NOT FOUND";
    if (status === "FAIL" || status === "QUOTE NOT FOUND") bad++;
    console.log(`${status.padEnd(24)} ${r.status} ${s.id} ${s.url}`);
  } catch (e) {
    bad++;
    console.log(`ERROR ${s.id} ${e.message}`);
  }
}
process.exit(bad ? 1 : 0);
