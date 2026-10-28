import { fail, json } from "@/lib/api";
import { buildShowcase } from "@/lib/showcase";

export const dynamic = "force-dynamic";

/**
 * GET /api/showcase
 * Runs the whole pipeline on the fixture business in memory (scan, diagnose,
 * citations, ROI, agent, simulated callers, red team) and returns what the
 * /showcase tour shows. No keys, no network, nothing stored.
 */
export async function GET() {
  try {
    return json(await buildShowcase());
  } catch (e) {
    return fail(e);
  }
}
