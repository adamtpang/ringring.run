import { fail, json } from "@/lib/api";
import { elevenLabsProvider } from "@/lib/agent/providers";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// Deploy the stored agent config to the voice provider. Without voice keys
// this is a no-op that returns status "not_configured" and sends nothing.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const store = getStore();
    const agent = await store.getAgentForBusiness(id);
    if (!agent) return json({ error: "No agent has been built for this business yet" }, 404);
    const provider = elevenLabsProvider;
    const status = provider.status();
    if (!status.configured) {
      return json({ ok: false, status: "not_configured", message: status.reason, missing: status.missing }, 409);
    }
    const r = await provider.deploy(agent.config);
    await store.updateAgent(agent.id, {
      status: r.ok ? "deployed" : "deploy_failed",
      provider: provider.id,
      external_agent_id: r.ok ? r.external_agent_id : agent.external_agent_id,
      deploy_message: r.message,
    });
    return json(r, r.ok ? 200 : 502);
  } catch (e) {
    return fail(e);
  }
}
