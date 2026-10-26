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
