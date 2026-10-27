import { fail, json } from "@/lib/api";
import { answersToFacts, latestAnswers, SaveAnswersSchema } from "@/lib/interview";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Save the owner's interview answers to the business profile (owner-sourced knowledge facts). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = SaveAnswersSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid answers" }, 400);
  let store;
  try {
    store = getStore();
    const business = await store.getBusiness(id);
    if (!business) return json({ error: "Business not found" }, 404);
  } catch {
    return json({ error: "Saving is offline right now. Your answers are still on this screen; try again in a minute." }, 503);
  }
  try {
    await store.insertKnowledgeFacts(answersToFacts(id, parsed.data));
    const answers = latestAnswers(await store.listKnowledgeFacts(id));
    return json({ ok: true, answers });
  } catch (e) {
    return fail(e, 503);
  }
}
