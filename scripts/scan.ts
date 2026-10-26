// CLI:
//   pnpm scan "plumbers" "Austin TX" 10              category + city
//   pnpm scan --name "Joe's Plumbing, Austin TX"      one business by name
//   pnpm scan --name "Joe's Plumbing" "Austin TX"
// Loads .env.local if present (values are never printed). Without keys it runs
// in demo mode on fictional fixture data and the local JSON store.

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: demo mode
}

async function main() {
  const { ScanInputSchema } = await import("../src/lib/schema");
  const { defaultDeps, createRun, executeRun } = await import("../src/lib/pipeline");
  const { isDemo } = await import("../src/lib/env");

  const args = process.argv.slice(2).filter((a) => a !== "--");
  const byName = args[0] === "--name";
  const parsed = byName
    ? ScanInputSchema.safeParse({ name: args[1], city: args[2] })
    : ScanInputSchema.safeParse({ category: args[0], city: args[1], maxCount: Number(args[2] ?? 10) });
  if (!parsed.success) {
    console.error('Usage: pnpm scan "<category>" "<city>" [maxCount 1-50]');
    console.error('       pnpm scan --name "<business name>, <city>"');
    console.error(parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
    process.exit(1);
  }

  const deps = defaultDeps();
  const m = deps.mode;
  console.log(
    parsed.data.kind === "name"
      ? `ringring.run lookup: "${parsed.data.category}" in ${parsed.data.city}`
      : `ringring.run scan: "${parsed.data.category}" in ${parsed.data.city}, max ${parsed.data.maxCount}`,
  );
  console.log(
    `mode: scraper=${m.scraper} diagnoser=${m.diagnoser}${m.llm_model ? ` (${m.llm_model})` : ""} store=${m.store}` +
      (isDemo(m) ? "  [DEMO DATA: fictional fixtures or stub components in use]" : ""),
  );

  const run = await createRun(parsed.data, deps);
  console.log(`run ${run.id}`);
  const t0 = Date.now();
  const summary = await executeRun(run.id, { ...deps, log: (l) => console.log(l) });

  const ranked = await deps.store.listBusinesses({ runId: run.id });
  console.log("\nRanked by estimated monthly value (estimates from editable assumptions):");
  ranked.forEach((b, i) => {
    const status = b.diagnosis_status === "failed" ? "FAILED" : `$${b.est_monthly_value.toLocaleString("en-US")}/mo`;
    console.log(`  ${String(i + 1).padStart(2)}. ${b.name.padEnd(34)} score ${String(b.opportunity_score).padStart(3)}  ${status}`);
  });
  console.log(
    `\n${summary.status}: ${summary.businessCount} businesses, ${summary.diagnosedCount} diagnosed, ` +
      `${summary.failedCount} failed, ${summary.findingCount} findings kept, ${summary.droppedFindings} dropped by citation check ` +
      `(${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
  if (summary.status === "failed") process.exit(2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
