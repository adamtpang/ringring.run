import { fail, json } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ runs: await getStore().listRuns(20) });
  } catch (e) {
    return fail(e);
  }
}
