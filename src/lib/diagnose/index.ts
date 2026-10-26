import { parseDiagnosis, DIAGNOSIS_JSON_SCHEMA, type Diagnosis } from "../schema";
import type { Business, Review, WebPage } from "../types";
import { createLlmClient, type LlmClient } from "./llm-client";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { stubDiagnose } from "./stub";

export interface DiagnoseResult {
  diagnosis: Diagnosis;
  aliasMap: Record<string, string>;
}

export interface Diagnoser {
  mode: "llm" | "stub";
  model: string | null;
  diagnose(business: Business, reviews: Review[], pages?: WebPage[]): Promise<DiagnoseResult>;
}

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

export function llmDiagnoser(client: LlmClient = createLlmClient()): Diagnoser {
  return {
    mode: "llm",
    model: client.model,
    async diagnose(business, reviews, pages = []) {
      const { prompt, aliasMap } = buildUserPrompt(business, reviews, pages);
      const raw = await client.completeJson({
        system: SYSTEM_PROMPT,
        user: prompt,
        schemaName: "business_diagnosis",
        schema: DIAGNOSIS_JSON_SCHEMA as unknown as Record<string, unknown>,
      });
      const parsed = parseDiagnosis(raw);
      // Schema errors are retried by the pipeline: a fresh sample often passes.
      if (!parsed.ok) throw new SchemaError(parsed.error);
      return { diagnosis: parsed.data, aliasMap };
    },
  };
}

export function stubDiagnoser(): Diagnoser {
  return {
    mode: "stub",
    model: null,
    async diagnose(business, reviews, pages = []) {
      const { aliasMap } = buildUserPrompt(business, reviews, pages);
      const raw = stubDiagnose(business, reviews, aliasMap, pages);
      // Validate stub output with the same schema the LLM must satisfy.
      const parsed = parseDiagnosis(raw);
      if (!parsed.ok) throw new SchemaError(parsed.error);
      return { diagnosis: parsed.data, aliasMap };
    },
  };
}
