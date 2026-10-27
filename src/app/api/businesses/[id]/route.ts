import { fail, json } from "@/lib/api";
import { loadReport } from "@/lib/report";
import { reportOrSnapshot } from "@/lib/snapshot";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const force = new URL(req.url).searchParams.get("snapshot") === "1";
  try {
    // getStore() runs inside load() so a misconfigured store also falls back.
    const r = await reportOrSnapshot(id, () => loadReport(getStore(), id), { force });
    if (r.kind === "not_found") return json({ error: "Business not found" }, 404);
    if (r.kind === "error") return json({ error: r.error }, 500);
    return json(r.report);
  } catch (e) {
    return fail(e);
  }
}
