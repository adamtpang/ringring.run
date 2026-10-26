// Domain types. Field names mirror the Postgres columns (snake_case) so the
// Supabase store can map rows 1:1.

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed";

export type StepStatus = "running" | "ok" | "retry" | "warn" | "error" | "skipped";

export type ScraperMode = "apify" | "fixture";
export type DiagnoserMode = "llm" | "stub";
export type StoreMode = "supabase" | "local";

export interface RunMode {
  scraper: ScraperMode;
  diagnoser: DiagnoserMode;
  store: StoreMode;
  llm_model: string | null;
}

export interface Run {
  id: string;
  category: string;
  city: string;
  max_count: number;
  status: RunStatus;
  mode: RunMode;
  business_count: number;
  diagnosed_count: number;
  failed_count: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface RunStep {
  id: string;
  run_id: string;
  business_id: string | null;
  step: string;
  status: StepStatus;
  message: string;
  attempt: number;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface OpeningHours {
  day: string;
  hours: string;
}

export type DiagnosisStatus = "pending" | "running" | "ok" | "failed";

export interface Business {
  id: string;
  run_id: string;
  place_id: string;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  opening_hours: OpeningHours[];
  maps_url: string | null;
  owner_response_rate: number | null;
  scraped_review_count: number;
  is_fixture: boolean;
  diagnosis_status: DiagnosisStatus;
  diagnosis_summary: string | null;
  diagnosis_error: string | null;
  opportunity_score: number;
  est_monthly_value: number;
  raw: Record<string, unknown>;
  created_at: string;
}

export interface Review {
  id: string;
  business_id: string;
  external_id: string | null;
  rating: number | null;
  text: string;
  published_at: string | null;
  owner_response: string | null;
  position: number;
}

export const FINDING_KINDS = [
  "missed_calls",
  "slow_response",
  "booking_friction",
  "unanswered_reviews",
  "no_website",
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export const LISTING_FACTS = [
  "no_website",
  "no_phone",
  "no_hours",
  "low_owner_response_rate",
  "low_rating",
  "few_reviews",
] as const;
export type ListingFact = (typeof LISTING_FACTS)[number];

export const SOLUTION_IDS = [
  "ai_receptionist",
  "review_responder",
  "landing_page",
  "booking_followup",
] as const;
export type SolutionId = (typeof SOLUTION_IDS)[number];

export type Evidence =
  | { source: "review"; review_id: string; quote: string; rating: number | null }
  | { source: "listing"; fact: ListingFact; value: string };

export interface Finding {
  id: string;
  business_id: string;
  run_id: string;
  kind: FindingKind;
  title: string;
  detail: string;
  severity: number;
  solution: SolutionId;
  evidence: Evidence[];
  created_at: string;
}

export type AssumptionUnit = "count" | "ratio" | "usd" | "multiplier";

export interface Assumption {
  key: string;
  label: string;
  value: number;
  unit: AssumptionUnit;
  source: "assumption" | "listing";
  note?: string;
}

export interface RoiEstimate {
  id: string;
  finding_id: string;
  business_id: string;
  assumptions: Assumption[];
  formula: string;
  monthly_value: number;
  is_edited: boolean;
  updated_at: string;
}

export interface ScanInput {
  category: string;
  city: string;
  maxCount: number;
}
