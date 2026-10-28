import { fail, json } from "@/lib/api";
import { CARELESS_FIRST_MESSAGE, carelessResponder, fixtureAgent, fixtureResponder, llmResponder, runEvals, voiceResponder } from "@/lib/evals";
import { getStore } from "@/lib/store";
import type { AgentRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/evals?businessId=...&responder=fixture|llm|careless
 * Runs the simulated caller cases against a stored agent. Without businessId it
 * uses the latest stored agent, then falls back to an in-memory demo agent.
 * "careless" is a deliberately bad agent (red team) that shows the grader at work.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get("businessId");
  const which = url.searchParams.get("responder") ?? "fixture";
  try {
    const llm = llmResponder();
    const responders = [fixtureResponder, llm, carelessResponder, voiceResponder].map((r) => ({ id: r.id, name: r.name, ...r.status() }));
    const responder = which === "llm" ? llm : which === "careless" ? carelessResponder : fixtureResponder;
    const st = responder.status();
    if (!st.available) return json({ error: st.reason, responders }, 409);

    const store = getStore();
    let agent: AgentRecord | null = null;
    let source: "stored" | "fixture" = "stored";
    if (businessId) {
      agent = await store.getAgentForBusiness(businessId).catch(() => null);
      if (!agent) return json({ error: "No agent for this business yet", responders }, 404);
    } else {
      agent = (await store.listAgents({ limit: 1 }).catch(() => []))[0] ?? null;
    }
    if (!agent) {
      agent = await fixtureAgent();
      source = "fixture";
    }
    const business = source === "stored" ? await store.getBusiness(agent.business_id).catch(() => null) : null;
    const config = responder.id === "careless" ? { ...agent.config, first_message: CARELESS_FIRST_MESSAGE } : agent.config;
    const report = await runEvals(config, responder, { agentId: agent.id });
    return json({
      report,
      source,
      is_fixture: source === "fixture" || Boolean(business?.is_fixture),
      responders,
    });
  } catch (e) {
    return fail(e);
  }
}
