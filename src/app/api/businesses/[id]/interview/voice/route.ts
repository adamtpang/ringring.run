import { json } from "@/lib/api";
import { QuestionsSchema } from "@/lib/interview";
import { ensureInterviewAgent, signedUrl, VoiceError, voiceInterviewStatus } from "@/lib/interview-voice";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Start a browser voice interview: returns a one-conversation signed URL. The API key stays on the server. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const st = voiceInterviewStatus();
  if (!st.available) return json({ error: st.reason }, 409);
  const parsed = QuestionsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid questions" }, 400);
  try {
    const business = await getStore().getBusiness(id);
    if (!business) return json({ error: "Business not found" }, 404);
    const agentId = await ensureInterviewAgent(id, business.name, parsed.data.questions);
    return json({ signedUrl: await signedUrl(agentId), agentId });
  } catch (e) {
    const status = e instanceof VoiceError ? e.status : 502;
    return json({ error: e instanceof VoiceError ? e.message : "Voice is unavailable right now. Type your answers instead." }, status);
  }
}
