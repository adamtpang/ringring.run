import { fail, json } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const store = getStore();
    const business = await store.getBusiness(id);
    if (!business) return json({ error: "Business not found" }, 404);
    const [reviews, findings, roi, steps, run, pages, knowledge] = await Promise.all([
      store.listReviews(id),
      store.listFindings(id),
      store.listRoi(id),
      store.listSteps(business.run_id, id),
      store.getRun(business.run_id),
      store.listWebPages(id),
      store.listKnowledgeFacts(id),
    ]);
    // Page text can be long; the report shows a preview, the full text stays in the store.
    const pageSummaries = pages.map(({ text, ...p }) => ({ ...p, chars: text.length, preview: text.slice(0, 600) }));
    return json({ business, run, reviews, findings, roi, steps, pages: pageSummaries, knowledge });
  } catch (e) {
    return fail(e);
  }
}
