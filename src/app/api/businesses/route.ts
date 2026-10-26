import { fail, json } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const runId = new URL(req.url).searchParams.get("runId") ?? undefined;
  try {
    return json({ businesses: await getStore().listBusinesses({ runId, limit: 100 }) });
  } catch (e) {
    return fail(e);
  }
}
