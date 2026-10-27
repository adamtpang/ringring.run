import { json } from "@/lib/api";
import { mapTranscript, QuestionsSchema } from "@/lib/interview";
import { fetchTranscript, VoiceError, voiceInterviewStatus } from "@/lib/interview-voice";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Body = QuestionsSchema.extend({ conversation_id: z.string().regex(/^[A-Za-z0-9_-]{4,80}$/) });

/** Read the finished call from ElevenLabs and turn it into draft answers for the owner to check. Nothing is saved here. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const st = voiceInterviewStatus();
  if (!st.available) return json({ error: st.reason }, 409);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
  try {
    const t = await fetchTranscript(parsed.data.conversation_id, id);
    return json({ status: t.status, duration_secs: t.duration_secs, turns: t.turns, answers: mapTranscript(parsed.data.questions, t.turns) });
  } catch (e) {
    const status = e instanceof VoiceError ? e.status : 502;
    return json({ error: e instanceof VoiceError ? e.message : "Could not read the conversation." }, status);
  }
}
