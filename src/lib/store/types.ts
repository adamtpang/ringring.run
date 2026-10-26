import type { Business, Finding, Review, RoiEstimate, Run, RunStep } from "../types";

export type NewRun = Omit<Run, "id" | "created_at">;
export type NewStep = Omit<RunStep, "id" | "created_at" | "updated_at">;
export type NewBusinessRow = Omit<Business, "id" | "created_at">;
export type NewReviewRow = Omit<Review, "id">;
export type NewFinding = Omit<Finding, "id" | "created_at">;
export type NewRoi = Omit<RoiEstimate, "id" | "updated_at">;

export interface Store {
  kind: "supabase" | "local";
  createRun(run: NewRun): Promise<Run>;
  updateRun(id: string, patch: Partial<Run>): Promise<void>;
  getRun(id: string): Promise<Run | null>;
  listRuns(limit?: number): Promise<Run[]>;

  addStep(step: NewStep): Promise<RunStep>;
  updateStep(id: string, patch: Partial<RunStep>): Promise<void>;
  listSteps(runId: string, businessId?: string): Promise<RunStep[]>;

  insertBusiness(b: NewBusinessRow): Promise<Business>;
  updateBusiness(id: string, patch: Partial<Business>): Promise<void>;
  getBusiness(id: string): Promise<Business | null>;
  listBusinesses(opts?: { runId?: string; limit?: number }): Promise<Business[]>;

  insertReviews(rows: NewReviewRow[]): Promise<Review[]>;
  listReviews(businessId: string): Promise<Review[]>;

  insertFinding(f: NewFinding): Promise<Finding>;
  listFindings(businessId: string): Promise<Finding[]>;

  insertRoi(r: NewRoi): Promise<RoiEstimate>;
  updateRoi(id: string, patch: Partial<RoiEstimate>): Promise<void>;
  getRoi(id: string): Promise<RoiEstimate | null>;
  listRoi(businessId: string): Promise<RoiEstimate[]>;
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

/** Businesses ranked by estimated monthly value, then score, then name. */
export function rankBusinesses(list: Business[]): Business[] {
  return [...list].sort(
    (a, b) =>
      b.est_monthly_value - a.est_monthly_value ||
      b.opportunity_score - a.opportunity_score ||
      a.name.localeCompare(b.name),
  );
}
