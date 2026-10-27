/**
 * pnpm eval [--responder fixture|llm] [--name "Example Plumbing Co"] [--city "Austin TX"] [--json]
 *
 * Builds the demo business's phone agent in memory (fixture data, no network)
 * and runs the simulated caller cases against it. Exits 1 if any case fails.
 * The llm responder needs XAI_API_KEY or LLM_API_KEY; the agent config is
 * still built from fixtures.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: fixture responder only
}

import { llmConfig } from "../src/lib/env";
import { fixtureAgent, fixtureResponder, llmResponder, runEvals } from "../src/lib/evals";
import { snapshotEvals } from "../src/lib/evals/product-source";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main() {
  const which = arg("responder", "fixture");
  const responder = which === "llm" ? llmResponder() : fixtureResponder;
  const st = responder.status();
  if (!st.available) {
    console.error(`Responder "${which}" is not available: ${st.reason}`);
    process.exit(2);
  }
  const agent = await fixtureAgent(arg("name", "Example Plumbing Co"), arg("city", "Austin TX"));
  const r = await runEvals(agent.config, responder, { agentId: agent.id });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`Simulated calls: ${r.business_name}, ${r.responder.name} responder${which === "llm" ? ` (${llmConfig().chatModel})` : ""}, ${agent.config.knowledge.length} KB facts (demo data)\n`);
    for (const c of r.cases) {
      const mark = c.status === "pass" ? "PASS" : c.status === "fail" ? "FAIL" : "SKIP";
      console.log(`${mark}  ${c.title.padEnd(18)} ${c.status === "skipped" ? c.skip_reason : `${c.latency_ms.max.toFixed(1)} ms`}`);
      for (const x of c.checks) if (!x.pass) console.log(`      ${x.name}: ${x.detail}`);
    }
    console.log(`\n${r.passed}/${r.passed + r.failed} passed (${Math.round(r.pass_rate * 100)}%), ${r.skipped} skipped`);
  }
  // Rule checks on the committed real-report snapshot (deterministic, no network).
  const p = snapshotEvals();
  if (!process.argv.includes("--json")) {
    console.log(`\nChecks on real reports: ${p.source.label}\n`);
    for (const c of p.checks) {
      console.log(`${c.fail ? "FAIL" : "PASS"}  ${c.title.padEnd(34)} ${c.pass} pass, ${c.fail} fail${c.skipped ? `, ${c.skipped} n/a` : ""}`);
      for (const f of c.failures) console.log(`      ${f.business}: ${f.detail}`);
    }
    console.log(`\n${p.checks.filter((c) => !c.fail).length}/${p.checks.length} rule checks passed`);
  }
  process.exit(r.failed || p.total.fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
