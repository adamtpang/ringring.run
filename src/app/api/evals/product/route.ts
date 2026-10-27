import { json } from "@/lib/api";
import { productEvals } from "@/lib/evals/product-source";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** GET /api/evals/product: rule checks run on real saved reports (snapshot when the store is down). */
export async function GET() {
  return json(await productEvals(async () => getStore()));
}
