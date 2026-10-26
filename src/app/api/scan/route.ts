import { after } from "next/server";
import { fail, json } from "@/lib/api";
import { createRun, defaultDeps, executeRun } from "@/lib/pipeline";
import { ScanInputSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Creates a run and executes the pipeline after the response is sent.
// The UI polls GET /api/runs/[id] for the step timeline.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const parsed = ScanInputSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid scan input", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
  }
  try {
    const deps = defaultDeps();
    const run = await createRun(parsed.data, deps);
    after(async () => {
      try {
        await executeRun(run.id, deps);
      } catch (e) {
        console.error(`run ${run.id} crashed:`, e instanceof Error ? e.message : e);
      }
    });
    return json({ run }, 202);
  } catch (e) {
    return fail(e);
  }
}
