import { fail, json } from "@/lib/api";
import { currentStates, optinRow, OptinRequestSchema } from "@/lib/channels";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Current channel preferences for a business, contacts masked. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const store = getStore();
    if (!(await store.getBusiness(id))) return json({ error: "Business not found" }, 404);
    return json({ channels: currentStates(await store.listChannelOptins(id)) });
  } catch (e) {
    return fail(e, 503);
  }
}

/** Save the owner's own choice. Stores the consent text and time; sends nothing. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = OptinRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
  let store;
  let name: string;
  try {
    store = getStore();
    const business = await store.getBusiness(id);
    if (!business) return json({ error: "Business not found" }, 404);
    name = business.name;
  } catch {
    return json({ error: "Saving is offline right now. Try again in a minute." }, 503);
  }
  try {
    const row = await store.addChannelOptin(optinRow(id, name, parsed.data, new Date().toISOString()));
    return json({ ok: true, saved: { channel: row.channel, status: row.status, consented_at: row.consented_at }, channels: currentStates(await store.listChannelOptins(id)) });
  } catch (e) {
    return fail(e, 503);
  }
}
