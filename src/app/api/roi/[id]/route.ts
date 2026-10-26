import { fail, json } from "@/lib/api";
import { recomputeBusinessTotals } from "@/lib/pipeline";
import { applyEdits, computeMonthlyValue, defaultAssumptions, formulaFor, InvalidAssumptionError } from "@/lib/roi";
import { RoiEditSchema } from "@/lib/schema";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// Edit ROI assumptions for one finding. Body: { assumptions: { key: value } }
// or { assumptions: {}, reset: true } to restore defaults. Recomputes the
// estimate and the business totals.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const parsed = RoiEditSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid edit", issues: parsed.error.issues.map((i) => i.message) }, 400);

  try {
    const store = getStore();
    const roi = await store.getRoi(id);
    if (!roi) return json({ error: "ROI estimate not found" }, 404);

    let assumptions;
    if (parsed.data.reset) {
      const business = await store.getBusiness(roi.business_id);
      const finding = (await store.listFindings(roi.business_id)).find((f) => f.id === roi.finding_id);
      const run = business ? await store.getRun(business.run_id) : null;
      if (!business || !finding) return json({ error: "Finding not found" }, 404);
      assumptions = defaultAssumptions(finding.kind, { ...business, searchCategory: run?.search_kind === "category" ? run.category : undefined });
    } else {
      assumptions = applyEdits(roi.assumptions, parsed.data.assumptions);
    }
    const monthly_value = computeMonthlyValue(assumptions);
    await store.updateRoi(id, {
      assumptions,
      monthly_value,
      formula: formulaFor(assumptions),
      is_edited: !parsed.data.reset,
    });
    const total = await recomputeBusinessTotals(store, roi.business_id);
    return json({ roi: await store.getRoi(id), business_total: total });
  } catch (e) {
    if (e instanceof InvalidAssumptionError) return json({ error: e.message }, 400);
    return fail(e);
  }
}
