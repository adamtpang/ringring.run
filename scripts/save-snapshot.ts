// Saves a business's real report as the committed demo-safe snapshot.
// Usage: pnpm tsx scripts/save-snapshot.ts <businessId> <file> <match words...>
// Phone numbers are masked; nothing secret is in a report payload.
import { writeFileSync } from "node:fs";
import { loadReport } from "../src/lib/report";
import { getStore } from "../src/lib/store";

const PHONE = /\(?\b\d{3}\)?[ .-]?\d{3}[ .-]\d{4}\b/g;
const MASK = "[phone on Google listing]";

function scrub(v: unknown): unknown {
  if (typeof v === "string") return v.replace(PHONE, MASK);
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)]));
  return v;
}

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // env already set
  }
  const [id, file, ...match] = process.argv.slice(2);
  if (!id || !file || !match.length) throw new Error("usage: save-snapshot <businessId> <file> <match words...>");
  const report = await loadReport(getStore(), id);
  if (!report) throw new Error("business not found");
  const out = {
    saved_at: new Date().toISOString(),
    business_id: report.business.id,
    place_id: report.business.place_id,
    name: report.business.name,
    match: match.map((w) => w.toLowerCase()),
    report: scrub({ ...report, business: { ...report.business, phone: report.business.phone ? MASK : null } }),
  };
  writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
  console.log(`saved ${report.business.name} (${report.reviews.length} reviews, ${report.findings.length} findings) to ${file}`);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
