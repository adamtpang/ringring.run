// Sourced case studies, matched to the plan kind they back up. Data only; see src/data/case-studies.json.
import { z } from "zod";
import data from "@/data/case-studies.json";
import { PLAN_KINDS, type PlanKind } from "./types";

export const CaseStudySchema = z.object({
  id: z.string().min(3),
  kinds: z.array(z.enum(PLAN_KINDS)).min(1),
  title: z.string().min(5),
  publisher: z.string().min(2),
  authors: z.string().nullable(),
  date: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/),
  url: z.string().url().startsWith("https://"),
  source_type: z.string().min(3),
  vendor_reported: z.boolean(),
  claim: z.string().min(10),
  quote: z.string().min(10),
  caveat: z.string().nullable(),
});
export type CaseStudy = z.infer<typeof CaseStudySchema>;
export const CASE_STUDIES: CaseStudy[] = z.array(CaseStudySchema).parse(data.studies);
export const CASE_STUDIES_CHECKED = data.verified_on;

export function caseStudiesFor(kind: PlanKind): CaseStudy[] {
  return CASE_STUDIES.filter((c) => c.kinds.includes(kind));
}

/** "Feb 14, 2018", "Sep 2011" or "2019". */
export function fmtStudyDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!m) return String(y);
  const dt = new Date(Date.UTC(y!, m - 1, day ?? 1, 12));
  return dt.toLocaleDateString("en-US", { month: "short", ...(day ? { day: "numeric" } : {}), year: "numeric", timeZone: "UTC" });
}

/** Numbers in a claim, each of which must appear in the quote. */
export const numbersIn = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).map(String);
