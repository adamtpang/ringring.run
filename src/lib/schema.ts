import { z } from "zod";
import { FINDING_KINDS, LISTING_FACTS } from "./types";

// Strict schema for the LLM diagnosis. Flat evidence objects (nullable fields
// instead of unions) keep it compatible with strict JSON-schema structured output.

export const EvidenceSchema = z
  .object({
    source: z.enum(["review", "listing"]),
    review_id: z.string().nullable(),
    quote: z.string().nullable(),
    listing_fact: z.enum(LISTING_FACTS).nullable(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.source === "review") {
      if (!e.review_id) ctx.addIssue({ code: "custom", message: "review evidence needs review_id" });
      if (!e.quote || e.quote.trim().length < 12)
        ctx.addIssue({ code: "custom", message: "review evidence needs a quote of at least 12 characters" });
    } else if (!e.listing_fact) {
      ctx.addIssue({ code: "custom", message: "listing evidence needs listing_fact" });
    }
  });

export const LlmFindingSchema = z
  .object({
    kind: z.enum(FINDING_KINDS),
    title: z.string().min(3).max(140),
    detail: z.string().min(3).max(600),
    severity: z.number().int().min(1).max(5),
    evidence: z.array(EvidenceSchema).min(1).max(4),
  })
  .strict();

export const DiagnosisSchema = z
  .object({
    summary: z.string().min(1).max(600),
    findings: z.array(LlmFindingSchema).max(6),
  })
  .strict();

export type LlmEvidence = z.infer<typeof EvidenceSchema>;
export type LlmFinding = z.infer<typeof LlmFindingSchema>;
export type Diagnosis = z.infer<typeof DiagnosisSchema>;

/** Hand-written JSON Schema mirror of DiagnosisSchema for structured output (strict mode friendly). */
export const DIAGNOSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "findings"],
  properties: {
    summary: { type: "string", description: "Two sentences, no numbers that are not in the input." },
    findings: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "detail", "severity", "evidence"],
        properties: {
          kind: { type: "string", enum: [...FINDING_KINDS] },
          title: { type: "string" },
          detail: { type: "string" },
          severity: { type: "integer", minimum: 1, maximum: 5 },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["source", "review_id", "quote", "listing_fact"],
              properties: {
                source: { type: "string", enum: ["review", "listing"] },
                review_id: { type: ["string", "null"] },
                quote: { type: ["string", "null"], description: "Copied verbatim from the review text." },
                listing_fact: { type: ["string", "null"], enum: [...LISTING_FACTS, null] },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function parseDiagnosis(raw: unknown):
  | { ok: true; data: Diagnosis }
  | { ok: false; error: string } {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(stripFences(raw));
    } catch {
      return { ok: false, error: "LLM output is not valid JSON" };
    }
  }
  const r = DiagnosisSchema.safeParse(value);
  if (!r.success) {
    const issues = r.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Schema validation failed: ${issues}` };
  }
  return { ok: true, data: r.data };
}

function stripFences(s: string): string {
  const t = s.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : t;
}

/** Scan request from the dashboard form, API, or CLI. */
export const ScanInputSchema = z.object({
  category: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  maxCount: z.coerce.number().int().min(1).max(50),
});

/** PATCH /api/roi/[id] body: assumption key -> new value. */
export const RoiEditSchema = z.object({
  assumptions: z.record(z.string(), z.number().finite().nonnegative()),
  reset: z.boolean().optional(),
});
