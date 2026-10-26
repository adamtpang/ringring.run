import { llmConfig } from "../env";
import { NonRetryableError } from "../retry";

// Minimal OpenAI-compatible client. Default target is xAI's Responses API
// (https://api.x.ai/v1/responses). Set LLM_API_STYLE=chat to use
// /chat/completions on any OpenAI-compatible provider instead.

export interface JsonRequest {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  timeoutMs?: number;
}

export interface LlmClient {
  model: string;
  completeJson(req: JsonRequest): Promise<string>;
}

export function createLlmClient(overrides: Partial<ReturnType<typeof llmConfig>> = {}): LlmClient {
  const cfg = { ...llmConfig(), ...overrides };
  if (!cfg.apiKey) throw new NonRetryableError("LLM API key is not configured");

  async function post(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      const msg = `LLM ${res.status}: ${text}`;
      if ([400, 401, 403, 404, 422].includes(res.status)) throw new NonRetryableError(msg);
      throw new Error(msg);
    }
    return res.json();
  }

  return {
    model: cfg.model,
    async completeJson(req) {
      const timeoutMs = req.timeoutMs ?? 120_000;
      if (cfg.apiStyle === "chat") {
        const data = (await post(
          "/chat/completions",
          {
            model: cfg.model,
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.user },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name: req.schemaName, schema: req.schema, strict: true },
            },
          },
          timeoutMs,
        )) as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error("LLM returned no content");
        return content;
      }
      const body: Record<string, unknown> = {
        model: cfg.model,
        input: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        text: { format: { type: "json_schema", name: req.schemaName, schema: req.schema, strict: true } },
        store: false,
      };
      if (cfg.reasoningEffort) body.reasoning = { effort: cfg.reasoningEffort };
      const data = (await post("/responses", body, timeoutMs)) as {
        output_text?: string;
        output?: { type?: string; content?: { type?: string; text?: string }[] }[];
      };
      if (typeof data.output_text === "string" && data.output_text.length > 0) return data.output_text;
      const text = (data.output ?? [])
        .filter((o) => o.type === "message")
        .flatMap((o) => o.content ?? [])
        .filter((c) => c.type === "output_text" && typeof c.text === "string")
        .map((c) => c.text)
        .join("");
      if (!text) throw new Error("LLM returned no output_text");
      return text;
    },
  };
}
