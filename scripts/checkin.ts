// Manual weekly check-in (the demo path). Respects the same monthly cap as the cron.
//   pnpm checkin                          all opted-in businesses (same as the cron)
//   pnpm checkin --business <id>          one business, tracked or not
//   pnpm checkin --business <id> --light-only   rating and count only, never fetch reviews
//   pnpm checkin --track <id> | --untrack <id>  owner opt-in flag (no scan)
//   pnpm checkin --status                 this month's spend and recent check-ins
// Loads .env.local if present (values are never printed).

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: demo mode
}

async function main() {
  const { getStore } = await import("../src/lib/store");
  const { runCheckins } = await import("../src/lib/checkin/run");
  const { businessTarget, pickChecker, pickClassifier, trackedTargets } = await import("../src/lib/checkin/targets");
  const { ctMonthStart, monthSpend, monthlyBudget, nextCheckinDate } = await import("../src/lib/checkin/logic");

  const args = process.argv.slice(2).filter((a) => a !== "--");
  const flag = (n: string) => args.includes(n);
  const val = (n: string) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const store = getStore();
  const now = new Date();
  const ct = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" }) + " CT";

  for (const f of ["--track", "--untrack"]) {
    const id = val(f);
    if (!id) continue;
    const b = await store.getBusiness(id);
    if (!b) throw new Error(`No business ${id}`);
    const on = f === "--track";
    const prev = await store.getTracked(b.place_id);
    await store.upsertTracked({ place_id: b.place_id, business_id: b.id, tracked: on, opted_in_at: on ? (prev?.opted_in_at ?? now.toISOString()) : null, note: prev?.note ?? null });
    console.log(`${b.name}: tracked=${on}${on ? `. Next scheduled check-in ${ct(nextCheckinDate(now))}.` : ""}`);
    return;
  }

  if (flag("--status")) {
    const cs = await store.listCheckins({ since: ctMonthStart(now).toISOString() });
    console.log(`This month: $${monthSpend(cs, now).toFixed(4)} of $${monthlyBudget().toFixed(2)} cap, ${cs.length} check-ins logged.`);
    for (const c of cs.slice(0, 15)) console.log(`  ${c.started_at}  ${c.kind.padEnd(11)} ${c.status.padEnd(14)} est $${c.est_cost_usd.toFixed(4)} actual ${c.actual_cost_usd == null ? "n/a" : `$${c.actual_cost_usd.toFixed(4)}`}  ${c.message ?? ""}`);
    return;
  }

  const id = val("--business");
  let targets;
  if (id) {
    const t = await businessTarget(store, id);
    if (!t) throw new Error(`No business ${id}`);
    const tr = await store.getTracked(t.business.place_id);
    if (!tr?.tracked) console.log(`Note: ${t.business.name} has not opted in (tracked=false); the weekly cron skips it. Running once by hand.`);
    targets = [t];
  } else {
    const r = await trackedTargets(store);
    if (r.missing.length) console.log(`Tracked places with no scanned business: ${r.missing.length}`);
    targets = r.targets;
  }
  if (targets.length === 0) {
    console.log("No opted-in businesses. Use --track <id> or --business <id>.");
    return;
  }

  const log = (m: string) => console.log(`  ${m}`);
  const checker = pickChecker(targets, log);
  const lightOnly = flag("--light-only");
  console.log(`check-in: ${targets.length} business(es), checker=${checker.mode}${lightOnly ? ", light only" : ""}, cap $${monthlyBudget().toFixed(2)}/month`);
  const s = await runCheckins({ store, checker, classifier: pickClassifier(), trigger: "manual", targets, lightOnly, log });
  console.log(`spent this month: $${s.spentBefore.toFixed(5)} before, $${s.spentAfter.toFixed(5)} after (cap $${s.cap.toFixed(2)})`);
  for (const o of s.outcomes) console.log(`  ${o.name}: ${o.kind} ${o.status}, est $${o.estCostUsd.toFixed(5)}, actual ${o.actualCostUsd == null ? "n/a" : `$${o.actualCostUsd.toFixed(5)}`}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});

export {};
