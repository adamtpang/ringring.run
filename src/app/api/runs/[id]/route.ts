import { fail, json } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const store = getStore();
    const run = await store.getRun(id);
    if (!run) return json({ error: "Run not found" }, 404);
    const [steps, businesses, agents] = await Promise.all([
      store.listSteps(id),
      store.listBusinesses({ runId: id }),
      store.listAgents({ runId: id }).catch(() => []),
    ]);
    return json({ run, steps, businesses, agents: agents.map((a) => ({ id: a.id, business_id: a.business_id, status: a.status, ready_ms: a.ready_ms })) });
  } catch (e) {
    return fail(e);
  }
}
