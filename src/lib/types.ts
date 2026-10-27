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

export type SearchKind = "category" | "name";

export interface Run {
  id: string;
  /** "category": category + city, many businesses. "name": one business looked up by name + city. */
  search_kind: SearchKind;
  /** The search text: a category like "plumbers", or a business name when search_kind is "name". */
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
  /** Stopwatch: when the first phone agent config of this run passed validation. */
  agent_ready_at: string | null;
  /** Milliseconds from run created (business named) to first agent ready. */
  agent_ready_ms: number | null;
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

/** Everything the game plan can prioritize: the diagnoser's findings, owner-only problems read from 1-3 star reviews, and gaps in what the listing shows. */
export const OWNER_ONLY_KINDS = ["work_quality", "staff_attitude", "pricing", "refunds"] as const;
export const GAP_KINDS = ["no_phone", "no_hours", "few_reviews"] as const;
export const PLAN_KINDS = [...FINDING_KINDS, ...OWNER_ONLY_KINDS, ...GAP_KINDS] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

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
  | { source: "listing"; fact: ListingFact; value: string }
  | { source: "website"; page_id: string; url: string; quote: string };

/** Text read from a business's own website. Stored as raw evidence that findings can cite. */
export interface WebPage {
  id: string;
  business_id: string;
  url: string;
  final_url: string | null;
  status: "ok" | "failed" | "skipped";
  http_status: number | null;
  title: string | null;
  text: string;
  error: string | null;
  fetched_at: string;
}

// Knowledge facts: per-business facts with a citation, stored so a later
// voice agent knowledge pack (hours, services, prices, FAQs) can be generated
// from stored data only. Phase 1 fills contact and hours facts from the listing.
export const KNOWLEDGE_KINDS = ["contact", "hours", "service", "price", "faq", "policy", "service_area"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export interface KnowledgeFact {
  id: string;
  business_id: string;
  kind: KnowledgeKind;
  label: string;
  value: string;
  source_type: "listing" | "website" | "review" | "owner";
  /** Where the value came from: a listing field name, a web_pages id, or a reviews id. */
  source_ref: string;
  /** Verbatim supporting text when the source is a page or review. */
  quote: string | null;
  created_at: string;
}

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
  /** Defaults to "category". */
  kind?: SearchKind;
  /** Category text, or the business name when kind is "name". */
  category: string;
  city: string;
  maxCount: number;
}

export type AgentStatus = "ready" | "deployed" | "deploy_failed";

/** A generated phone agent for one business. config is a Zod-validated AgentConfig (src/lib/agent/schema.ts). */
export interface AgentRecord {
  id: string;
  business_id: string;
  run_id: string;
  status: AgentStatus;
  config: import("./agent/schema").AgentConfig;
  /** Milliseconds from run created to this agent's config passing validation. */
  ready_ms: number | null;
  provider: string | null;
  external_agent_id: string | null;
  deploy_message: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- weekly check-ins ----------

export const CHECKIN_KINDS = ["baseline", "light", "new_reviews", "deep"] as const;
export type CheckinKind = (typeof CHECKIN_KINDS)[number];
export type CheckinTrigger = "cron" | "manual";
/** ok: something was measured and stored. no_change: count unchanged. deferred: count rose but the new-review fetch was skipped (light-only run). */
export type CheckinStatus = "ok" | "no_change" | "deferred" | "skipped_budget" | "error";

export interface TrackedBusiness {
  place_id: string;
  business_id: string | null;
  tracked: boolean;
  opted_in_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Checkin {
  id: string;
  place_id: string;
  business_id: string | null;
  kind: CheckinKind;
  trigger: CheckinTrigger;
  status: CheckinStatus;
  est_cost_usd: number;
  actual_cost_usd: number | null;
  apify_run_id: string | null;
  message: string | null;
  started_at: string;
  finished_at: string | null;
}

/** What one check-in measured. Null means not measured this time, never zero. */
export interface CheckinSnapshot {
  id: string;
  place_id: string;
  business_id: string | null;
  checkin_id: string | null;
  kind: CheckinKind;
  rating: number | null;
  review_count: number | null;
  reply_rate: number | null;
  reply_sample: number | null;
  neg_reply_rate: number | null;
  neg_sample: number | null;
  complaint_counts: Record<string, number> | null;
  new_reviews: number;
  taken_at: string;
}

export interface CheckinReview {
  id: string;
  place_id: string;
  checkin_id: string | null;
  external_id: string;
  rating: number | null;
  text: string;
  published_at: string | null;
  owner_response: string | null;
  complaints: string[];
  classified_by: "llm" | "rules";
  created_at: string;
}
