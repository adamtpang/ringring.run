import { fail, json } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const store = getStore();
    const run = await store.getRun(id);
    if (!run) return json({ error: "Run not found" }, 404);
    const [steps, businesses] = await Promise.all([store.listSteps(id), store.listBusinesses({ runId: id })]);
    return json({ run, steps, businesses });
  } catch (e) {
    return fail(e);
  }
}
