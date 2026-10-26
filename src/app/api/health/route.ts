import { configured, envPresence, isDemo, runtimeMode } from "@/lib/env";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

// Reports which env keys are present: names and true/false only, never values.
export async function GET() {
  const mode = runtimeMode();
  return json({ ok: true, demo: isDemo(mode), mode, configured: configured(), env: envPresence() });
}
