import { fail, json } from "@/lib/api";
import { getStore } from "@/lib/store";
import { withMoney } from "@/lib/business-money";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const runId = new URL(req.url).searchParams.get("runId") ?? undefined;
  try {
    const store = getStore();
    return json({ businesses: await withMoney(store, await store.listBusinesses({ runId, limit: 100 })) });
  } catch (e) {
    return fail(e);
  }
}
